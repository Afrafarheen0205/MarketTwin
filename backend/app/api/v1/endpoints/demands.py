import logging
from typing import List, Optional

from uuid import UUID

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile, status

from app.core.config import get_settings
from app.core.security import get_current_user, require_roles
from app.schemas.demand import (
    AttachmentResponse,
    DemandCreateRequest,
    DemandListResponse,
    DemandResponse,
    DemandUpdateRequest,
)
from app.schemas.demand_analysis import DemandAnalysisResponse
from app.services.demand_service import (
    add_attachment,
    cancel_demand,
    create_demand,
    get_attachments,
    get_analysis_dataset,
    get_demand,
    list_demands,
    update_demand,
)
from app.services.demand_analysis_service import analyze_demands, is_eligible_demand
from app.services.demand_mapping import database_row_to_api_response

logger = logging.getLogger("markettwin.api.demands")
router = APIRouter()

def _to_response(demand: dict) -> DemandResponse:
    return DemandResponse.model_validate(database_row_to_api_response(demand))


@router.post("", response_model=DemandResponse, status_code=status.HTTP_201_CREATED)
async def create_customer_demand(
    payload: DemandCreateRequest,
    current_user=Depends(require_roles("customer")),
    idempotency_key: Optional[UUID] = Header(default=None, alias="Idempotency-Key"),
):
    if not get_settings().DEMAND_PERSISTENCE_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Demand submission is disabled until the database migration and staging verification are complete.",
        )
    if idempotency_key is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An idempotency key is required for demand submission.",
        )
    try:
        demand = create_demand(
            current_user["id"],
            payload.model_dump(mode="json"),
            str(idempotency_key),
        )
        return _to_response(demand)
    except Exception as exc:
        logger.error(
            "Demand persistence operation failed.",
            extra={"error_type": type(exc).__name__},
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Demand could not be saved. Your reviewed form has not been cleared; please retry.",
        ) from exc


@router.get("", response_model=DemandListResponse)
async def get_customer_demands(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    search: Optional[str] = Query(default=None),
    current_user=Depends(require_roles("customer")),
):
    try:
        items, total = list_demands(current_user["id"], page=page, page_size=page_size, status=status_filter, search=search)
        return DemandListResponse(items=[_to_response(d) for d in items], total=total, page=page, page_size=page_size)
    except Exception as exc:
        logger.error(
            "List demands operation failed.",
            extra={"error_type": type(exc).__name__},
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Your demands are temporarily unavailable.",
        ) from exc


@router.get("/{demand_id}", response_model=DemandResponse)
async def get_customer_demand(demand_id: str, current_user=Depends(require_roles("customer"))):
    demand = get_demand(current_user["id"], demand_id)
    if not demand:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demand not found.")
    return _to_response(demand)


@router.post("/{demand_id}/analyze", response_model=DemandAnalysisResponse)
async def analyze_customer_demand(
    demand_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    classification: str = Query(
        default="all",
        pattern="^(all|exact|similar|incompatible)$",
    ),
    current_user=Depends(require_roles("customer")),
):
    if not get_settings().DEMAND_ANALYSIS_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Demand analysis is disabled until the privacy migration and staging verification are complete.",
        )
    try:
        current, records = get_analysis_dataset(current_user["id"], demand_id)
        if not is_eligible_demand(current):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This demand is not eligible for analysis.",
            )
        result = analyze_demands(
            current,
            records,
            current_user["id"],
            page=page,
            page_size=page_size,
            classification=classification,
        )
        return DemandAnalysisResponse.model_validate(result)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demand not found.") from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "Demand analysis operation failed.",
            extra={"error_type": type(exc).__name__},
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Demand analysis is temporarily unavailable.",
        ) from exc


@router.put("/{demand_id}", response_model=DemandResponse)
async def update_customer_demand(demand_id: str, payload: DemandUpdateRequest, current_user=Depends(require_roles("customer"))):
    if not get_settings().DEMAND_PERSISTENCE_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Demand updates are disabled until the database migration and staging verification are complete.",
        )
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