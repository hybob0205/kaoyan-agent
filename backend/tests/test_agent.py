from datetime import date, timedelta
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from app.services.model_provider import HealthResult, ModelProvider


class FakeProvider(ModelProvider):
    def __init__(self, intent: str = "plan_query") -> None:
        self.intent = intent
        self.calls: list[list[dict[str, str]]] = []
        self.closed = False

    async def chat(self, messages: list[dict[str, str]], temperature: float = 0.2) -> str:
        self.calls.append(messages)
        if len(self.calls) == 1:
            return f'{{"intent":"{self.intent}"}}'
        return "今天先完成数学任务，再按顺序推进其余科目。"

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [[0.0] for _ in texts]

    async def health_check(self) -> HealthResult:
        return HealthResult(True, "ok", 1)

    async def close(self) -> None:
        self.closed = True


class MissingModelProvider(FakeProvider):
    async def chat(self, messages: list[dict[str, str]], temperature: float = 0.2) -> str:
        request = httpx.Request("POST", "http://127.0.0.1:11434/api/chat")
        response = httpx.Response(404, request=request)
        raise httpx.HTTPStatusError("not found", request=request, response=response)


class StreamingProvider(FakeProvider):
    async def stream_chat(self, messages: list[dict[str, str]], temperature: float = 0.2):
        self.calls.append(messages)
        yield "今天先做"
        yield "数学任务。"


class SummarizingProvider(FakeProvider):
    async def chat(self, messages: list[dict[str, str]], temperature: float = 0.2) -> str:
        self.calls.append(messages)
        system = messages[0]["content"]
        if "压缩为简洁中文摘要" in system:
            return "用户正在准备数学二积分，并希望保持每日学习节奏。"
        if "意图分类器" in system:
            return '{"intent":"general"}'
        return "继续按当前节奏学习。"


def create_user(client: TestClient, name: str, with_config: bool = True) -> tuple[str, dict[str, str]]:
    registered = client.post(
        "/api/auth/register",
        json={"username": name, "email": f"{name}@example.com", "password": "password123"},
    )
    token = registered.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    client.put(
        "/api/profile",
        headers=headers,
        json={
            "exam_date": (date.today() + timedelta(days=300)).isoformat(),
            "school": "验收大学",
            "major": "计算机技术",
            "daily_minutes": 180,
            "rest_days": [],
            "subjects": [
                {"subject": "math2", "score": 1, "weaknesses": "积分"},
                {"subject": "english2", "score": 3, "weaknesses": "写作"},
                {"subject": "politics", "score": 2, "weaknesses": "马原"},
            ],
        },
    )
    if with_config:
        client.put(
            "/api/model-config",
            headers=headers,
            json={
                "provider": "ollama",
                "base_url": "http://127.0.0.1:11434",
                "model": "test-model",
                "embedding_model": "test-embed",
                "temperature": 0.2,
            },
        )
    return token, headers


def test_agent_routes_to_read_only_plan_tool(client: TestClient, monkeypatch) -> None:
    _, headers = create_user(client, "agent-plan")
    plan = client.post("/api/plans/generate", headers=headers, json={})
    assert plan.status_code == 200
    fake = FakeProvider()
    monkeypatch.setattr("app.api.agent.build_provider", lambda *args: fake)

    response = client.post("/api/agent/chat", headers=headers, json={"message": "我今天要学什么？"})

    assert response.status_code == 200, response.text
    assert response.json()["intent"] == "plan_query"
    assert response.json()["used_tools"] == ["today_plan"]
    assert "今日计划" in fake.calls[1][1]["content"]
    assert "数学二" in fake.calls[1][1]["content"]
    assert fake.closed is True
    assert client.get("/api/plans/today", headers=headers).json()["id"] == plan.json()["id"]


