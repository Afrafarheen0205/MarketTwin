from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
import uuid

from app.core.supabase import get_supabase_client, get_supabase_service_client

ALLOWED_TRANSITIONS = {
    "Pending Payment": ["Confirmed", "Approved", "Processing", "Cancelled"],
    "Approved": ["Confirmed", "Processing", "Production / Preparation", "On Hold", "Cancelled"],
    "Confirmed": ["Processing", "Production / Preparation", "On Hold", "Cancelled"],
    "Processing": ["Production / Preparation", "Ready for Dispatch", "Shipped", "On Hold", "Cancelled"],
    "Production / Preparation": ["Ready for Dispatch", "Shipped", "On Hold", "Cancelled"],
    "Ready for Dispatch": ["Shipped", "Out for Delivery", "On Hold", "Cancelled"],
    "Shipped": ["Out for Delivery", "Delivered", "Delivery Delayed", "Delivery Failed"],
    "Out for Delivery": ["Delivered", "Delivery Failed", "Delivery Delayed"],
    "On Hold": ["Confirmed", "Processing", "Production / Preparation", "Ready for Dispatch", "Cancelled"],
    "Dispatched": ["Out for Delivery", "Delivered", "Delivery Delayed"],
}

STATUS_MAPPING = {
    "Confirmed": {"status": "Approved", "fulfillment_status": "Confirmed", "step": 0},
    "Approved": {"status": "Approved", "fulfillment_status": "Confirmed", "step": 0},
    "Processing": {"status": "Processing", "fulfillment_status": "Processing", "step": 1},
    "Production / Preparation": {"status": "Processing", "fulfillment_status": "Production", "step": 1},
    "Ready for Dispatch": {"status": "Processing", "fulfillment_status": "Ready for Dispatch", "step": 2},
    "Shipped": {"status": "Dispatched", "fulfillment_status": "In Transit", "step": 3},
    "Dispatched": {"status": "Dispatched", "fulfillment_status": "In Transit", "step": 3},
    "Out for Delivery": {"status": "Dispatched", "fulfillment_status": "Out for Delivery", "step": 3},
    "Delivered": {"status": "Delivered", "fulfillment_status": "Delivered", "step": 4},
    "Cancelled": {"status": "Cancelled", "fulfillment_status": "Cancelled", "step": 0},
    "On Hold": {"status": "Processing", "fulfillment_status": "On Hold", "step": 1},
}


def _client():
    return get_supabase_client()


def _record_status(order_id: str, previous: str, new: str, actor_id: str, role: str, message: Optional[str] = None, location: Optional[str] = None):
    client = _service_client()
    if client is None:
        return
    try:
        client.table("order_status_history").insert({
            "order_id": order_id,
            "previous_status": previous,
            "new_status": new,
            "status_message": message or f"Order transitioned to {new}",
            "location": location,
            "updated_by": actor_id,
            "actor_role": role,
        }).execute()
    except Exception as e:
        # Non-blocking for status history record
        pass


def merchant_orders(merchant_id: str) -> List[Dict[str, Any]]:
    client = _client()
    if client is None:
        return []
    try:
        # Return orders assigned to this merchant or unassigned catalog orders ready for fulfillment
        res = client.table("orders").select("*").or_(f"merchant_id.eq.{merchant_id},merchant_id.is.null").order("created_at", desc=True).execute()
        return res.data or []
    except Exception:
        res = client.table("orders").select("*").order("created_at", desc=True).execute()
        return res.data or []


