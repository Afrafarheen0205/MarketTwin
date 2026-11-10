import base64
import logging
import re
import time
from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings

_PAYPAL_TIMEOUT_SECONDS = 10.0
_SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com"
logger = logging.getLogger("markettwin.paypal")


class PayPalConnectionError(RuntimeError):
    """A safe, non-sensitive PayPal connection failure."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        debug_id: str | None = None,
        issue_codes: tuple[str, ...] = (),
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.debug_id = debug_id
        self.issue_codes = issue_codes


def _paypal_rejection_context(response: httpx.Response) -> tuple[str, str | None, tuple[str, ...]]:
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}

    name = payload.get("name")
    safe_name = (
        re.sub(r"[^A-Za-z0-9_.-]", "", name)[:80]
        if isinstance(name, str)
        else "provider_error"
    )
    raw_debug_id = payload.get("debug_id") or response.headers.get("PayPal-Debug-Id")
    debug_id = (
        re.sub(r"[^A-Za-z0-9_-]", "", raw_debug_id)[:80]
        if isinstance(raw_debug_id, str)
        else None
    )
    details = payload.get("details")
    issues = tuple(
        sorted(
            {
                re.sub(r"[^A-Za-z0-9_.-]", "", detail["issue"])[:80]
                for detail in details
                if isinstance(detail, dict)
                and isinstance(detail.get("issue"), str)
            }
        )
    ) if isinstance(details, list) else ()
    return safe_name, debug_id, issues


def _raise_paypal_rejection(response: httpx.Response, operation: str) -> None:
    error_name, debug_id, issue_codes = _paypal_rejection_context(response)
    logger.warning(
        "PayPal Sandbox rejected %s: http_status=%s error_name=%s issue_codes=%s debug_id=%s",
        operation,
        response.status_code,
        error_name,
        ",".join(issue_codes) or "not_provided",
        debug_id or "not_provided",
    )
    details = [f"HTTP {response.status_code}", error_name]
    if issue_codes:
        details.append(f"issues: {', '.join(issue_codes)}")
    if debug_id:
        details.append(f"debug ID: {debug_id}")
    raise PayPalConnectionError(
        f"PayPal Sandbox rejected {operation} ({'; '.join(details)}).",
        status_code=response.status_code,
        debug_id=debug_id,
        issue_codes=issue_codes,
    )


@dataclass(frozen=True)
class PayPalAccessToken:
    value: str
    expires_in: int


def _paypal_mode() -> str:
    mode = get_settings().PAYPAL_MODE.strip().lower()
    if mode != "sandbox":
        raise PayPalConnectionError(
            "This purchase flow only supports PAYPAL_MODE='sandbox'."
        )
    return mode


def _base_url() -> str:
    _paypal_mode()
    return _SANDBOX_BASE_URL


def paypal_environment() -> str:
    return _paypal_mode()


async def get_access_token_details() -> PayPalAccessToken:
    settings = get_settings()
    base_url = _base_url()
    if not settings.PAYPAL_CLIENT_ID or not settings.PAYPAL_CLIENT_SECRET:
        raise PayPalConnectionError("PayPal credentials are not configured.")

    credentials = f"{settings.PAYPAL_CLIENT_ID}:{settings.PAYPAL_CLIENT_SECRET}"
    auth = base64.b64encode(credentials.encode("utf-8")).decode("ascii")
    try:
        async with httpx.AsyncClient(timeout=_PAYPAL_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{base_url}/v1/oauth2/token",
                headers={
                    "Authorization": f"Basic {auth}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={"grant_type": "client_credentials"},
            )
    except httpx.TimeoutException as exc:
        raise PayPalConnectionError("PayPal OAuth request timed out.") from exc
    except httpx.HTTPError as exc:
        raise PayPalConnectionError("Unable to connect to PayPal OAuth.") from exc

    if not response.is_success:
        raise PayPalConnectionError(
            f"PayPal rejected the OAuth request (HTTP {response.status_code})."
        )
    try:
        payload: Any = response.json()
    except ValueError as exc:
        raise PayPalConnectionError("PayPal returned an invalid OAuth response.") from exc
    if not isinstance(payload, dict):
        raise PayPalConnectionError("PayPal returned an invalid OAuth response.")

    token = payload.get("access_token")
    expires_in = payload.get("expires_in")
    if not isinstance(token, str) or not token.strip():
        raise PayPalConnectionError("PayPal OAuth response did not contain an access token.")
    if isinstance(expires_in, bool) or not isinstance(expires_in, int) or expires_in <= 0:
        raise PayPalConnectionError("PayPal OAuth response did not contain a valid token expiry.")
    return PayPalAccessToken(value=token, expires_in=expires_in)


async def get_access_token() -> str:
    return (await get_access_token_details()).value


def _validate_paypal_link(url: Any) -> str | None:
    if not isinstance(url, str):
        return None
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        return None
    if not (
        parsed.hostname == "sandbox.paypal.com"
        or parsed.hostname.endswith(".sandbox.paypal.com")
    ):
        return None
    return url


def _approval_url(payload: dict) -> str | None:
    links = payload.get("links")
    if not isinstance(links, list):
        return None
    return next(
        (
            _validate_paypal_link(link.get("href"))
            for link in links
            if isinstance(link, dict) and link.get("rel") in {"approve", "payer-action"}
        ),
        None,
    )


async def create_paypal_order(
    amount: float | Decimal,
    currency: str,
    *,
    order_reference: str | None = None,
    request_id: str | None = None,
    return_url: str | None = None,
    cancel_url: str | None = None,
) -> dict:
    started = time.perf_counter()
    token = await get_access_token()
    amount_value = Decimal(str(amount))
    if not amount_value.is_finite() or amount_value <= 0:
        raise ValueError("PayPal order amount must be positive.")
    if len(currency) != 3 or not currency.isalpha() or not currency.isupper():
        raise ValueError("PayPal order currency must be a three-letter ISO code.")

    purchase_unit: dict[str, Any] = {
        "amount": {"currency_code": currency, "value": f"{amount_value:.2f}"},
    }
    if order_reference:
        purchase_unit.update(
            {
                "reference_id": order_reference[:256],
                "invoice_id": order_reference[:127],
                "custom_id": order_reference[:127],
            }
        )
    request_payload: dict[str, Any] = {
        "intent": "CAPTURE",
        "purchase_units": [purchase_unit],
    }
    if return_url and cancel_url:
        request_payload["application_context"] = {
            "return_url": return_url,
            "cancel_url": cancel_url,
            "user_action": "PAY_NOW",
            "shipping_preference": "NO_SHIPPING",
        }

    try:
        async with httpx.AsyncClient(timeout=_PAYPAL_TIMEOUT_SECONDS) as client:
            if request_id:
                client.headers["PayPal-Request-Id"] = request_id
            endpoint = f"{_base_url()}/v2/checkout/orders"
            logger.info(
                "Creating PayPal Sandbox order: endpoint=%s amount=%s currency=%s",
                endpoint,
                f"{amount_value:.2f}",
                currency,
            )
            response = await client.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json=request_payload,
            )
    except httpx.TimeoutException as exc:
        logger.warning(
            "PayPal Sandbox order creation timed out: elapsed_ms=%s",
            round((time.perf_counter() - started) * 1000),
        )
        raise PayPalConnectionError("PayPal order creation timed out.") from exc
    except httpx.HTTPError as exc:
        logger.warning(
            "PayPal Sandbox order request failed: error_type=%s elapsed_ms=%s",
            type(exc).__name__,
            round((time.perf_counter() - started) * 1000),
        )
        raise PayPalConnectionError("Unable to connect to PayPal Orders API.") from exc

    if not response.is_success:
        _raise_paypal_rejection(response, "order creation")
    try:
        result = response.json()
    except ValueError as exc:
        raise PayPalConnectionError("PayPal returned an invalid order response.") from exc
    if not isinstance(result, dict) or not isinstance(result.get("id"), str):
        raise PayPalConnectionError("PayPal order response did not contain an order ID.")
    if return_url and cancel_url:
        approval_url = _approval_url(result)
        if not approval_url:
            raise PayPalConnectionError("PayPal order response did not contain a valid approval link.")
        result["approval_url"] = approval_url
    logger.info(
        "PayPal Sandbox order created: http_status=%s elapsed_ms=%s",
        response.status_code,
        round((time.perf_counter() - started) * 1000),
    )
    return result


async def capture_paypal_order(order_id: str) -> dict:
    token = await get_access_token()
    try:
        async with httpx.AsyncClient(timeout=_PAYPAL_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{_base_url()}/v2/checkout/orders/{order_id}/capture",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )
    except httpx.TimeoutException as exc:
        raise PayPalConnectionError("PayPal capture request timed out.") from exc
    except httpx.HTTPError as exc:
        raise PayPalConnectionError("Unable to connect to PayPal Orders API.") from exc
    if not response.is_success:
        raise PayPalConnectionError(
            f"PayPal rejected the capture request (HTTP {response.status_code})."
        )
    try:
        result = response.json()
    except ValueError as exc:
        raise PayPalConnectionError("PayPal returned an invalid capture response.") from exc
    if not isinstance(result, dict):
        raise PayPalConnectionError("PayPal returned an invalid capture response.")
    return result


async def get_paypal_order(order_id: str) -> dict:
    token = await get_access_token()
    try:
        async with httpx.AsyncClient(timeout=_PAYPAL_TIMEOUT_SECONDS) as client:
            response = await client.get(
                f"{_base_url()}/v2/checkout/orders/{order_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
    except httpx.TimeoutException as exc:
        raise PayPalConnectionError("PayPal order lookup timed out.") from exc
    except httpx.HTTPError as exc:
        raise PayPalConnectionError("Unable to connect to PayPal Orders API.") from exc
    if not response.is_success:
        raise PayPalConnectionError(
            f"PayPal rejected the order lookup (HTTP {response.status_code})."
        )
    try:
        result = response.json()
    except ValueError as exc:
        raise PayPalConnectionError("PayPal returned an invalid order response.") from exc
    if not isinstance(result, dict):
        raise PayPalConnectionError("PayPal returned an invalid order response.")
    approval_url = _approval_url(result)
    if approval_url:
        result["approval_url"] = approval_url
    return result
