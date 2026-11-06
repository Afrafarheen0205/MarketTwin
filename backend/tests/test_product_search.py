import pytest
from fastapi.testclient import TestClient

from app.core.security import get_current_user
from app.main import app
from app.services.product_service import ProductService

client = TestClient(app)


def test_search_exact_model_number():
    """1. Test exact model number search returns exact match classification."""
    response = client.get("/api/products/search?q=AE-GW-9000X")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert data["has_exact_match"] is True
    assert data["exact_count"] >= 1
    exact_item = data["exact_matches"][0]
    assert exact_item["model_number"] == "AE-GW-9000X" or exact_item["sku"] == "AE-GW-9000X"
    assert exact_item["match_type"] == "exact"
    assert exact_item["relevance_score"] >= 0.85
    assert any("Model Number" in r or "SKU" in r for r in exact_item["match_reasons"])


def test_search_partial_product_name():
    """2. Test partial product title search."""
    response = client.get("/api/products/search?q=Ultrasonic")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    first = data["items"][0]
    assert "ultrasonic" in first["name"].lower()
    assert first["relevance_score"] > 0.0


def test_search_brand_and_model():
    """3. Test brand and model combined search."""
    response = client.get("/api/products/search?q=FlowMetric FM-US-620")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    first = data["items"][0]
    assert first["brand"] == "FlowMetric" or "flowmetric" in first["name"].lower() or "flowmetric" in str(first["specifications"]).lower()
    assert first["match_type"] == "exact"


def test_search_case_insensitive_and_whitespace():
    """4. Test case-insensitive search and trimmed whitespace."""
    response = client.get("/api/products/search?q=   acueDGE   ")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert data["query"] == "acueDGE"
    first = data["items"][0]
    assert first["brand"].lower() == "acuedge" or "acuedge" in first["name"].lower() or "acuedge" in str(first["specifications"]).lower()


def test_search_category_filter():
    """5. Test category filter constraint on search results."""
    response = client.get("/api/products/search?q=Pump&category=Medical & Lab Equipment")
    assert response.status_code == 200
    data = response.json()
    for item in data["items"]:
        assert "medical" in item["category"].lower()


def test_search_price_filtering():
    """6. Test min_price and max_price boundaries."""
    response = client.get("/api/products/search?min_price=200&max_price=600")
    assert response.status_code == 200
    data = response.json()
    for item in data["items"]:
        assert 200 <= item["retail_price"] <= 600

    # Invalid range should return 400 Bad Request
    invalid_resp = client.get("/api/products/search?min_price=500&max_price=100")
    assert invalid_resp.status_code == 400


def test_search_similar_product_suggestions():
    """7. Test similar suggestions when query matches specification or category without exact title match."""
    # Searching for "CAN Bus 48V" should suggest the LiFePO4 Energy Module
    response = client.get("/api/products/search?q=CAN Bus 48V")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    # Check that reasons mention specification or title overlap
    first = data["items"][0]
    assert len(first["match_reasons"]) > 0


def test_search_no_results_handling():
    """8. Test no-results state returns empty list with guidance message."""
    response = client.get("/api/products/search?q=XYZNonExistent999MegaGizmo")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert data["has_exact_match"] is False
    assert data["items"] == []
    assert data["suggestion_message"] is not None
    assert "couldn't find" in data["suggestion_message"].lower()


def test_match_demand_endpoint():
    """9. Test POST /api/products/match evaluates buyer requirements and pre-fills demand creation."""
    payload = {
        "query": "Custom Industrial High-Torque Servo Stepper",
        "category": "Automation & Robotics",
        "target_price": 180.00,
        "target_quantity": 10,
        "specifications": {"Holding Torque": "8.5 N.m"},
    }
    response = client.post("/api/products/match", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "matches" in data
    assert "recommendation" in data
    assert "create_demand_params" in data
    assert data["create_demand_params"]["product"] == payload["query"]
    assert data["create_demand_params"]["category"] == payload["category"]
    assert data["create_demand_params"]["targetPrice"] == 180.00
    assert data["create_demand_params"]["targetQuantity"] == 10


def test_inactive_products_hidden_from_search():
    """10. Verify inactive / deactivated products are excluded from public search."""
    mock_admin_user = {
        "id": "a0000000-0000-0000-0000-000000000001",
        "email": "admin@markettwin.com",
        "role": "admin",
        "metadata": {"role": "admin"},
        "email_confirmed_at": "2026-01-01T00:00:00Z",
    }
    app.dependency_overrides[get_current_user] = lambda: mock_admin_user

    try:
        import uuid
        unique_sku = f"INACT-{uuid.uuid4().hex[:6].upper()}"
        create_res = client.post(
            "/api/admin/products",
            json={
                "name": "Secret Experimental Deactivated Drone",
                "category": "Robotics",
                "model_number": unique_sku,
                "retail_price": 999.00,
                "wholesale_price": 800.00,
                "status": "inactive",
            },
        )
        assert create_res.status_code == 201
        created_id = create_res.json()["id"]

        # Search for it publicly
        search_res = client.get(f"/api/products/search?q={unique_sku}")
        assert search_res.status_code == 200
        # Inactive item MUST NOT appear
        matched_ids = [item["id"] for item in search_res.json()["items"]]
        assert created_id not in matched_ids

        # Clean up
        client.delete(f"/api/admin/products/{created_id}?hard_delete=true")
    finally:
        app.dependency_overrides.clear()
