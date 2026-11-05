import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status

from app.core.security import require_roles
from app.schemas.product import ProductCreate, ProductListResponse, ProductResponse, ProductUpdate
from app.services.product_service import ProductService

logger = logging.getLogger("markettwin.api.admin_products")
router = APIRouter()

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.get("", response_model=ProductListResponse, summary="Admin list all products (including inactive)")
async def admin_list_products(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: Optional[str] = None,
    category: Optional[str] = None,
    sort_by: Optional[str] = "newest",
    current_user: Dict[str, Any] = Depends(require_roles("admin")),
):
    """Admin-only endpoint to inspect full product inventory, including inactive and pending items."""
    return ProductService.list_products(
        page=page,
        page_size=page_size,
        search=search,
        category=category,
        sort_by=sort_by,
        only_active=False,
    )


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED, summary="Create a catalog product")
async def admin_create_product(
    payload: ProductCreate,
    current_user: Dict[str, Any] = Depends(require_roles("admin")),
):
    """
    Admin-only endpoint to register a new verified product in the marketplace catalog.
    Enforces server-side validation on prices, MOQ, and role authorization.
    """
    try:
        created_by = current_user.get("id")
        return ProductService.create_product(payload, created_by=created_by)
    except Exception as exc:
        logger.error(f"Error creating product: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Product creation failed: {str(exc)}",
        )


@router.get("/{product_id}", response_model=ProductResponse, summary="Admin retrieve product by ID or slug")
async def admin_get_product(
    product_id: str,
    current_user: Dict[str, Any] = Depends(require_roles("admin")),
):
    """Admin endpoint to fetch complete product records regardless of active/inactive status."""
    product = ProductService.get_product_by_id_or_slug(product_id, only_active=False)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product '{product_id}' not found.",
        )
    return product


@router.put("/{product_id}", response_model=ProductResponse, summary="Update product specifications and pricing")
async def admin_update_product(
    product_id: str,
    payload: ProductUpdate,
    current_user: Dict[str, Any] = Depends(require_roles("admin")),
):
    """
    Admin-only endpoint to update product details, pricing tiers, specifications,
    stock counts, or active/inactive status.
    """
    updated = ProductService.update_product(product_id, payload)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product '{product_id}' not found or could not be updated.",
        )
    return updated


@router.delete("/{product_id}", summary="Delete or deactivate a catalog product")
async def admin_delete_product(
    product_id: str,
    hard_delete: bool = Query(default=False, description="If true, permanently deletes record from database"),
    current_user: Dict[str, Any] = Depends(require_roles("admin")),
):
    """
    Admin-only endpoint to deactivate (soft-delete) or permanently delete a product.
    Defaults to soft deactivation to preserve historical order / demand integrity.
    """
    success = ProductService.delete_product(product_id, hard_delete=hard_delete)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product '{product_id}' could not be deleted.",
        )
    action_str = "permanently deleted" if hard_delete else "deactivated"
    return {"success": True, "message": f"Product successfully {action_str}."}


@router.post("/{product_id}/images", summary="Upload product image to Supabase Storage")
async def admin_upload_product_image(
    product_id: str,
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(require_roles("admin")),
):
    """
    Admin-only endpoint to securely upload product photography directly to
    the Supabase Storage 'product-images' bucket and link the URL to the product.
    """
    # 1. Verify existence of product
    product = ProductService.get_product_by_id_or_slug(product_id, only_active=False)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product '{product_id}' not found.",
        )

    # 2. Validate MIME type
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{file.content_type}'. Allowed types: JPEG, PNG, WebP, GIF, SVG.",
        )

    # 3. Read and validate file size
    try:
        content = await file.read()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to read uploaded file payload.",
        ) from exc

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds the 10 MB maximum allowed limit.",
        )

    # 4. Upload to Supabase Storage and append image URL
    try:
        public_url = ProductService.upload_image(
            product_id=product_id,
            file_bytes=content,
            filename=file.filename or "upload.jpg",
            content_type=file.content_type,
        )
        # Fetch refreshed product
        refreshed = ProductService.get_product_by_id_or_slug(product_id, only_active=False)
        return {
            "success": True,
            "url": public_url,
            "images": refreshed.images if refreshed else [public_url],
            "message": "Product image uploaded successfully.",
        }
    except Exception as exc:
        logger.error(f"Image upload failed for product {product_id}: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Image upload failed: {str(exc)}",
        )
