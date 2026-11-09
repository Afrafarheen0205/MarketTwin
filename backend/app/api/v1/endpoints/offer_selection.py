import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import get_current_user, require_roles
from app.schemas.bidding import OfferSelectRequest
from app.services.bidding_service import OfferConflict
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
    return {"items": get_offers_for_customer(current_user["id"], demand_id)}


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
async def customer_select_offer(demand_id: str, payload: OfferSelectRequest, current_user=Depends(require_roles("customer"))):
    try:
        selection = select_offer(current_user["id"], demand_id, str(payload.offer_id), payload.terms_accepted, payload.expected_unit_price, payload.expected_quantity)
        return selection
    except OfferConflict as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Offer acceptance is unavailable. Refresh orders before retrying.")


@router.get("/customer/offer-selections")
async def customer_offer_selections(current_user=Depends(require_roles("customer"))):
    client = None
    from app.core.supabase import get_supabase_client
    client = get_supabase_client()
    if client is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Supabase is not configured.")
    res = client.table("customer_offer_selections").select("*").eq("customer_id", current_user["id"]).execute()
    return {"items": res.data or []}