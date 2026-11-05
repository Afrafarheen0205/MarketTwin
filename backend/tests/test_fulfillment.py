from fastapi.testclient import TestClient
from app.main import app


def test_merchant_orders_requires_auth():
    client = TestClient(app)
    response = client.get("/api/v1/merchant/orders")
    assert response.status_code == 401


def test_customer_tracking_requires_auth():
    client = TestClient(app)
    response = client.get("/api/v1/customer/orders/00000000-0000-0000-0000-000000000000/tracking")
    assert response.status_code == 401