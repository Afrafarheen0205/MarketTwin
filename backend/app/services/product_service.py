import logging
import math
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.core.supabase import get_supabase_client
from app.schemas.product import ProductCreate, ProductListResponse, ProductResponse, ProductUpdate, generate_slug

logger = logging.getLogger("markettwin.products")

_has_extended_schema: Optional[bool] = None


def check_extended_schema() -> bool:
    """Check if Phase 5 extended columns exist in the remote database schema cache."""
    global _has_extended_schema
    if _has_extended_schema is not None:
        return _has_extended_schema


def safe_execute(query_fn, max_retries: int = 2):
    """Execute a Supabase query builder function with auto-retry on transient remote connection drops."""
    from app.core.supabase import reset_supabase_client
    last_exc = None
    for attempt in range(max_retries):
        try:
            return query_fn()
        except Exception as exc:
            last_exc = exc
            err_str = str(exc)
            if ("10054" in err_str or "closed by the remote host" in err_str or "readerror" in err_str.lower()) and attempt < max_retries - 1:
                logger.warning(f"Retrying query after transient connection drop: {exc}")
                reset_supabase_client()
                continue
            raise
    if last_exc:
        raise last_exc
    client = get_supabase_client()
    if not client:
        return False
    try:
        client.table("products").select("available_quantity").limit(1).execute()
        _has_extended_schema = True
    except Exception:
        _has_extended_schema = False
    return _has_extended_schema


def safe_execute(query_fn, max_retries: int = 2):
    """Execute a Supabase query builder function with auto-retry on transient remote connection drops."""
    from app.core.supabase import reset_supabase_client
    last_exc = None
    for attempt in range(max_retries):
        try:
            return query_fn()
        except Exception as exc:
            last_exc = exc
            err_str = str(exc)
            if ("10054" in err_str or "closed by the remote host" in err_str or "readerror" in err_str.lower()) and attempt < max_retries - 1:
                logger.warning(f"Retrying query after transient connection drop: {exc}")
                reset_supabase_client()
                continue
            raise
    if last_exc:
        raise last_exc


def _normalize_product(row: Dict[str, Any]) -> ProductResponse:
    """Normalize a raw Supabase row into a consistent ProductResponse."""
    row_id = str(row.get("id") or "")
    name = row.get("name") or "Untitled Product"
    specs = row.get("specifications") or row.get("specs") or {}
    if not isinstance(specs, dict):
        specs = {}

    brand = row.get("brand") or specs.get("Brand") or specs.get("brand") or ""
    model = row.get("model_number") or row.get("sku") or specs.get("Model") or specs.get("model") or ""
    unit = row.get("unit") or specs.get("Unit") or "piece"

    # Prices
    retail = row.get("retail_price")
    if retail is None:
        retail = row.get("market_price") or 0.0
    retail = float(retail)

    wholesale = row.get("wholesale_price")
    if wholesale is None:
        wholesale = row.get("min_demand_price") or round(retail * 0.75, 2)
    wholesale = float(wholesale)

    # MOQ & Inventory
    moq = row.get("minimum_order_quantity")
    if moq is None:
        try:
            moq = int(specs.get("MOQ", 1))
        except (ValueError, TypeError):
            moq = 1

    avail_qty = row.get("available_quantity")
    if avail_qty is None and "AvailableQty" in specs:
        try:
            avail_qty = int(specs["AvailableQty"])
        except (ValueError, TypeError):
            avail_qty = None
    if avail_qty is None:
        in_stock_val = row.get("in_stock", True)
        avail_qty = 100 if in_stock_val else 0

    # Images
    images: List[str] = []
    raw_images = row.get("images")
    if isinstance(raw_images, list):
        images = [str(img) for img in raw_images if img]
    elif isinstance(raw_images, str) and raw_images.startswith("["):
        import json
        try:
            images = json.loads(raw_images)
        except Exception:
            images = [raw_images]
    image_url = row.get("image_url")
    if image_url and image_url not in images:
        images.insert(0, image_url)
    if not images and image_url:
        images = [image_url]

    # Status
    status = row.get("status")
    if not status:
        status = "active" if row.get("in_stock", True) else "inactive"

    # Slug
    slug = row.get("slug")
    if not slug:
        slug = generate_slug(name, row_id[:6] if row_id else "item")

    return ProductResponse(
        id=row_id,
        name=name,
        slug=slug,
        description=row.get("description") or "",
        category=row.get("category") or "General",
        brand=brand,
        model_number=model,
        specifications=specs,
        unit=unit,
        retail_price=retail,
        wholesale_price=wholesale,
        minimum_order_quantity=int(moq),
        available_quantity=int(avail_qty),
        images=images,
        status=status,
        created_by=str(row.get("created_by")) if row.get("created_by") else None,
        created_at=str(row.get("created_at") or datetime.now(timezone.utc).isoformat()),
        updated_at=str(row.get("updated_at") or datetime.now(timezone.utc).isoformat()),
        # Legacy compatibility aliases
        market_price=retail,
        min_demand_price=wholesale,
        in_stock=(status == "active" and avail_qty > 0),
        image_url=images[0] if images else None,
        sku=model or row.get("sku") or f"SKU-{row_id[:8]}",
        rating=float(row.get("rating") or 5.0),
        reviews_count=int(row.get("reviews_count") or 0),
    )


