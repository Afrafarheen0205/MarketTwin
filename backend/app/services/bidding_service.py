import logging
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from uuid import uuid4

from app.core.supabase import get_supabase_client, get_supabase_service_client
from app.schemas.bidding import OfferReviseRequest, OfferSubmitRequest
from app.services.demand_group_merge_service import resolve_group_id

logger = logging.getLogger("markettwin.services.bidding")


ACTIVE_DEMAND_STATUSES = (
    "Pending",
    "Submitted",
    "Under Review",
    "Grouped",
    "Bidding Open",
    "Offers Available",
    "Offers Received",
    "Approved",
)

BLOCKED_MERCHANT_STATUSES = {
    "SUSPENDED",
    "REJECTED",
    "BLOCKED",
    "DISABLED",
    "INACTIVE",
}

_DEMAND_FIELDS = (
    "id,customer_id,demand_code,title,category,description,brand,model_number,"
    "technical_specifications,dimensions,certifications,target_quantity,unit,"
    "min_target_unit_price,max_target_unit_price,target_price,market_price,currency,"
    "expected_lead_time,required_delivery_time,delivery_address,additional_requirements,"
    "custom_requirements,status,group_id,created_at,updated_at,deadline,"
    "demand_normalized_requirements(product_type,normalized_product_name,"
    "normalized_category,normalized_material,normalized_specifications,"
    "normalized_dimensions,mandatory_requirements,optional_preferences,"
    "commercial_constraints,delivery_constraints,status)"
)


def _client():
    return get_supabase_client()


def _service_client():
    return get_supabase_service_client() or get_supabase_client()


def merchant_is_approved(merchant_id: str) -> bool:
    """Return whether a registered merchant may participate in bidding.

    Live merchant records use a mix of legacy "APPROVED" and operational
    "Active"/"PENDING" values. Only explicitly blocked statuses are denied so
    every registered merchant sees and can bid on available demands.
    """
    client = _client()
    if client is None:
        return False
    try:
        res = client.table("merchant_profiles").select("status").eq("id", merchant_id).single().execute()
        status = str((res.data or {}).get("status") or "").strip().upper()
        return status not in BLOCKED_MERCHANT_STATUSES
    except Exception:
        return False


def _serialize_demand(row: Dict[str, Any]) -> Dict[str, Any]:
    normalized = row.pop("demand_normalized_requirements", None)
    if isinstance(normalized, list):
        normalized = normalized[0] if normalized else None
    if not isinstance(normalized, dict):
        normalized = None
    return {**row, "normalized_requirements": normalized}


def list_active_demands() -> List[Dict[str, Any]]:
    """List every customer demand still open to merchant offers."""
    client = _service_client()
    if client is None:
        return []
    res = (
        client.table("demands")
        .select(_DEMAND_FIELDS)
        .in_("status", list(ACTIVE_DEMAND_STATUSES))
        .order("created_at", desc=True)
        .execute()
    )
    return [_serialize_demand(dict(row)) for row in (res.data or [])]


def get_active_demand(demand_id: str) -> Optional[Dict[str, Any]]:
    client = _service_client()
    if client is None:
        return None
    res = client.table("demands").select(_DEMAND_FIELDS).eq("id", demand_id).limit(1).execute()
    rows = res.data or []
    if not rows:
        return None
    row = dict(rows[0])
    if row.get("status") not in ACTIVE_DEMAND_STATUSES:
        return None
    return _serialize_demand(row)


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
    canonical_group_id = resolve_group_id(group_id, client=client)
    res = client.table("demand_groups").select("*").eq("id", canonical_group_id).single().execute()
    return res.data


class OfferConflict(ValueError):
    pass


def _offer_rpc(name: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
    client = get_supabase_service_client()
    if client is None:
        raise RuntimeError("Offer operations are unavailable.")
    try:
        result = client.rpc(name, parameters).execute()
    except Exception as exc:
        code = getattr(exc, "code", None)
        message = getattr(exc, "message", None)
        conflicts = {
            "OFFER_DUPLICATE": "An offer already exists for this group. Refresh My Offers.",
            "OFFER_NOT_REVISABLE": "This offer can no longer be revised.",
            "OFFER_STALE_PRICE": "The price changed. Refresh the offer before revising.",
            "OFFER_STALE_QUANTITY": "Your demand quantity changed. Refresh before accepting.",
            "OFFER_GROUP_CLOSED": "The group is not open for bidding.",
            "OFFER_ALREADY_SELECTED": "Another offer has already been selected for this demand.",
            "OFFER_NOT_ACTIVE": "This offer is no longer available for acceptance.",
            "OFFER_LEGACY_QUANTITY": "This legacy offer has no verified quote quantity and cannot be revised.",
            "OFFER_CURRENCY_MISMATCH": "The offer currency does not match the demand currency.",
        }
        if code == "23505":
            raise OfferConflict("An offer already exists. Refresh My Offers.") from exc
        if code == "P0001" and message in conflicts:
            raise OfferConflict(conflicts[message]) from exc
        if code == "P0001" and message == "OFFER_INVALID_TERMS":
            raise ValueError("Offer terms are invalid for this demand.") from exc
        if code == "P0001" and message == "DEMAND_NOT_FOUND":
            raise ValueError("Demand not found.") from exc
        if code == "P0001" and message == "DEMAND_NOT_ACTIVE":
            raise ValueError("This demand is no longer available for offers.") from exc
        if code == "42501" and message == "Merchant is not authorized":
            raise PermissionError("Merchant is not authorized to submit offers.") from exc
        logger.error("Offer RPC %s failed: code=%s message=%s", name, code, message, exc_info=exc)
        raise RuntimeError(f"Offer operations are unavailable ({code}): {message}") from exc
    if not isinstance(result.data, dict) or not result.data.get("id"):
        raise RuntimeError("Offer operation returned an invalid response. Refresh before retrying.")
    return result.data


def submit_offer(merchant_id: str, group_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    request = OfferSubmitRequest.model_validate(payload)
    return _offer_rpc("submit_merchant_offer_v1", {
        "p_merchant_id": merchant_id,
        "p_group_id": group_id,
        "p_offer_code": f"OFF-{uuid4().hex.upper()}",
        "p_terms": request.model_dump(mode="json"),
    })


def submit_demand_offer(merchant_id: str, demand_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Submit an offer against a single active customer demand."""
    request = OfferSubmitRequest.model_validate(payload)
    return _offer_rpc("submit_merchant_demand_offer_v1", {
        "p_merchant_id": merchant_id,
        "p_demand_id": demand_id,
        "p_offer_code": f"OFF-{uuid4().hex.upper()}",
        "p_terms": request.model_dump(mode="json"),
    })


def revise_offer(merchant_id: str, offer_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    request = OfferReviseRequest.model_validate(payload)
    return _offer_rpc("revise_merchant_offer_v1", {
        "p_merchant_id": merchant_id,
        "p_offer_id": offer_id,
        "p_unit_price": str(request.unit_price),
        "p_expected_unit_price": str(request.expected_unit_price),
    })


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