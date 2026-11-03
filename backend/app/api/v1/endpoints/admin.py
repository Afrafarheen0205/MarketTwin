from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.security import get_current_user, require_roles
from app.core.supabase import get_supabase_client

router = APIRouter()


class CreateUserRequest(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "customer"
    company: Optional[str] = None


@router.post("/users", summary="Provision a user account (admin only)")
async def create_user(payload: CreateUserRequest, current_user: Dict[str, Any] = Depends(require_roles("admin"))):
    client = get_supabase_client()
    if client is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Supabase is not configured.")

    if payload.role not in {"customer", "merchant", "admin"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role.")

    try:
        response = client.auth.admin.create_user(
            {
                "email": payload.email,
                "password": payload.password,
                "email_confirm": True,
                "user_metadata": {
                    "full_name": payload.full_name,
                    "role": payload.role,
                    "company": payload.company,
                },
            }
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    user = getattr(response, "user", None)
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User creation failed.")

    return {"id": str(getattr(user, "id", "")), "email": payload.email, "role": payload.role}