from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.core.security import get_current_user
from app.schemas.user import UserProfile
from app.services.profile_service import get_profile

router = APIRouter()


@router.get("/me", response_model=UserProfile, summary="Current authenticated user")
async def read_current_user(current_user: Dict[str, Any] = Depends(get_current_user)):
    profile = get_profile(current_user["id"])
    if profile:
        return UserProfile(
            id=profile["id"],
            email=profile.get("email"),
            full_name=profile.get("full_name"),
            role=profile.get("role", current_user.get("role", "customer")),
            company=profile.get("company"),
        )
    return UserProfile(
        id=current_user["id"],
        email=current_user.get("email"),
        role=current_user.get("role", "customer"),
    )