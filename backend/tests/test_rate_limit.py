from fastapi.testclient import TestClient

from app.core.rate_limit import RateLimiter
from app.main import request_logger


def test_rate_limiter_resets_after_window(monkeypatch):
    limiter = RateLimiter(window_seconds=10)
    clock = [100.0]
    monkeypatch.setattr("app.core.rate_limit.monotonic", lambda: clock[0])
    assert limiter.check("127.0.0.1", "auth", 2) == 0
    assert limiter.check("127.0.0.1", "auth", 2) == 0
    assert limiter.check("127.0.0.1", "auth", 2) > 0
    assert limiter.check("127.0.0.2", "auth", 2) == 0
    clock[0] = 110.0
    assert limiter.check("127.0.0.1", "auth", 2) == 0


def test_auth_rate_limit_returns_429_and_keeps_health_available(client: TestClient):
    for _ in range(20):
        response = client.post("/api/auth/login", json={"account": "missing", "password": "password123"})
        assert response.status_code == 401
    blocked = client.post("/api/auth/login", json={"account": "missing", "password": "password123"}, headers={"Origin": "http://127.0.0.1:5175"})
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0
    assert blocked.headers["Access-Control-Allow-Origin"] == "http://127.0.0.1:5175"
    assert client.get("/api/health").status_code == 200


def test_request_log_does_not_include_query_or_password(client: TestClient, monkeypatch):
    records = []
    monkeypatch.setattr(request_logger, "info", lambda message, *args: records.append(message % args))
    response = client.post("/api/auth/login?secret=do-not-log", json={"account": "missing", "password": "private-password"})
    assert response.status_code == 401
    messages = "\n".join(records)
    assert "method=POST path=/api/auth/login status=401" in messages
    assert "do-not-log" not in messages
    assert "private-password" not in messages
