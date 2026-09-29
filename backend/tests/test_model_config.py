import asyncio
import json

import httpx
from fastapi.testclient import TestClient

from app.core.secrets import decrypt_secret, encrypt_secret
from app.services.model_provider import OllamaProvider, OpenAICompatibleProvider, SplitModelProvider, build_provider


def register(client: TestClient, name: str) -> str:
    response = client.post(
        "/api/auth/register",
        json={"username": name, "email": f"{name}@example.com", "password": "password123"},
    )
    return response.json()["access_token"]


def test_model_config_is_encrypted_masked_and_user_scoped(client: TestClient) -> None:
    token_a = register(client, "model-a")
    token_b = register(client, "model-b")
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    saved = client.put(
        "/api/model-config",
        headers=headers_a,
        json={
            "provider": "openai_compatible",
            "base_url": "https://api.example.com/v1",
            "model": "chat-model",
            "embedding_model": "embed-model",
            "temperature": 0.3,
            "api_key": "secret-key-1234",
        },
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["api_key_masked"] == "••••1234"
    assert "secret-key" not in saved.text
    assert client.get("/api/model-config", headers=headers_b).status_code == 404

    ciphertext = encrypt_secret("secret-key-1234")
    assert "secret-key-1234" not in ciphertext
    assert decrypt_secret(ciphertext) == "secret-key-1234"


def test_multiple_profiles_switch_with_their_own_encrypted_keys(client: TestClient, monkeypatch) -> None:
    token = register(client, "profile-owner")
    other = register(client, "profile-other")
    headers = {"Authorization": f"Bearer {token}"}
    other_headers = {"Authorization": f"Bearer {other}"}
    endpoint = "/api/model-config/profiles"

    first = client.post(endpoint, headers=headers, json={
        "expected_version": 0, "name": "在线", "provider": "openai_compatible",
        "base_url": "https://one.example.com/v1", "model": "chat-one",
        "embedding_model": "", "temperature": 0.2, "api_key": "key-one-1234",
    })
    assert first.status_code == 200, first.text
    first_id = first.json()["active_id"]
    assert first.json()["items"][0]["api_key_masked"] == "••••1234"
    assert "key-one-1234" not in first.text
    assert client.get("/api/app-data/model-profiles", headers=headers).status_code == 422
    assert client.get("/api/model-config", headers=headers).json()["model"] == "chat-one"
    assert client.get(endpoint, headers=other_headers).json()["items"] == []

    second = client.post(endpoint, headers=headers, json={
        "expected_version": 1, "name": "本机", "provider": "openai_compatible",
        "base_url": "http://127.0.0.1:11434/v1", "model": "gemma3:4b",
        "embedding_model": "nomic-embed-text", "temperature": 0.3,
    })
    assert second.status_code == 200, second.text
    second_id = second.json()["active_id"]
    assert client.get("/api/model-config", headers=headers).json()["model"] == "gemma3:4b"
    assert client.put(f"{endpoint}/{first_id}/activate", headers=headers, json={"expected_version": 2}).status_code == 200
    assert client.get("/api/model-config", headers=headers).json()["model"] == "chat-one"
    assert client.get("/api/model-config", headers=headers).json()["api_key_masked"] == "••••1234"
    seen = []
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.headers.get("authorization"), json.loads(request.read())["model"]))
        return httpx.Response(200, json={"choices": [{"message": {"content": "你好"}}]})
    monkeypatch.setattr("app.api.model_config._completion_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    reply = client.post("/api/model-config/chat/completions", headers=headers,
                        json={"messages": [{"role": "user", "content": "你好"}]})
    assert reply.status_code == 200 and seen == [("Bearer key-one-1234", "chat-one")]
    legacy_update = client.put("/api/model-config", headers=headers, json={
        "provider": "openai_compatible", "base_url": "https://one.example.com/v1",
        "model": "chat-one-updated", "embedding_model": "", "temperature": 0.2,
    })
    assert legacy_update.status_code == 200, legacy_update.text
    assert client.get(endpoint, headers=headers).json()["items"][0]["model"] == "chat-one-updated"
    assert client.post(endpoint, headers=headers, json={
        "expected_version": 2, "id": first_id, "name": "过期", "provider": "openai_compatible",
        "base_url": "https://one.example.com/v1", "model": "bad",
    }).status_code == 409
    assert client.request("DELETE", f"{endpoint}/{second_id}", headers=headers, json={"expected_version": 4}).status_code == 200
    assert len(client.get(endpoint, headers=headers).json()["items"]) == 1
    assert client.request("DELETE", f"{endpoint}/{first_id}", headers=headers, json={"expected_version": 5}).status_code == 200
    assert client.get("/api/model-config", headers=headers).status_code == 404


def test_old_single_model_appears_as_editable_profile(client: TestClient) -> None:
    token = register(client, "profile-legacy")
    headers = {"Authorization": f"Bearer {token}"}
    assert client.put("/api/model-config", headers=headers, json={
        "provider": "openai_compatible", "base_url": "https://api.example.com/v1",
        "model": "old-model", "embedding_model": "", "temperature": 0.2,
        "api_key": "legacy-secret",
    }).status_code == 200
    profiles = client.get("/api/model-config/profiles", headers=headers).json()
    assert profiles["version"] == 0 and profiles["active_id"] == "legacy"
    assert profiles["items"][0]["has_api_key"] is True
    updated = client.post("/api/model-config/profiles", headers=headers, json={
        "expected_version": 0, "id": "legacy", "name": "旧配置",
        "provider": "openai_compatible", "base_url": "https://api.example.com/v1",
        "model": "new-model", "embedding_model": "", "temperature": 0.2,
    })
    assert updated.status_code == 200, updated.text
    assert client.get("/api/model-config", headers=headers).json()["api_key_masked"] == "••••cret"


