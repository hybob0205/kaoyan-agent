from fastapi.testclient import TestClient

from tests.test_agent import create_user


def test_confirmed_action_requires_preview_and_is_audited(client: TestClient) -> None:
    _, headers = create_user(client, "action-owner", with_config=False)
    plan = client.post("/api/plans/generate", headers=headers, json={}).json()
    task = plan["tasks"][0]

    preview = client.post("/api/agent/actions/preview", headers=headers, json={"message": "完成今日第1项任务"})
    assert preview.status_code == 201, preview.text
    action = preview.json()
    assert task["title"] in action["preview"]
    assert client.get("/api/plans/today", headers=headers).json()["tasks"][0]["status"] == "pending"

    confirmed = client.post(f"/api/agent/actions/{action['id']}/confirm", headers=headers)
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["status"] == "completed"
    assert client.post(f"/api/agent/actions/{action['id']}/confirm", headers=headers).status_code == 409
    audit = client.get("/api/agent/actions", headers=headers).json()
    assert audit[0]["status"] == "applied"
    assert audit[0]["confirmed_at"] is not None


def test_action_is_user_scoped_and_can_be_cancelled(client: TestClient) -> None:
    _, owner = create_user(client, "action-a", with_config=False)
    _, other = create_user(client, "action-b", with_config=False)
    client.post("/api/plans/generate", headers=owner, json={})
    action_id = client.post("/api/agent/actions/preview", headers=owner, json={"message": "把今天第1项任务标记为完成"}).json()["id"]

    assert client.get("/api/agent/actions", headers=other).json() == []
    assert client.post(f"/api/agent/actions/{action_id}/confirm", headers=other).status_code == 404
    assert client.post(f"/api/agent/actions/{action_id}/cancel", headers=owner).json()["status"] == "cancelled"
    assert client.post(f"/api/agent/actions/{action_id}/confirm", headers=owner).status_code == 409
    assert client.get("/api/plans/today", headers=owner).json()["tasks"][0]["status"] == "pending"


def test_action_rechecks_changed_task_and_rejects_ambiguous_command(client: TestClient) -> None:
    _, headers = create_user(client, "action-stale", with_config=False)
    plan = client.post("/api/plans/generate", headers=headers, json={}).json()
    task = plan["tasks"][0]
    assert client.post("/api/agent/actions/preview", headers=headers, json={"message": "完成所有任务"}).status_code == 422
    action_id = client.post("/api/agent/actions/preview", headers=headers, json={"message": "完成今日第1项任务"}).json()["id"]
    client.patch(f"/api/tasks/{task['id']}", headers=headers, json={"title": "修改后的任务"})
    assert client.post(f"/api/agent/actions/{action_id}/confirm", headers=headers).status_code == 409
    assert client.get("/api/plans/today", headers=headers).json()["tasks"][0]["status"] == "pending"


def test_action_requires_login(client: TestClient) -> None:
    assert client.get("/api/agent/actions").status_code == 401
    assert client.post("/api/agent/actions/preview", json={"message": "完成今日第1项任务"}).status_code == 401


def test_agent_can_preview_and_resize_task_with_time_limit(client: TestClient) -> None:
    _, headers = create_user(client, "action-resize", with_config=False)
    plan = client.post("/api/plans/generate", headers=headers, json={}).json()
    original = plan["tasks"][0]
    preview = client.post("/api/agent/actions/preview", headers=headers, json={"message": "将今日第1项任务改为30分钟"})
    assert preview.status_code == 201, preview.text
    assert preview.json()["action"] == "resize_task"
    assert client.get("/api/plans/today", headers=headers).json()["tasks"][0]["minutes"] == original["minutes"]
    confirmed = client.post(f"/api/agent/actions/{preview.json()['id']}/confirm", headers=headers)
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["minutes"] == 30
    assert client.get("/api/plans/today", headers=headers).json()["total_minutes"] <= 180
    assert client.post("/api/agent/actions/preview", headers=headers, json={"message": "将今日第1项任务改为1440分钟"}).status_code == 422


def test_agent_can_create_task_only_after_confirmation(client: TestClient) -> None:
    _, owner = create_user(client, "action-create", with_config=False)
    _, other = create_user(client, "action-create-other", with_config=False)
    plan = client.post("/api/plans/generate", headers=owner, json={}).json()
    client.delete(f"/api/tasks/{plan['tasks'][-1]['id']}", headers=owner)
    before = client.get("/api/plans/today", headers=owner).json()
    preview = client.post("/api/agent/actions/preview", headers=owner, json={"message": "新增今日数学二任务：积分练习，20分钟"})
    assert preview.status_code == 201, preview.text
    assert preview.json()["action"] == "create_task"
    assert len(client.get("/api/plans/today", headers=owner).json()["tasks"]) == len(before["tasks"])
    assert client.post(f"/api/agent/actions/{preview.json()['id']}/confirm", headers=other).status_code == 404
    saved = client.post(f"/api/agent/actions/{preview.json()['id']}/confirm", headers=owner)
    assert saved.status_code == 200, saved.text
    assert saved.json()["subject"] == "math2" and saved.json()["title"] == "积分练习"
    assert client.get("/api/plans/today", headers=owner).json()["total_minutes"] <= 180
