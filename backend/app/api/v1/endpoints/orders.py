import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import get_current_user, require_roles
from app.services.order_service import create_order_from_selection, get_order, get_orders, get_payments
from app.services.paypal_service import capture_paypal_order, create_paypal_order

logger = logging.getLogger("markettwin.api.orders")
router = APIRouter()


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


@router.post("/customer/orders/{order_id}/payments/paypal/create")
async def create_paypal_payment(order_id: str, current_user=Depends(require_roles("customer"))):
    order = get_order(current_user["id"], order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
    if order.get("payment_status") not in ("Not Initiated", "Failed", "Cancelled"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment already processed.")
    try:
        paypal_order = await create_paypal_order(float(order.get("total_amount") or 0), order.get("currency") or "USD")
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    # update payment record
    from app.core.supabase import get_supabase_client
    client = get_supabase_client()
    payments = client.table("payments").select("id").eq("order_id", order_id).execute().data or []
    if payments:
        client.table("payments").update({"provider_order_id": paypal_order.get("id"), "status": "Created"}).eq("id", payments[0]["id"]).execute()
    client.table("orders").update({"payment_status": "Created", "order_status": "Payment Processing"}).eq("id", order_id).execute()
    return {"paypal_order_id": paypal_order.get("id"), "status": paypal_order.get("status")}


@router.post("/customer/orders/{order_id}/payments/paypal/capture")
async def capture_paypal_payment(order_id: str, payload: Dict[str, Any], current_user=Depends(require_roles("customer"))):
    order = get_order(current_user["id"], order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
    paypal_order_id = payload.get("paypal_order_id")
    if not paypal_order_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="paypal_order_id is required.")
    try:
        capture = await capture_paypal_order(paypal_order_id)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    # verify
    status_val = capture.get("status")
    if status_val != "COMPLETED":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment not completed.")
    # amount verification
    pu = (capture.get("purchase_units") or [{}])[0]
    capture_detail = (pu.get("payments", {}).get("captures") or [{}])[0]
    captured_amount = float(capture_detail.get("amount", {}).get("value", 0))
    captured_currency = capture_detail.get("amount", {}).get("currency_code")
    if abs(captured_amount - float(order.get("total_amount") or 0)) > 0.01 or captured_currency != order.get("currency"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Amount or currency mismatch.")
    from app.core.supabase import get_supabase_client
    client = get_supabase_client()
    payments = client.table("payments").select("id").eq("order_id", order_id).execute().data or []
    if payments:
        client.table("payments").update({
            "provider_capture_id": capture_detail.get("id"),
            "status": "Captured",
            "captured_at": "now()",
        }).eq("id", payments[0]["id"]).execute()
    client.table("orders").update({"payment_status": "Captured", "order_status": "Confirmed"}).eq("id", order_id).execute()
    # notification
    try:
        client.table("notifications").insert({
            "user_id": current_user["id"],
            "title": "Payment successful",
            "description": f"Payment for order {order.get('order_reference')} completed.",
            "type": "order",
            "unread": True,
        }).execute()
    except Exception:
        pass
    return {"status": "COMPLETED", "capture_id": capture_detail.get("id")}