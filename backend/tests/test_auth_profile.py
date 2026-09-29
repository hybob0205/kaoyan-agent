from datetime import date, timedelta

from fastapi.testclient import TestClient


def register(client: TestClient, username: str, email: str) -> str:
    response = client.post(
        "/api/auth/register",
        json={"username": username, "email": email, "password": "password123"},
    )
    assert response.status_code == 201, response.text
    return response.json()["access_token"]


def profile_payload(school: str = "广东工业大学") -> dict:
    return {
        "exam_date": (date.today() + timedelta(days=300)).isoformat(),
        "school": school,
        "major": "计算机技术",
        "daily_minutes": 360,
        "rest_days": [6],
        "subjects": [
            {"subject": "math2", "score": 2, "weaknesses": "积分"},
            {"subject": "english2", "score": 3, "weaknesses": "写作"},
            {"subject": "politics", "score": 1, "weaknesses": "尚未开始"},
        ],
    }


def test_register_login_and_current_user(client: TestClient) -> None:
    token = register(client, "student", "student@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["username"] == "student"

    login = client.post(
        "/api/auth/login",
        json={"account": "student@example.com", "password": "password123"},
    )
    assert login.status_code == 200
    assert login.json()["token_type"] == "bearer"


def test_token_is_bound_to_user_identity(client: TestClient) -> None:
    token = register(client, "student", "student@example.com")
    from app.core.security import create_access_token

    mismatched = create_access_token(1, "someone-else@example.com")
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {mismatched}"}).status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200


def test_account_update_refreshes_token_and_preserves_user_scope(client: TestClient) -> None:
    token = register(client, "student", "student@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    updated = client.put("/api/auth/me", headers=headers, json={"username": "小研", "email": "new@example.com"})
    assert updated.status_code == 200, updated.text
    assert updated.json()["user"]["username"] == "小研"
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    fresh_headers = {"Authorization": f"Bearer {updated.json()['access_token']}"}
    assert client.get("/api/auth/me", headers=fresh_headers).json()["email"] == "new@example.com"

    register(client, "another", "taken@example.com")
    duplicate = client.put("/api/auth/me", headers=fresh_headers, json={"username": "another", "email": "new@example.com"})
    assert duplicate.status_code == 409
    assert client.get("/api/auth/me", headers=fresh_headers).json()["username"] == "小研"


def test_duplicate_account_and_invalid_password_are_rejected(client: TestClient) -> None:
    register(client, "student", "student@example.com")
    duplicate = client.post(
        "/api/auth/register",
        json={"username": "student", "email": "other@example.com", "password": "password123"},
    )
    assert duplicate.status_code == 409

    invalid = client.post(
        "/api/auth/login",
        json={"account": "student", "password": "not-the-password"},
    )
    assert invalid.status_code == 401


def test_profile_requires_authentication_and_validates_constraints(client: TestClient) -> None:
    assert client.get("/api/profile").status_code == 401
    token = register(client, "student", "student@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    invalid = profile_payload()
    invalid["daily_minutes"] = 10
    response = client.put("/api/profile", headers=headers, json=invalid)
    assert response.status_code == 422


def test_profiles_are_isolated_by_authenticated_user(client: TestClient) -> None:
    token_a = register(client, "student-a", "a@example.com")
    token_b = register(client, "student-b", "b@example.com")
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    saved = client.put("/api/profile", headers=headers_a, json=profile_payload())
    assert saved.status_code == 200, saved.text
    assert saved.json()["school"] == "广东工业大学"

    assert client.get("/api/profile", headers=headers_b).status_code == 404
    client.put("/api/profile", headers=headers_b, json=profile_payload("广州大学"))

    profile_a = client.get("/api/profile", headers=headers_a)
    profile_b = client.get("/api/profile", headers=headers_b)
    assert profile_a.json()["school"] == "广东工业大学"
    assert profile_b.json()["school"] == "广州大学"
