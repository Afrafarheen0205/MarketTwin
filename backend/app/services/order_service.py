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
    existing = client.table("orders").select("*").eq("selection_id", selection_id).eq("customer_id", customer_id).execute()
    if not existing.data:
        raise RuntimeError("This legacy selection has no atomic order and requires review.")
    return _order_response(existing.data[0])


def _order_response(order: Dict[str, Any]) -> Dict[str, Any]:
    terms = order.get("accepted_terms") or {}
    return {**order, "group_id": terms.get("group_id"),
        "offer_id": order.get("accepted_offer_id"), "total_amount": order.get("total_price"),
        "currency": terms.get("currency", "USD"), "order_reference": order.get("order_number")}


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