def test_compatible_chat_can_use_local_ollama_embeddings(client: TestClient, monkeypatch) -> None:
    token = register(client, "split-provider")
    headers = {"Authorization": f"Bearer {token}"}
    saved = client.put("/api/model-config", headers=headers, json={
        "provider": "openai_compatible",
        "base_url": "https://chat.example.com/v1",
        "model": "chat-model",
        "embedding_model": "ollama://nomic-embed-text",
        "temperature": 0.2,
    })
    assert saved.status_code == 200, saved.text
    assert client.get("/api/model-config", headers=headers).json()["embedding_model"] == "ollama://nomic-embed-text"

    calls: list[tuple[str, list[str]]] = []

    class FakeLocalEmbedding:
        def __init__(self, base_url, model, embedding_model):
            assert base_url == "http://127.0.0.1:11434"
            assert embedding_model == "nomic-embed-text"

        async def embed(self, texts):
            calls.append(("embed", texts))
            return [[0.1, 0.2]]

        async def close(self):
            calls.append(("close", []))

    monkeypatch.setattr("app.services.model_provider.OllamaProvider", FakeLocalEmbedding)
    provider = build_provider("openai_compatible", "https://chat.example.com/v1", "chat-model", "ollama://nomic-embed-text")
    assert isinstance(provider, SplitModelProvider)
    assert asyncio.run(provider.embed(["数学资料"])) == [[0.1, 0.2]]
    asyncio.run(provider.close())
    assert calls == [("embed", ["数学资料"]), ("close", [])]


def test_openai_compatible_provider_contract() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": "chat-model"}]})
        if request.url.path.endswith("/chat/completions"):
            return httpx.Response(200, json={"choices": [{"message": {"content": "回答"}}]})
        return httpx.Response(200, json={"data": [{"index": 0, "embedding": [0.1, 0.2]}]})

    async def run() -> None:
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        provider = OpenAICompatibleProvider(
            "https://api.example.com/v1",
            "chat-model",
            "embed-model",
            "key",
            client,
        )
        assert (await provider.health_check()).ok is True
        assert await provider.chat([{"role": "user", "content": "你好"}]) == "回答"
        assert await provider.embed(["文本"]) == [[0.1, 0.2]]
        await client.aclose()

    asyncio.run(run())


def test_ollama_health_reports_missing_model() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"models": [{"name": "qwen2.5:7b"}]})

    async def run() -> None:
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        provider = OllamaProvider("http://127.0.0.1:11434", "llama3.2", "nomic-embed-text", client)
        result = await provider.health_check()
        assert result.ok is False
        assert "未安装模型" in result.message
        await client.aclose()

    asyncio.run(run())


def test_provider_stream_parses_openai_and_ollama_chunks() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/chat/completions"):
            return httpx.Response(200, text=(
                'data: {"choices":[{"delta":{"content":"你"}}]}\n\n'
                'data: {"choices":[{"delta":{"content":"好"}}]}\n\n'
                'data: [DONE]\n\n'
            ))
        return httpx.Response(200, text=(
            '{"message":{"content":"你"},"done":false}\n'
            '{"message":{"content":"好"},"done":false}\n'
            '{"done":true}\n'
        ))

    async def run() -> None:
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        messages = [{"role": "user", "content": "你好"}]
        openai = OpenAICompatibleProvider("https://api.example.com/v1", "chat", "embed", "key", client)
        ollama = OllamaProvider("http://127.0.0.1:11434", "gemma3:4b", "nomic-embed-text", client)
        assert [chunk async for chunk in openai.stream_chat(messages)] == ["你", "好"]
        assert [chunk async for chunk in ollama.stream_chat(messages)] == ["你", "好"]
        await client.aclose()

    asyncio.run(run())


def test_bundled_app_uses_agent_model_without_exposing_key(client: TestClient, monkeypatch) -> None:
    token = register(client, "model-proxy")
    headers = {"Authorization": f"Bearer {token}"}
    saved = client.put("/api/model-config", headers=headers, json={
        "provider": "openai_compatible", "base_url": "https://example.com/v1",
        "model": "real-model", "embedding_model": "", "temperature": 0.2, "api_key": "secret-1234",
    })
    assert saved.status_code == 200
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if json.loads(request.read()).get("stream") is True:
            return httpx.Response(200, text='data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: [DONE]\n\n')
        return httpx.Response(200, json={"choices": [{"message": {"content": "回答"}}]})

    monkeypatch.setattr("app.api.model_config._completion_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    payload = {"model": "wrong-model", "messages": [{"role": "user", "content": "你好"}]}
    assert client.post("/api/model-config/chat/completions", json=payload).status_code == 401
    response = client.post("/api/model-config/chat/completions", headers=headers, json=payload)
    assert response.status_code == 200, response.text
    assert response.json()["choices"][0]["message"]["content"] == "回答"
    assert seen[0].url.path == "/v1/chat/completions"
    assert seen[0].headers["authorization"] == "Bearer secret-1234"
    assert seen[0].read().find(b'"real-model"') >= 0
    assert b'wrong-model' not in seen[0].read()
    assert "secret-1234" not in response.text
    streamed = client.post("/api/model-config/chat/completions", headers=headers, json={**payload, "stream": True})
    assert streamed.status_code == 200
    assert "你好" in streamed.text
