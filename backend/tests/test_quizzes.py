import json

from fastapi.testclient import TestClient

from app.services.model_provider import HealthResult, ModelProvider


def register(client: TestClient, username: str) -> dict[str, str]:
    response = client.post("/api/auth/register", json={"username": username, "email": f"{username}@example.com", "password": "password123"})
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


class FakeQuizProvider(ModelProvider):
    def __init__(self, response: str) -> None:
        self.response = response

    async def chat(self, messages: list[dict[str, str]], temperature: float = 0.2) -> str:
        return self.response

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return []

    async def health_check(self) -> HealthResult:
        return HealthResult(True, "ok", 1)

    async def close(self) -> None:
        return None


def configure(client: TestClient, headers: dict[str, str]) -> None:
    response = client.put("/api/model-config", headers=headers, json={
        "provider": "ollama", "base_url": "http://127.0.0.1:11434", "model": "fake", "embedding_model": "fake-embed", "temperature": 0.2,
    })
    assert response.status_code == 200, response.text


def quiz_json() -> str:
    return json.dumps({"questions": [
        {"stem": f"第{i}题：下列说法哪项正确？", "options": ["选项甲", "选项乙", "选项丙", "选项丁"], "answer_index": i % 4, "explanation": "根据基本定义可判断。"}
        for i in range(3)
    ]}, ensure_ascii=False)


def test_quiz_generation_submission_history_and_isolation(client: TestClient, monkeypatch) -> None:
    owner = register(client, "quiz-owner")
    other = register(client, "quiz-other")
    configure(client, owner)
    monkeypatch.setattr("app.api.quizzes.build_provider", lambda *args: FakeQuizProvider(quiz_json()))

    created = client.post("/api/quizzes", headers=owner, json={"subject": "english2", "topic": "阅读理解"})
    assert created.status_code == 201, created.text
    quiz_id = created.json()["id"]
    assert len(created.json()["questions"]) == 3
    assert all(question["answer_index"] is None and question["explanation"] is None for question in created.json()["questions"])
    assert client.get("/api/quizzes", headers=other).json() == []
    assert client.get(f"/api/quizzes/{quiz_id}", headers=other).status_code == 404
    assert client.post(f"/api/quizzes/{quiz_id}/submit", headers=other, json={"answers": [0, 1, 2]}).status_code == 404
    assert client.post(f"/api/quizzes/{quiz_id}/submit", headers=owner, json={"answers": [0, 1]}).status_code == 422
    assert client.post(f"/api/quizzes/{quiz_id}/submit", headers=owner, json={"answers": [0, 1, 4]}).status_code == 422

    submitted = client.post(f"/api/quizzes/{quiz_id}/submit", headers=owner, json={"answers": [0, 1, 3]})
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["score"] == 2
    assert submitted.json()["questions"][2]["answer_index"] == 2
    assert submitted.json()["questions"][2]["selected_index"] == 3
    assert client.post(f"/api/quizzes/{quiz_id}/submit", headers=owner, json={"answers": [0, 1, 2]}).status_code == 409
    assert client.get("/api/quizzes", headers=owner).json()[0]["score"] == 2


def test_quiz_requires_model_and_valid_generated_questions(client: TestClient, monkeypatch) -> None:
    headers = register(client, "quiz-validation")
    assert client.post("/api/quizzes", headers=headers, json={"subject": "english2", "topic": "阅读"}).status_code == 409
    configure(client, headers)
    monkeypatch.setattr("app.api.quizzes.build_provider", lambda *args: FakeQuizProvider("not json"))
    response = client.post("/api/quizzes", headers=headers, json={"subject": "english2", "topic": "阅读"})
    assert response.status_code == 502
    assert client.get("/api/quizzes", headers=headers).json() == []
    assert client.post("/api/quizzes", headers=headers, json={"subject": "unknown", "topic": "积分"}).status_code == 422


