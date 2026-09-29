from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.api.checkins import consecutive_days


def prepared_user(client: TestClient, name: str = "reviewer") -> tuple[str, dict]:
    registered = client.post(
        "/api/auth/register",
        json={
            "username": name,
            "email": f"{name}@example.com",
            "password": "password123",
        },
    )
    token = registered.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    client.put(
        "/api/profile",
        headers=headers,
        json={
            "exam_date": (date.today() + timedelta(days=300)).isoformat(),
            "school": "广东工业大学",
            "major": "计算机技术",
            "daily_minutes": 180,
            "rest_days": [],
            "subjects": [
                {"subject": "math2", "score": 1, "weaknesses": "高数积分"},
                {"subject": "english2", "score": 3, "weaknesses": "写作"},
                {"subject": "politics", "score": 2, "weaknesses": "马原"},
            ],
        },
    )
    plan = client.post("/api/plans/generate", headers=headers, json={}).json()
    return token, plan


def test_checkin_requires_reason_and_is_user_scoped(client: TestClient) -> None:
    token_a, plan_a = prepared_user(client, "reviewer-a")
    token_b, _ = prepared_user(client, "reviewer-b")
    task_id = plan_a["tasks"][0]["id"]

    no_reason = client.post(
        "/api/checkins",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"task_id": task_id, "completed": False, "actual_minutes": 10},
    )
    assert no_reason.status_code == 422

    other_user = client.post(
        "/api/checkins",
        headers={"Authorization": f"Bearer {token_b}"},
        json={
            "task_id": task_id,
            "completed": False,
            "actual_minutes": 10,
            "difficulty": "too_hard",
        },
    )
    assert other_user.status_code == 404


def test_streak_counts_distinct_consecutive_study_days() -> None:
    today = date(2026, 9, 24)
    assert consecutive_days(set(), today) == 0
    assert consecutive_days({today - timedelta(days=1), today - timedelta(days=2)}, today) == 2
    assert consecutive_days({today, today - timedelta(days=1), today - timedelta(days=3)}, today) == 2
    assert consecutive_days({today - timedelta(days=2)}, today) == 0


def test_streak_is_user_scoped_and_updates_after_checkin(client: TestClient) -> None:
    token_a, plan_a = prepared_user(client, "streak-a")
    token_b, _ = prepared_user(client, "streak-b")
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}
    assert client.get("/api/checkins/streak").status_code == 401
    assert client.get("/api/checkins/streak", headers=headers_a).json() == {"days": 0}
    assert client.post("/api/checkins", headers=headers_a, json={
        "task_id": plan_a["tasks"][0]["id"], "completed": True, "actual_minutes": 30,
    }).status_code == 200
    assert client.get("/api/checkins/streak", headers=headers_a).json() == {"days": 1}
    assert client.get("/api/checkins/streak", headers=headers_b).json() == {"days": 0}


def test_skipped_task_is_carried_forward_and_review_uses_real_data(client: TestClient) -> None:
    token, plan = prepared_user(client)
    headers = {"Authorization": f"Bearer {token}"}
    skipped_task, completed_task = plan["tasks"][:2]

    skipped = client.post(
        "/api/checkins",
        headers=headers,
        json={
            "task_id": skipped_task["id"],
            "completed": False,
            "actual_minutes": 20,
            "difficulty": "too_hard",
            "note": "积分方法还不熟",
        },
    )
    assert skipped.status_code == 200
    assert skipped.json()["task"]["status"] == "skipped"

    completed = client.post(
        "/api/checkins",
        headers=headers,
        json={
            "task_id": completed_task["id"],
            "completed": True,
            "actual_minutes": 55,
            "note": "按计划完成",
        },
    )
    assert completed.status_code == 200

    tomorrow = client.post("/api/plans/adjust-next-day", headers=headers, json={})
    assert tomorrow.status_code == 200, tomorrow.text
    adjusted = tomorrow.json()
    assert adjusted["start_date"] == (date.today() + timedelta(days=1)).isoformat()
    assert adjusted["total_minutes"] <= 180
    assert adjusted["tasks"][0]["title"].startswith("顺延：")

    daily_review = client.post("/api/reviews/daily", headers=headers)
    assert daily_review.status_code == 200
    daily_metrics = daily_review.json()["metrics"]
    assert daily_metrics["planned_tasks"] == 3
    assert daily_metrics["completed_tasks"] == 1
    assert daily_metrics["actual_minutes"] == 75
    assert daily_metrics["incomplete_reasons"]["too_hard"] == 1
    assert client.get("/api/reviews/daily", headers=headers).json()["id"] == daily_review.json()["id"]

    review = client.post("/api/reviews/weekly", headers=headers)
    assert review.status_code == 200
    metrics = review.json()["metrics"]
    assert metrics["planned_tasks"] == 3
    assert metrics["completed_tasks"] == 1
    assert metrics["actual_minutes"] == 75
    assert metrics["incomplete_reasons"]["too_hard"] == 1

    assert client.get("/api/plans/next-day", headers=headers).json()["id"] == adjusted["id"]
    assert client.get("/api/reviews/weekly", headers=headers).json()["id"] == review.json()["id"]
