from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api.v1.endpoints import auth
from app.main import app


def test_customer_registration_creates_unverified_user(monkeypatch):
    observed = {}

    def create_user(payload):
        observed.update(payload)
        return SimpleNamespace(user=SimpleNamespace(id="customer-1"))

    client = SimpleNamespace(
        auth=SimpleNamespace(admin=SimpleNamespace(create_user=create_user))
    )
    monkeypatch.setattr(auth, "get_supabase_client", lambda: client)

    response = TestClient(app).post(
        "/api/v1/auth/register/customer",
        json={
            "email": "customer@example.test",
            "password": "secure-password",
            "full_name": "Test Customer",
        },
    )

    assert response.status_code == 200
    assert observed["email_confirm"] is False
    assert observed["user_metadata"]["role"] == "customer"