def test_math_quiz_uses_verified_templates_without_model(client: TestClient) -> None:
    headers = register(client, "quiz-math")
    for topic, expected in [("导数定义", [0, 2, 1]), ("高数积分", [1, 2, 3])]:
        created = client.post("/api/quizzes", headers=headers, json={"subject": "math2", "topic": topic})
        assert created.status_code == 201, created.text
        quiz_id = created.json()["id"]
        submitted = client.post(f"/api/quizzes/{quiz_id}/submit", headers=headers, json={"answers": expected})
        assert submitted.status_code == 200
        assert submitted.json()["score"] == 3
    unsupported = client.post("/api/quizzes", headers=headers, json={"subject": "math2", "topic": "线性代数"})
    assert unsupported.status_code == 422


def test_question_feedback_is_saved_only_after_submission(client: TestClient) -> None:
    owner = register(client, "quiz-feedback-owner")
    other = register(client, "quiz-feedback-other")
    created = client.post("/api/quizzes", headers=owner, json={"subject": "math2", "topic": "高数积分"})
    assert created.status_code == 201
    quiz_id = created.json()["id"]
    feedback = {"question_index": 0, "category": "ambiguous", "note": "两个选项看起来都成立"}
    assert client.post(f"/api/quizzes/{quiz_id}/feedback", headers=owner, json=feedback).status_code == 409
    assert client.post(f"/api/quizzes/{quiz_id}/submit", headers=owner, json={"answers": [1, 2, 3]}).status_code == 200
    assert client.post(f"/api/quizzes/{quiz_id}/feedback", headers=other, json=feedback).status_code == 404
    assert client.post(f"/api/quizzes/{quiz_id}/feedback", headers=owner, json={**feedback, "question_index": 3}).status_code == 422

    saved = client.post(f"/api/quizzes/{quiz_id}/feedback", headers=owner, json=feedback)
    assert saved.status_code == 200, saved.text
    assert saved.json()["questions"][0]["feedback"] == {"category": "ambiguous", "note": feedback["note"]}
    assert saved.json()["score"] == 3
    assert client.get(f"/api/quizzes/{quiz_id}", headers=owner).json()["questions"][0]["feedback"] == saved.json()["questions"][0]["feedback"]
    assert client.get("/api/quizzes", headers=owner).json()[0]["questions"][0]["feedback"] == saved.json()["questions"][0]["feedback"]


def test_quiz_analysis_uses_only_submitted_user_history(client: TestClient) -> None:
    owner = register(client, "quiz-analysis-owner")
    other = register(client, "quiz-analysis-other")
    integral = client.post("/api/quizzes", headers=owner, json={"subject": "math2", "topic": "高数积分"}).json()
    derivative = client.post("/api/quizzes", headers=owner, json={"subject": "math2", "topic": "导数定义"}).json()
    client.post("/api/quizzes", headers=owner, json={"subject": "math2", "topic": "高数积分"})
    assert client.post(f"/api/quizzes/{integral['id']}/submit", headers=owner, json={"answers": [1, 0, 0]}).json()["score"] == 1
    assert client.post(f"/api/quizzes/{derivative['id']}/submit", headers=owner, json={"answers": [0, 2, 1]}).json()["score"] == 3

    analysis = client.get("/api/quizzes/analysis", headers=owner)
    assert analysis.status_code == 200, analysis.text
    payload = analysis.json()
    assert payload["submitted_quizzes"] == 2
    assert payload["correct_answers"] == 4
    assert payload["total_questions"] == 6
    assert payload["accuracy"] == 67
    assert payload["subjects"] == [{
        "subject": "math2", "submitted_quizzes": 2, "correct_answers": 4, "total_questions": 6, "accuracy": 67,
    }]
    assert payload["weak_topics"][0]["topic"] == "高数积分"
    assert payload["weak_topics"][0]["accuracy"] == 33
    assert "高数积分" in payload["recommendation"]

    empty = client.get("/api/quizzes/analysis", headers=other).json()
    assert empty["submitted_quizzes"] == 0
    assert empty["subjects"] == []
    assert empty["weak_topics"] == []
