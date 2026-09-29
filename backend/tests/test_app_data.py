from fastapi.testclient import TestClient

from tests.test_agent import create_user


def test_snapshot_is_account_scoped_and_versioned(client: TestClient) -> None:
    _, owner = create_user(client, "snapshot-owner", with_config=False)
    _, other = create_user(client, "snapshot-other", with_config=False)
    path = "/api/app-data/study-hub"
    assert client.get(path, headers=owner).status_code == 404
    key = "math2-study-v1-agent-1"
    saved = client.put(path, headers=owner, json={"expected_version": 0, "data": {key: '{"records":{}}'}})
    assert saved.status_code == 200, saved.text
    assert saved.json()["version"] == 1
    assert client.get(path, headers=other).status_code == 404
    assert client.put(path, headers=other, json={"expected_version": 0, "data": {key: "secret"}}).status_code == 422
    assert client.put(path, headers=owner, json={"expected_version": 0, "data": {key: "stale"}}).status_code == 409
    updated = client.put(path, headers=owner, json={"expected_version": 1, "data": {key: "new"}})
    assert updated.status_code == 200 and updated.json()["version"] == 2
    assert client.get(path, headers=owner).json()["data"][key] == "new"
    cleared = client.put(path, headers=owner, json={"expected_version": 2, "data": {}})
    assert cleared.status_code == 200 and cleared.json()["data"] == {}


def test_mistake_snapshot_excludes_model_secret(client: TestClient, monkeypatch) -> None:
    _, headers = create_user(client, "snapshot-mistake", with_config=False)
    from app.api import app_data
    monkeypatch.setattr(app_data, "MAX_BYTES", 50)
    path = "/api/app-data/mistake-review"
    prefix = "shicuo-agent-1:"
    assert client.put(path, headers=headers, json={"expected_version": 0, "data": {prefix + "shicuo-ai-settings-v1": "API_KEY"}}).status_code == 422
    assert client.put(path, headers=headers, json={"expected_version": 0, "data": {prefix + "other-secret": "secret"}}).status_code == 422
    assert client.put(path, headers=headers, json={"expected_version": 0, "data": {prefix + "shicuo-mistakes-v1": "x" * 100}}).status_code == 413
    saved = client.put(path, headers=headers, json={"expected_version": 0, "data": {prefix + "shicuo-mistakes-v1": "[]"}})
    assert saved.status_code == 200, saved.text
    assert "API_KEY" not in saved.text


def test_schedule_is_account_scoped_and_rejects_bad_dates(client: TestClient) -> None:
    _, owner = create_user(client, "schedule-owner", with_config=False)
    _, other = create_user(client, "schedule-other", with_config=False)
    path = "/api/app-data/agent-schedule"
    events = '[{"id":"holiday","title":"放假","date":"2026-10-01"}]'
    saved = client.put(path, headers=owner, json={"expected_version": 0, "data": {"events": events}})
    assert saved.status_code == 200, saved.text
    assert client.get(path, headers=owner).json()["data"]["events"] == events
    assert client.get(path, headers=other).status_code == 404
    assert client.put(path, headers=owner, json={"expected_version": 1, "data": {"events": '[{"id":"x","title":"放假","date":"2026-02-30"}]'}}).status_code == 422
    assert client.put(path, headers=owner, json={"expected_version": 1, "data": {"secret": "x"}}).status_code == 422
