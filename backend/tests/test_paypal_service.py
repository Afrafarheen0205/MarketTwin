import asyncio
from decimal import Decimal
from unittest.mock import AsyncMock

import httpx
import pytest

from app.core.config import Settings
from app.services import paypal_service


class MockAsyncClient:
    def __init__(self, *, response=None, error=None, **kwargs):
        self.response = response
        self.error = error
        self.headers = {}
        self.post = AsyncMock(side_effect=error) if error else AsyncMock(return_value=response)
        self.get = AsyncMock(side_effect=error) if error else AsyncMock(return_value=response)

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        return False


def _settings(mode="sandbox"):
    return Settings(
        _env_file=None,
        PAYPAL_CLIENT_ID="test-client-id",
        PAYPAL_CLIENT_SECRET="test-client-secret",
        PAYPAL_MODE=mode,
    )


def _run(coroutine):
    return asyncio.run(coroutine)


def test_get_access_token_details_success(monkeypatch):
    response = httpx.Response(
        200,
        json={"access_token": "do-not-print-token", "expires_in": 900, "token_type": "Bearer"},
    )
    client = MockAsyncClient(response=response)
    monkeypatch.setattr(paypal_service, "get_settings", lambda: _settings())
    monkeypatch.setattr(paypal_service.httpx, "AsyncClient", lambda **kwargs: client)

    token = _run(paypal_service.get_access_token_details())

    assert token.value == "do-not-print-token"
    assert token.expires_in == 900
    client.post.assert_awaited_once()
    assert client.post.await_args.args[0] == "https://api-m.sandbox.paypal.com/v1/oauth2/token"
    assert client.post.await_args.kwargs["data"] == {"grant_type": "client_credentials"}


def test_get_access_token_rejects_invalid_credentials(monkeypatch):
    client = MockAsyncClient(response=httpx.Response(401, json={"error": "invalid_client"}))
    monkeypatch.setattr(paypal_service, "get_settings", lambda: _settings())
    monkeypatch.setattr(paypal_service.httpx, "AsyncClient", lambda **kwargs: client)

    with pytest.raises(paypal_service.PayPalConnectionError, match="HTTP 401"):
        _run(paypal_service.get_access_token())


def test_get_access_token_handles_timeout_without_leaking_credentials(monkeypatch):
    client = MockAsyncClient(error=httpx.ReadTimeout("sensitive request context"))
    monkeypatch.setattr(paypal_service, "get_settings", lambda: _settings())
    monkeypatch.setattr(paypal_service.httpx, "AsyncClient", lambda **kwargs: client)

    with pytest.raises(paypal_service.PayPalConnectionError) as error:
        _run(paypal_service.get_access_token())
    assert str(error.value) == "PayPal OAuth request timed out."
    assert "sensitive" not in str(error.value)


def test_get_access_token_rejects_malformed_json(monkeypatch):
    response = httpx.Response(200, content=b"not-json")
    client = MockAsyncClient(response=response)
    monkeypatch.setattr(paypal_service, "get_settings", lambda: _settings())
    monkeypatch.setattr(paypal_service.httpx, "AsyncClient", lambda **kwargs: client)

    with pytest.raises(paypal_service.PayPalConnectionError, match="invalid OAuth response"):
        _run(paypal_service.get_access_token())


@pytest.mark.parametrize(
    "payload, message",
    [
        ({"expires_in": 900}, "did not contain an access token"),
        ({"access_token": "token"}, "did not contain a valid token expiry"),
        ({"access_token": "token", "expires_in": 0}, "did not contain a valid token expiry"),
        ({"access_token": "token", "expires_in": True}, "did not contain a valid token expiry"),
    ],
)
def test_get_access_token_rejects_incomplete_response(monkeypatch, payload, message):
    client = MockAsyncClient(response=httpx.Response(200, json=payload))
    monkeypatch.setattr(paypal_service, "get_settings", lambda: _settings())
    monkeypatch.setattr(paypal_service.httpx, "AsyncClient", lambda **kwargs: client)

    with pytest.raises(paypal_service.PayPalConnectionError, match=message):
        _run(paypal_service.get_access_token())


def test_invalid_paypal_mode_fails_without_request(monkeypatch):
    client = MockAsyncClient(response=httpx.Response(200, json={}))
    monkeypatch.setattr(paypal_service, "get_settings", lambda: _settings("staging"))
    monkeypatch.setattr(paypal_service.httpx, "AsyncClient", lambda **kwargs: client)

    with pytest.raises(paypal_service.PayPalConnectionError, match="only supports"):
        _run(paypal_service.get_access_token())
    client.post.assert_not_awaited()


def test_live_mode_is_rejected(monkeypatch):
    monkeypatch.setattr(paypal_service, "get_settings", lambda: _settings(" LIVE "))

    with pytest.raises(paypal_service.PayPalConnectionError, match="only supports"):
        paypal_service.paypal_environment()


def test_create_order_uses_access_token_and_keeps_checkout_payload(monkeypatch):
    response = httpx.Response(
        201,
        json={"id": "order-id", "status": "CREATED"},
        request=httpx.Request("POST", "https://api-m.sandbox.paypal.com/v2/checkout/orders"),
    )
    client = MockAsyncClient(response=response)
    monkeypatch.setattr(paypal_service, "get_access_token", AsyncMock(return_value="private-token"))
    monkeypatch.setattr(paypal_service, "_base_url", lambda: "https://api-m.sandbox.paypal.com")
    monkeypatch.setattr(paypal_service.httpx, "AsyncClient", lambda **kwargs: client)

    result = _run(paypal_service.create_paypal_order(12.5, "USD"))

    assert result == {"id": "order-id", "status": "CREATED"}
    assert client.post.await_args.kwargs["headers"]["Authorization"] == "Bearer private-token"
    assert client.post.await_args.kwargs["json"]["purchase_units"][0]["amount"] == {
        "currency_code": "USD",
        "value": "12.50",
    }


