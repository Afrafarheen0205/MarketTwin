import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status

from app.core.security import get_current_user, require_roles
from app.schemas.demand import (
    AttachmentResponse,
    DemandCreateRequest,
    DemandListResponse,
    DemandResponse,
    DemandUpdateRequest,
)
from app.services.demand_service import (
    add_attachment,
    cancel_demand,
    create_demand,
    get_attachments,
    get_demand,
    list_demands,
    update_demand,
)

logger = logging.getLogger("markettwin.api.demands")
router = APIRouter()


def _to_response(demand: dict) -> DemandResponse:
    return DemandResponse(
        id=str(demand.get("id")),
        customer_id=str(demand.get("customer_id")),
        product_name=demand.get("product_name"),
        category=demand.get("category"),
        description=demand.get("description"),
        brand=demand.get("brand"),
        model_number=demand.get("model_number"),
        technical_specifications=demand.get("technical_specifications") or [],
        dimensions=demand.get("dimensions") or {},
        material=demand.get("material"),
        certifications=demand.get("certifications") or [],
        quantity=float(demand.get("quantity") or 0),
        unit=demand.get("unit") or "units",
        target_unit_price=demand.get("target_unit_price"),
        maximum_budget=demand.get("maximum_budget"),
        currency=demand.get("currency") or "USD",
        required_delivery_date=demand.get("required_delivery_date"),
        expected_lead_time=demand.get("expected_lead_time"),
        delivery_address=demand.get("delivery_address") or {},
        additional_requirements=demand.get("additional_requirements"),
        status=demand.get("status") or "Submitted",
        created_at=demand.get("created_at"),
        updated_at=demand.get("updated_at"),
    )


@router.post("", response_model=DemandResponse, status_code=status.HTTP_201_CREATED)
async def create_customer_demand(payload: DemandCreateRequest, current_user=Depends(require_roles("customer"))):
    try:
        demand = create_demand(current_user["id"], payload.model_dump())
        return _to_response(demand)
    except Exception as exc:
        logger.error(f"Demand creation failed: {exc}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("", response_model=DemandListResponse)
async def get_customer_demands(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    current_user=Depends(require_roles("customer")),
):
    try:
        items, total = list_demands(current_user["id"], page=page, page_size=page_size, status=status, search=search)
        return DemandListResponse(items=[_to_response(d) for d in items], total=total, page=page, page_size=page_size)
    except Exception as exc:
        logger.error(f"List demands failed: {exc}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/{demand_id}", response_model=DemandResponse)
async def get_customer_demand(demand_id: str, current_user=Depends(require_roles("customer"))):
    demand = get_demand(current_user["id"], demand_id)
    if not demand:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demand not found.")
    return _to_response(demand)


@router.put("/{demand_id}", response_model=DemandResponse)
async def update_customer_demand(demand_id: str, payload: DemandUpdateRequest, current_user=Depends(require_roles("customer"))):
    try:
        demand = update_demand(current_user["id"], demand_id, payload.model_dump(exclude_unset=True))
        return _to_response(demand)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error(f"Update demand failed: {exc}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/{demand_id}/cancel", response_model=DemandResponse)
async def cancel_customer_demand(demand_id: str, current_user=Depends(require_roles("customer"))):
    try:
        demand = cancel_demand(current_user["id"], demand_id)
        return _to_response(demand)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error(f"Cancel demand failed: {exc}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/{demand_id}/attachments", response_model=List[AttachmentResponse])
async def get_demand_attachments(demand_id: str, current_user=Depends(require_roles("customer"))):
    demand = get_demand(current_user["id"], demand_id)
    if not demand:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demand not found.")
    attachments = get_attachments(demand_id)
    return [AttachmentResponse(**a) for a in attachments]


@router.post("/{demand_id}/attachments", response_model=AttachmentResponse, status_code=status.HTTP_201_CREATED)
async def upload_demand_attachment(
    demand_id: str,
    file: UploadFile = File(...),
    current_user=Depends(require_roles("customer")),
):
    demand = get_demand(current_user["id"], demand_id)
    if not demand:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demand not found.")
    # Validate file size (max 10MB)
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File size exceeds 10MB limit.")
    # Upload to Supabase Storage
    client = None
    from app.core.supabase import get_supabase_client
    client = get_supabase_client()
    if client is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Supabase is not configured.")
    import uuid
    file_path = f"{current_user['id']}/{demand_id}/{uuid.uuid4()}_{file.filename}"
    try:
        client.storage.from_("demand-attachments").upload(file_path, content, file_options={"content-type": file.content_type or "application/octet-stream"})
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Upload failed: {exc}")
    attachment = add_attachment(demand_id, current_user["id"], file.filename or "file", file_path, file.content_type, len(content))
    return AttachmentResponse(**attachment)