import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import get_current_user, require_roles
from app.services.demand_grouping_engine import generate_groups
from app.core.supabase import get_supabase_client

logger = logging.getLogger("markettwin.api.grouping")
router = APIRouter()


@router.post("/admin/demand-groups/generate")
async def generate_demand_groups(current_user=Depends(require_roles("admin"))):
    try:
        result = generate_groups(triggered_by=current_user["id"])
        return result
    except Exception as exc:
        logger.error(f"Grouping failed: {exc}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/admin/demand-groups")
async def list_demand_groups(
    status: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user=Depends(require_roles("admin")),
):
    client = get_supabase_client()
    if client is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Supabase is not configured.")
    query = client.table("demand_groups").select("*", count="exact")
    if status:
        query = query.eq("group_status", status)
    query = query.order("created_at", desc=True)
    offset = (page - 1) * page_size
    result = query.range(offset, offset + page_size - 1).execute()
    return {"items": result.data or [], "total": result.count or 0, "page": page, "page_size": page_size}


@router.get("/admin/demand-groups/{group_id}")
async def get_demand_group(group_id: str, current_user=Depends(require_roles("admin"))):
    client = get_supabase_client()
    if client is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Supabase is not configured.")
    group = client.table("demand_groups").select("*").eq("id", group_id).single().execute()
    if not group.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found.")
    members = client.table("demand_group_members").select("*").eq("group_id", group_id).execute()
    return {"group": group.data, "members": members.data or []}


@router.post("/admin/demand-groups/{group_id}/review")
async def review_demand_group(group_id: str, payload: Dict[str, Any], current_user=Depends(require_roles("admin"))):
    client = get_supabase_client()
    if client is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Supabase is not configured.")
    action = payload.get("action")
    notes = payload.get("notes")
    group = client.table("demand_groups").select("*").eq("id", group_id).single().execute()
    if not group.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found.")
    prev_status = group.data.get("group_status")
    new_status = prev_status
    if action == "approve":
        new_status = "Approved"
    elif action == "reject":
        new_status = "Rejected"
    client.table("demand_groups").update({"group_status": new_status, "updated_at": "now()"}).eq("id", group_id).execute()
    client.table("demand_group_reviews").insert({
        "group_id": group_id,
        "reviewed_by": current_user["id"],
        "action": action or "review",
        "review_notes": notes,
        "previous_status": prev_status,
        "new_status": new_status,
    }).execute()
    return {"id": group_id, "status": new_status}


@router.get("/customer/groups")
async def customer_groups(current_user=Depends(require_roles("customer"))):
    client = get_supabase_client()
    if client is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Supabase is not configured.")
    # Find demand_ids for this customer
    demands = client.table("demands").select("id").eq("customer_id", current_user["id"]).execute()
    demand_ids = [d["id"] for d in (demands.data or [])]
    if not demand_ids:
        return {"items": []}
    members = client.table("demand_group_members").select("group_id").in_("demand_id", demand_ids).execute()
    group_ids = list({m["group_id"] for m in (members.data or [])})
    if not group_ids:
        return {"items": []}
    groups = client.table("demand_groups").select("*").in_("id", group_ids).execute()
    return {"items": groups.data or []}


@router.get("/customer/groups/{group_id}")
async def customer_group_detail(group_id: str, current_user=Depends(require_roles("customer"))):
    client = get_supabase_client()
    if client is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Supabase is not configured.")
    group = client.table("demand_groups").select("*").eq("id", group_id).single().execute()
    if not group.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found.")
    # verify membership
    demands = client.table("demands").select("id").eq("customer_id", current_user["id"]).execute()
    demand_ids = [d["id"] for d in (demands.data or [])]
    members = client.table("demand_group_members").select("*").eq("group_id", group_id).in_("demand_id", demand_ids).execute()
    if not members.data:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    return {"group": group.data, "membership": members.data}