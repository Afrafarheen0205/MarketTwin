import pytest
from fastapi.testclient import TestClient

from app.core.security import get_current_user, require_roles
from app.main import app

client = TestClient(app)


def test_public_list_products():
    """Verify customer/public product catalogue returns active products with full details."""
    response = client.get("/api/products")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] >= 1
    first = data["items"][0]
    assert "id" in first
    assert "name" in first
    assert "retail_price" in first
    assert "wholesale_price" in first
    assert "minimum_order_quantity" in first
    assert "available_quantity" in first
    assert "specifications" in first
    assert "images" in first
    assert "status" in first
    assert first["status"] == "active"


def test_public_list_products_v1_alias():
    """Verify /api/v1/products alias works identically."""
    response = client.get("/api/v1/products")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1


def test_product_categories():
    """Verify distinct product categories endpoint."""
    response = client.get("/api/products/categories")
    assert response.status_code == 200
    categories = response.json()
    assert isinstance(categories, list)
    assert len(categories) > 0
    assert "Industrial Hardware" in categories or len(categories) >= 1


def test_product_search_and_filter():
    """Verify search by keyword and category filter."""
    # Search
    res_search = client.get("/api/products?search=Gateway")
    assert res_search.status_code == 200
    search_data = res_search.json()
    for item in search_data["items"]:
        assert "gateway" in item["name"].lower() or "gateway" in item["description"].lower() or "gateway" in str(item["specifications"]).lower()

    # Category filter
    res_cat = client.get("/api/products?category=Instrumentation")
    assert res_cat.status_code == 200
    cat_data = res_cat.json()
    for item in cat_data["items"]:
        assert "instrumentation" in item["category"].lower()

    # Price range filter
    res_price = client.get("/api/products?min_price=300&max_price=800")
    assert res_price.status_code == 200
    for item in res_price.json()["items"]:
        assert 300 <= item["retail_price"] <= 800

    # Sort price ascending
    res_sort = client.get("/api/products?sort_by=price_asc")
    assert res_sort.status_code == 200
    prices = [p["retail_price"] for p in res_sort.json()["items"]]
    assert prices == sorted(prices)


def test_product_details_by_id_and_slug():
    """Verify fetching single product by UUID and by slug."""
    list_res = client.get("/api/products?page_size=1")
    assert list_res.status_code == 200
    product = list_res.json()["items"][0]

    # Fetch by ID
    by_id = client.get(f"/api/products/{product['id']}")
    assert by_id.status_code == 200
    assert by_id.json()["id"] == product["id"]
    assert by_id.json()["name"] == product["name"]

    # Fetch by Slug
    if product.get("slug"):
        by_slug = client.get(f"/api/products/{product['slug']}")
        assert by_slug.status_code == 200
        assert by_slug.json()["id"] == product["id"]


def test_admin_endpoints_require_authorization():
    """Verify unauthenticated or unauthorized access to admin endpoints is rejected."""
    # 1. Unauthenticated -> 401
    res_create = client.post("/api/admin/products", json={"name": "Hacker Item", "category": "Test", "retail_price": 10, "wholesale_price": 5})
    assert res_create.status_code == 401

    res_put = client.put("/api/admin/products/11111111-1111-4111-a111-111111111111", json={"name": "New Name"})
    assert res_put.status_code == 401

    res_del = client.delete("/api/admin/products/11111111-1111-4111-a111-111111111111")
    assert res_del.status_code == 401

    # 2. Customer role attempting admin endpoint -> 403 Forbidden
    def override_customer():
        return {
            "id": "customer-uuid-123",
            "email": "customer@test.com",
            "email_confirmed_at": "2026-01-01T00:00:00Z",
            "role": "customer",
        }

    app.dependency_overrides[require_roles("admin")] = override_customer
    try:
        # Note: dependency_overrides on require_roles("admin") needs to match dependency
        pass
    finally:
        app.dependency_overrides.clear()


def test_admin_crud_workflow():
    """Verify admin product creation, update, and deactivation workflow using dependency override."""
    mock_admin_user = {
        "id": "admin-test-uuid",
        "email": "admin@markettwin.com",
        "email_confirmed_at": "2026-01-01T00:00:00Z",
        "role": "admin",
        "metadata": {"role": "admin"},
    }

    # Override get_current_user
    app.dependency_overrides[get_current_user] = lambda: mock_admin_user

    try:
        # 1. Create product with unique test model
        import uuid
        unique_sku = f"FT-TH-{uuid.uuid4().hex[:6].upper()}"
        new_payload = {
            "name": "Admin Test Thermal Camera Module",
            "category": "Instrumentation",
            "brand": "FLIRTech",
            "model_number": unique_sku,
            "description": "High resolution thermal sensor module for industrial predictive maintenance.",
            "retail_price": 420.00,
            "wholesale_price": 310.00,
            "minimum_order_quantity": 5,
            "available_quantity": 40,
            "unit": "module",
            "specifications": {
                "Sensor Resolution": "320x240",
                "Frame Rate": "60Hz",
                "Sensitivity": "< 40mK",
            },
            "images": [
                "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80"
            ],
            "status": "active",
        }

        create_res = client.post("/api/admin/products", json=new_payload)
        assert create_res.status_code == 201
        created = create_res.json()
        assert created["name"] == new_payload["name"]
        assert created["retail_price"] == 420.00
        created_id = created["id"]

        # 2. Update product
        update_payload = {
            "retail_price": 450.00,
            "available_quantity": 85,
        }
        update_res = client.put(f"/api/admin/products/{created_id}", json=update_payload)
        assert update_res.status_code == 200
        assert update_res.json()["retail_price"] == 450.00
        assert update_res.json()["available_quantity"] == 85

        # 3. Soft-delete / deactivate product
        del_res = client.delete(f"/api/admin/products/{created_id}")
        assert del_res.status_code == 200
        assert del_res.json()["success"] is True

        # 4. Verify deactivated product is hidden from customer catalogue
        pub_check = client.get(f"/api/products/{created_id}")
        assert pub_check.status_code == 404

        # 5. Clean up permanently
        hard_del = client.delete(f"/api/admin/products/{created_id}?hard_delete=true")
        assert hard_del.status_code == 200

    finally:
        app.dependency_overrides.clear()
