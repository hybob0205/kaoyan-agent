from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass
import json
from time import perf_counter

import httpx


@dataclass(frozen=True)
class HealthResult:
    ok: bool
    message: str
    latency_ms: int


class ModelProvider(ABC):
    @abstractmethod
    async def chat(self, messages: list[dict[str, str]], temperature: float = 0.2) -> str:
        raise NotImplementedError

    async def stream_chat(self, messages: list[dict[str, str]], temperature: float = 0.2) -> AsyncIterator[str]:
        yield await self.chat(messages, temperature)

    async def chat_with_image(self, prompt: str, image_base64: str, temperature: float = 0.1) -> str:
        raise NotImplementedError("当前模型提供商不支持图片输入")

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError

    @abstractmethod
    async def health_check(self) -> HealthResult:
        raise NotImplementedError

    @abstractmethod
    async def close(self) -> None:
        raise NotImplementedError


class OpenAICompatibleProvider(ModelProvider):
    def __init__(
        self,
        base_url: str,
        model: str,
        embedding_model: str,
        api_key: str,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.embedding_model = embedding_model
        self.api_key = api_key
        self._owns_client = client is None
        self.client = client or httpx.AsyncClient(timeout=20)

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}

    async def chat(self, messages: list[dict[str, str]], temperature: float = 0.2) -> str:
        response = await self.client.post(
            f"{self.base_url}/chat/completions",
            headers=self.headers,
            json={"model": self.model, "messages": messages, "temperature": temperature},
        )
        response.raise_for_status()
        return str(response.json()["choices"][0]["message"]["content"])

    async def chat_with_image(self, prompt: str, image_base64: str, temperature: float = 0.1) -> str:
        response = await self.client.post(
            f"{self.base_url}/chat/completions",
            headers=self.headers,
            json={
                "model": self.model,
                "messages": [{"role": "user", "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}},
                ]}],
                "temperature": temperature,
            },
            timeout=90,
        )
        response.raise_for_status()
        return str(response.json()["choices"][0]["message"]["content"])

    async def stream_chat(self, messages: list[dict[str, str]], temperature: float = 0.2) -> AsyncIterator[str]:
        async with self.client.stream(
            "POST",
            f"{self.base_url}/chat/completions",
            headers=self.headers,
            json={"model": self.model, "messages": messages, "temperature": temperature, "stream": True},
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:].strip()
                if data == "[DONE]":
                    break
                delta = json.loads(data)["choices"][0]["delta"].get("content")
                if delta:
                    yield str(delta)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not self.embedding_model:
            raise ValueError("尚未配置 Embedding 模型")
        response = await self.client.post(
            f"{self.base_url}/embeddings",
            headers=self.headers,
            json={"model": self.embedding_model, "input": texts},
        )
        response.raise_for_status()
        data = sorted(response.json()["data"], key=lambda item: item["index"])
        return [item["embedding"] for item in data]

    async def health_check(self) -> HealthResult:
        started = perf_counter()
        try:
            response = await self.client.get(f"{self.base_url}/models", headers=self.headers)
            if response.status_code == 404:
                return HealthResult(True, "接口可访问；当前服务未提供模型列表，尚未验证对话生成", round((perf_counter() - started) * 1000))
            response.raise_for_status()
            return HealthResult(True, "OpenAI 兼容接口连接成功", round((perf_counter() - started) * 1000))
        except (httpx.HTTPError, KeyError, ValueError) as error:
            return HealthResult(False, f"连接失败：{error}", round((perf_counter() - started) * 1000))

    async def close(self) -> None:
        if self._owns_client:
            await self.client.aclose()