def test_create_order_returns_only_sandbox_approval_link(monkeypatch):
    response = httpx.Response(
        201,
        json={
            "id": "order-id",
            "status": "CREATED",
            "links": [
                {"rel": "approve", "href": "https://www.sandbox.paypal.com/checkoutnow?token=order-id"}
            ],
        },
        request=httpx.Request("POST", "https://api-m.sandbox.paypal.com/v2/checkout/orders"),
    )
    client = MockAsyncClient(response=response)
    monkeypatch.setattr(paypal_service, "get_access_token", AsyncMock(return_value="private-token"))
    monkeypatch.setattr(paypal_service, "_base_url", lambda: "https://api-m.sandbox.paypal.com")
    monkeypatch.setattr(paypal_service.httpx, "AsyncClient", lambda **kwargs: client)

    result = _run(
        paypal_service.create_paypal_order(
            Decimal("12.50"),
            "USD",
            order_reference="MARKETTWIN-1",
            request_id="stable-request-id",
            return_url="http://localhost:5173/customer/payment/success?order_id=internal-id",
            cancel_url="http://localhost:5173/customer/payment/cancelled?order_id=internal-id",
        )
    )

    payload = client.post.await_args.kwargs["json"]
    assert result["approval_url"] == "https://www.sandbox.paypal.com/checkoutnow?token=order-id"
    assert payload["intent"] == "CAPTURE"
    assert payload["purchase_units"][0]["invoice_id"] == "MARKETTWIN-1"
    assert payload["application_context"]["return_url"].endswith("order_id=internal-id")
    assert client.headers["PayPal-Request-Id"] == "stable-request-id"


def test_create_order_preserves_sanitized_provider_rejection(monkeypatch, caplog):
    response = httpx.Response(
        422,
        json={
            "name": "UNPROCESSABLE_ENTITY",
            "message": "Request failed",
            "debug_id": "sandbox-debug-123",
            "details": [
                {"issue": "CURRENCY_NOT_SUPPORTED", "description": "Sensitive provider detail"},
            ],
        },
        request=httpx.Request(
            "POST",
            "https://api-m.sandbox.paypal.com/v2/checkout/orders",
        ),
    )
    client = MockAsyncClient(response=response)
    monkeypatch.setattr(
        paypal_service,
        "get_access_token",
        AsyncMock(return_value="private-token"),
    )
    monkeypatch.setattr(
        paypal_service,
        "_base_url",
        lambda: "https://api-m.sandbox.paypal.com",
    )
    monkeypatch.setattr(paypal_service.httpx, "AsyncClient", lambda **kwargs: client)

    with pytest.raises(paypal_service.PayPalConnectionError) as error:
        _run(paypal_service.create_paypal_order(Decimal("79999.00"), "INR"))

    assert error.value.status_code == 422
    assert error.value.issue_codes == ("CURRENCY_NOT_SUPPORTED",)
    assert error.value.debug_id == "sandbox-debug-123"
    assert "CURRENCY_NOT_SUPPORTED" in str(error.value)
    assert "Sensitive provider detail" not in str(error.value)
    assert "CURRENCY_NOT_SUPPORTED" in caplog.text
    assert "private-token" not in caplog.text


def test_live_paypal_approval_link_is_rejected(monkeypatch):
    response = httpx.Response(
        201,
        json={
            "id": "order-id",
            "status": "CREATED",
            "links": [{"rel": "approve", "href": "https://www.paypal.com/checkoutnow?token=order-id"}],
        },
        request=httpx.Request("POST", "https://api-m.sandbox.paypal.com/v2/checkout/orders"),
    )
    client = MockAsyncClient(response=response)
    monkeypatch.setattr(paypal_service, "get_access_token", AsyncMock(return_value="private-token"))
    monkeypatch.setattr(paypal_service, "_base_url", lambda: "https://api-m.sandbox.paypal.com")
    monkeypatch.setattr(paypal_service.httpx, "AsyncClient", lambda **kwargs: client)

    with pytest.raises(paypal_service.PayPalConnectionError, match="valid approval link"):
        _run(
            paypal_service.create_paypal_order(
                Decimal("12.50"),
                "USD",
                return_url="http://localhost:5173/success",
                cancel_url="http://localhost:5173/cancel",
            )
        )


def test_capture_order_uses_access_token_and_order_reference(monkeypatch):
    response = httpx.Response(
        200,
        json={"id": "order-id", "status": "COMPLETED"},
        request=httpx.Request(
            "POST",
            "https://api-m.sandbox.paypal.com/v2/checkout/orders/order-id/capture",
        ),
    )
    client = MockAsyncClient(response=response)
    monkeypatch.setattr(paypal_service, "get_access_token", AsyncMock(return_value="private-token"))
    monkeypatch.setattr(paypal_service, "_base_url", lambda: "https://api-m.sandbox.paypal.com")
    monkeypatch.setattr(paypal_service.httpx, "AsyncClient", lambda **kwargs: client)

    result = _run(paypal_service.capture_paypal_order("order-id"))

    assert result == {"id": "order-id", "status": "COMPLETED"}
    assert client.post.await_args.args[0] == (
        "https://api-m.sandbox.paypal.com/v2/checkout/orders/order-id/capture"
    )
    assert client.post.await_args.kwargs["headers"]["Authorization"] == "Bearer private-token"
