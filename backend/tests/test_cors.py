import pytest
from fastapi.testclient import TestClient

from app import main
from app.core.config import Settings


FRONTEND_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://10.107.161.106:5173",
)


@pytest.mark.parametrize("origin", FRONTEND_ORIGINS)
def test_checkout_allows_frontend_origin_credentials_and_authorization(
    monkeypatch,
    origin,
):
    settings = Settings(
        _env_file=None,
        ALLOWED_ORIGINS=",".join(FRONTEND_ORIGINS),
    )
    assert set(settings.cors_origins) == set(FRONTEND_ORIGINS)
    monkeypatch.setattr(main, "settings", settings)
    client = TestClient(main.create_application())

    preflight = client.options(
        "/api/v1/customer/orders/checkout",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == origin
    assert preflight.headers["access-control-allow-credentials"] == "true"
    allowed_headers = preflight.headers["access-control-allow-headers"].casefold()
    assert "authorization" in allowed_headers
    assert "content-type" in allowed_headers

    response = client.post(
        "/api/v1/customer/orders/checkout",
        headers={"Origin": origin, "Authorization": "Bearer invalid-test-token"},
        json={
            "product_id": "catalogue-1",
            "quantity": 1,
            "requirements": {},
            "idempotency_key": "11111111-1111-4111-8111-111111111111",
        },
    )

    assert response.status_code == 401
    assert response.headers["access-control-allow-origin"] == origin
    assert response.headers["access-control-allow-credentials"] == "true"
