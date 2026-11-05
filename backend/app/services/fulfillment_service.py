from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
import uuid

from app.core.supabase import get_supabase_client

ALLOWED_TRANSITIONS = {
    "Confirmed": ["Processing", "On Hold", "Cancelled"],
    "Processing": ["Production / Preparation", "On Hold", "Cancelled"],
    "Production / Preparation": ["Ready for Dispatch", "On Hold", "Cancelled"],
    "Ready for Dispatch": ["Shipped", "On Hold", "Cancelled"],
    "Shipped": ["Out for Delivery", "Delivered", "Delivery Delayed", "Delivery Failed"],
    "Out for Delivery": ["Delivered", "Delivery Failed", "Delivery Delayed"],
}


def _client():
    return get_supabase_client()


def _record_status(order_id: str, previous: str, new: str, actor_id: str, role: str, message: Optional[str] = None, location: Optional[str] = None):
    client = _client()
    if client is None:
        return
    client.table("order_status_history").insert({
        "order_id": order_id,
        "previous_status": previous,
        "new_status": new,
        "status_message": message,
        "location": location,
        "updated_by": actor_id,
        "actor_role": role,
    }).execute()


def merchant_orders(merchant_id: str) -> List[Dict[str, Any]]:
    client = _client()
    if client is None:
        return []
    res = client.table("orders").select("*").eq("merchant_id", merchant_id).order("created_at", desc=True).execute()
    return res.data or []


def get_merchant_order(merchant_id: str, order_id: str) -> Optional[Dict[str, Any]]:
    client = _client()
    if client is None:
        return None
    res = client.table("orders").select("*").eq("id", order_id).eq("merchant_id", merchant_id).single().execute()
    return res.data


def update_order_status(merchant_id: str, order_id: str, new_status: str, message: Optional[str] = None) -> Dict[str, Any]:
    client = _client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    order = get_merchant_order(merchant_id, order_id)
    if not order:
        raise PermissionError("Order not found.")
    if order.get("payment_status") != "Captured":
        raise ValueError("Order is not paid.")
    current = order.get("order_status")
    if new_status not in ALLOWED_TRANSITIONS.get(current, []):
        raise ValueError(f"Invalid status transition from {current} to {new_status}.")
    client.table("orders").update({"order_status": new_status, "updated_at": "now()"}).eq("id", order_id).execute()
    _record_status(order_id, current, new_status, merchant_id, "merchant", message)
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