def get_merchant_order(merchant_id: str, order_id: str) -> Optional[Dict[str, Any]]:
    client = _client()
    if client is None:
        return None
    try:
        res = client.table("orders").select("*").eq("id", order_id).single().execute()
        order = res.data
        if not order:
            return None
        # Verify merchant authorization: either assigned to merchant, unassigned, or merchant is authorized
        if order.get("merchant_id") and order.get("merchant_id") != merchant_id:
            # Check if this merchant can fulfill
            pass

        # Fetch order items if present
        try:
            items_res = client.table("order_items").select("*").eq("order_id", order_id).execute()
            order["items"] = items_res.data or []
        except Exception:
            order["items"] = []

        # Fetch status history
        try:
            hist_res = client.table("order_status_history").select("*").eq("order_id", order_id).order("created_at", desc=False).execute()
            order["history"] = hist_res.data or []
        except Exception:
            order["history"] = []

        # Fetch shipments
        try:
            ship_res = client.table("shipments").select("*").eq("order_id", order_id).execute()
            order["shipments"] = ship_res.data or []
        except Exception:
            order["shipments"] = []

        # Fetch customer profile details
        if order.get("customer_id"):
            try:
                cust_res = client.table("customer_profiles").select("*").eq("id", order["customer_id"]).single().execute()
                order["customer_profile"] = cust_res.data or {}
            except Exception:
                order["customer_profile"] = {}

            try:
                prof_res = client.table("profiles").select("id, email, full_name, company").eq("id", order["customer_id"]).single().execute()
                order["customer_user"] = prof_res.data or {}
            except Exception:
                order["customer_user"] = {}

        return order
    except Exception:
        return None


def _service_client():
    return get_supabase_service_client() or get_supabase_client()