class OllamaProvider(ModelProvider):
    def __init__(
        self,
        base_url: str,
        model: str,
        embedding_model: str,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.embedding_model = embedding_model
        self._owns_client = client is None
        self.client = client or httpx.AsyncClient(timeout=30)

    async def chat(self, messages: list[dict[str, str]], temperature: float = 0.2) -> str:
        response = await self.client.post(
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "messages": messages,
                "stream": False,
                "options": {"temperature": temperature},
            },
        )
        response.raise_for_status()
        return str(response.json()["message"]["content"])

    async def chat_with_image(self, prompt: str, image_base64: str, temperature: float = 0.1) -> str:
        response = await self.client.post(
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "messages": [{"role": "user", "content": prompt, "images": [image_base64]}],
                "stream": False,
                "options": {"temperature": temperature},
            },
            timeout=120,
        )
        response.raise_for_status()
        return str(response.json()["message"]["content"])

    async def stream_chat(self, messages: list[dict[str, str]], temperature: float = 0.2) -> AsyncIterator[str]:
        async with self.client.stream(
            "POST",
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "messages": messages,
                "stream": True,
                "options": {"temperature": temperature},
            },
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.strip():
                    continue
                chunk = json.loads(line)
                delta = chunk.get("message", {}).get("content")
                if delta:
                    yield str(delta)
                if chunk.get("done"):
                    break

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not self.embedding_model:
            raise ValueError("尚未配置 Embedding 模型")
        response = await self.client.post(
            f"{self.base_url}/api/embed",
            json={"model": self.embedding_model, "input": texts},
        )
        response.raise_for_status()
        return response.json()["embeddings"]

    async def health_check(self) -> HealthResult:
        started = perf_counter()
        try:
            response = await self.client.get(f"{self.base_url}/api/tags")
            response.raise_for_status()
            models = {item.get("name", "").split(":")[0] for item in response.json().get("models", [])}
            configured = self.model.split(":")[0]
            if configured and configured not in models:
                return HealthResult(False, f"Ollama 已连接，但未安装模型 {self.model}", round((perf_counter() - started) * 1000))
            return HealthResult(True, "Ollama 连接成功，模型已就绪", round((perf_counter() - started) * 1000))
        except (httpx.HTTPError, KeyError, ValueError) as error:
            return HealthResult(False, f"连接失败：{error}", round((perf_counter() - started) * 1000))

    async def close(self) -> None:
        if self._owns_client:
            await self.client.aclose()


LOCAL_EMBED_PREFIX = "ollama://"
LOCAL_OLLAMA_URL = "http://127.0.0.1:11434"


class SplitModelProvider(ModelProvider):
    """Use a compatible chat API with a local Ollama embedding model."""

    def __init__(self, chat_provider: ModelProvider, embedding_model: str) -> None:
        self.chat_provider = chat_provider
        self.embedding_provider = OllamaProvider(LOCAL_OLLAMA_URL, "", embedding_model)

    async def chat(self, messages: list[dict[str, str]], temperature: float = 0.2) -> str:
        return await self.chat_provider.chat(messages, temperature)

    async def stream_chat(self, messages: list[dict[str, str]], temperature: float = 0.2) -> AsyncIterator[str]:
        async for chunk in self.chat_provider.stream_chat(messages, temperature):
            yield chunk

    async def chat_with_image(self, prompt: str, image_base64: str, temperature: float = 0.1) -> str:
        return await self.chat_provider.chat_with_image(prompt, image_base64, temperature)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return await self.embedding_provider.embed(texts)

    async def health_check(self) -> HealthResult:
        return await self.chat_provider.health_check()

    async def close(self) -> None:
        await self.chat_provider.close()
        await self.embedding_provider.close()


def build_provider(
    provider: str,
    base_url: str,
    model: str,
    embedding_model: str,
    api_key: str = "",
) -> ModelProvider:
    if provider == "openai_compatible":
        if embedding_model.startswith(LOCAL_EMBED_PREFIX):
            local_model = embedding_model[len(LOCAL_EMBED_PREFIX):]
            if not local_model:
                raise ValueError("请选择本机 Ollama 的 Embedding 模型")
            return SplitModelProvider(
                OpenAICompatibleProvider(base_url, model, "", api_key), local_model,
            )
        return OpenAICompatibleProvider(base_url, model, embedding_model, api_key)
    if provider == "ollama":
        return OllamaProvider(base_url, model, embedding_model)
    raise ValueError("不支持的模型提供商")
