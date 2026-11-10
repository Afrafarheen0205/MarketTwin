from typing import Any, Dict, Optional
from decimal import Decimal, InvalidOperation
import re
import logging
import time

from app.core.supabase import get_supabase_client, get_supabase_service_client
from app.schemas.ai import RequirementDraft
from app.services.product_matching_service import ProductMatchingService

logger = logging.getLogger("markettwin.orders")


def _client():
    return get_supabase_client()


def create_order_from_selection(customer_id: str, selection_id: str) -> Dict[str, Any]:
    client = _client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    # fetch selection
    sel = client.table("customer_offer_selections").select("*").eq("id", selection_id).eq("customer_id", customer_id).single().execute()
    if not sel.data:
        raise PermissionError("Selection not found.")
    existing = client.table("orders").select("*").eq("selection_id", selection_id).eq("customer_id", customer_id).execute()
    if not existing.data:
        raise RuntimeError("This legacy selection has no atomic order and requires review.")
    return _order_response(existing.data[0])


def _order_response(order: Dict[str, Any]) -> Dict[str, Any]:
    terms = order.get("accepted_terms") or {}
    return {**order, "group_id": terms.get("group_id"),
        "offer_id": order.get("accepted_offer_id"), "total_amount": order.get("total_price"),
        "currency": terms.get("currency"), "order_reference": order.get("order_number")}


def get_orders(customer_id: str) -> list:
    client = _client()
    if client is None:
        return []
    res = client.table("orders").select("*").eq("customer_id", customer_id).order("created_at", desc=True).execute()
    return [_order_response(order) for order in (res.data or [])]


def get_order(customer_id: str, order_id: str) -> dict:
    client = _client()
    if client is None:
        return None
    res = client.table("orders").select("*").eq("id", order_id).eq("customer_id", customer_id).single().execute()
    return _order_response(res.data) if res.data else None


def get_payments(order_id: str) -> list:
    client = _client()
    if client is None:
        return []
    res = client.table("payments").select("*").eq("order_id", order_id).execute()
    return res.data or []


async def quote_exact_catalogue_product(
    requirements: RequirementDraft,
    product_id: str,
    quantity: int,
) -> Dict[str, Any]:
    if not product_id.strip() or quantity < 1:
        raise ValueError("A product and positive quantity are required.")

    match_started = time.perf_counter()
    match_result = await ProductMatchingService().match(
        requirements,
        include_ai_explanation=False,
    )
    logger.info(
        "Catalogue quote matching completed: product_id=%s quantity=%s "
        "elapsed_ms=%s exact_matches=%s catalogue_products=%s",
        product_id,
        quantity,
        round((time.perf_counter() - match_started) * 1000),
        match_result.exact_match_count,
        match_result.catalogue_products_examined,
    )
    product = next(
        (
            candidate
            for candidate in match_result.products
            if candidate.product_id == product_id
        ),
        None,
    )
    if product is None:
        raise PermissionError("This product is not an exact match for the current requirements.")
    if any(
        result.state != "PASS" for result in product.mandatory_results
    ):
        raise PermissionError("The product has unverified or failed mandatory requirements.")
    if product.effective_price is None or product.currency is None:
        raise ValueError("The exact-match product has no verified price or currency.")

    try:
        unit_price = Decimal(str(product.effective_price))
    except InvalidOperation as exc:
        raise ValueError("The catalogue price is invalid.") from exc
    currency = product.currency.strip().upper()
    if (
        not unit_price.is_finite()
        or unit_price <= 0
        or not re.fullmatch(r"[A-Z]{3}", currency)
    ):
        raise ValueError("The exact-match product has invalid price information.")
    if product.stock is not None and quantity > product.stock:
        raise ValueError("Requested quantity exceeds the available stock.")

    subtotal = (unit_price * quantity).quantize(Decimal("0.01"))
    snapshot = product.model_dump(mode="json")
    return {
        "product": snapshot,
        "product_id": product.product_id,
        "quantity": quantity,
        "unit_price": str(unit_price.quantize(Decimal("0.01"))),
        "subtotal": str(subtotal),
        "shipping": None,
        "tax": None,
        "total": str(subtotal),
        "currency": currency,
    }


def create_catalogue_order(
    customer_id: str,
    idempotency_key: str,
    quote: Dict[str, Any],
) -> Dict[str, Any]:
    return _payment_rpc(
        "create_catalogue_order_v1",
        {
            "p_customer_id": customer_id,
            "p_idempotency_key": idempotency_key,
            "p_product_id": quote["product_id"],
            "p_product_snapshot": quote["product"],
            "p_quantity": quote["quantity"],
            "p_unit_price": quote["unit_price"],
            "p_currency": quote["currency"],
        },
    )


class PaymentConflict(RuntimeError):
    pass


