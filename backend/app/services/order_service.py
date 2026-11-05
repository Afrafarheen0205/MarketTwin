from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
import uuid

from app.core.supabase import get_supabase_client


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
    selection = sel.data
    # prevent duplicate order
    existing = client.table("orders").select("id").eq("selection_id", selection_id).execute()
    if existing.data:
        raise ValueError("Order already exists for this selection.")
    offer = client.table("merchant_offers").select("*").eq("id", selection["offer_id"]).single().execute().data
    demand = client.table("demands").select("*").eq("id", selection["demand_id"]).single().execute().data
    order_ref = f"ORD-{uuid.uuid4().hex[:8].upper()}"
    payload = {
        "order_reference": order_ref,
        "order_number": order_ref,
        "customer_id": customer_id,
        "merchant_id": selection.get("merchant_id"),
        "demand_id": selection.get("demand_id"),
        "group_id": selection.get("group_id"),
        "offer_id": selection.get("offer_id"),
        "selection_id": selection_id,
        "quantity": selection.get("selected_quantity"),
        "unit": selection.get("selected_unit"),
        "product_snapshot": {"product_name": offer.get("offered_product_name"), "material": offer.get("material")},
        "merchant_snapshot": {"merchant_name": offer.get("merchant_name")},
        "delivery_address_snapshot": {},
        "delivery_terms_snapshot": selection.get("delivery_terms_snapshot", {}),
        "agreed_unit_price": selection.get("agreed_unit_price"),
        "tax_amount": selection.get("agreed_taxes", 0),
        "shipping_cost": selection.get("agreed_shipping_cost", 0),
        "additional_charges": selection.get("agreed_additional_charges", 0),
        "total_amount": selection.get("estimated_total", 0),
        "currency": selection.get("currency", "USD"),
        "payment_status": "Not Initiated",
        "order_status": "Pending Payment",
        "product_name": offer.get("offered_product_name"),
        "merchant_name": offer.get("merchant_name"),
        "total_price": selection.get("estimated_total", 0),
    }
    result = client.table("orders").insert(payload).execute()
    if not result.data:
        raise RuntimeError("Order creation failed.")
    order = result.data[0]
    # payment record
    client.table("payments").insert({
        "order_id": order["id"],
        "customer_id": customer_id,
        "amount": selection.get("estimated_total", 0),
        "currency": selection.get("currency", "USD"),
        "status": "Not Initiated",
        "provider": "paypal",
        "refund_status": "None",
    }).execute()
    # notification
    try:
        client.table("notifications").insert({
            "user_id": customer_id,
            "title": "Order created",
            "description": f"Order {order_ref} created. Complete payment to confirm.",
            "type": "order",
            "unread": True,
        }).execute()
    except Exception:
        pass
    return order


def get_orders(customer_id: str) -> list:
    client = _client()
    if client is None:
        return []
    res = client.table("orders").select("*").eq("customer_id", customer_id).order("created_at", desc=True).execute()
    return res.data or []


def get_order(customer_id: str, order_id: str) -> dict:
    client = _client()
    if client is None:
        return None
    res = client.table("orders").select("*").eq("id", order_id).eq("customer_id", customer_id).single().execute()
    return res.data


def get_payments(order_id: str) -> list:
    client = _client()
    if client is None:
        return []
    res = client.table("payments").select("*").eq("order_id", order_id).execute()
    return res.data or []