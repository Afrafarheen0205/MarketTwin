import logging
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, Optional
from urllib.parse import urlparse
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from pydantic import HttpUrl

from app.core.config import get_settings
from app.core.security import require_roles
from app.core.supabase import get_supabase_client
from app.schemas.ai import RequirementDraft
from app.schemas.product_matching import MatchedProduct
from app.services.order_service import (
    PaymentConflict,
    begin_paypal_payment,
    cancel_paypal_payment,
    claim_paypal_capture,
    create_catalogue_order,
    create_order_from_selection,
    fail_paypal_payment,
    finalize_paypal_capture,
    get_order,
    get_orders,
    get_payments,
    get_paypal_payment,
    quote_exact_catalogue_product,
    release_paypal_capture,
    record_paypal_order,
)
from app.services.paypal_service import (
    PayPalConnectionError,
    capture_paypal_order,
    create_paypal_order,
    get_paypal_order,
    paypal_environment,
)

logger = logging.getLogger("markettwin.api.orders")
router = APIRouter()


class PayPalCaptureRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    paypal_order_id: str = Field(..., min_length=1, max_length=128)


class CatalogueCheckoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: str = Field(..., min_length=1, max_length=160)
    quantity: int = Field(..., ge=1, le=1_000_000)
    requirements: RequirementDraft


class CatalogueOrderCreateRequest(CatalogueCheckoutRequest):
    idempotency_key: UUID


class CatalogueQuoteResponse(BaseModel):
    product: MatchedProduct
    product_id: str
    quantity: int
    unit_price: Decimal
    subtotal: Decimal
    shipping: Optional[Decimal]
    tax: Optional[Decimal]
    total: Decimal
    currency: str


class CatalogueOrderResponse(BaseModel):
    id: UUID
    order_number: str
    product_id: str
    product_name: str
    product_snapshot: MatchedProduct
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    total_amount: Decimal
    currency: str
    payment_status: str
    order_status: str


class PayPalCreateResponse(BaseModel):
    paypal_order_id: str
    status: str
    approval_url: HttpUrl


class PayPalCaptureResponse(BaseModel):
    status: str
    capture_id: str


def _frontend_payment_url(path: str, order_id: str) -> str:
    configured_url = get_settings().FRONTEND_URL.strip()
    parsed = urlparse(configured_url)
    if (
        parsed.scheme not in {"https", "http"}
        or not parsed.netloc
        or parsed.username
        or parsed.password
        or (parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1"})
    ):
        raise RuntimeError("The configured frontend URL is not safe for PayPal redirects.")
    return f"{configured_url.rstrip('/')}{path}?order_id={order_id}"


def _release_capture_or_503(
    customer_id: str,
    order_id: str,
    event_type: str,
    payment_status: str,
) -> None:
    try:
        release_paypal_capture(customer_id, order_id, event_type, payment_status)
    except Exception as exc:
        logger.error("Unable to record PayPal capture verification result.", extra={"error_type": type(exc).__name__})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment verification failed and could not be recorded safely.",
        ) from exc


@router.post("/customer/orders/quote", response_model=CatalogueQuoteResponse)
async def quote_catalogue_checkout(
    payload: CatalogueCheckoutRequest,
    _current_user=Depends(require_roles("customer")),
):
    try:
        return await quote_exact_catalogue_product(
            payload.requirements,
            payload.product_id,
            payload.quantity,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Catalogue checkout quote failed.", extra={"error_type": type(exc).__name__})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The product price and availability could not be verified.",
        ) from exc


@router.post(
    "/customer/orders/checkout",
    status_code=status.HTTP_201_CREATED,
    response_model=CatalogueOrderResponse,
)
async def create_catalogue_checkout(
    payload: CatalogueOrderCreateRequest,
    current_user=Depends(require_roles("customer")),
):
    try:
        quote = await quote_exact_catalogue_product(
            payload.requirements,
            payload.product_id,
            payload.quantity,
        )
        order = create_catalogue_order(
            current_user["id"],
            str(payload.idempotency_key),
            quote,
        )
        return order
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except PaymentConflict as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Catalogue checkout creation failed.", extra={"error_type": type(exc).__name__})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The order could not be created. Please retry.",
        ) from exc


