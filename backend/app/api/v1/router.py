from fastapi import APIRouter
from app.api.v1.endpoints import admin, admin_products, auth, health, products, users

api_router = APIRouter()

# Register endpoint routers
api_router.include_router(health.router, tags=["Health & System Diagnostics"])
api_router.include_router(users.router, prefix="/users", tags=["Users & Authentication"])
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(admin.router, prefix="/admin", tags=["Administration"])
api_router.include_router(products.router, prefix="/products", tags=["Product Catalogue"])
api_router.include_router(admin_products.router, prefix="/admin/products", tags=["Admin Product Management"])
