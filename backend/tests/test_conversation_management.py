from test_agent import create_user


def test_conversation_management(client):
    _, owner = create_user(client, "chat-owner", with_config=False)
    _, other = create_user(client, "chat-other", with_config=False)
    base = "/api/agent/conversations"
    first = client.post(base, headers=owner)
    assert first.status_code == 201
    first_id = first.json()["id"]
    second_id = client.post(base, headers=owner).json()["id"]
    foreign_id = client.post(base, headers=other).json()["id"]
    renamed = client.patch(f"{base}/{first_id}", headers=owner, json={"title": "  数学复习  "})
    assert renamed.status_code == 200
    assert renamed.json()["title"] == "数学复习"
    assert client.get(f"{base}/{first_id}", headers=owner).json()["title"] == "数学复习"
    assert client.patch(f"{base}/{first_id}", headers=owner, json={"title": " "}).status_code == 422
    assert client.patch(f"{base}/{first_id}", headers=other, json={"title": "越权"}).status_code == 404
    assert client.post(f"{base}/delete-many", headers=owner, json={"ids": []}).status_code == 422
    assert client.post(f"{base}/delete-many", headers=owner, json={"ids": [first_id, foreign_id]}).status_code == 404
    assert client.get(f"{base}/{first_id}", headers=owner).status_code == 200
    assert client.post(f"{base}/delete-many", headers=owner, json={"ids": [first_id, second_id, first_id]}).status_code == 204
    assert client.get(base, headers=owner).json() == []
    assert client.get(f"{base}/{foreign_id}", headers=other).status_code == 200
