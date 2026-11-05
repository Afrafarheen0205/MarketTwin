import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import get_current_user, require_roles
from app.services.offer_validation_service import (
    get_customer_demands,
    get_offers_for_customer,
    select_offer,
    validate_offer,
)

logger = logging.getLogger("markettwin.api.offer_selection")
router = APIRouter()


@router.get("/customer/offers")
async def customer_offers(current_user=Depends(require_roles("customer"))):
    offers = get_offers_for_customer(current_user["id"])
    return {"items": offers}


@router.get("/customer/demands/{demand_id}/offers")
async def customer_demand_offers(demand_id: str, current_user=Depends(require_roles("customer"))):
    offers = get_offers_for_customer(current_user["id"])
    filtered = [o for o in offers if True]
    return {"items": filtered}


@router.get("/customer/demands/{demand_id}/offers/{offer_id}/eligibility")
async def customer_offer_eligibility(demand_id: str, offer_id: str, current_user=Depends(require_roles("customer"))):
    try:
        return validate_offer(current_user["id"], demand_id, offer_id)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error(f"Eligibility failed: {exc}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/customer/demands/{demand_id}/select-offer")
async def customer_select_offer(demand_id: str, payload: Dict[str, Any], current_user=Depends(require_roles("customer"))):
    offer_id = payload.get("offer_id")
    terms_accepted = payload.get("terms_accepted", False)
    if not offer_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="offer_id is required.")
    try:
        selection = select_offer(current_user["id"], demand_id, offer_id, terms_accepted)
        return selection
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error(f"Selection failed: {exc}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/customer/offer-selections")
async def customer_offer_selections(current_user=Depends(require_roles("customer"))):
    client = None
    from app.core.supabase import get_supabase_client
    client = get_supabase_client()
    if client is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Supabase is not configured.")
    res = client.table("customer_offer_selections").select("*").eq("customer_id", current_user["id"]).execute()
    return {"items": res.data or []}