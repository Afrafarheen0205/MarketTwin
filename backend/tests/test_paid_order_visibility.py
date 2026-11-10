import pytest

from app.services import order_service
from app.services.order_service import _verified_paypal_order


@pytest.fixture
def verified_records():
    order = {
        "id": "order-id",
        "customer_id": "customer-id",
        "total_price": "79999.00",
        "payment_status": "Paid",
        "accepted_terms": {"currency": "INR"},
    }
    payment = {
        "id": "payment-id",
        "order_id": "order-id",
        "status": "Captured",
        "provider_order_id": "paypal-order-id",
        "provider_capture_id": "capture-id",
        "captured_at": "2026-11-10T00:00:00Z",
        "amount": "79999.00",
        "currency": "INR",
        "paypal_amount": "999.99",
        "paypal_currency": "USD",
    }
    event = {
        "payment_id": "payment-id",
        "provider_event_id": "capture-id",
        "event_type": "PAYPAL_CAPTURE_COMPLETED",
        "verification_status": "verified",
        "event_payload": {
            "capture_id": "capture-id",
            "paypal_order_id": "paypal-order-id",
            "original_amount": "79999.00",
            "original_currency": "INR",
            "paypal_amount": "999.99",
            "paypal_currency": "USD",
        },
    }
    return order, payment, [event]


def test_completed_verified_capture_is_visible(verified_records):
    assert _verified_paypal_order(*verified_records)


@pytest.mark.parametrize(
    "change",
    [
        lambda order, payment, event: order.update(payment_status="Capturing"),
        lambda order, payment, event: payment.update(status="Pending"),
        lambda order, payment, event: payment.update(provider_capture_id=None),
        lambda order, payment, event: payment.update(captured_at=None),
        lambda order, payment, event: payment.update(paypal_currency="EUR"),
        lambda order, payment, event: payment.update(paypal_amount="1000.00"),
        lambda order, payment, event: payment.update(amount="1.00"),
        lambda order, payment, event: payment.update(order_id="another-order"),
        lambda order, payment, event: event[0].update(verification_status="pending"),
        lambda order, payment, event: event[0]["event_payload"].update(paypal_order_id="other-order"),
        lambda order, payment, event: event[0]["event_payload"].update(paypal_amount="1000.00"),
        lambda order, payment, event: event[0]["event_payload"].update(original_currency="USD"),
    ],
)
def test_unverified_or_mismatched_payment_is_not_visible(verified_records, change):
    order, payment, events = verified_records
    change(order, payment, events)
    assert not _verified_paypal_order(order, payment, events)


def test_malformed_event_payload_is_not_visible(verified_records):
    order, payment, events = verified_records
    events[0]["event_payload"] = ["malformed"]
    assert not _verified_paypal_order(order, payment, events)


def test_get_orders_returns_only_owned_rows_with_verified_paypal_capture(monkeypatch, verified_records):
    order, payment, events = verified_records
    order["match_classification"] = "CLOSEST_ALTERNATIVE"
    invalid_order = {**order, "id": "unverified-order"}
    invalid_payment = {**payment, "id": "unverified-payment", "order_id": "unverified-order"}
    queries = []

    class Query:
        def __init__(self, table):
            self.table = table
            self.filters = {}
            queries.append(self)

        def select(self, _columns):
            return self

        def eq(self, column, value):
            self.filters[column] = value
            return self

        def in_(self, column, values):
            self.filters[column] = values
            return self

        def order(self, *_args, **_kwargs):
            return self

        def execute(self):
            if self.table == "orders":
                assert self.filters["customer_id"] == "customer-id"
                assert self.filters["payment_status"] == ["Paid", "Released"]
                return type("Response", (), {"data": [order, invalid_order]})()
            if self.table == "payments":
                return type("Response", (), {"data": [payment, invalid_payment]})()
            return type("Response", (), {"data": events})()

    client = type("Client", (), {"table": lambda _self, name: Query(name)})()
    monkeypatch.setattr(order_service, "get_supabase_service_client", lambda: client)

    result = order_service.get_orders("customer-id")

    assert len(result) == 1
    assert result[0]["id"] == "order-id"
    assert result[0]["match_classification"] == "CLOSEST_ALTERNATIVE"
