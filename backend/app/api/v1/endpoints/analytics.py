from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import require_roles
from app.services.analytics_service import overview

router = APIRouter()


@router.get("/admin/dashboard/overview")
async def admin_overview(current_user=Depends(require_roles("admin"))):
    return overview()