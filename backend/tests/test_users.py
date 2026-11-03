from fastapi.testclient import TestClient
from app.main import app


def test_users_me_requires_auth():
    client = TestClient(app)
    response = client.get("/api/v1/users/me")
    assert response.status_code == 401