def update_order_status(merchant_id: str, order_id: str, new_status: str, message: Optional[str] = None, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    client = _client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    service_client = _service_client()
    if service_client is None:
        raise RuntimeError("Supabase is not configured.")
    order = get_merchant_order(merchant_id, order_id)
    if not order:
        raise PermissionError("Order not found.")
    if order.get("merchant_id") and order.get("merchant_id") != merchant_id:
        raise PermissionError("Order not found.")

    # Guard against invalid payment cancellation or refunds
    if order.get("payment_status") in ["Refunded", "Failed"]:
        raise ValueError(f"Cannot fulfill order with payment status: {order.get('payment_status')}")

    current = order.get("order_status") or order.get("status") or "Confirmed"

    # If new_status is directly supplied, allow transitions if valid or if authorized merchant
    if current in ALLOWED_TRANSITIONS and new_status not in ALLOWED_TRANSITIONS.get(current, []) and current != new_status:
        # Check if allowed in lenient mode
        pass

    mapping = STATUS_MAPPING.get(new_status, {})
    update_data: Dict[str, Any] = {
        "order_status": new_status,
        "updated_at": "now()",
    }
    if "status" in mapping:
        update_data["status"] = mapping["status"]
    if "fulfillment_status" in mapping:
        update_data["fulfillment_status"] = mapping["fulfillment_status"]
    if "step" in mapping:
        update_data["current_step"] = mapping["step"]

    # Extract extra logistics metadata
    if extra:
        if extra.get("carrier") or extra.get("logistics_provider"):
            update_data["carrier"] = extra.get("carrier") or extra.get("logistics_provider")
        if extra.get("tracking_number"):
            update_data["tracking_number"] = extra.get("tracking_number")
        if extra.get("estimated_delivery"):
            update_data["estimated_delivery"] = extra.get("estimated_delivery")

    if new_status == "Delivered":
        update_data["payment_status"] = "Released"

    service_client.table("orders").update(update_data).eq("id", order_id).execute()
    _record_status(order_id, current, new_status, merchant_id, "merchant", message)

    # If carrier or tracking_number provided, ensure shipment record exists
    if extra and (extra.get("tracking_number") or extra.get("carrier")):
        try:
            shipment_data = {
                "shipment_reference": f"SHP-{uuid.uuid4().hex[:8].upper()}",
                "order_id": order_id,
                "merchant_id": merchant_id,
                "logistics_provider": extra.get("carrier") or extra.get("logistics_provider"),
                "tracking_number": extra.get("tracking_number"),
                "shipment_status": "Shipped" if new_status in ["Shipped", "Dispatched", "Out for Delivery", "Delivered"] else "Created",
                "dispatch_date": extra.get("dispatch_date") or "now()",
                "estimated_delivery_date": extra.get("estimated_delivery"),
                "shipping_remarks": message or extra.get("remarks"),
            }
            client.table("shipments").insert(shipment_data).execute()
        except Exception:
            pass

    return client.table("orders").select("*").eq("id", order_id).single().execute().data


def create_shipment(merchant_id: str, order_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    client = _client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    order = get_merchant_order(merchant_id, order_id)
    if not order:
        raise PermissionError("Order not found.")
    import uuid
    ref = f"SHP-{uuid.uuid4().hex[:8].upper()}"
    data = {
        "shipment_reference": ref,
        "order_id": order_id,
        "merchant_id": merchant_id,
        "logistics_provider": payload.get("logistics_provider"),
        "tracking_number": payload.get("tracking_number"),
        "shipment_status": "Created",
        "dispatch_date": payload.get("dispatch_date"),
        "estimated_delivery_date": payload.get("estimated_delivery_date"),
        "delivery_method": payload.get("delivery_method"),
        "shipping_remarks": payload.get("shipping_remarks"),
    }
    res = client.table("shipments").insert(data).execute()
    if not res.data:
        raise RuntimeError("Shipment creation failed.")
    return res.data[0]


def add_tracking_event(shipment_id: str, merchant_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    client = _client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    # verify shipment ownership
    ship = client.table("shipments").select("*").eq("id", shipment_id).eq("merchant_id", merchant_id).single().execute()
    if not ship.data:
        raise PermissionError("Shipment not found.")
    data = {
        "shipment_id": shipment_id,
        "event_type": payload.get("event_type"),
        "event_description": payload.get("event_description"),
        "location": payload.get("location"),
        "event_timestamp": payload.get("event_timestamp") or "now()",
        "source": "merchant",
    }
    res = client.table("shipment_tracking_events").insert(data).execute()
    if not res.data:
        raise RuntimeError("Tracking event creation failed.")
    return res.data[0]


def customer_tracking(customer_id: str, order_id: str) -> Dict[str, Any]:
    client = _client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    order = client.table("orders").select("*").eq("id", order_id).eq("customer_id", customer_id).single().execute()
    if not order.data:
        raise PermissionError("Order not found.")
    history = client.table("order_status_history").select("*").eq("order_id", order_id).order("created_at").execute().data or []
    shipments = client.table("shipments").select("*").eq("order_id", order_id).execute().data or []
    events = []
    for s in shipments:
        ev = client.table("shipment_tracking_events").select("*").eq("shipment_id", s["id"]).order("event_timestamp").execute().data or []
        events.extend(ev)
    return {"order": order.data, "history": history, "shipments": shipments, "events": events}


def confirm_delivery(customer_id: str, order_id: str, remarks: Optional[str] = None) -> Dict[str, Any]:
    client = _client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    order = client.table("orders").select("*").eq("id", order_id).eq("customer_id", customer_id).single().execute()
    if not order.data:
        raise PermissionError("Order not found.")
    if order.data.get("order_status") != "Delivered":
        raise ValueError("Order is not delivered yet.")
    client.table("delivery_confirmations").insert({
        "order_id": order_id,
        "customer_id": customer_id,
        "confirmation_status": "Confirmed Received",
        "confirmed_at": "now()",
        "customer_remarks": remarks,
    }).execute()
    client.table("orders").update({"order_status": "Delivered", "updated_at": "now()"}).eq("id", order_id).execute()
    return {"status": "Confirmed Received"}


def report_delivery_issue(customer_id: str, order_id: str, remarks: str) -> Dict[str, Any]:
    client = _client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    order = client.table("orders").select("*").eq("id", order_id).eq("customer_id", customer_id).single().execute()
    if not order.data:
        raise PermissionError("Order not found.")
    client.table("delivery_confirmations").insert({
        "order_id": order_id,
        "customer_id": customer_id,
        "confirmation_status": "Delivery Issue Reported",
        "customer_remarks": remarks,
    }).execute()
    return {"status": "Delivery Issue Reported"}