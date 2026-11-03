from fastapi import APIRouter
from app.api.v1.endpoints import admin, health, users

api_router = APIRouter()

# Register endpoint routers
api_router.include_router(health.router, tags=["Health & System Diagnostics"])
api_router.include_router(users.router, prefix="/users", tags=["Users & Authentication"])
api_router.include_router(admin.router, prefix="/admin", tags=["Administration"])

# Additional domain routers (Demands, Offers, Products, Groups) will be registered here in future phases
