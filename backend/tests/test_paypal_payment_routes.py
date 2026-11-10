import asyncio
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import orders


_CUSTOMER = {"id": "customer-id"}
_ORDER = {
    "id": "order-id",
    "total_amount": "120.00",
    "currency": "USD",
    "payment_status": "Not Initiated",
    "order_reference": "ORDER-1",
    "accepted_offer_id": "offer-id",
    "selection_id": "selection-id",
}
_PAYMENT = {
    "id": "payment-id",
    "order_id": "order-id",
    "provider": "paypal",
    "provider_order_id": "paypal-order-id",
    "provider_capture_id": None,
    "amount": "120.00",
    "currency": "USD",
    "paypal_amount": "120.00",
    "paypal_currency": "USD",
    "exchange_rate": "1.00000000",
    "exchange_rate_source": "Native USD order",
    "conversion_timestamp": "2026-01-01T00:00:00+00:00",
    "status": "Created",
}
_COMPLETED_CAPTURE = {
    "id": "paypal-order-id",
    "status": "COMPLETED",
    "purchase_units": [
        {
            "payments": {
                "captures": [
                    {
                        "id": "capture-id",
                        "status": "COMPLETED",
                        "amount": {"value": "120.00", "currency_code": "USD"},
                    }
                ]
            }
        }
    ],
}


def _run(coroutine):
    return asyncio.run(coroutine)


def test_create_payment_persists_provider_order(monkeypatch):
    monkeypatch.setattr(orders, "get_order", lambda customer_id, order_id: _ORDER)
    monkeypatch.setattr(orders, "get_paypal_payment", lambda customer_id, order_id: None)
    monkeypatch.setattr(orders, "paypal_environment", lambda: "sandbox")
    monkeypatch.setattr(
        orders,
        "get_settings",
        lambda: type("SettingsStub", (), {"FRONTEND_URL": "http://localhost:5173"})(),
    )
    monkeypatch.setattr(
        orders,
        "begin_paypal_payment",
        lambda customer_id, order_id, currency, existing_payment: {
            "payment_id": "payment-id",
            "amount": "120.00",
            "currency": "USD",
            "paypal_amount": "120.00",
            "paypal_currency": "USD",
            "exchange_rate": "1.00000000",
            "exchange_rate_source": "Native USD order",
            "conversion_timestamp": "2026-01-01T00:00:00+00:00",
        },
    )
    create_order = AsyncMock(
        return_value={
            "id": "paypal-order-id",
            "status": "CREATED",
            "approval_url": "https://www.sandbox.paypal.com/checkoutnow?token=paypal-order-id",
        }
    )
    recorded = {}

    def persist_order(customer_id, order_id, payment_id, paypal_order_id):
        recorded.update(
            customer_id=customer_id,
            order_id=order_id,
            payment_id=payment_id,
            paypal_order_id=paypal_order_id,
        )
        return {"provider_order_id": paypal_order_id, "status": "Created"}

    monkeypatch.setattr(orders, "create_paypal_order", create_order)
    monkeypatch.setattr(orders, "record_paypal_order", persist_order)

    result = _run(orders.create_paypal_payment("order-id", _CUSTOMER))

    assert result == {
        "paypal_order_id": "paypal-order-id",
        "status": "CREATED",
        "approval_url": "https://www.sandbox.paypal.com/checkoutnow?token=paypal-order-id",
        "original_amount": Decimal("120.00"),
        "original_currency": "USD",
        "paypal_amount": Decimal("120.00"),
        "paypal_currency": "USD",
        "exchange_rate": Decimal("1.00000000"),
        "exchange_rate_source": "Native USD order",
        "conversion_timestamp": "2026-01-01T00:00:00+00:00",
    }
    create_order.assert_awaited_once_with(
        Decimal("120.00"),
        "USD",
        order_reference="ORDER-1",
        request_id="payment-id",
        return_url="http://localhost:5173/customer/payment/success?order_id=order-id",
        cancel_url="http://localhost:5173/customer/payment/cancelled?order_id=order-id",
    )
    assert recorded == {
        "customer_id": "customer-id",
        "order_id": "order-id",
        "payment_id": "payment-id",
        "paypal_order_id": "paypal-order-id",
    }


