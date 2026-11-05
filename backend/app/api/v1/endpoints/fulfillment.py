import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import get_current_user, require_roles
from app.services.fulfillment_service import (
    add_tracking_event,
    confirm_delivery,
    create_shipment,
    customer_tracking,
    get_merchant_order,
    merchant_orders,
    report_delivery_issue,
    update_order_status,
)

logger = logging.getLogger("markettwin.api.fulfillment")
router = APIRouter()


@router.get("/merchant/orders")
async def merchant_orders_list(current_user=Depends(require_roles("merchant"))):
    return {"items": merchant_orders(current_user["id"])}


@router.get("/merchant/orders/{order_id}")
async def merchant_order_detail(order_id: str, current_user=Depends(require_roles("merchant"))):
    order = get_merchant_order(current_user["id"], order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
    return order


@router.post("/merchant/orders/{order_id}/update-status")
async def merchant_update_status(order_id: str, payload: Dict[str, Any], current_user=Depends(require_roles("merchant"))):
    new_status = payload.get("status")
    message = payload.get("message")
    if not new_status:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="status is required.")
    try:
        order = update_order_status(current_user["id"], order_id, new_status, message)
        return order
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error(f"Status update failed: {exc}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/merchant/orders/{order_id}/shipments")
async def merchant_create_shipment(order_id: str, payload: Dict[str, Any], current_user=Depends(require_roles("merchant"))):
    try:
        shipment = create_shipment(current_user["id"], order_id, payload)
        return shipment
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        logger.error(f"Shipment creation failed: {exc}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/merchant/shipments/{shipment_id}/tracking-events")
async def merchant_add_tracking_event(shipment_id: str, payload: Dict[str, Any], current_user=Depends(require_roles("merchant"))):
    try:
        event = add_tracking_event(shipment_id, current_user["id"], payload)
        return event
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        logger.error(f"Tracking event failed: {exc}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/customer/orders/{order_id}/tracking")
async def customer_order_tracking(order_id: str, current_user=Depends(require_roles("customer"))):
    try:
        return customer_tracking(current_user["id"], order_id)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        logger.error(f"Tracking failed: {exc}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/customer/orders/{order_id}/confirm-delivery")
async def customer_confirm_delivery(order_id: str, payload: Dict[str, Any], current_user=Depends(require_roles("customer"))):
    try:
        return confirm_delivery(current_user["id"], order_id, payload.get("remarks"))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error(f"Confirm delivery failed: {exc}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/customer/orders/{order_id}/report-delivery-issue")
async def customer_report_delivery_issue(order_id: str, payload: Dict[str, Any], current_user=Depends(require_roles("customer"))):
    try:
        return report_delivery_issue(current_user["id"], order_id, payload.get("remarks", ""))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        logger.error(f"Report issue failed: {exc}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))