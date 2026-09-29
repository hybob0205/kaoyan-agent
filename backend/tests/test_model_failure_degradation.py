from datetime import date, timedelta

import httpx
from fastapi.testclient import TestClient

from app.services.model_provider import HealthResult, ModelProvider


class OfflineProvider(ModelProvider):
    async def chat(self, messages: list[dict[str, str]], temperature: float = 0.2) -> str:
        raise httpx.RequestError("model offline", request=httpx.Request("POST", "http://127.0.0.1:11434/api/chat"))

    async def embed(self, texts: list[str]) -> list[list[float]]:
        raise AssertionError("not used")

    async def health_check(self) -> HealthResult:
        return HealthResult(False, "offline", 0)

    async def close(self) -> None:
        return None


def test_model_failure_keeps_plan_editing_and_review_available(client: TestClient, monkeypatch):
    registered = client.post("/api/auth/register", json={
        "username": "offline-student", "email": "offline@example.com", "password": "password123",
    })
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    profile = client.put("/api/profile", headers=headers, json={
        "exam_date": (date.today() + timedelta(days=120)).isoformat(),
        "school": "验收大学", "major": "计算机技术", "daily_minutes": 180, "rest_days": [],
        "subjects": [
            {"subject": "math2", "score": 1, "weaknesses": "积分"},
            {"subject": "english2", "score": 2, "weaknesses": "阅读"},
            {"subject": "politics", "score": 3, "weaknesses": "马原"},
        ],
    })
    assert profile.status_code == 200
    plan = client.post("/api/plans/generate", headers=headers, json={}).json()
    configured = client.put("/api/model-config", headers=headers, json={
        "provider": "ollama", "base_url": "http://127.0.0.1:11434",
        "model": "gemma3:4b", "embedding_model": "nomic-embed-text", "temperature": 0.2,
    })
    assert configured.status_code == 200
    monkeypatch.setattr("app.api.agent.build_provider", lambda *args: OfflineProvider())

    failed_chat = client.post("/api/agent/chat", headers=headers, json={"message": "我今天该学什么？"})
    assert failed_chat.status_code == 502
    assert client.get("/api/plans/today", headers=headers).status_code == 200
    task_id = plan["tasks"][0]["id"]
    edited = client.patch(f"/api/tasks/{task_id}", headers=headers, json={"title": "手动调整的积分练习"})
    assert edited.status_code == 200
    assert edited.json()["title"] == "手动调整的积分练习"
    checkin = client.post("/api/checkins", headers=headers, json={
        "task_id": task_id, "completed": True, "actual_minutes": 30,
    })
    assert checkin.status_code == 200
    assert client.post("/api/reviews/weekly", headers=headers).status_code == 200
