from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.core.supabase import get_supabase_client
from app.services.demand_requirement_extractor import extract_requirements


def extract_and_save(demand_id: str, demand: Dict[str, Any], version: str = "v1") -> Dict[str, Any]:
    client = get_supabase_client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    extracted = extract_requirements(demand)
    payload = {
        "demand_id": demand_id,
        "extraction_version": version,
        "product_type": extracted.get("product_type"),
        "normalized_product_name": extracted.get("normalized_product_name"),
        "normalized_category": extracted.get("normalized_category"),
        "normalized_material": extracted.get("normalized_material"),
        "normalized_specifications": extracted.get("normalized_specifications", {}),
        "normalized_dimensions": extracted.get("normalized_dimensions", {}),
        "mandatory_requirements": extracted.get("mandatory_requirements", []),
        "optional_preferences": extracted.get("optional_preferences", []),
        "commercial_constraints": extracted.get("commercial_constraints", {}),
        "delivery_constraints": extracted.get("delivery_constraints", {}),
        "missing_information": extracted.get("missing_information", []),
        "clarification_questions": extracted.get("clarification_questions", []),
        "validation_errors": extracted.get("validation_errors", []),
        "confidence_score": extracted.get("confidence_score"),
        "status": extracted.get("status", "Pending"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    result = client.table("demand_normalized_requirements").upsert(
        payload,
        on_conflict="demand_id,extraction_version",
    ).execute()
    if not result.data:
        raise RuntimeError("Failed to save normalized requirements.")
    return result.data[0]


def get_normalized(demand_id: str, version: str = "v1") -> Optional[Dict[str, Any]]:
    client = get_supabase_client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    result = client.table("demand_normalized_requirements").select("*").eq("demand_id", demand_id).eq("extraction_version", version).single().execute()
    return result.data


def review_normalized(requirement_id: str, reviewer_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    client = get_supabase_client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")
    updates["reviewed_by"] = reviewer_id
    updates["reviewed_at"] = datetime.now(timezone.utc).isoformat()
    updates["status"] = updates.get("status", "Manually Reviewed")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = client.table("demand_normalized_requirements").update(updates).eq("id", requirement_id).execute()
    if not result.data:
        raise RuntimeError("Review update failed.")
    return result.data[0]