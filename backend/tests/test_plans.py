from datetime import date, timedelta

from fastapi.testclient import TestClient


def create_user_with_profile(
    client: TestClient,
    suffix: str,
    daily_minutes: int = 180,
    rest_days: list[int] | None = None,
    exam_days: int = 300,
) -> str:
    registered = client.post(
        "/api/auth/register",
        json={
            "username": f"planner-{suffix}",
            "email": f"planner-{suffix}@example.com",
            "password": "password123",
        },
    )
    assert registered.status_code == 201
    token = registered.json()["access_token"]
    profile = client.put(
        "/api/profile",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "exam_date": (date.today() + timedelta(days=exam_days)).isoformat(),
            "school": "广东工业大学",
            "major": "计算机技术",
            "daily_minutes": daily_minutes,
            "rest_days": rest_days or [],
            "subjects": [
                {"subject": "math2", "score": 1, "weaknesses": "高数积分"},
                {"subject": "english2", "score": 3, "weaknesses": "写作"},
                {"subject": "politics", "score": 2, "weaknesses": "马原"},
            ],
        },
    )
    assert profile.status_code == 200
    return token


def test_generate_plan_respects_time_limit_and_is_idempotent(client: TestClient) -> None:
    token = create_user_with_profile(client, "a", 180)
    headers = {"Authorization": f"Bearer {token}"}

    created = client.post("/api/plans/generate", headers=headers, json={})
    assert created.status_code == 200, created.text
    plan = created.json()
    assert plan["total_minutes"] <= 180
    assert len(plan["tasks"]) == 3
    assert plan["tasks"][0]["subject"] == "math2"

    repeated = client.post("/api/plans/generate", headers=headers, json={})
    assert repeated.json()["id"] == plan["id"]

    regenerated = client.post("/api/plans/generate", headers=headers, json={"regenerate": True})
    assert regenerated.json()["id"] != plan["id"]
    assert regenerated.json()["version"] == 2


def test_generate_current_week_plan_respects_rest_days_and_daily_limit(client: TestClient) -> None:
    today = date.today()
    token = create_user_with_profile(client, "week", 180, [today.weekday()])
    headers = {"Authorization": f"Bearer {token}"}

    generated = client.post("/api/plans/week/generate", headers=headers, json={})
    assert generated.status_code == 200, generated.text
    plan = generated.json()
    week_start = today - timedelta(days=today.weekday())
    assert plan["plan_type"] == "weekly"
    assert plan["start_date"] == week_start.isoformat()
    assert plan["end_date"] == (week_start + timedelta(days=6)).isoformat()
    assert all(task["due_date"] != today.isoformat() for task in plan["tasks"])
    assert all(today.isoformat() <= task["due_date"] <= plan["end_date"] for task in plan["tasks"])

    minutes_by_day: dict[str, int] = {}
    for task in plan["tasks"]:
        minutes_by_day[task["due_date"]] = minutes_by_day.get(task["due_date"], 0) + task["minutes"]
    assert all(minutes <= 180 for minutes in minutes_by_day.values())

    repeated = client.post("/api/plans/week/generate", headers=headers, json={})
    assert repeated.json()["id"] == plan["id"]
    assert client.get("/api/plans/week", headers=headers).json()["id"] == plan["id"]

    regenerated = client.post(
        "/api/plans/week/generate",
        headers=headers,
        json={"regenerate": True},
    )
    assert regenerated.status_code == 200
    assert regenerated.json()["id"] != plan["id"]
    assert regenerated.json()["version"] == 2


def test_week_plan_is_private_to_its_owner(client: TestClient) -> None:
    token_a = create_user_with_profile(client, "week-a")
    token_b = create_user_with_profile(client, "week-b")
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}
    generated = client.post("/api/plans/week/generate", headers=headers_a, json={})
    assert generated.status_code == 200

    assert client.get("/api/plans/week", headers=headers_b).status_code == 404


def test_stage_plan_covers_remaining_days_and_versions(client: TestClient) -> None:
    token = create_user_with_profile(client, "stages")
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/plans/stages", headers=headers).status_code == 404

    created = client.post("/api/plans/stages/generate", headers=headers, json={})
    assert created.status_code == 200, created.text
    plan = created.json()
    phases = plan["phases"]
    assert len(phases) == 3
    assert phases[0]["start_date"] == date.today().isoformat()
    assert phases[-1]["end_date"] == (date.today() + timedelta(days=299)).isoformat()
    for current, following in zip(phases, phases[1:], strict=False):
        assert date.fromisoformat(current["end_date"]) + timedelta(days=1) == date.fromisoformat(following["start_date"])

    repeated = client.post("/api/plans/stages/generate", headers=headers, json={})
    assert repeated.json()["id"] == plan["id"]
    regenerated = client.post("/api/plans/stages/generate", headers=headers, json={"regenerate": True})
    assert regenerated.status_code == 200
    assert regenerated.json()["id"] != plan["id"]
    assert regenerated.json()["version"] == 2