def test_agent_uses_copied_study_hub_catalog(client: TestClient, monkeypatch) -> None:
    _, headers = create_user(client, "agent-hub")
    fake = FakeProvider("practice_query")
    monkeypatch.setattr("app.api.agent.build_provider", lambda *args: fake)

    response = client.post("/api/agent/chat", headers=headers, json={
        "message": "推荐数学二积分真题练习",
        "hub_progress": {"math2": {"practiced": 5, "wrong": 1, "due": 1, "wrong_ids": ["real-2026-1"]}},
    })

    assert response.status_code == 200, response.text
    assert response.json()["intent"] == "practice_query"
    assert response.json()["used_tools"] == ["study_hub_catalog", "study_hub_progress"]
    assert "/study-hub/math.html#question/" in fake.calls[1][-1]["content"]
    assert "已练 5 项、错题 1 项、到期复习 1 项" in fake.calls[1][-1]["content"]
    assert "2026 年第 1 题" in fake.calls[1][-1]["content"]


def test_agent_subject_and_answer_mode_are_applied(client: TestClient, monkeypatch) -> None:
    _, headers = create_user(client, "agent-preferences")
    fake = FakeProvider("practice_query")
    monkeypatch.setattr("app.api.agent.build_provider", lambda *args: fake)
    response = client.post("/api/agent/chat", headers=headers, json={
        "message": "推荐一道练习", "subject": "english2", "answer_mode": "step_by_step",
    })
    assert response.status_code == 200, response.text
    assert "分步讲解推理过程" in fake.calls[1][1]["content"]
    assert "/study-hub/english.html" in fake.calls[1][-1]["content"]


def test_agent_accepts_408_subject_preference(client: TestClient, monkeypatch) -> None:
    _, headers = create_user(client, "agent-408-preference")
    fake = FakeProvider("practice_query")
    monkeypatch.setattr("app.api.agent.build_provider", lambda *args: fake)
    response = client.post("/api/agent/chat", headers=headers, json={
        "message": "分析 408 错题", "subject": "cs408",
        "hub_progress": {"cs408": {"practiced": 5, "wrong": 2, "due": 1, "wrong_ids": ["co-1"]}},
    })
    assert response.status_code == 200, response.text
    assert "408 计算机基础" in fake.calls[1][1]["content"]


def test_agent_analyzes_study_hub_wrong_details(client: TestClient, monkeypatch) -> None:
    _, headers = create_user(client, "agent-hub-wrong")
    fake = FakeProvider("practice_query")
    monkeypatch.setattr("app.api.agent.build_provider", lambda *args: fake)

    response = client.post("/api/agent/chat", headers=headers, json={
        "message": "整理分析我在研习室的错题",
        "hub_progress": {"math2": {
            "practiced": 4, "wrong": 2, "due": 1, "wrong_ids": ["real-2026-1"],
            "wrong_items": [{"id": "real-2026-1", "answer": "B", "cause": "概念不清", "notes": "无穷小比较忘记展开"}],
            "custom_mistakes": [{"title": "积分换序", "source": "讲义", "detail": "区域边界写反了", "review": "先画图"}],
        }},
    })

    assert response.status_code == 200, response.text
    context = fake.calls[1][-1]["content"]
    assert "无穷小比较忘记展开" in context
    assert "区域边界写反了" in context
    assert "题库参考答案 A" in context
    assert response.json()["used_tools"] == ["study_hub_catalog", "study_hub_progress"]


def test_agent_reads_mistake_review_text_without_image_or_key(client: TestClient, monkeypatch) -> None:
    _, headers = create_user(client, "agent-mistake-review")
    fake = FakeProvider("practice_query")
    monkeypatch.setattr("app.api.agent.build_provider", lambda *args: fake)

    response = client.post("/api/agent/chat", headers=headers, json={
        "message": "分析我在拾错里的错题",
        "mistake_review": {
            "total": 2, "due": 1, "weak": 1,
            "items": [{"subject": "数学二", "module": "高等数学", "knowledge": "积分换序", "cause": "区域边界写反了", "question": "求二重积分", "mastery": 1}],
        },
    })

    assert response.status_code == 200, response.text
    assert "mistake_review" in response.json()["used_tools"]
    context = fake.calls[1][-1]["content"]
    assert "区域边界写反了" in context
    assert "/mistake-review/index.html" in context
    assert "data:image" not in context