@router.post("/customer/orders", status_code=status.HTTP_201_CREATED)
async def create_order(payload: Dict[str, Any], current_user=Depends(require_roles("customer"))):
    selection_id = payload.get("selection_id")
    if not selection_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="selection_id is required.")
    try:
        order = create_order_from_selection(current_user["id"], selection_id)
        return order
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Order unavailable. Legacy selections may require review.")


@router.get("/customer/orders")
async def list_customer_orders(current_user=Depends(require_roles("customer"))):
    return {"items": get_orders(current_user["id"])}


@router.get("/customer/orders/{order_id}")
async def get_customer_order(order_id: str, current_user=Depends(require_roles("customer"))):
    order = get_order(current_user["id"], order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
    return order


@router.get("/customer/orders/{order_id}/payments")
async def get_order_payments(order_id: str, current_user=Depends(require_roles("customer"))):
    order = get_order(current_user["id"], order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
    return {"items": get_payments(order_id)}


@router.post(
    "/customer/orders/{order_id}/payments/paypal/create",
    response_model=PayPalCreateResponse,
)
async def create_paypal_payment(order_id: str, current_user=Depends(require_roles("customer"))):
    order = get_order(current_user["id"], order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
    is_catalogue_order = bool(order.get("product_id") and order.get("checkout_idempotency_key"))
    is_accepted_offer_order = bool(order.get("accepted_offer_id") and order.get("selection_id"))
    if not is_catalogue_order and not is_accepted_offer_order:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="This order is not eligible for PayPal checkout.",
        )

    try:
        if paypal_environment() != "sandbox":
            raise PayPalConnectionError("This purchase flow only supports Sandbox.")
        existing_payment = get_paypal_payment(current_user["id"], order_id)
        if (
            existing_payment
            and existing_payment.get("status") == "Created"
            and existing_payment.get("provider_order_id")
        ):
            existing_paypal_order = await get_paypal_order(existing_payment["provider_order_id"])
            if (
                existing_paypal_order.get("id") != existing_payment["provider_order_id"]
                or not isinstance(existing_paypal_order.get("approval_url"), str)
            ):
                raise PayPalConnectionError("PayPal order cannot be safely resumed.")
            return {
                "paypal_order_id": existing_payment["provider_order_id"],
                "status": existing_paypal_order.get("status"),
                "approval_url": existing_paypal_order["approval_url"],
            }
        payment = begin_paypal_payment(current_user["id"], order_id)
        amount = Decimal(str(payment["amount"]))
        currency = payment["currency"]
        payment_id = payment["payment_id"]
        if not amount.is_finite() or amount <= 0 or not isinstance(currency, str):
            raise RuntimeError("Payment persistence returned invalid order terms.")
    except PaymentConflict as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.") from exc
    except Exception as exc:
        logger.error("Unable to initialize PayPal payment.", extra={"error_type": type(exc).__name__})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment could not be initialized. No PayPal order was created.",
        ) from exc

    try:
        paypal_order = await create_paypal_order(
            amount,
            currency,
            order_reference=str(order.get("order_reference") or order.get("order_number") or order_id),
            request_id=str(payment_id),
            return_url=_frontend_payment_url("/customer/payment/success", order_id),
            cancel_url=_frontend_payment_url("/customer/payment/cancelled", order_id),
        )
    except PayPalConnectionError as exc:
        try:
            fail_paypal_payment(current_user["id"], order_id, payment_id)
        except Exception as persistence_exc:
            logger.error(
                "Unable to record failed PayPal order creation.",
                extra={"error_type": type(persistence_exc).__name__},
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="PayPal could not create an order and payment status could not be updated.",
            ) from persistence_exc
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="PayPal could not create the payment order.",
        ) from exc
    except Exception as exc:
        logger.error("PayPal order creation failed.", extra={"error_type": type(exc).__name__})
        try:
            fail_paypal_payment(current_user["id"], order_id, payment_id)
        except Exception as persistence_exc:
            logger.error(
                "Unable to record failed PayPal order creation.",
                extra={"error_type": type(persistence_exc).__name__},
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="PayPal could not create an order and payment status could not be updated.",
            ) from persistence_exc
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="PayPal could not create the payment order.",
        ) from exc

    paypal_order_id = paypal_order.get("id") if isinstance(paypal_order, dict) else None
    if not isinstance(paypal_order_id, str) or not paypal_order_id.strip():
        try:
            fail_paypal_payment(current_user["id"], order_id, payment_id)
        except Exception as exc:
            logger.error(
                "Unable to record malformed PayPal order response.",
                extra={"error_type": type(exc).__name__},
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="PayPal returned an invalid order reference and payment status could not be updated.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="PayPal returned an invalid payment order reference.",
        )
    try:
        record_paypal_order(
            current_user["id"],
            order_id,
            payment_id,
            paypal_order_id,
        )
    except Exception as exc:
        logger.error("Unable to persist PayPal order reference.", extra={"error_type": type(exc).__name__})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PayPal created the payment order, but it could not be recorded. Contact support before retrying.",
        ) from exc
    approval_url = paypal_order.get("approval_url")
    if not isinstance(approval_url, str):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="PayPal order was created without a valid approval link.",
        )
    return {
        "paypal_order_id": paypal_order_id,
        "status": paypal_order.get("status"),
        "approval_url": approval_url,
    }