def test_create_payment_reuses_existing_paypal_order(monkeypatch):
    existing = {**_PAYMENT, "status": "Created"}
    monkeypatch.setattr(orders, "get_order", lambda customer_id, order_id: _ORDER)
    monkeypatch.setattr(orders, "get_paypal_payment", lambda customer_id, order_id: existing)
    monkeypatch.setattr(orders, "paypal_environment", lambda: "sandbox")
    fetch = AsyncMock(
        return_value={
            "id": "paypal-order-id",
            "status": "CREATED",
            "approval_url": "https://www.sandbox.paypal.com/checkoutnow?token=paypal-order-id",
        }
    )
    begin = lambda *args: pytest.fail("A retry must not create another PayPal order.")
    monkeypatch.setattr(orders, "get_paypal_order", fetch)
    monkeypatch.setattr(orders, "begin_paypal_payment", begin)

    result = _run(orders.create_paypal_payment("order-id", _CUSTOMER))

    assert result["paypal_order_id"] == "paypal-order-id"
    assert result["approval_url"].startswith("https://www.sandbox.paypal.com/")
    fetch.assert_awaited_once_with("paypal-order-id")


def test_create_payment_returns_sanitized_sandbox_rejection(monkeypatch):
    inr_order = {**_ORDER, "total_amount": "79999.00", "currency": "INR"}
    monkeypatch.setattr(orders, "get_order", lambda customer_id, order_id: inr_order)
    monkeypatch.setattr(orders, "get_paypal_payment", lambda customer_id, order_id: None)
    monkeypatch.setattr(orders, "paypal_environment", lambda: "sandbox")
    monkeypatch.setattr(
        orders,
        "get_settings",
        lambda: type("SettingsStub", (), {"FRONTEND_URL": "http://localhost:5173"})(),
    )
    monkeypatch.setattr(
        orders,
        "begin_paypal_payment",
        lambda customer_id, order_id, currency, existing_payment: {
            "payment_id": "payment-id",
            "amount": "79999.00",
            "currency": "INR",
            "paypal_amount": "999.99",
            "paypal_currency": "USD",
            "exchange_rate": "0.01250000",
            "exchange_rate_source": "Configured Sandbox test rate",
            "conversion_timestamp": "2026-01-01T00:00:00+00:00",
        },
    )
    monkeypatch.setattr(
        orders,
        "create_paypal_order",
        AsyncMock(
            side_effect=orders.PayPalConnectionError(
                "PayPal Sandbox rejected order creation (HTTP 422; "
                "UNPROCESSABLE_ENTITY; issues: CURRENCY_NOT_SUPPORTED; "
                "debug ID: sandbox-debug-123).",
                status_code=422,
                debug_id="sandbox-debug-123",
                issue_codes=("CURRENCY_NOT_SUPPORTED",),
            )
        ),
    )
    failed = {}

    def mark_failed(customer_id, order_id, payment_id):
        failed.update(customer_id=customer_id, order_id=order_id, payment_id=payment_id)

    monkeypatch.setattr(orders, "fail_paypal_payment", mark_failed)

    with pytest.raises(HTTPException) as error:
        _run(orders.create_paypal_payment("order-id", _CUSTOMER))

    assert error.value.status_code == 502
    assert "CURRENCY_NOT_SUPPORTED" in error.value.detail
    assert "sandbox-debug-123" in error.value.detail
    assert failed == {
        "customer_id": "customer-id",
        "order_id": "order-id",
        "payment_id": "payment-id",
    }


def test_successful_capture_persists_verified_capture(monkeypatch):
    monkeypatch.setattr(orders, "get_order", lambda customer_id, order_id: _ORDER)
    monkeypatch.setattr(
        orders,
        "get_paypal_payment",
        lambda customer_id, order_id: _PAYMENT,
    )
    monkeypatch.setattr(
        orders,
        "claim_paypal_capture",
        lambda customer_id, order_id: {"status": "Capturing", "action": "capture"},
    )
    monkeypatch.setattr(
        orders,
        "capture_paypal_order",
        AsyncMock(return_value=_COMPLETED_CAPTURE),
    )
    persisted = {}

    def finalize(customer_id, order_id, paypal_order_id, capture_id, amount, currency):
        persisted.update(
            customer_id=customer_id,
            order_id=order_id,
            paypal_order_id=paypal_order_id,
            capture_id=capture_id,
            amount=amount,
            currency=currency,
        )
        return {"status": "Captured", "provider_capture_id": capture_id}

    monkeypatch.setattr(orders, "finalize_paypal_capture", finalize)
    monkeypatch.setattr(orders, "get_supabase_client", lambda: None)

    result = _run(
        orders.capture_paypal_payment(
            "order-id",
            orders.PayPalCaptureRequest(paypal_order_id="paypal-order-id"),
            _CUSTOMER,
        )
    )

    assert result == {"status": "COMPLETED", "capture_id": "capture-id"}
    assert persisted == {
        "customer_id": "customer-id",
        "order_id": "order-id",
        "paypal_order_id": "paypal-order-id",
        "capture_id": "capture-id",
        "amount": Decimal("120.00"),
        "currency": "USD",
    }