def test_mistake_review_ignores_extra_fields(client: TestClient, monkeypatch) -> None:
    _, headers = create_user(client, "agent-mistake-validation")
    fake = FakeProvider("practice_query")
    monkeypatch.setattr("app.api.agent.build_provider", lambda *args: fake)
    response = client.post("/api/agent/chat", headers=headers, json={
        "message": "分析拾错", "mistake_review": {"total": 1, "due": 0, "weak": 1,
        "api_key": "SECRET_KEY", "images": ["SECRET_IMAGE"],
        "items": [{"subject": "数学二", "mastery": 1, "image": "SECRET_IMAGE"}]},
    })
    assert response.status_code == 200, response.text
    context = fake.calls[1][-1]["content"]
    assert "SECRET_KEY" not in context and "SECRET_IMAGE" not in context


def test_agent_reads_only_own_uploaded_documents(client: TestClient, monkeypatch, tmp_path: Path) -> None:
    _, headers_a = create_user(client, "agent-doc-a")
    _, headers_b = create_user(client, "agent-doc-b")
    for headers in (headers_a, headers_b):
        client.put("/api/model-config", headers=headers, json={
            "provider": "ollama", "base_url": "http://127.0.0.1:11434", "model": "test-model",
            "embedding_model": "", "temperature": 0.2,
        })
    monkeypatch.setattr("app.api.knowledge.UPLOAD_ROOT", tmp_path)
    monkeypatch.setattr("app.services.rag.UPLOAD_ROOT", tmp_path)
    monkeypatch.setattr("app.api.knowledge.build_provider", lambda *args: FakeProvider())
    uploaded = client.post("/api/documents", headers=headers_a, files={"file": ("积分笔记.md", "定积分表示有向面积。".encode(), "text/markdown")})
    assert uploaded.status_code == 201, uploaded.text

    fake_a = FakeProvider("document_query")
    monkeypatch.setattr("app.api.agent.build_provider", lambda *args: fake_a)
    answer_a = client.post("/api/agent/chat", headers=headers_a, json={"message": "我上传的资料如何解释定积分？"})
    assert answer_a.status_code == 200, answer_a.text
    assert "定积分表示有向面积" in fake_a.calls[1][-1]["content"]
    assert "[1] 积分笔记.md" in answer_a.json()["answer"]
    assert answer_a.json()["used_tools"] == ["user_documents"]

    fake_b = FakeProvider("document_query")
    monkeypatch.setattr("app.api.agent.build_provider", lambda *args: fake_b)
    answer_b = client.post("/api/agent/chat", headers=headers_b, json={"message": "我上传的资料如何解释定积分？"})
    assert answer_b.status_code == 200, answer_b.text
    assert answer_b.json()["answer"] == "在已上传资料中没有找到足够证据。请换一种问法，或上传相关资料。"
    assert len(fake_b.calls) == 1


def test_agent_stream_cites_uploaded_documents(client: TestClient, monkeypatch, tmp_path: Path) -> None:
    _, headers = create_user(client, "agent-doc-stream")
    client.put("/api/model-config", headers=headers, json={
        "provider": "ollama", "base_url": "http://127.0.0.1:11434", "model": "test-model",
        "embedding_model": "", "temperature": 0.2,
    })
    monkeypatch.setattr("app.api.knowledge.UPLOAD_ROOT", tmp_path)
    monkeypatch.setattr("app.services.rag.UPLOAD_ROOT", tmp_path)
    monkeypatch.setattr("app.api.knowledge.build_provider", lambda *args: FakeProvider())
    assert client.post("/api/documents", headers=headers, files={"file": ("公式.md", "定积分表示有向面积。".encode(), "text/markdown")}).status_code == 201
    fake = StreamingProvider("document_query")
    monkeypatch.setattr("app.api.agent.build_provider", lambda *args: fake)

    response = client.post("/api/agent/chat/stream", headers=headers, json={"message": "我的资料如何解释定积分？"})

    assert response.status_code == 200, response.text
    assert "资料来源" in response.text
    assert "[1] 公式.md" in response.text
    assert "定积分表示有向面积" in fake.calls[1][-1]["content"]


