from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

from app.core.supabase import get_supabase_client


def _client():
    return get_supabase_client()


def merchant_is_approved(merchant_id: str) -> bool:
    client = _client()
    if client is None:
        return False
    try:
        res = client.table("merchant_profiles").select("status").eq("id", merchant_id).single().execute()
        return (res.data or {}).get("status") == "APPROVED"
    except Exception:
        return False


def list_open_groups() -> List[Dict[str, Any]]:
    client = _client()
    if client is None:
        return []
    now = datetime.now(timezone.utc).isoformat()
    res = client.table("demand_groups").select("*").eq("group_status", "Approved").eq("bidding_status", "open").execute()
    groups = res.data or []
    # filter by deadline server-side
    out = []
    for g in groups:
        deadline = g.get("bidding_deadline")
        if deadline and deadline < now:
            continue
        out.append(g)
    return out


def get_group(group_id: str) -> Optional[Dict[str, Any]]:
    client = _client()
    if client is None:
        return None
    res = client.table("demand_groups").select("*").eq("id", group_id).single().execute()
    return res.data


def submit_offer(merchant_id: str, group_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    client = _client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    # check group open
    group = get_group(group_id)
    if not group or group.get("bidding_status") != "open":
        raise ValueError("Group is not open for bidding.")
    deadline = group.get("bidding_deadline")
    if deadline and deadline < datetime.now(timezone.utc).isoformat():
        raise ValueError("Bidding deadline has passed.")
    # prevent duplicate
    existing = client.table("merchant_offers").select("id").eq("group_id", group_id).eq("merchant_id", merchant_id).execute()
    if existing.data:
        raise ValueError("An offer already exists for this group.")
    data = {
        "offer_reference": f"OFF-{group_id[:6]}-{merchant_id[:6]}",
        "group_id": group_id,
        "merchant_id": merchant_id,
        "offered_product_name": payload.get("offered_product_name"),
        "brand": payload.get("brand"),
        "model_number": payload.get("model_number"),
        "description": payload.get("description"),
        "material": payload.get("material"),
        "material_grade": payload.get("material_grade"),
        "specifications": payload.get("specifications", {}),
        "certifications": payload.get("certifications", []),
        "compliance_status": "Requires Manual Review",
        "compliance_notes": payload.get("compliance_notes"),
        "offered_unit_price": payload.get("offered_unit_price"),
        "currency": payload.get("currency", "USD"),
        "tax_amount": payload.get("tax_amount", 0),
        "additional_charges": payload.get("additional_charges", 0),
        "shipping_cost": payload.get("shipping_cost", 0),
        "final_quoted_amount": payload.get("final_quoted_amount"),
        "minimum_order_quantity": payload.get("minimum_order_quantity"),
        "available_quantity": payload.get("available_quantity"),
        "production_lead_time": payload.get("production_lead_time"),
        "dispatch_lead_time": payload.get("dispatch_lead_time"),
        "delivery_lead_time": payload.get("delivery_lead_time"),
        "delivery_terms": payload.get("delivery_terms"),
        "offer_valid_until": payload.get("offer_valid_until"),
        "merchant_remarks": payload.get("merchant_remarks"),
        "offer_status": "Submitted",
        "demand_id": None,
        "demand_title": group.get("product_title"),
        "merchant_name": payload.get("merchant_name"),
        "merchant_rating": payload.get("merchant_rating", 0),
        "unit_price": payload.get("offered_unit_price"),
        "original_target_price": None,
        "total_offer_amount": payload.get("final_quoted_amount"),
        "min_order_quantity": payload.get("minimum_order_quantity"),
        "delivery_days": payload.get("delivery_lead_time"),
        "warranty_months": None,
        "spec_notes": payload.get("compliance_notes"),
        "shipping_terms": payload.get("delivery_terms"),
    }
    # remove None values not needed? keep
    result = client.table("merchant_offers").insert(data).execute()
    if not result.data:
        raise RuntimeError("Offer submission failed.")
    offer = result.data[0]
    # status history
    client.table("offer_status_history").insert({
        "offer_id": offer["id"],
        "previous_status": None,
        "new_status": "Submitted",
        "changed_by": merchant_id,
        "remarks": "Offer submitted",
    }).execute()
    return offer


def list_merchant_offers(merchant_id: str) -> List[Dict[str, Any]]:
    client = _client()
    if client is None:
        return []
    res = client.table("merchant_offers").select("*").eq("merchant_id", merchant_id).order("created_at", desc=True).execute()
    return res.data or []


def open_bidding(group_id: str, start: str, deadline: str, admin_id: str) -> Dict[str, Any]:
    client = _client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    group = get_group(group_id)
    if not group:
        raise ValueError("Group not found.")
    if group.get("group_status") != "Approved":
        raise ValueError("Group must be approved before bidding.")
    client.table("demand_groups").update({
        "bidding_status": "open",
        "bidding_start": start,
        "bidding_deadline": deadline,
        "updated_at": "now()",
    }).eq("id", group_id).execute()
    client.table("bidding_history").insert({
        "group_id": group_id,
        "action": "open_bidding",
        "previous_status": group.get("bidding_status"),
        "new_status": "open",
        "performed_by": admin_id,
        "remarks": "Bidding opened",
    }).execute()
    return get_group(group_id)


def close_bidding(group_id: str, admin_id: str) -> Dict[str, Any]:
    client = _client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    group = get_group(group_id)
    if not group:
        raise ValueError("Group not found.")
    client.table("demand_groups").update({
        "bidding_status": "closed",
        "updated_at": "now()",
    }).eq("id", group_id).execute()
    client.table("bidding_history").insert({
        "group_id": group_id,
        "action": "close_bidding",
        "previous_status": group.get("bidding_status"),
        "new_status": "closed",
        "performed_by": admin_id,
        "remarks": "Bidding closed",
    }).execute()
    return get_group(group_id)