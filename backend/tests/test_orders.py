from fastapi.testclient import TestClient
from app.main import app


def test_create_order_requires_auth():
    client = TestClient(app)
    response = client.post("/api/v1/customer/orders", json={"selection_id": "00000000-0000-0000-0000-000000000000"})
    assert response.status_code == 401


def test_list_orders_requires_auth():
    client = TestClient(app)
    response = client.get("/api/v1/customer/orders")
    assert response.status_code == 401