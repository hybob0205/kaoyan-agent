from fastapi.testclient import TestClient

from app.services.model_provider import HealthResult, ModelProvider


def register(client: TestClient, username: str) -> dict[str, str]:
    response = client.post(
        "/api/auth/register",
        json={"username": username, "email": f"{username}@example.com", "password": "password123"},
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def candidate_payload(school: str = "广东工业大学") -> dict:
    return {
        "school": school,
        "major": "计算机技术",
        "year": 2026,
        "score_line": 310,
        "source": "招生简章",
        "note": "数学二、英语二",
    }


def test_school_candidates_crud_and_user_isolation(client: TestClient) -> None:
    owner = register(client, "school-owner")
    other = register(client, "school-other")

    created = client.post("/api/schools", headers=owner, json=candidate_payload())
    assert created.status_code == 201, created.text
    candidate_id = created.json()["id"]
    assert created.json()["score_line"] == 310

    assert len(client.get("/api/schools", headers=owner).json()) == 1
    assert client.get("/api/schools", headers=other).json() == []
    assert client.put(f"/api/schools/{candidate_id}", headers=other, json=candidate_payload("广州大学")).status_code == 404
    assert client.delete(f"/api/schools/{candidate_id}", headers=other).status_code == 404

    updated = client.put(f"/api/schools/{candidate_id}", headers=owner, json=candidate_payload("广州大学"))
    assert updated.status_code == 200
    assert updated.json()["school"] == "广州大学"

    deleted = client.delete(f"/api/schools/{candidate_id}", headers=owner)
    assert deleted.status_code == 204
    assert client.get("/api/schools", headers=owner).json() == []


class FakeSchoolProvider(ModelProvider):
    def __init__(self) -> None:
        self.calls: list[list[dict[str, str]]] = []

    async def chat(self, messages: list[dict[str, str]], temperature: float = 0.2) -> str:
        self.calls.append(messages)
        if len(self.calls) == 1:
            return '{"intent":"school_query"}'
        return "已根据你保存的院校数据进行比较。"

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [[0.0] for _ in texts]

    async def health_check(self) -> HealthResult:
        return HealthResult(True, "ok", 1)

    async def close(self) -> None:
        return None


def test_agent_compares_only_current_users_saved_candidates(client: TestClient, monkeypatch) -> None:
    owner = register(client, "school-agent-owner")
    other = register(client, "school-agent-other")
    payload = candidate_payload()
    client.post("/api/schools", headers=owner, json=payload)
    client.post("/api/schools", headers=other, json=candidate_payload("华南理工大学"))
    configured = client.put(
        "/api/model-config",
        headers=owner,
        json={
            "provider": "ollama",
            "base_url": "http://127.0.0.1:11434",
            "model": "acceptance-fake",
            "embedding_model": "acceptance-fake-embed",
            "temperature": 0.2,
        },
    )
    assert configured.status_code == 200, configured.text

    fake = FakeSchoolProvider()
    monkeypatch.setattr("app.api.agent.build_provider", lambda *args: fake)
    response = client.post("/api/agent/chat", headers=owner, json={"message": "帮我比较候选院校"})

    assert response.status_code == 200, response.text
    assert response.json()["intent"] == "school_query"
    assert response.json()["used_tools"] == ["school_candidates"]
    context = fake.calls[1][-1]["content"]
    assert "广东工业大学" in context
    assert "华南理工大学" not in context
    assert "310" in context
