from typing import Dict, Optional
from pydantic import BaseModel, Field


class ServiceStatus(BaseModel):
    """Status for dependent subsystem services."""
    status: str = Field(..., description="operational | degraded | unconfigured | unavailable")
    message: Optional[str] = None
    latency_ms: Optional[float] = None


class HealthCheckResponse(BaseModel):
    """Response payload for system health check."""
    status: str = Field(..., description="ok | degraded | error")
    timestamp: str = Field(..., description="ISO 8601 UTC timestamp")
    service: str = Field(..., description="Application name")
    version: str = Field(..., description="API Version")
    environment: str = Field(..., description="development | staging | production")
    services: Optional[Dict[str, ServiceStatus]] = None
