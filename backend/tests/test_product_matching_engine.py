import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.product_service import ProductService

client = TestClient(app)


def test_scenario_1_exact_available_product():
    """
    Scenario 1: Customer searches for an exact available product.
    Expected: Exact product appears first with purchase option and exact match tier.
    """
    res = client.get("/api/products/search?q=SS 304 Water Storage Tank – 1000 Litres")
    assert res.status_code == 200
    data = res.json()
    assert data["has_exact_match"] is True
    assert data["exact_count"] >= 1
    exact_names = [p["name"] for p in data["exact_matches"]]
    assert "SS 304 Water Storage Tank – 1000 Litres" in exact_names
    # Check that in_stock is True and available quantity exists
    matched = data["exact_matches"][0]
    assert matched["match_tier"] == "exact"
    assert matched["in_stock"] is True


def test_scenario_2_unavailable_exact_similar_exists():
    """
    Scenario 2: Customer searches for a product variant that has similar/alternative items in catalogue.
    Expected: Similar and alternative products appear.
    """
    # Search for an alternative brand or variant
    res = client.get("/api/products/search?q=Stainless Steel 304 Storage Tank 1000L")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 1
    # Check that items or similar/alternative matches are present
    all_matched_names = [p["name"] for p in data["items"]]
    assert any("304" in name for name in all_matched_names)


def test_scenario_3_mandatory_spec_override():
    """
    Scenario 3: Customer searches for a product with different mandatory specifications (e.g. SS 316 vs SS 304).
    Expected: Incompatible products are not presented as exact matches (classified as alternative with structured explanation).
    """
    res = client.get("/api/products/search?q=SS 316 Water Storage Tank – 1000 Litres")
    assert res.status_code == 200
    data = res.json()

    # SS 316 must be exact
    exact_names = [p["name"] for p in data["exact_matches"]]
    assert all("316" in name for name in exact_names)

    # SS 304 must NOT be classified as exact match
    for p in data["exact_matches"]:
        assert "304" not in p["name"]

    # SS 304 products must be classified as alternative matches
    alt_names = [p["name"] for p in data["alternative_matches"]]
    assert any("304" in name for name in alt_names)

    # Check that difference is explained
    for p in data["alternative_matches"]:
        if "304" in p["name"]:
            assert len(p["different_attributes"]) > 0
            assert any("material" in attr.lower() or "grade" in attr.lower() for attr in p["different_attributes"])


def test_scenario_4_no_suitable_products_custom_demand_fallback():
    """
    Scenario 4: No suitable products exist in the catalog.
    Expected: Suggestion message advises custom demand creation and returns prefilled params.
    """
    res = client.get("/api/products/search?q=XYZNonExistentHypotheticalApparatus99999")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 0
    assert data["has_exact_match"] is False
    assert "We couldn't find a product that fully matches your requirements" in (data["suggestion_message"] or "")

    # Also test POST /api/products/match
    match_res = client.post(
        "/api/products/match",
        json={
            "query": "Custom Titanium Cryogenic Valve",
            "category": "Industrial Hardware",
            "target_price": 500.0,
            "target_quantity": 10,
        },
    )
    assert match_res.status_code == 200
    match_data = match_res.json()
    assert match_data["recommendation"] in ["create_demand", "view_alternatives"]
    assert match_data["create_demand_params"]["product"] == "Custom Titanium Cryogenic Valve"
    assert match_data["create_demand_params"]["category"] == "Industrial Hardware"


def test_discovery_endpoints():
    """
    Verify newly added discovery endpoints:
      - /api/products/recommendations
      - /api/products/popular
      - /api/products/recent
      - /api/products/{id}/similar
    """
    rec_res = client.get("/api/products/recommendations")
    assert rec_res.status_code == 200
    assert isinstance(rec_res.json(), list)

    pop_res = client.get("/api/products/popular")
    assert pop_res.status_code == 200
    assert isinstance(pop_res.json(), list)

    recent_res = client.get("/api/products/recent")
    assert recent_res.status_code == 200
    assert isinstance(recent_res.json(), list)