def test_stale_capture_claim_reconciles_without_second_capture(monkeypatch):
    payment = {**_PAYMENT, "status": "Capturing"}
    monkeypatch.setattr(orders, "get_order", lambda customer_id, order_id: _ORDER)
    monkeypatch.setattr(orders, "get_paypal_payment", lambda customer_id, order_id: payment)
    monkeypatch.setattr(
        orders,
        "claim_paypal_capture",
        lambda customer_id, order_id: {"status": "Capturing", "action": "reconcile"},
    )
    provider_capture = AsyncMock()
    monkeypatch.setattr(orders, "capture_paypal_order", provider_capture)
    monkeypatch.setattr(orders, "get_paypal_order", AsyncMock(return_value=_COMPLETED_CAPTURE))
    monkeypatch.setattr(
        orders,
        "finalize_paypal_capture",
        lambda *args: {"status": "Captured", "provider_capture_id": "capture-id"},
    )
    monkeypatch.setattr(orders, "get_supabase_client", lambda: None)

    result = _run(
        orders.capture_paypal_payment(
            "order-id",
            orders.PayPalCaptureRequest(paypal_order_id="paypal-order-id"),
            _CUSTOMER,
        )
    )

    assert result == {"status": "COMPLETED", "capture_id": "capture-id"}
    provider_capture.assert_not_awaited()


def test_duplicate_capture_is_idempotent(monkeypatch):
    captured_payment = {
        **_PAYMENT,
        "status": "Captured",
        "provider_capture_id": "capture-id",
    }
    monkeypatch.setattr(orders, "get_order", lambda customer_id, order_id: _ORDER)
    monkeypatch.setattr(
        orders,
        "get_paypal_payment",
        lambda customer_id, order_id: captured_payment,
    )
    provider_capture = AsyncMock()
    monkeypatch.setattr(orders, "capture_paypal_order", provider_capture)

    result = _run(
        orders.capture_paypal_payment(
            "order-id",
            orders.PayPalCaptureRequest(paypal_order_id="paypal-order-id"),
            _CUSTOMER,
        )
    )

    assert result == {"status": "COMPLETED", "capture_id": "capture-id"}
    provider_capture.assert_not_awaited()


def test_failed_capture_does_not_persist_captured_status(monkeypatch):
    failed_capture = {**_COMPLETED_CAPTURE, "status": "PENDING"}
    monkeypatch.setattr(orders, "get_order", lambda customer_id, order_id: _ORDER)
    monkeypatch.setattr(
        orders,
        "get_paypal_payment",
        lambda customer_id, order_id: _PAYMENT,
    )
    monkeypatch.setattr(
        orders,
        "claim_paypal_capture",
        lambda customer_id, order_id: {"status": "Capturing", "action": "capture"},
    )
    monkeypatch.setattr(orders, "release_paypal_capture", lambda *args: {"status": "Created"})
    monkeypatch.setattr(
        orders,
        "capture_paypal_order",
        AsyncMock(return_value=failed_capture),
    )
    finalize = lambda *args: pytest.fail("A non-completed capture must not be persisted.")
    monkeypatch.setattr(orders, "finalize_paypal_capture", finalize)

    with pytest.raises(HTTPException) as error:
        _run(
            orders.capture_paypal_payment(
                "order-id",
                orders.PayPalCaptureRequest(paypal_order_id="paypal-order-id"),
                _CUSTOMER,
            )
        )

    assert error.value.status_code == 400


@pytest.mark.parametrize(
    "capture",
    [
        {
            **_COMPLETED_CAPTURE,
            "purchase_units": [
                {
                    "payments": {
                        "captures": [
                            {
                                "id": "capture-id",
                                "status": "COMPLETED",
                                "amount": {"value": "119.00", "currency_code": "USD"},
                            }
                        ]
                    }
                }
            ],
        },
        {
            **_COMPLETED_CAPTURE,
            "purchase_units": [
                {
                    "payments": {
                        "captures": [
                            {
                                "id": "capture-id",
                                "status": "COMPLETED",
                                "amount": {"value": "120.00", "currency_code": "EUR"},
                            }
                        ]
                    }
                }
            ],
        },
        {
            **_COMPLETED_CAPTURE,
            "purchase_units": [
                {
                    "payments": {
                        "captures": [
                            {
                                "status": "COMPLETED",
                                "amount": {"value": "120.00", "currency_code": "USD"},
                            }
                        ]
                    }
                }
            ],
        },
    ],
)
def test_capture_amount_currency_or_id_mismatch_is_not_finalized(monkeypatch, capture):
    monkeypatch.setattr(orders, "get_order", lambda customer_id, order_id: _ORDER)
    monkeypatch.setattr(orders, "get_paypal_payment", lambda customer_id, order_id: _PAYMENT)
    monkeypatch.setattr(
        orders,
        "claim_paypal_capture",
        lambda customer_id, order_id: {"status": "Capturing", "action": "capture"},
    )
    monkeypatch.setattr(orders, "capture_paypal_order", AsyncMock(return_value=capture))
    released = []
    monkeypatch.setattr(
        orders,
        "release_paypal_capture",
        lambda *args: released.append(args) or {"status": "Verification Failed"},
    )
    monkeypatch.setattr(
        orders,
        "finalize_paypal_capture",
        lambda *args: pytest.fail("A mismatched capture must never be finalized."),
    )

    with pytest.raises(HTTPException) as error:
        _run(
            orders.capture_paypal_payment(
                "order-id",
                orders.PayPalCaptureRequest(paypal_order_id="paypal-order-id"),
                _CUSTOMER,
            )
        )

    assert error.value.status_code == 400
    assert released