def test_stage_plan_edit_is_scoped_and_short_horizon_is_supported(client: TestClient) -> None:
    token_a = create_user_with_profile(client, "stage-a", exam_days=10)
    token_b = create_user_with_profile(client, "stage-b", exam_days=30)
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    plan_a = client.post("/api/plans/stages/generate", headers=headers_a, json={}).json()
    plan_b = client.post("/api/plans/stages/generate", headers=headers_b, json={}).json()
    assert len(plan_a["phases"]) == 1
    assert len(plan_b["phases"]) == 2
    assert client.get("/api/plans/stages", headers=headers_b).json()["id"] == plan_b["id"]

    phase_id = plan_a["phases"][0]["id"]
    assert client.patch(
        f"/api/plans/stages/{phase_id}",
        headers=headers_b,
        json={"math_focus": "越权修改"},
    ).status_code == 404
    assert client.patch(f"/api/plans/stages/{phase_id}", headers=headers_a, json={}).status_code == 422
    edited = client.patch(
        f"/api/plans/stages/{phase_id}",
        headers=headers_a,
        json={"math_focus": "  高数错题专项复盘  "},
    )
    assert edited.status_code == 200
    assert edited.json()["math_focus"] == "高数错题专项复盘"
    assert client.get("/api/plans/stages", headers=headers_a).json()["phases"][0]["math_focus"] == "高数错题专项复盘"

    client.post("/api/plans/stages/generate", headers=headers_a, json={"regenerate": True})
    assert client.patch(
        f"/api/plans/stages/{phase_id}",
        headers=headers_a,
        json={"math_focus": "旧版本修改"},
    ).status_code == 404


def test_task_update_tracks_completion_and_enforces_total_time(client: TestClient) -> None:
    token = create_user_with_profile(client, "a", 120)
    headers = {"Authorization": f"Bearer {token}"}
    plan = client.post("/api/plans/generate", headers=headers, json={}).json()
    task = plan["tasks"][0]

    completed = client.patch(
        f"/api/tasks/{task['id']}",
        headers=headers,
        json={"status": "completed"},
    )
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"

    too_long = client.patch(
        f"/api/tasks/{task['id']}",
        headers=headers,
        json={"minutes": 120},
    )
    assert too_long.status_code == 422

    refreshed = client.get("/api/plans/today", headers=headers)
    assert refreshed.json()["completed_minutes"] == task["minutes"]


def test_today_task_create_delete_preserves_limits_and_checkins(client: TestClient) -> None:
    token_a = create_user_with_profile(client, "task-a", 120)
    token_b = create_user_with_profile(client, "task-b", 120)
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    assert client.post(
        "/api/plans/today/tasks",
        headers=headers_a,
        json={"subject": "math2", "title": "错题复盘", "minutes": 25},
    ).status_code == 404

    plan = client.post("/api/plans/generate", headers=headers_a, json={}).json()
    first = plan["tasks"][0]
    assert client.post(
        "/api/plans/today/tasks",
        headers=headers_a,
        json={"subject": "math2", "title": "错题复盘", "minutes": 25},
    ).status_code == 422

    reduced = client.patch(
        f"/api/tasks/{first['id']}", headers=headers_a, json={"minutes": first["minutes"] - 30}
    )
    assert reduced.status_code == 200
    assert client.post(
        "/api/plans/today/tasks",
        headers=headers_a,
        json={"subject": "math2", "title": "   ", "minutes": 25},
    ).status_code == 422

    created = client.post(
        "/api/plans/today/tasks",
        headers=headers_a,
        json={"subject": "math2", "title": "  错题复盘  ", "minutes": 25},
    )
    assert created.status_code == 201
    task = created.json()
    assert task["title"] == "错题复盘"
    refreshed = client.get("/api/plans/today", headers=headers_a).json()
    assert refreshed["total_minutes"] == plan["total_minutes"] - 5
    assert refreshed["tasks"][-1]["id"] == task["id"]
    assert client.delete(f"/api/tasks/{task['id']}", headers=headers_b).status_code == 404
    assert client.delete(f"/api/tasks/{task['id']}", headers=headers_a).status_code == 204
    assert all(item["id"] != task["id"] for item in client.get("/api/plans/today", headers=headers_a).json()["tasks"])

    checked = client.post(
        "/api/checkins",
        headers=headers_a,
        json={"task_id": first["id"], "completed": True, "actual_minutes": first["minutes"] - 30},
    )
    assert checked.status_code == 200
    assert client.delete(f"/api/tasks/{first['id']}", headers=headers_a).status_code == 409


def test_user_cannot_read_or_update_another_users_plan(client: TestClient) -> None:
    token_a = create_user_with_profile(client, "a")
    token_b = create_user_with_profile(client, "b")
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}
    plan_a = client.post("/api/plans/generate", headers=headers_a, json={}).json()

    assert client.get("/api/plans/today", headers=headers_b).status_code == 404
    forbidden = client.patch(
        f"/api/tasks/{plan_a['tasks'][0]['id']}",
        headers=headers_b,
        json={"status": "completed"},
    )
    assert forbidden.status_code == 404
