from typing import Any, Dict, List, Optional

from app.core.supabase import get_supabase_client

EDITABLE_STATUSES = {"Submitted", "Under Review"}
CANCELLABLE_STATUSES = {"Submitted", "Under Review"}


def _client():
    return get_supabase_client()


def create_demand(customer_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    client = _client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    data = {
        "customer_id": customer_id,
        "product_name": payload["product_name"],
        "category": payload.get("category"),
        "description": payload.get("description"),
        "brand": payload.get("brand"),
        "model_number": payload.get("model_number"),
        "technical_specifications": payload.get("technical_specifications", []),
        "dimensions": payload.get("dimensions", {}),
        "material": payload.get("material"),
        "certifications": payload.get("certifications", []),
        "quantity": payload["quantity"],
        "unit": payload["unit"],
        "target_unit_price": payload.get("target_unit_price"),
        "maximum_budget": payload.get("maximum_budget"),
        "currency": payload.get("currency", "USD"),
        "required_delivery_date": payload.get("required_delivery_date"),
        "expected_lead_time": payload.get("expected_lead_time"),
        "delivery_address": payload.get("delivery_address", {}),
        "additional_requirements": payload.get("additional_requirements"),
        "status": "Submitted",
    }
    result = client.table("demands").insert(data).execute()
    if not result.data:
        raise RuntimeError("Demand creation failed.")
    demand = result.data[0]
    # Create notification
    try:
        client.table("notifications").insert({
            "user_id": customer_id,
            "title": "Demand submitted successfully",
            "description": f"Your demand {demand['demand_code']} has been submitted.",
            "type": "demand",
            "unread": True,
        }).execute()
    except Exception:
        pass
    return demand


def list_demands(customer_id: str, page: int = 1, page_size: int = 20, status: Optional[str] = None, search: Optional[str] = None) -> tuple[List[Dict[str, Any]], int]:
    client = _client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    query = client.table("demands").select("*", count="exact").eq("customer_id", customer_id)
    if status:
        query = query.eq("status", status)
    if search:
        query = query.ilike("product_name", f"%{search}%")
    query = query.order("created_at", desc=True)
    offset = (page - 1) * page_size
    result = query.range(offset, offset + page_size - 1).execute()
    return result.data or [], result.count or 0


def get_demand(customer_id: str, demand_id: str) -> Optional[Dict[str, Any]]:
    client = _client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    result = client.table("demands").select("*").eq("id", demand_id).eq("customer_id", customer_id).single().execute()
    return result.data


def get_attachments(demand_id: str) -> List[Dict[str, Any]]:
    client = _client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    result = client.table("demand_attachments").select("*").eq("demand_id", demand_id).execute()
    return result.data or []


def update_demand(customer_id: str, demand_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    client = _client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    existing = get_demand(customer_id, demand_id)
    if not existing:
        raise PermissionError("Demand not found or access denied.")
    if existing.get("status") not in EDITABLE_STATUSES:
        raise ValueError("Demand is not eligible for modification.")
    update_data = {}
    for key in ["product_name", "category", "description", "brand", "model_number", "technical_specifications", "dimensions", "material", "certifications", "quantity", "unit", "target_unit_price", "maximum_budget", "currency", "required_delivery_date", "expected_lead_time", "delivery_address", "additional_requirements"]:
        if key in payload and payload[key] is not None:
            update_data[key] = payload[key]
    update_data["updated_at"] = "now()"
    result = client.table("demands").update(update_data).eq("id", demand_id).eq("customer_id", customer_id).execute()
    if not result.data:
        raise RuntimeError("Demand update failed.")
    return result.data[0]


def cancel_demand(customer_id: str, demand_id: str) -> Dict[str, Any]:
    client = _client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    existing = get_demand(customer_id, demand_id)
    if not existing:
        raise PermissionError("Demand not found or access denied.")
    if existing.get("status") not in CANCELLABLE_STATUSES:
        raise ValueError("Demand cannot be cancelled in its current state.")
    result = client.table("demands").update({"status": "Cancelled", "updated_at": "now()"}).eq("id", demand_id).eq("customer_id", customer_id).execute()
    if not result.data:
        raise RuntimeError("Demand cancellation failed.")
    return result.data[0]


def add_attachment(demand_id: str, customer_id: str, file_name: str, file_path: str, file_type: Optional[str], file_size: Optional[int]) -> Dict[str, Any]:
    client = _client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    existing = get_demand(customer_id, demand_id)
    if not existing:
        raise PermissionError("Demand not found or access denied.")
    result = client.table("demand_attachments").insert({
        "demand_id": demand_id,
        "file_name": file_name,
        "file_path": file_path,
        "file_type": file_type,
        "file_size": file_size,
    }).execute()
    if not result.data:
        raise RuntimeError("Attachment creation failed.")
    return result.data[0]