class ProductService:
    @staticmethod
    def list_products(
        page: int = 1,
        page_size: int = 12,
        search: Optional[str] = None,
        category: Optional[str] = None,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        sort_by: Optional[str] = "newest",
        only_active: bool = True,
    ) -> ProductListResponse:
        client = get_supabase_client()
        if not client:
            return ProductListResponse(items=[], total=0, page=page, page_size=page_size, total_pages=0)

        # Execute query to retrieve records safely with retry
        res = safe_execute(lambda: get_supabase_client().table("products").select("*").execute())
        raw_items: List[Dict[str, Any]] = res.data or []

        # Client-side filtering for search, category, and price range to ensure robust matching across schema variants
        normalized_items = [_normalize_product(row) for row in raw_items]

        if only_active:
            normalized_items = [p for p in normalized_items if p.status == "active"]

        if category and category.lower() != "all":
            c_low = category.lower().strip()
            normalized_items = [p for p in normalized_items if c_low in p.category.lower()]

        if search and search.strip():
            s = search.strip().lower()
            normalized_items = [
                p for p in normalized_items
                if s in p.name.lower()
                or s in p.category.lower()
                or s in (p.brand or "").lower()
                or s in (p.model_number or "").lower()
                or s in (p.description or "").lower()
            ]

        if min_price is not None:
            normalized_items = [p for p in normalized_items if p.retail_price >= min_price]

        if max_price is not None:
            normalized_items = [p for p in normalized_items if p.retail_price <= max_price]

        # Sorting
        if sort_by == "price_asc":
            normalized_items.sort(key=lambda x: x.retail_price)
        elif sort_by == "price_desc":
            normalized_items.sort(key=lambda x: x.retail_price, reverse=True)
        elif sort_by == "popular":
            normalized_items.sort(key=lambda x: (x.reviews_count or 0, x.rating or 0), reverse=True)
        else:  # newest
            normalized_items.sort(key=lambda x: x.created_at or "", reverse=True)

        total = len(normalized_items)
        total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 0

        # Pagination slice
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_items = normalized_items[start_idx:end_idx]

        return ProductListResponse(
            items=paginated_items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    @staticmethod
    def get_product_by_id_or_slug(identifier: str, only_active: bool = False) -> Optional[ProductResponse]:
        client = get_supabase_client()
        if not client:
            return None

        # Check by UUID if valid UUID format, else by slug
        row = None
        is_uuid = False
        try:
            uuid.UUID(identifier)
            is_uuid = True
        except ValueError:
            is_uuid = False

        if is_uuid:
            try:
                res = safe_execute(lambda: get_supabase_client().table("products").select("*").eq("id", identifier).execute())
                if res.data:
                    row = res.data[0]
            except Exception:
                pass

        if not row:
            # Try by sku directly
            try:
                res = safe_execute(lambda: get_supabase_client().table("products").select("*").eq("sku", identifier).execute())
                if res.data:
                    row = res.data[0]
            except Exception:
                pass

        if not row:
            # Fallback: scan records to match normalized slug or model/sku
            try:
                all_res = safe_execute(lambda: get_supabase_client().table("products").select("*").execute())
                for r in (all_res.data or []):
                    norm = _normalize_product(r)
                    if norm.slug == identifier or norm.sku == identifier:
                        row = r
                        break
            except Exception:
                pass

        if not row:
            return None

        product = _normalize_product(row)
        if only_active and product.status != "active":
            return None
        return product

    @staticmethod
    def list_categories() -> List[str]:
        client = get_supabase_client()
        if not client:
            return ["Industrial Hardware", "Instrumentation", "Energy & Power", "Automation & Robotics", "Networking & Telecom", "Medical & Lab Equipment"]

        res = safe_execute(lambda: get_supabase_client().table("products").select("category").execute())
        categories = sorted(list({row["category"] for row in (res.data or []) if row.get("category")}))
        if not categories:
            return ["Industrial Hardware", "Instrumentation", "Energy & Power", "Automation & Robotics", "Networking & Telecom", "Medical & Lab Equipment"]
        return categories

    @staticmethod
    def create_product(product_in: ProductCreate, created_by: Optional[str] = None) -> ProductResponse:
        client = get_supabase_client()
        if not client:
            raise RuntimeError("Database connection unavailable.")

        new_id = str(uuid.uuid4())
        slug = product_in.slug or generate_slug(product_in.name, new_id[:6])
        sku = product_in.model_number or f"SKU-{new_id[:8]}"

        now_iso = datetime.now(timezone.utc).isoformat()
        has_extended = check_extended_schema()

        # Build specs with embedded metadata
        specs = dict(product_in.specifications or {})
        if product_in.brand:
            specs["Brand"] = product_in.brand
        if product_in.model_number:
            specs["Model"] = product_in.model_number
        if product_in.unit:
            specs["Unit"] = product_in.unit
        if product_in.minimum_order_quantity:
            specs["MOQ"] = str(product_in.minimum_order_quantity)
        if product_in.available_quantity is not None:
            specs["AvailableQty"] = str(product_in.available_quantity)

        # Base payload compatible with current table
        db_payload: Dict[str, Any] = {
            "id": new_id,
            "name": product_in.name,
            "category": product_in.category,
            "sku": sku,
            "description": product_in.description or "",
            "market_price": product_in.retail_price,
            "min_demand_price": product_in.wholesale_price,
            "in_stock": (product_in.status == "active" and (product_in.available_quantity or 0) > 0),
            "image_url": product_in.images[0] if product_in.images else None,
            "specs": specs,
            "created_at": now_iso,
            "updated_at": now_iso,
        }

        if has_extended:
            db_payload.update({
                "slug": slug,
                "brand": product_in.brand or "",
                "model_number": product_in.model_number or sku,
                "specifications": specs,
                "unit": product_in.unit or "piece",
                "retail_price": product_in.retail_price,
                "wholesale_price": product_in.wholesale_price,
                "minimum_order_quantity": product_in.minimum_order_quantity or 1,
                "available_quantity": product_in.available_quantity or 0,
                "images": product_in.images or [],
                "status": product_in.status or "active",
            })
            if created_by:
                db_payload["created_by"] = created_by

        res = safe_execute(lambda: get_supabase_client().table("products").insert(db_payload).execute())
        if not res.data:
            raise RuntimeError("Failed to create product in database.")

        return _normalize_product(res.data[0])

    @staticmethod
    def update_product(product_id: str, update_in: ProductUpdate) -> Optional[ProductResponse]:
        client = get_supabase_client()
        if not client:
            raise RuntimeError("Database connection unavailable.")

        update_data = update_in.model_dump(exclude_unset=True)
        if not update_data:
            return ProductService.get_product_by_id_or_slug(product_id)

        now_iso = datetime.now(timezone.utc).isoformat()
        has_extended = check_extended_schema()
        db_payload: Dict[str, Any] = {"updated_at": now_iso}

        # Map to core columns
        if "name" in update_data:
            db_payload["name"] = update_data["name"]
        if "category" in update_data:
            db_payload["category"] = update_data["category"]
        if "description" in update_data:
            db_payload["description"] = update_data["description"]
        if "retail_price" in update_data:
            db_payload["market_price"] = update_data["retail_price"]
        if "wholesale_price" in update_data:
            db_payload["min_demand_price"] = update_data["wholesale_price"]
        if "specifications" in update_data:
            db_payload["specs"] = update_data["specifications"]
        if "images" in update_data and update_data["images"]:
            db_payload["image_url"] = update_data["images"][0]
        if "status" in update_data:
            db_payload["in_stock"] = (update_data["status"] == "active")
        if "model_number" in update_data:
            db_payload["sku"] = update_data["model_number"]
        if "available_quantity" in update_data and not has_extended:
            try:
                curr = client.table("products").select("specs").eq("id", product_id).execute()
                curr_specs = (curr.data[0].get("specs") if curr.data else {}) or {}
                curr_specs["AvailableQty"] = str(update_data["available_quantity"])
                db_payload["specs"] = curr_specs
            except Exception:
                pass

        if has_extended:
            for k in [
                "slug", "brand", "model_number", "specifications", "unit",
                "retail_price", "wholesale_price", "minimum_order_quantity",
                "available_quantity", "images", "status"
            ]:
                if k in update_data:
                    db_payload[k] = update_data[k]

        res = safe_execute(lambda: get_supabase_client().table("products").update(db_payload).eq("id", product_id).execute())
        if not res.data:
            return None

        return _normalize_product(res.data[0])

    @staticmethod
    def delete_product(product_id: str, hard_delete: bool = False) -> bool:
        client = get_supabase_client()
        if not client:
            return False

        if hard_delete:
            res = client.table("products").delete().eq("id", product_id).execute()
            return bool(res.data)
        else:
            # Soft delete / deactivate
            update_data: Dict[str, Any] = {
                "in_stock": False,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            try:
                client.table("products").update({**update_data, "status": "inactive"}).eq("id", product_id).execute()
            except Exception:
                client.table("products").update(update_data).eq("id", product_id).execute()
            return True

    @staticmethod
    def upload_image(product_id: str, file_bytes: bytes, filename: str, content_type: str) -> str:
        client = get_supabase_client()
        if not client:
            raise RuntimeError("Supabase client unavailable for upload.")

        bucket_name = "product-images"
        file_ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
        storage_path = f"products/{product_id}/{uuid.uuid4().hex[:10]}.{file_ext}"

        # Upload to bucket
        client.storage.from_(bucket_name).upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": content_type, "upsert": "true"},
        )

        # Get public URL
        public_url = client.storage.from_(bucket_name).get_public_url(storage_path)

        # Append to product images
        product = ProductService.get_product_by_id_or_slug(product_id)
        if product:
            updated_images = list(product.images or [])
            if public_url not in updated_images:
                updated_images.append(public_url)
            ProductService.update_product(product_id, ProductUpdate(images=updated_images))

        return public_url
