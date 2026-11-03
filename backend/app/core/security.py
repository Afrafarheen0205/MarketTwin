from typing import Any, Dict, List, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.supabase import get_supabase_client

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
            detail=f"Invalid or expired authentication token: {exc}",
        ) from exc

    user = getattr(response, "user", None)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unable to resolve authenticated user.",
        )

    metadata = getattr(user, "user_metadata", None) or {}
    role = metadata.get("role", "customer")

    # Prefer trusted role from profiles table when available.
    client = get_supabase_client()
    profile_status = None
    if client is not None:
        try:
            profile_res = client.table("profiles").select("role").eq("id", str(getattr(user, "id", ""))).single().execute()
            if profile_res.data:
                role = profile_res.data.get("role", role)
        except Exception:
            pass
        if role == "merchant":
            try:
                merch_res = client.table("merchant_profiles").select("status").eq("id", str(getattr(user, "id", ""))).single().execute()
                if merch_res.data:
                    profile_status = merch_res.data.get("status")
            except Exception:
                pass

    return {
        "id": str(getattr(user, "id", "")),
        "email": getattr(user, "email", None),
        "email_confirmed_at": getattr(user, "email_confirmed_at", None),
        "role": role,
        "status": profile_status,
        "metadata": metadata,
    }


def require_roles(*allowed_roles: str):
    """Factory returning a dependency that enforces role-based access."""

    def _checker(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        role = current_user.get("role", "customer")
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