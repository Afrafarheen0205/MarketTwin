from typing import Any, Dict, List
from datetime import datetime, timezone
import uuid

from app.core.supabase import get_supabase_client


def _client():
    return get_supabase_client()


def get_customer_demands(customer_id: str) -> List[Dict[str, Any]]:
    client = _client()
    if client is None:
        return []
    res = client.table("demands").select("*").eq("customer_id", customer_id).execute()
    return res.data or []


def get_offers_for_customer(customer_id: str) -> List[Dict[str, Any]]:
    client = _client()
    if client is None:
        return []
    demands = get_customer_demands(customer_id)
    demand_ids = [d["id"] for d in demands]
    if not demand_ids:
        return []
    # find groups containing these demands
    members = client.table("demand_group_members").select("group_id,demand_id").in_("demand_id", demand_ids).execute()
    group_ids = list({m["group_id"] for m in (members.data or [])})
    if not group_ids:
        return []
    offers = client.table("merchant_offers").select("*").in_("group_id", group_ids).execute()
    return offers.data or []


def validate_offer(customer_id: str, demand_id: str, offer_id: str) -> Dict[str, Any]:
    client = _client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    demand = client.table("demands").select("*").eq("id", demand_id).eq("customer_id", customer_id).single().execute()
    if not demand.data:
        raise PermissionError("Demand not found.")
    offer = client.table("merchant_offers").select("*").eq("id", offer_id).single().execute()
    if not offer.data:
        raise ValueError("Offer not found.")
    # basic eligibility
    status = "Eligible"
    details = {"checks": []}
    # deadline
    group = None
    if offer.data.get("group_id"):
        g = client.table("demand_groups").select("*").eq("id", offer.data["group_id"]).single().execute()
        group = g.data
    if offer.data.get("offer_status") != "Submitted" and offer.data.get("offer_status") != "Under Review":
        status = "Not Eligible"
        details["checks"].append("Offer not active.")
    if offer.data.get("offer_valid_until"):
        if offer.data["offer_valid_until"] < datetime.now(timezone.utc).date().isoformat():
            status = "Not Eligible"
            details["checks"].append("Offer expired.")
    # customer quantity check
    qty = demand.data.get("quantity")
    min_qty = offer.data.get("minimum_order_quantity") or offer.data.get("min_order_quantity")
    if min_qty and qty and qty < min_qty:
        status = "Not Eligible"
        details["checks"].append("Offer minimum quantity exceeds demand quantity.")
    # store eligibility
    client.table("customer_offer_eligibility").upsert({
        "customer_id": customer_id,
        "demand_id": demand_id,
        "offer_id": offer_id,
        "eligibility_status": status,
        "validation_details": details,
        "validation_version": "v1",
    }, on_conflict="customer_id,demand_id,offer_id").execute()
    return {"status": status, "details": details, "offer": offer.data, "demand": demand.data, "group": group}


def select_offer(customer_id: str, demand_id: str, offer_id: str, terms_accepted: bool) -> Dict[str, Any]:
    client = _client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    if not terms_accepted:
        raise ValueError("Terms must be accepted.")
    # prevent duplicate
    existing = client.table("customer_offer_selections").select("id").eq("customer_id", customer_id).eq("demand_id", demand_id).execute()
    if existing.data:
        raise ValueError("Offer already selected for this demand.")
    elig = validate_offer(customer_id, demand_id, offer_id)
    if elig["status"] == "Not Eligible":
        raise ValueError("Offer is not eligible.")
    offer = elig["offer"]
    demand = elig["demand"]
    group = elig["group"]
    quantity = demand.get("quantity") or 1
    unit_price = offer.get("offered_unit_price") or offer.get("unit_price") or 0
    taxes = offer.get("tax_amount") or 0
    shipping = offer.get("shipping_cost") or 0
    additional = offer.get("additional_charges") or 0
    total = quantity * unit_price + taxes + shipping + additional
    import uuid
    selection_ref = f"SEL-{uuid.uuid4().hex[:8].upper()}"
    payload = {
        "selection_reference": selection_ref,
        "customer_id": customer_id,
        "demand_id": demand_id,
        "group_id": group.get("id") if group else None,
        "offer_id": offer_id,
        "merchant_id": offer.get("merchant_id"),
        "selected_quantity": quantity,
        "selected_unit": demand.get("unit") or "units",
        "agreed_unit_price": unit_price,
        "currency": offer.get("currency") or "USD",
        "agreed_taxes": taxes,
        "agreed_shipping_cost": shipping,
        "agreed_additional_charges": additional,
        "estimated_total": total,
        "delivery_terms_snapshot": {"delivery_terms": offer.get("delivery_terms"), "delivery_lead_time": offer.get("delivery_lead_time")},
        "product_terms_snapshot": {"product_name": offer.get("offered_product_name"), "material": offer.get("material")},
        "compliance_snapshot": elig["details"],
        "selection_status": "Selected",
    }
    result = client.table("customer_offer_selections").insert(payload).execute()
    if not result.data:
        raise RuntimeError("Selection failed.")
    return result.data[0]