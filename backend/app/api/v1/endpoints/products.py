import logging
from typing import Annotated, List, Optional, Union
from fastapi import APIRouter, Body, HTTPException, Query, status
from pydantic import Field

from app.schemas.ai import RequirementDraft
from app.schemas.product import (
    ProductListResponse,
    ProductMatchRequest,
    ProductMatchResponse,
    ProductResponse,
    ProductSearchResponse,
)
from app.schemas.product_matching import ProductMatchingResponse
from app.services.product_service import ProductService
from app.services.product_matching_service import ProductMatchingService
from app.services.buyora_catalogue_service import (
    CatalogueInvalidResponse,
    CatalogueTimeout,
    CatalogueUnavailable,
)

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
        if min_price is not None and max_price is not None and min_price > max_price:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="min_price cannot be greater than max_price.",
            )
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
    except HTTPException:
        raise
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


@router.get("/search", response_model=ProductSearchResponse, summary="Search and match active products with relevance ranking")
async def search_products(
    q: Optional[str] = Query(default=None, description="Search query keywords, brand, model number or technical specifications"),
    category: Optional[str] = Query(default=None, description="Filter by category"),
    min_price: Optional[float] = Query(default=None, ge=0, description="Minimum price filter"),
    max_price: Optional[float] = Query(default=None, ge=0, description="Maximum price filter"),
    sort: Optional[str] = Query(default="relevance", description="Sorting order: relevance | price_asc | price_desc | newest"),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=12, ge=1, le=100, description="Results per page"),
):
    """
    Phase 6 Engine: Searches active commercial catalogue products and partitions results
    into Exact Matches and Similar Suggestions with explainable match reasons and relevance scores.
    """
    allowed_sorts = {"relevance", "price_asc", "price_desc", "newest"}
    sort_clean = (sort or "relevance").lower().strip()
    if sort_clean not in allowed_sorts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid sort option '{sort}'. Must be one of: {', '.join(sorted(allowed_sorts))}.",
        )

    if min_price is not None and max_price is not None and min_price > max_price:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="min_price cannot be greater than max_price.",
        )

    try:
        return ProductService.search_and_match_products(
            query=q,
            category=category,
            min_price=min_price,
            max_price=max_price,
            sort=sort_clean,
            page=page,
            page_size=page_size,
            only_active=True,
        )
    except Exception as exc:
        logger.error(f"Error executing product search for query '{q}': {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Product search failed: {str(exc)}",
        )


@router.post(
    "/match",
    response_model=Union[ProductMatchingResponse, ProductMatchResponse],
    summary="Match Phase 1 requirements or legacy demand specifications against a catalogue",
)
async def match_product_specifications(
    payload: Annotated[
        Union[RequirementDraft, ProductMatchRequest],
        Field(union_mode="left_to_right"),
    ] = Body(...),
):
    """
    Evaluate incoming customer requirements or demand specifications against verified catalogue items.
    Returns ranked matches, recommendation ('use_catalog' vs. 'create_demand'), and prefilled demand parameters.
    """
    if isinstance(payload, RequirementDraft):
        try:
            return await ProductMatchingService().match(payload)
        except CatalogueTimeout as exc:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="The product catalogue is taking longer than expected. Please try again shortly.",
            ) from exc
        except CatalogueInvalidResponse as exc:
            logger.warning("Product matching received invalid Buyora catalogue data.")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="The product catalogue returned an invalid response. Please try again later.",
            ) from exc
        except CatalogueUnavailable as exc:
            failure_type = type(exc.__cause__).__name__ if exc.__cause__ else type(exc).__name__
            logger.warning(
                "Product matching could not load the Buyora catalogue (%s).",
                failure_type,
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The product catalogue is temporarily unavailable. Please try again shortly.",
            ) from exc

    try:
        return ProductService.match_demand_parameters(payload)
    except Exception as exc:
        logger.error(f"Error executing specification match: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Specification matching failed: {str(exc)}",
        )


@router.get("/recommendations", response_model=List[ProductResponse], summary="Personalized product recommendations")
async def get_personalized_recommendations(
    user_id: Optional[str] = Query(default=None, description="Optional customer user ID for personalization"),
    limit: int = Query(default=8, ge=1, le=50, description="Max recommendations to return"),
):
    """
    Retrieve personalized catalog recommendations tailored to customer's past demands,
    orders, and viewed categories. Falls back to top-rated catalogue items if new customer.
    """
    try:
        return ProductService.get_personalized_recommendations(user_id=user_id, limit=limit)
    except Exception as exc:
        logger.error(f"Error fetching recommendations: {exc}", exc_info=True)
        return []


@router.get("/popular", response_model=List[ProductResponse], summary="List popular marketplace products")
async def get_popular_products(
    limit: int = Query(default=8, ge=1, le=50, description="Max popular products to return"),
):
    """
    Retrieve verified popular products sorted by reviews count and ratings.
    """
    try:
        return ProductService.get_popular_products(limit=limit)
    except Exception as exc:
        logger.error(f"Error fetching popular products: {exc}", exc_info=True)
        return []


@router.get("/recent", response_model=List[ProductResponse], summary="List recently added products")
async def get_recently_added_products(
    limit: int = Query(default=8, ge=1, le=50, description="Max recently added products to return"),
):
    """
    Retrieve newly listed catalog products sorted by creation timestamp.
    """
    try:
        return ProductService.get_recently_added_products(limit=limit)
    except Exception as exc:
        logger.error(f"Error fetching recently added products: {exc}", exc_info=True)
        return []


@router.get("/{product_id}/similar", summary="Get similar, alternative, and related products")
async def get_similar_and_alternative_products(
    product_id: str,
    limit: int = Query(default=6, ge=1, le=20, description="Max items per tier"),
):
    """
    Retrieve similar, alternative, and related products for a specific catalog item.
    """
    try:
        return ProductService.get_similar_and_alternatives(product_id=product_id, limit=limit)
    except Exception as exc:
        logger.error(f"Error fetching similar products for '{product_id}': {exc}", exc_info=True)
        return {"similar": [], "alternatives": [], "related": []}


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