def test_agent_retrieves_vector_documents(client: TestClient, monkeypatch, tmp_path: Path) -> None:
    _, headers = create_user(client, "agent-doc-vector")
    monkeypatch.setattr("app.api.knowledge.UPLOAD_ROOT", tmp_path / "uploads")
    monkeypatch.setattr("app.services.rag.CHROMA_ROOT", tmp_path / "chroma")

    class VectorProvider(FakeProvider):
        async def embed(self, texts: list[str]) -> list[list[float]]:
            return [[1.0, 0.0] for _ in texts]

    monkeypatch.setattr("app.api.knowledge.build_provider", lambda *args: VectorProvider())
    uploaded = client.post("/api/documents", headers=headers, files={"file": ("向量笔记.md", "定积分表示有向面积。".encode(), "text/markdown")})
    assert uploaded.status_code == 201, uploaded.text
    fake = VectorProvider("document_query")
    monkeypatch.setattr("app.api.agent.build_provider", lambda *args: fake)

    response = client.post("/api/agent/chat", headers=headers, json={"message": "我的资料中定积分表示什么？"})

    assert response.status_code == 200, response.text
    assert "定积分表示有向面积" in fake.calls[1][-1]["content"]
    assert "[1] 向量笔记.md" in response.json()["answer"]


def test_agent_requires_model_configuration(client: TestClient) -> None:
    _, headers = create_user(client, "agent-no-config", with_config=False)
    response = client.post("/api/agent/chat", headers=headers, json={"message": "你好"})
    assert response.status_code == 409
    assert "模型设置" in response.json()["detail"]


def test_agent_rejects_unknown_model_route_and_uses_allowlist(client: TestClient, monkeypatch) -> None:
    _, headers = create_user(client, "agent-allowlist")
    fake = FakeProvider("delete_all_data")
    monkeypatch.setattr("app.api.agent.build_provider", lambda *args: fake)

    response = client.post("/api/agent/chat", headers=headers, json={"message": "你好"})

    assert response.status_code == 200, response.text
    assert response.json()["intent"] == "general"
    assert response.json()["used_tools"] == []


def test_agent_sanitizes_provider_errors(client: TestClient, monkeypatch) -> None:
    _, headers = create_user(client, "agent-error")
    fake = MissingModelProvider()
    monkeypatch.setattr("app.api.agent.build_provider", lambda *args: fake)

    response = client.post("/api/agent/chat", headers=headers, json={"message": "今天学什么"})

    assert response.status_code == 502
    assert response.json()["detail"] == "模型不存在，请检查模型名称，或先在 Ollama 中下载该模型"
    assert "http://" not in response.text
    assert fake.closed is True