def test_invalid_order_ownership_stops_before_provider_call(monkeypatch):
    monkeypatch.setattr(orders, "get_order", lambda customer_id, order_id: None)
    provider_capture = AsyncMock()
    monkeypatch.setattr(orders, "capture_paypal_order", provider_capture)

    with pytest.raises(HTTPException) as error:
        _run(
            orders.capture_paypal_payment(
                "order-id",
                orders.PayPalCaptureRequest(paypal_order_id="paypal-order-id"),
                _CUSTOMER,
            )
        )

    assert error.value.status_code == 404
    provider_capture.assert_not_awaited()


def test_unrelated_paypal_order_id_is_not_captured(monkeypatch):
    monkeypatch.setattr(orders, "get_order", lambda customer_id, order_id: _ORDER)
    monkeypatch.setattr(
        orders,
        "get_paypal_payment",
        lambda customer_id, order_id: _PAYMENT,
    )
    provider_capture = AsyncMock()
    monkeypatch.setattr(orders, "capture_paypal_order", provider_capture)

    with pytest.raises(HTTPException) as error:
        _run(
            orders.capture_paypal_payment(
                "order-id",
                orders.PayPalCaptureRequest(paypal_order_id="other-paypal-order"),
                _CUSTOMER,
            )
        )

    assert error.value.status_code == 404
    provider_capture.assert_not_awaited()


def test_database_error_does_not_create_paypal_order(monkeypatch):
    monkeypatch.setattr(orders, "get_order", lambda customer_id, order_id: _ORDER)

    def fail_begin(customer_id, order_id):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(orders, "begin_paypal_payment", fail_begin)
    provider_create = AsyncMock()
    monkeypatch.setattr(orders, "create_paypal_order", provider_create)

    with pytest.raises(HTTPException) as error:
        _run(orders.create_paypal_payment("order-id", _CUSTOMER))

    assert error.value.status_code == 503
    provider_create.assert_not_awaited()


def test_unbacked_order_cannot_start_paypal_checkout(monkeypatch):
    unbacked_order = {
        **_ORDER,
        "accepted_offer_id": None,
        "selection_id": None,
        "product_id": None,
        "checkout_idempotency_key": None,
    }
    monkeypatch.setattr(orders, "get_order", lambda customer_id, order_id: unbacked_order)
    provider_create = AsyncMock()
    monkeypatch.setattr(orders, "create_paypal_order", provider_create)

    with pytest.raises(HTTPException) as error:
        _run(orders.create_paypal_payment("order-id", _CUSTOMER))

    assert error.value.status_code == 422
    provider_create.assert_not_awaited()


def test_capture_database_error_does_not_report_success(monkeypatch):
    monkeypatch.setattr(orders, "get_order", lambda customer_id, order_id: _ORDER)
    monkeypatch.setattr(
        orders,
        "get_paypal_payment",
        lambda customer_id, order_id: _PAYMENT,
    )
    monkeypatch.setattr(
        orders,
        "claim_paypal_capture",
        lambda customer_id, order_id: {"status": "Capturing", "action": "capture"},
    )
    monkeypatch.setattr(
        orders,
        "capture_paypal_order",
        AsyncMock(return_value=_COMPLETED_CAPTURE),
    )

    def fail_finalize(*args):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(orders, "finalize_paypal_capture", fail_finalize)

    with pytest.raises(HTTPException) as error:
        _run(
            orders.capture_paypal_payment(
                "order-id",
                orders.PayPalCaptureRequest(paypal_order_id="paypal-order-id"),
                _CUSTOMER,
            )
        )

    assert error.value.status_code == 503
