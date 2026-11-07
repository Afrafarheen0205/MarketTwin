import logging
from typing import Any, Dict, List, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.supabase import get_supabase_client

logger = logging.getLogger("markettwin.security")
bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Dict[str, Any]:
    """Verify a Supabase JWT and return the authenticated user payload."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token.",
        )

    client = get_supabase_client()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase authentication is not configured.",
        )

    try:
        response = client.auth.get_user(credentials.credentials)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
        ) from exc

    user = getattr(response, "user", None)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unable to resolve authenticated user.",
        )

    metadata = getattr(user, "user_metadata", None) or {}
    user_id = str(getattr(user, "id", ""))
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unable to resolve authenticated user.",
        )

    try:
        profile_res = (
            client.table("profiles")
            .select("role")
            .eq("id", user_id)
            .single()
            .execute()
        )
    except Exception as exc:
        logger.warning("Unable to resolve the authenticated user's profile role.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Account role verification is temporarily unavailable.",
        ) from exc

    profile = getattr(profile_res, "data", None)
    role = profile.get("role") if isinstance(profile, dict) else None
    if role not in {"customer", "merchant", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A valid account role could not be verified.",
        )

    profile_status = None
    if role == "merchant":
        try:
            merch_res = (
                client.table("merchant_profiles")
                .select("status")
                .eq("id", user_id)
                .single()
                .execute()
            )
        except Exception as exc:
            logger.warning("Unable to resolve the authenticated merchant's approval status.")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Merchant account verification is temporarily unavailable.",
            ) from exc
        merchant_profile = getattr(merch_res, "data", None)
        if isinstance(merchant_profile, dict):
            profile_status = merchant_profile.get("status")

    return {
        "id": user_id,
        "email": getattr(user, "email", None),
        "email_confirmed_at": getattr(user, "email_confirmed_at", None),
        "role": role,
        "status": profile_status,
        "metadata": metadata,
    }


def require_roles(*allowed_roles: str):
    """Factory returning a dependency that enforces role-based access."""

    def _checker(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        role = current_user.get("role")
        if role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role}' is not permitted for this operation.",
            )
        if current_user.get("email_confirmed_at") is None and role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Email address is not verified.",
            )
        return current_user

    return _checker


def require_approved_merchant(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if current_user.get("role") != "merchant":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Merchant role required.")
    if current_user.get("email_confirmed_at") is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email address is not verified.")
    if current_user.get("status") != "APPROVED":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Merchant account is not approved.")
    return current_user