def _payment_rpc(name: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
    client = get_supabase_service_client()
    if client is None:
        raise RuntimeError("Payment persistence is unavailable.")
    try:
        result = client.rpc(name, parameters).execute()
    except Exception as exc:
        code = getattr(exc, "code", None)
        message = getattr(exc, "message", None)
        if code == "P0001" and message == "PAYMENT_NOT_RETRYABLE":
            raise PaymentConflict("Payment is already in progress or completed.") from exc
        if code == "P0001" and message == "PAYMENT_CAPTURE_IN_PROGRESS":
            raise PaymentConflict("Payment capture is already in progress.") from exc
        if code == "P0001" and message == "CHECKOUT_IDEMPOTENCY_CONFLICT":
            raise PaymentConflict("This checkout key was already used for a different order.") from exc
        if code == "P0001" and message == "PAYMENT_NOT_FOUND":
            raise PermissionError("Order or payment not found.") from exc
        if code == "P0001" and message == "PAYMENT_CAPTURE_CONFLICT":
            raise PaymentConflict("Payment was already recorded with different capture details.") from exc
        if code == "P0001" and message == "PAYMENT_CAPTURE_MISMATCH":
            raise ValueError("Verified capture does not match the stored order amount or currency.") from exc
        if code == "23505":
            raise PaymentConflict("This PayPal order or capture reference was already recorded.") from exc
        raise RuntimeError("Payment persistence is unavailable.") from exc
    if not isinstance(result.data, dict):
        raise RuntimeError("Payment persistence returned an invalid response.")
    return result.data


def begin_paypal_payment(customer_id: str, order_id: str) -> Dict[str, Any]:
    return _payment_rpc(
        "begin_paypal_payment_v1",
        {"p_customer_id": customer_id, "p_order_id": order_id},
    )


def record_paypal_order(
    customer_id: str,
    order_id: str,
    payment_id: str,
    paypal_order_id: str,
) -> Dict[str, Any]:
    if not paypal_order_id or len(paypal_order_id) > 128:
        raise ValueError("PayPal returned an invalid order reference.")
    return _payment_rpc(
        "record_paypal_order_v1",
        {
            "p_customer_id": customer_id,
            "p_order_id": order_id,
            "p_payment_id": payment_id,
            "p_paypal_order_id": paypal_order_id,
        },
    )


def fail_paypal_payment(customer_id: str, order_id: str, payment_id: str) -> Dict[str, Any]:
    return _payment_rpc(
        "fail_paypal_payment_v1",
        {
            "p_customer_id": customer_id,
            "p_order_id": order_id,
            "p_payment_id": payment_id,
        },
    )


def claim_paypal_capture(customer_id: str, order_id: str) -> Dict[str, Any]:
    return _payment_rpc(
        "claim_paypal_capture_v1",
        {"p_customer_id": customer_id, "p_order_id": order_id},
    )


def release_paypal_capture(
    customer_id: str,
    order_id: str,
    event_type: str,
    payment_status: str = "Created",
) -> Dict[str, Any]:
    return _payment_rpc(
        "release_paypal_capture_v1",
        {
            "p_customer_id": customer_id,
            "p_order_id": order_id,
            "p_event_type": event_type,
            "p_payment_status": payment_status,
        },
    )


def cancel_paypal_payment(customer_id: str, order_id: str) -> Dict[str, Any]:
    return _payment_rpc(
        "cancel_paypal_payment_v1",
        {"p_customer_id": customer_id, "p_order_id": order_id},
    )


def get_paypal_payment(customer_id: str, order_id: str) -> Optional[Dict[str, Any]]:
    client = get_supabase_service_client()
    if client is None:
        raise RuntimeError("Payment information is unavailable.")
    order_result = (
        client.table("orders")
        .select("id")
        .eq("id", order_id)
        .eq("customer_id", customer_id)
        .limit(1)
        .execute()
    )
    if not order_result.data:
        return None
    result = (
        client.table("payments")
        .select("*")
        .eq("order_id", order_id)
        .eq("provider", "paypal")
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def finalize_paypal_capture(
    customer_id: str,
    order_id: str,
    paypal_order_id: str,
    capture_id: str,
    amount: Decimal,
    currency: str,
) -> Dict[str, Any]:
    if not capture_id or len(capture_id) > 128:
        raise ValueError("PayPal returned an invalid capture reference.")
    if not re.fullmatch(r"[A-Z]{3}", currency):
        raise ValueError("PayPal returned an invalid capture currency.")
    return _payment_rpc(
        "finalize_paypal_capture_v1",
        {
            "p_customer_id": customer_id,
            "p_order_id": order_id,
            "p_paypal_order_id": paypal_order_id,
            "p_capture_id": capture_id,
            "p_amount": str(amount),
            "p_currency": currency,
        },
    )