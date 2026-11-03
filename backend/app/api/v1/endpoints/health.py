from datetime import datetime, timezone
from fastapi import APIRouter, status
from app.core.config import get_settings
from app.core.supabase import check_supabase_health
from app.schemas.health import HealthCheckResponse, ServiceStatus

router = APIRouter()


@router.get(
    "/health",
    response_model=HealthCheckResponse,
    status_code=status.HTTP_200_OK,
    summary="Comprehensive System Health Check",
    description="Returns detailed application status, version, environment, and connected service health.",
)
async def get_health() -> HealthCheckResponse:
    settings = get_settings()
    db_status, db_msg = check_supabase_health()

    services = {
        "database": ServiceStatus(
            status=db_status,
            message=db_msg
        )
    }

    # Determine overall status
    overall_status = "ok"
    if db_status == "degraded":
        overall_status = "degraded"

    return HealthCheckResponse(
        status=overall_status,
        timestamp=datetime.now(timezone.utc).isoformat(),
        service=settings.PROJECT_NAME,
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        services=services
    )


@router.get(
    "/health/ping",
    status_code=status.HTTP_200_OK,
    summary="Lightweight Ping Probe",
    description="Minimal latency endpoint for container liveness / readiness probes.",
)
async def ping():
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
