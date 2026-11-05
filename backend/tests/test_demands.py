from fastapi.testclient import TestClient
from app.main import app


def test_create_demand_requires_auth():
    client = TestClient(app)
    response = client.post("/api/v1/customer/demands", json={"product_name": "Test", "quantity": 1, "unit": "units"})
    assert response.status_code == 401


def test_list_demands_requires_auth():
    client = TestClient(app)
    response = client.get("/api/v1/customer/demands")
    assert response.status_code == 401