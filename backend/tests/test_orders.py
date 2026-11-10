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


def test_catalogue_checkout_endpoints_require_auth():
    client = TestClient(app)
    payload = {
        "product_id": "catalogue-1",
        "quantity": 1,
        "requirements": {
            "product_name": "test",
            "product_type": None,
            "category": None,
            "mandatory_requirements": {},
            "optional_preferences": {},
            "commercial_constraints": {},
            "delivery_constraints": {},
        },
    }

    assert client.post("/api/v1/customer/orders/quote", json=payload).status_code == 401
    assert client.post(
        "/api/v1/customer/orders/checkout",
        json={**payload, "idempotency_key": "11111111-1111-4111-8111-111111111111"},
    ).status_code == 401


def test_order_lookup_uses_atomic_snapshot_not_current_offer(monkeypatch):
    from types import SimpleNamespace
    from app.services import order_service

    class Query:
        def __init__(self, table):
            assert table in ("orders", "customer_offer_selections")
            self.table = table
            self.filters = {}

        def select(self, columns):
            return self

        def eq(self, column, value):
            self.filters[column] = value
            return self

        def single(self):
            return self

        def execute(self):
            assert self.filters["customer_id"] == "customer"
            if self.table == "customer_offer_selections":
                return SimpleNamespace(data={"id": "selection"})
            return SimpleNamespace(data=[{
                "id": "order", "order_number": "ORD-existing", "total_price": "59.85",
                "accepted_offer_id": "offer", "accepted_terms": {"group_id": "group", "currency": "USD"},
            }])

    monkeypatch.setattr(order_service, "_client", lambda: SimpleNamespace(table=Query))
    first = order_service.create_order_from_selection("customer", "selection")
    second = order_service.create_order_from_selection("customer", "selection")
    assert first == second
    assert first["total_amount"] == "59.85"
    assert first["group_id"] == "group"