@router.post("/customer/orders/{order_id}/payments/paypal/cancel")
async def cancel_paypal_payment_route(
    order_id: str,
    current_user=Depends(require_roles("customer")),
):
    order = get_order(current_user["id"], order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
    try:
        result = cancel_paypal_payment(current_user["id"], order_id)
    except PaymentConflict as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Unable to record PayPal cancellation.", extra={"error_type": type(exc).__name__})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cancellation could not be recorded.",
        ) from exc
    return {"status": result.get("status", "Cancelled")}


@router.post(
    "/customer/orders/{order_id}/payments/paypal/capture",
    response_model=PayPalCaptureResponse,
)
async def capture_paypal_payment(
    order_id: str,
    payload: PayPalCaptureRequest,
    current_user=Depends(require_roles("customer")),
):
    order = get_order(current_user["id"], order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")

    try:
        payment = get_paypal_payment(current_user["id"], order_id)
    except Exception as exc:
        logger.error("Unable to load payment record.", extra={"error_type": type(exc).__name__})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment information is temporarily unavailable.",
        ) from exc
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment order not found.")
    paypal_order_id = payload.paypal_order_id.strip()
    if paypal_order_id != payment.get("provider_order_id"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment order not found.")

    if payment.get("status") == "Captured":
        capture_id = payment.get("provider_capture_id")
        if not isinstance(capture_id, str) or not capture_id:
            logger.error("Captured payment has no provider capture reference.")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Payment status is inconsistent. Contact support.",
            )
        return {
            "status": "COMPLETED",
            "capture_id": capture_id,
        }
    if payment.get("status") not in {"Created", "Capturing"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Payment is not ready to capture.")

    try:
        claim = claim_paypal_capture(current_user["id"], order_id)
    except PaymentConflict as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Unable to claim PayPal capture.", extra={"error_type": type(exc).__name__})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment capture is temporarily unavailable.",
        ) from exc

    if claim.get("status") == "Captured":
        return {
            "status": "COMPLETED",
            "capture_id": claim.get("provider_capture_id"),
        }

    try:
        if claim.get("action") == "reconcile":
            capture = await get_paypal_order(paypal_order_id)
            if capture.get("status") != "COMPLETED":
                _release_capture_or_503(
                    current_user["id"],
                    order_id,
                    "CAPTURE_RECOVERY_NOT_COMPLETED",
                    "Created",
                )
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="PayPal has not completed this payment. Please retry shortly.",
                )
        else:
            capture = await capture_paypal_order(paypal_order_id)
    except PayPalConnectionError as exc:
        # A timed-out capture may still have completed at PayPal. Leave the claim
        # in place so a later retry can retrieve and reconcile it without recapturing.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="PayPal could not complete the capture request.",
        ) from exc
    except Exception as exc:
        logger.error("PayPal capture request failed.", extra={"error_type": type(exc).__name__})
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="PayPal could not complete the capture request.",
        ) from exc

    if not isinstance(capture, dict) or capture.get("status") != "COMPLETED":
        paypal_status = capture.get("status") if isinstance(capture, dict) else None
        mapped_status = {
            "VOIDED": "Cancelled",
            "CANCELLED": "Cancelled",
            "FAILED": "Failed",
        }.get(paypal_status, "Created")
        _release_capture_or_503(
            current_user["id"],
            order_id,
            f"CAPTURE_{paypal_status or 'NOT_COMPLETED'}",
            mapped_status,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PayPal has not completed this payment.",
        )
    if capture.get("id") != paypal_order_id:
        _release_capture_or_503(
            current_user["id"], order_id, "CAPTURE_ORDER_REFERENCE_MISMATCH", "Verification Failed"
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PayPal order reference did not match.")

    purchase_units = capture.get("purchase_units")
    if not isinstance(purchase_units, list) or not purchase_units or not isinstance(purchase_units[0], dict):
        _release_capture_or_503(
            current_user["id"], order_id, "CAPTURE_DETAILS_MISSING", "Verification Failed"
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PayPal capture details are incomplete.")
    capture_rows = (purchase_units[0].get("payments") or {}).get("captures")
    if not isinstance(capture_rows, list) or len(capture_rows) != 1 or not isinstance(capture_rows[0], dict):
        _release_capture_or_503(
            current_user["id"], order_id, "CAPTURE_DETAILS_MISSING", "Verification Failed"
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PayPal capture details are incomplete.")
    capture_detail = capture_rows[0]
    capture_id = capture_detail.get("id")
    amount_data = capture_detail.get("amount")
    if (
        capture_detail.get("status") != "COMPLETED"
        or not isinstance(capture_id, str)
        or not capture_id.strip()
        or not isinstance(amount_data, dict)
        or not isinstance(amount_data.get("value"), str)
        or not isinstance(amount_data.get("currency_code"), str)
    ):
        _release_capture_or_503(
            current_user["id"], order_id, "CAPTURE_DETAILS_INVALID", "Verification Failed"
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PayPal capture details are incomplete.")
    try:
        captured_amount = Decimal(amount_data["value"])
        expected_amount = Decimal(str(payment["amount"]))
    except (InvalidOperation, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PayPal capture amount is invalid.") from exc
    captured_currency = amount_data["currency_code"].upper()
    expected_currency = str(payment.get("currency", "")).upper()
    if (
        not captured_amount.is_finite()
        or captured_amount != expected_amount
        or captured_currency != expected_currency
    ):
        _release_capture_or_503(
            current_user["id"],
            order_id,
            "CAPTURE_AMOUNT_OR_CURRENCY_MISMATCH",
            "Verification Failed",
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PayPal amount or currency did not match.")

    try:
        persisted = finalize_paypal_capture(
            current_user["id"],
            order_id,
            paypal_order_id,
            capture_id,
            captured_amount,
            captured_currency,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment order not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except PaymentConflict as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Unable to persist verified PayPal capture.", extra={"error_type": type(exc).__name__})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PayPal confirmed payment, but its status could not be recorded. Contact support before retrying.",
        ) from exc

    client = get_supabase_client()
    if client is not None:
        try:
            client.table("notifications").insert({
                "user_id": current_user["id"],
                "title": "Payment successful",
                "description": f"Payment for order {order.get('order_reference')} completed.",
                "type": "order",
                "unread": True,
            }).execute()
        except Exception as exc:
            logger.warning(
                "Payment notification could not be created.",
                extra={"error_type": type(exc).__name__},
            )
    return {
        "status": "COMPLETED",
        "capture_id": persisted.get("provider_capture_id", capture_id),
    }