def test_stream_chat_emits_chunks_and_persists_conversation(client: TestClient, monkeypatch) -> None:
    _, headers = create_user(client, "agent-stream")
    _, other_headers = create_user(client, "agent-stream-other")
    client.post("/api/plans/generate", headers=headers, json={})
    fake = StreamingProvider()
    monkeypatch.setattr("app.api.agent.build_provider", lambda *args: fake)

    response = client.post("/api/agent/chat/stream", headers=headers, json={"message": "我今天学什么？"})
    assert response.status_code == 200, response.text
    assert "text/event-stream" in response.headers["content-type"]
    assert 'event: meta' in response.text
    assert 'event: delta\ndata: {"text": "今天先做"}' in response.text
    assert 'event: delta\ndata: {"text": "数学任务。"}' in response.text
    assert 'event: done' in response.text
    assert fake.closed is True
    assert "今日计划" in fake.calls[1][-1]["content"]

    conversations = client.get("/api/agent/conversations", headers=headers).json()
    assert len(conversations) == 1
    assert conversations[0]["message_count"] == 2
    conversation_id = conversations[0]["id"]
    detail = client.get(f"/api/agent/conversations/{conversation_id}", headers=headers).json()
    assert detail["messages"][1]["content"] == "今天先做数学任务。"
    assert client.post("/api/agent/chat/stream", headers=other_headers, json={
        "message": "继续", "conversation_id": conversation_id,
    }).status_code == 404


def test_stream_chat_falls_back_after_partial_answer(client: TestClient, monkeypatch) -> None:
    _, headers = create_user(client, "agent-stream-error")

    class BrokenStream(StreamingProvider):
        async def stream_chat(self, messages: list[dict[str, str]], temperature: float = 0.2):
            yield "半句"
            request = httpx.Request("POST", "http://127.0.0.1:11434/api/chat")
            raise httpx.RequestError("connection dropped", request=request)

    fake = BrokenStream()
    monkeypatch.setattr("app.api.agent.build_provider", lambda *args: fake)
    response = client.post("/api/agent/chat/stream", headers=headers, json={"message": "今天学什么"})
    assert response.status_code == 200
    assert "event: reset" in response.text
    assert "event: done" in response.text
    history = client.get("/api/agent/conversations", headers=headers).json()
    assert history[0]["message_count"] == 2
    detail = client.get(f"/api/agent/conversations/{history[0]['id']}", headers=headers).json()
    assert detail["messages"][1]["content"] == "今天先完成数学任务，再按顺序推进其余科目。"
    assert fake.closed is True


def test_stream_chat_failed_fallback_does_not_save_partial_answer(client: TestClient, monkeypatch) -> None:
    _, headers = create_user(client, "agent-stream-double-error")

    class BrokenProvider(StreamingProvider):
        async def stream_chat(self, messages: list[dict[str, str]], temperature: float = 0.2):
            yield "半句"
            raise httpx.RequestError("stream dropped", request=httpx.Request("POST", "http://127.0.0.1:11434/api/chat"))

        async def chat(self, messages: list[dict[str, str]], temperature: float = 0.2) -> str:
            if not self.calls:
                return await super().chat(messages, temperature)
            raise httpx.RequestError("fallback failed", request=httpx.Request("POST", "http://127.0.0.1:11434/api/chat"))

    fake = BrokenProvider()
    monkeypatch.setattr("app.api.agent.build_provider", lambda *args: fake)
    response = client.post("/api/agent/chat/stream", headers=headers, json={"message": "今天学什么"})
    assert response.status_code == 200
    assert "event: reset" in response.text
    assert "event: error" in response.text
    assert client.get("/api/agent/conversations", headers=headers).json() == []


def test_long_conversation_creates_and_reuses_summary(client: TestClient, monkeypatch) -> None:
    _, headers = create_user(client, "agent-summary")
    fake = SummarizingProvider()
    monkeypatch.setattr("app.api.agent.build_provider", lambda *args: fake)
    conversation_id = None
    for index in range(11):
        response = client.post("/api/agent/chat", headers=headers, json={
            "message": f"第 {index + 1} 轮学习讨论",
            "conversation_id": conversation_id,
        })
        assert response.status_code == 200, response.text
        conversation_id = response.json()["conversation_id"]

    detail = client.get(f"/api/agent/conversations/{conversation_id}", headers=headers).json()
    assert detail["message_count"] == 22
    assert "数学二积分" in detail["summary"]
    assert any(
        any("较早对话摘要" in message["content"] for message in call if message["role"] == "system")
        for call in fake.calls
    )
