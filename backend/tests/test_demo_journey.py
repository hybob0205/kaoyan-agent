from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.services.model_provider import HealthResult, ModelProvider


class DemoProvider(ModelProvider):
    def __init__(self) -> None:
        self.calls: list[list[dict[str, str]]] = []

    async def chat(self, messages: list[dict[str, str]], temperature: float = 0.2) -> str:
        self.calls.append(messages)
        if len(self.calls) == 1:
            return '{"intent":"school_query"}'
        return "根据已保存的候选院校资料，先核对专业和复试线。"

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [[0.0] for _ in texts]

    async def health_check(self) -> HealthResult:
        return HealthResult(True, "ok", 1)

    async def close(self) -> None:
        return None


def test_registration_to_review_and_conversation_history(client: TestClient, monkeypatch) -> None:
    registered = client.post(
        "/api/auth/register",
        json={"username": "demo-user", "email": "demo-user@example.com", "password": "password123"},
    )
    assert registered.status_code == 201
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    other = client.post(
        "/api/auth/register",
        json={"username": "demo-other", "email": "demo-other@example.com", "password": "password123"},
    )
    other_headers = {"Authorization": f"Bearer {other.json()['access_token']}"}

    profile = client.put("/api/profile", headers=headers, json={
        "exam_date": (date.today() + timedelta(days=120)).isoformat(),
        "school": "验收大学", "major": "计算机技术", "daily_minutes": 180, "rest_days": [],
        "subjects": [
            {"subject": "math2", "score": 1, "weaknesses": "积分"},
            {"subject": "english2", "score": 3, "weaknesses": "阅读"},
            {"subject": "politics", "score": 2, "weaknesses": "马原"},
        ],
    })
    assert profile.status_code == 200
    daily = client.post("/api/plans/generate", headers=headers, json={}).json()
    assert len(daily["tasks"]) == 3
    assert client.get("/api/plans/today", headers=headers).json()["id"] == daily["id"]

    weekly = client.post("/api/plans/week/generate", headers=headers, json={})
    assert weekly.status_code == 200
    assert client.get("/api/plans/week", headers=headers).json()["id"] == weekly.json()["id"]
    stages = client.post("/api/plans/stages/generate", headers=headers, json={})
    assert stages.status_code == 200
    phase_id = stages.json()["phases"][0]["id"]
    assert client.patch(f"/api/plans/stages/{phase_id}", headers=headers, json={"math_focus": "积分错题复盘"}).status_code == 200
    assert client.get("/api/plans/stages", headers=headers).json()["phases"][0]["math_focus"] == "积分错题复盘"

    completed_task, skipped_task = daily["tasks"][:2]
    assert client.post("/api/checkins", headers=headers, json={
        "task_id": completed_task["id"], "completed": True, "actual_minutes": completed_task["minutes"],
    }).status_code == 200
    assert client.post("/api/checkins", headers=headers, json={
        "task_id": skipped_task["id"], "completed": False, "actual_minutes": 15,
        "difficulty": "too_hard", "note": "需要拆分练习",
    }).status_code == 200
    next_day = client.post("/api/plans/adjust-next-day", headers=headers, json={})
    assert next_day.status_code == 200
    assert next_day.json()["total_minutes"] <= 180
    assert client.get("/api/plans/next-day", headers=headers).json()["id"] == next_day.json()["id"]

    review = client.post("/api/reviews/weekly", headers=headers)
    assert review.status_code == 200
    assert review.json()["metrics"]["planned_tasks"] == len(daily["tasks"])
    assert review.json()["metrics"]["completed_tasks"] == 1
    assert client.get("/api/reviews/weekly", headers=headers).json()["id"] == review.json()["id"]

    school = client.post("/api/schools", headers=headers, json={
        "school": "示例大学", "major": "计算机技术", "year": 2026,
        "score_line": 310, "source": "招生简章", "note": "需核对年份",
    })
    assert school.status_code == 201
    school_id = school.json()["id"]
    assert client.get("/api/schools", headers=headers).json()[0]["id"] == school_id
    edited = client.put(f"/api/schools/{school_id}", headers=headers, json={
        "school": "示例大学", "major": "计算机技术", "year": 2026,
        "score_line": 315, "source": "招生简章", "note": "已更新",
    })
    assert edited.status_code == 200
    assert edited.json()["score_line"] == 315
    assert client.get("/api/schools", headers=other_headers).json() == []

    configured = client.put("/api/model-config", headers=headers, json={
        "provider": "ollama", "base_url": "http://127.0.0.1:11434",
        "model": "demo-fake", "embedding_model": "demo-embed", "temperature": 0.2,
    })
    assert configured.status_code == 200
    providers: list[DemoProvider] = []

    def build_fake(*args) -> DemoProvider:
        provider = DemoProvider()
        providers.append(provider)
        return provider

    monkeypatch.setattr("app.api.agent.build_provider", build_fake)
    first_chat = client.post("/api/agent/chat", headers=headers, json={"message": "比较我的候选院校"})
    assert first_chat.status_code == 200, first_chat.text
    assert first_chat.json()["used_tools"] == ["school_candidates"]
    conversation_id = first_chat.json()["conversation_id"]
    second_chat = client.post("/api/agent/chat", headers=headers, json={
        "message": "再说说复试线", "conversation_id": conversation_id,
    })
    assert second_chat.status_code == 200, second_chat.text
    assert second_chat.json()["conversation_id"] == conversation_id
    assert any("比较我的候选院校" in item["content"] for item in providers[1].calls[1])
    assert client.get("/api/agent/conversations", headers=headers).json()[0]["message_count"] == 4
    assert len(client.get(f"/api/agent/conversations/{conversation_id}", headers=headers).json()["messages"]) == 4
    assert client.get(f"/api/agent/conversations/{conversation_id}", headers=other_headers).status_code == 404
    assert client.delete(f"/api/agent/conversations/{conversation_id}", headers=headers).status_code == 204
    assert client.get("/api/agent/conversations", headers=headers).json() == []
