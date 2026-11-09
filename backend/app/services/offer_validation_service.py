from typing import Any, Dict, List
from decimal import Decimal, InvalidOperation

from app.core.supabase import get_supabase_client
from app.services.bidding_service import _offer_rpc
from app.services.demand_group_merge_service import resolve_group_id, resolve_group_ids


def _client():
    return get_supabase_client()


def _require_offer_group_id(client) -> None:
    try:
        client.table("merchant_offers").select("group_id").limit(0).execute()
    except Exception as exc:
        raise RuntimeError(
            "Offer validation is unavailable: merchant_offers.group_id is missing from the deployed schema."
        ) from exc


def get_customer_demands(customer_id: str) -> List[Dict[str, Any]]:
    client = _client()
    if client is None:
        return []
    res = client.table("demands").select("*").eq("customer_id", customer_id).execute()
    return res.data or []


def get_offers_for_customer(customer_id: str, demand_id: str | None = None) -> List[Dict[str, Any]]:
    client = _client()
    if client is None:
        return []
    demands = get_customer_demands(customer_id)
    if demand_id is not None:
        demands = [demand for demand in demands if demand["id"] == demand_id]
    demand_ids = [d["id"] for d in demands]
    if not demand_ids:
        return []
    _require_offer_group_id(client)
    members = client.table("demand_group_members").select("group_id").eq("customer_id", customer_id).eq("membership_status", "active").is_("removed_at", "null").execute()
    group_ids = sorted({member["group_id"] for member in (members.data or [])} | {demand["group_id"] for demand in demands if demand.get("group_id")})
    resolved = resolve_group_ids(group_ids, client=client) if group_ids else {}
    member_groups = {resolved[member["group_id"]] for member in (members.data or [])}
    offers = client.table("merchant_offers").select("*").in_("demand_id", demand_ids).execute().data or []
    if member_groups:
        offers += client.table("merchant_offers").select("*").in_("group_id", sorted(member_groups)).execute().data or []
    unique_offers = {offer["id"]: offer for offer in offers}
    result = []
    for demand in demands:
        demand_group = resolved.get(demand.get("group_id"))
        for offer in unique_offers.values():
            if offer.get("demand_id"):
                associated = offer["demand_id"] == demand["id"]
            else:
                associated = bool(demand_group and demand_group in member_groups and offer.get("group_id") == demand_group)
            if associated:
                eligibility = evaluate_offer(demand, offer)
                result.append({**offer, "customer_demand_id": demand["id"],
                    "customer_quantity": demand.get("target_quantity"), "eligibility": eligibility})
    return result


def evaluate_offer(demand: Dict[str, Any], offer: Dict[str, Any]) -> Dict[str, Any]:
    checks = []
    quantity = demand.get("target_quantity")
    if offer.get("status") not in ("Submitted", "Under Review"):
        checks.append("Offer is not active.")
    if not offer.get("merchant_id"):
        checks.append("Merchant is unavailable.")
    try:
        quantity_value = Decimal(str(quantity)) if not isinstance(quantity, bool) else Decimal("NaN")
        if not quantity_value.is_finite() or quantity_value <= 0:
            raise InvalidOperation
    except (InvalidOperation, ValueError, TypeError):
        checks.append("Demand quantity is invalid.")
    else:
        minimum_quantity = offer.get("min_order_quantity")
        if minimum_quantity is not None:
            try:
                minimum_value = Decimal(str(minimum_quantity))
                if not minimum_value.is_finite() or minimum_value <= 0:
                    raise InvalidOperation
                if quantity_value < minimum_value:
                    checks.append("Offer minimum quantity exceeds demand quantity.")
            except (InvalidOperation, ValueError, TypeError):
                checks.append("Offer minimum quantity is invalid.")
    try:
        price = Decimal(str(offer.get("unit_price")))
        if not price.is_finite() or price <= 0:
            checks.append("Offer price is invalid.")
    except InvalidOperation:
        checks.append("Offer price is invalid.")
    return {"status": "Not Eligible" if checks else "Eligible", "details": {"checks": checks}}


def validate_offer(customer_id: str, demand_id: str, offer_id: str) -> Dict[str, Any]:
    client = _client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    _require_offer_group_id(client)
    demand = client.table("demands").select("*").eq("id", demand_id).eq("customer_id", customer_id).single().execute()
    if not demand.data:
        raise PermissionError("Demand not found.")
    offer = next((offer for offer in get_offers_for_customer(customer_id, demand_id) if offer["id"] == offer_id), None)
    if offer is None:
        raise PermissionError("Offer not found for this demand.")
    return {**offer["eligibility"], "offer": offer, "demand": demand.data}


def select_offer(customer_id: str, demand_id: str, offer_id: str, terms_accepted: bool, expected_unit_price: Decimal, expected_quantity: Decimal) -> Dict[str, Any]:
    if terms_accepted is not True:
        raise ValueError("Terms must be accepted.")
    return _offer_rpc("accept_merchant_offer_v1", {
        "p_customer_id": customer_id, "p_demand_id": demand_id, "p_offer_id": offer_id,
        "p_terms_accepted": True, "p_expected_unit_price": str(expected_unit_price),
        "p_expected_quantity": str(expected_quantity),
    })