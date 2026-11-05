import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.product import ProductListResponse, ProductResponse
from app.services.product_service import ProductService

logger = logging.getLogger("markettwin.api.products")
router = APIRouter()


@router.get("", response_model=ProductListResponse, summary="List active catalog products")
async def get_products(
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=12, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(default=None, description="Search by title, brand, model or specs"),
    category: Optional[str] = Query(default=None, description="Filter by category taxonomy"),
    min_price: Optional[float] = Query(default=None, ge=0, description="Minimum retail price filter"),
    max_price: Optional[float] = Query(default=None, ge=0, description="Maximum retail price filter"),
    sort_by: Optional[str] = Query(default="newest", description="Sorting order: newest | price_asc | price_desc | popular"),
):
    """
    Retrieve active products available in the commercial catalog.
    Supports real-time search, category taxonomy filtering, price ceiling/floor, and multi-mode sorting.
    """
    try:
        return ProductService.list_products(
            page=page,
            page_size=page_size,
            search=search,
            category=category,
            min_price=min_price,
            max_price=max_price,
            sort_by=sort_by,
            only_active=True,
        )
    except Exception as exc:
        logger.error(f"Error fetching products: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to fetch catalog products: {str(exc)}",
        )


@router.get("/categories", response_model=List[str], summary="List distinct product categories")
async def get_product_categories():
    """Retrieve all distinct taxonomy categories currently registered in the catalog."""
    try:
        return ProductService.list_categories()
    except Exception as exc:
        logger.error(f"Error fetching categories: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to fetch product categories.",
        )


@router.get("/{product_id}", response_model=ProductResponse, summary="Get product details")
async def get_product_by_id(product_id: str):
    """
    Retrieve detailed technical specifications, pricing tiers, and availability
    for a specific product by its UUID or unique URL slug.
    """
    product = ProductService.get_product_by_id_or_slug(product_id, only_active=True)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with identifier '{product_id}' was not found or is currently inactive.",
        )
    return product
