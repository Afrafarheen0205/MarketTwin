import logging
import math
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.core.supabase import get_supabase_client
from app.schemas.product import (
    ProductCreate,
    ProductListResponse,
    ProductMatchItem,
    ProductMatchRequest,
    ProductMatchResponse,
    ProductResponse,
    ProductSearchResponse,
    ProductUpdate,
    generate_slug,
)

logger = logging.getLogger("markettwin.products")

_has_extended_schema: Optional[bool] = None


def check_extended_schema() -> bool:
    """Check if Phase 5 extended columns exist in the remote database schema cache."""
    global _has_extended_schema
    if _has_extended_schema is not None:
        return _has_extended_schema
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


def _extract_structured_attributes(text: str, specs: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Extract normalized technical attributes from query text or product description/specs.
    Identifies: materials/grades, capacities, voltages, speeds, certifications, brands, and product types.
    """
    text_lower = (text or "").lower()
    attrs: Dict[str, Any] = {
        "material": None,
        "material_grade": None,
        "capacity": None,
        "capacity_raw": None,
        "product_type": None,
        "certifications": [],
        "brand": None,
        "voltage": None,
    }

    # 1. Material and Grade Recognition
    if "ss 316" in text_lower or "ss316" in text_lower or "316 stainless" in text_lower or "aisi 316" in text_lower:
        attrs["material"] = "Stainless Steel"
        attrs["material_grade"] = "SS 316"
    elif "ss 304" in text_lower or "ss304" in text_lower or "304 stainless" in text_lower or "aisi 304" in text_lower:
        attrs["material"] = "Stainless Steel"
        attrs["material_grade"] = "SS 304"
    elif "stainless steel" in text_lower:
        attrs["material"] = "Stainless Steel"
    elif "hdpe" in text_lower or "polyethylene" in text_lower:
        attrs["material"] = "Polyethylene (HDPE)"
    elif "aluminum" in text_lower or "aluminium" in text_lower:
        attrs["material"] = "Aluminum"
    elif "carbon steel" in text_lower:
        attrs["material"] = "Carbon Steel"
    elif "lifepo4" in text_lower or "lithium iron phosphate" in text_lower:
        attrs["material"] = "LiFePO4"

    # 2. Capacity & Volume Recognition
    cap_match = re.search(r"(\d+)\s*(litres|liters|litre|liter|l\b)", text_lower)
    if cap_match:
        attrs["capacity"] = int(cap_match.group(1))
        attrs["capacity_raw"] = f"{cap_match.group(1)}L"
    else:
        ah_match = re.search(r"(\d+)\s*(ah\b|amp\s*hours?)", text_lower)
        if ah_match:
            attrs["capacity"] = int(ah_match.group(1))
            attrs["capacity_raw"] = f"{ah_match.group(1)}Ah"

    # 3. Voltage Recognition
    volt_match = re.search(r"(\d+)\s*(v\b|volts?)", text_lower)
    if volt_match:
        attrs["voltage"] = f"{volt_match.group(1)}V"

    # 4. Product Core Type
    if "tank" in text_lower or "vessel" in text_lower or "reservoir" in text_lower:
        attrs["product_type"] = "Water Storage Tank"
    elif "gateway" in text_lower or "edge" in text_lower:
        attrs["product_type"] = "IoT Gateway"
    elif "flow meter" in text_lower or "flowmeter" in text_lower:
        attrs["product_type"] = "Ultrasonic Flow Meter"
    elif "energy storage" in text_lower or "battery" in text_lower:
        attrs["product_type"] = "Energy Storage Module"
    elif "stepper" in text_lower or "servo" in text_lower or "motor" in text_lower:
        attrs["product_type"] = "Stepper Motor Kit"
    elif "switch" in text_lower or "sfp" in text_lower:
        attrs["product_type"] = "Managed Fiber Switch"
    elif "pump" in text_lower or "peristaltic" in text_lower:
        attrs["product_type"] = "Precision Peristaltic Pump"

    # 5. Certifications
    for cert in ["iso 9001", "nsf/ansi 61", "nsf 61", "ce", "ip67", "ip68", "dnv", "fda", "asme", "ul"]:
        if cert in text_lower:
            attrs["certifications"].append(cert.upper())

    # Merge product specifications object if provided
    if specs and isinstance(specs, dict):
        s_mat = specs.get("Material") or specs.get("material")
        if s_mat and not attrs["material"]:
            attrs["material"] = str(s_mat)
        s_grade = specs.get("Material Grade") or specs.get("material_grade")
        if s_grade and not attrs["material_grade"]:
            if "316" in str(s_grade):
                attrs["material_grade"] = "SS 316"
            elif "304" in str(s_grade):
                attrs["material_grade"] = "SS 304"
        s_cap = specs.get("Capacity") or specs.get("capacity")
        if s_cap and not attrs["capacity"]:
            c_m = re.search(r"(\d+)", str(s_cap))
            if c_m:
                attrs["capacity"] = int(c_m.group(1))
                attrs["capacity_raw"] = str(s_cap)

    return attrs


def _evaluate_product_match(
    product: ProductResponse,
    query_str: str,
    query_attrs: Dict[str, Any],
    query_tokens: List[str],
) -> Tuple[str, float, List[str], List[str], List[str], str]:
    """
    Evaluates a product against search query using structured attribute comparisons and hard constraint overrides.
    Returns:
      (match_tier, relevance_score, match_reasons, matching_attributes, different_attributes, compatibility_explanation)
      where match_tier is 'exact' | 'similar' | 'alternative' | 'related'
    """
    name_low = product.name.lower()
    brand_low = (product.brand or "").lower()
    model_low = (product.model_number or product.sku or "").lower()
    cat_low = product.category.lower()
    desc_low = (product.description or "").lower()
    specs = product.specifications or {}

    prod_text = f"{product.name} {product.brand} {product.model_number} {product.description} " + " ".join(f"{k}:{v}" for k, v in specs.items())
    prod_attrs = _extract_structured_attributes(prod_text, specs)

    matching_attrs: List[str] = []
    different_attrs: List[str] = []
    reasons: List[str] = []

    # Check for hard constraint violations
    material_mismatch = False
    capacity_mismatch = False

    # 1. Compare Material
    if query_attrs["material_grade"]:
        req_grade = query_attrs["material_grade"]
        prod_grade = prod_attrs.get("material_grade")
        if prod_grade:
            if req_grade == prod_grade:
                matching_attrs.append(f"Material Grade: {prod_grade}")
            else:
                material_mismatch = True
                different_attrs.append(f"Material Grade: {prod_grade} (Requested: {req_grade})")
        elif prod_attrs.get("material"):
            material_mismatch = True
            different_attrs.append(f"Material: {prod_attrs['material']} (Requested: {req_grade})")
    elif query_attrs["material"]:
        req_mat = query_attrs["material"].lower()
        prod_mat = (prod_attrs.get("material") or "").lower()
        if req_mat in prod_mat or prod_mat in req_mat:
            matching_attrs.append(f"Material: {prod_attrs['material']}")
        elif prod_mat:
            material_mismatch = True
            different_attrs.append(f"Material: {prod_attrs['material']} (Requested: {query_attrs['material']})")

    # 2. Compare Capacity
    if query_attrs["capacity"]:
        req_cap = query_attrs["capacity"]
        prod_cap = prod_attrs.get("capacity")
        if prod_cap:
            if req_cap == prod_cap:
                matching_attrs.append(f"Capacity: {prod_attrs.get('capacity_raw') or req_cap}")
            else:
                capacity_mismatch = True
                different_attrs.append(f"Capacity: {prod_attrs.get('capacity_raw') or prod_cap} (Requested: {query_attrs.get('capacity_raw') or req_cap})")

    # 3. Compare Product Core Type
    if query_attrs["product_type"]:
        req_type = query_attrs["product_type"]
        prod_type = prod_attrs.get("product_type")
        if req_type == prod_type:
            matching_attrs.append(f"Product Type: {req_type}")
        else:
            different_attrs.append(f"Type: {prod_type or 'General Equipment'}")

    # 4. Token & Keyword Overlaps
    title_matches = [t for t in query_tokens if t in name_low]
    if title_matches:
        reasons.append(f"Matched title keywords: {', '.join(title_matches[:3])}")

    spec_matches = []
    for sk, sv in specs.items():
        sk_low = str(sk).lower()
        sv_low = str(sv).lower()
        for t in query_tokens:
            if (len(t) >= 3 and t in sv_low) or (len(t) >= 4 and t in sk_low):
                spec_matches.append(f"{sk}: {sv}")
                break
    if spec_matches:
        reasons.append(f"Technical specs: {', '.join(spec_matches[:2])}")

    # Model or SKU exact match
    clean_model = model_low.replace("-", "").replace(" ", "")
    clean_q = query_str.lower().replace("-", "").replace(" ", "")
    is_model_hit = model_low and (clean_q == clean_model or model_low in query_str.lower())
    if is_model_hit:
        matching_attrs.append(f"Model/SKU: {product.model_number or product.sku}")
        reasons.append(f"Exact SKU match: {product.model_number or product.sku}")

    # Calculate token overlap score
    token_ratio = len(title_matches) / max(1, len(query_tokens)) if query_tokens else 0.0
    spec_ratio = min(1.0, len(spec_matches) / max(1, len(query_tokens))) if query_tokens else 0.0

    # Strict Tier Assignment
    # -----------------------
    # Case A: Exact Match
    # Condition: NO material mismatch, NO capacity mismatch, matching core product type or high token overlap, and title or model match
    if not material_mismatch and not capacity_mismatch:
        if is_model_hit or query_str.lower() == name_low or (query_str.lower() in name_low and len(query_str) >= 6):
            return (
                "exact",
                1.0,
                reasons or ["Exact catalogue inventory match"],
                matching_attrs or ["Full specification match"],
                different_attrs,
                "Direct specification match for all requested attributes."
            )
        if token_ratio >= 0.70 or (token_ratio >= 0.50 and matching_attrs):
            return (
                "exact",
                round(0.88 + 0.10 * token_ratio, 2),
                reasons or ["Direct specification match"],
                matching_attrs,
                different_attrs,
                "Direct match on key parameters and technical specifications."
            )
        if query_attrs["product_type"] and prod_attrs.get("product_type") == query_attrs["product_type"]:
            return (
                "similar",
                round(0.80 + 0.10 * token_ratio, 2),
                reasons or ["Equivalent specification variant"],
                matching_attrs,
                different_attrs,
                "Equivalent functional specifications from verified manufacturer."
            )

    # Case B: Highly Similar Match
    # Condition: Same core type and compatible, but different brand/model or minor difference
    same_type = bool(query_attrs.get("product_type") and prod_attrs.get("product_type") == query_attrs.get("product_type"))
    if not material_mismatch and not capacity_mismatch and (token_ratio >= 0.40 or spec_ratio >= 0.30 or same_type):
        return (
            "similar",
            round(0.75 + 0.15 * token_ratio, 2),
            reasons or ["Functionally equivalent specification"],
            matching_attrs,
            different_attrs,
            "Functionally equivalent specifications with alternative certified manufacturer/model."
        )

    # Case C: Alternative Product
    # Condition: Material difference (e.g. SS 316 vs SS 304, or HDPE vs SS 304) or capacity difference (2000L vs 1000L) within same product line
    if (material_mismatch or capacity_mismatch) and (same_type or token_ratio >= 0.30):
        explanation_parts = []
        if material_mismatch:
            if "316" in str(prod_attrs.get("material_grade")):
                explanation_parts.append("Premium marine-grade SS 316 upgrade with superior chloride and chemical resistance")
            elif "hdpe" in str(prod_attrs.get("material")).lower():
                explanation_parts.append("Non-metallic HDPE corrosion-free alternative with lower weight profile")
            else:
                explanation_parts.append(f"Alternative material specification ({prod_attrs.get('material_grade') or prod_attrs.get('material')})")
        if capacity_mismatch:
            explanation_parts.append(f"Alternative capacity variant ({prod_attrs.get('capacity_raw') or 'different volume'})")

        explanation = ". ".join(explanation_parts) + "."
        return (
            "alternative",
            round(0.65 + 0.15 * token_ratio, 2),
            reasons or ["Viable functional alternative with spec variance"],
            matching_attrs,
            different_attrs,
            explanation
        )

    # Case D: Related Product
    # Condition: Same category or domain keywords, but different product type
    if cat_low in query_str.lower() or any(t in cat_low for t in query_tokens) or token_ratio > 0.15 or spec_ratio > 0.15:
        return (
            "related",
            round(0.40 + 0.20 * token_ratio, 2),
            reasons or ["Related industrial equipment in same domain"],
            matching_attrs,
            different_attrs,
            f"Related equipment in the {product.category} category for complementary system integration."
        )

    return (
        "none",
        0.0,
        [],
        matching_attrs,
        different_attrs,
        ""
    )


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
    if (avail_qty is None or avail_qty == 0) and "AvailableQty" in specs:
        try:
            avail_qty = int(specs["AvailableQty"])
        except (ValueError, TypeError):
            pass
    if avail_qty is None or (avail_qty == 0 and row.get("in_stock") is True):
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
    def search_and_match_products(
        query: Optional[str] = None,
        category: Optional[str] = None,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        sort: str = "relevance",
        page: int = 1,
        page_size: int = 12,
        only_active: bool = True,
    ) -> ProductSearchResponse:
        """
        Phase 6 Core Engine: Searches, evaluates, and ranks products into:
          A. Exact Matches
          B. Highly Similar Products
          C. Alternative Products
          D. Related Products
        Uses structured attribute comparisons (material, grade, capacity, certifications, specs)
        and hard constraint overrides so incompatible specs are never presented as exact matches.
        """
        client = get_supabase_client()
        if not client:
            return ProductSearchResponse(
                items=[],
                exact_matches=[],
                similar_matches=[],
                alternative_matches=[],
                related_matches=[],
                total=0,
                exact_count=0,
                similar_count=0,
                alternative_count=0,
                related_count=0,
                page=page,
                page_size=page_size,
                total_pages=0,
                query=query or "",
                has_exact_match=False,
                suggestion_message="Catalogue database service currently offline.",
            )

        # Retrieve catalog records safely
        res = safe_execute(lambda: get_supabase_client().table("products").select("*").execute())
        raw_items: List[Dict[str, Any]] = res.data or []
        normalized_products = [_normalize_product(row) for row in raw_items]

        # Enforce active products only for customer public search
        if only_active:
            normalized_products = [p for p in normalized_products if p.status == "active"]

        # Category filter if specified
        if category and category.lower() != "all":
            c_low = category.lower().strip()
            normalized_products = [p for p in normalized_products if c_low in p.category.lower()]

        # Price range filter if specified
        if min_price is not None:
            normalized_products = [p for p in normalized_products if p.retail_price >= min_price]
        if max_price is not None:
            normalized_products = [p for p in normalized_products if p.retail_price <= max_price]

        cleaned_q = (query or "").strip()
        q_lower = cleaned_q.lower()
        tokens = [t for t in re.split(r"[,\s\-_/]+", q_lower) if len(t) >= 2]

        scored_items: List[ProductMatchItem] = []

        if not cleaned_q:
            # When no query is provided, return all filtered products
            for p in normalized_products:
                scored_items.append(
                    ProductMatchItem(
                        **p.model_dump(),
                        match_type="exact",
                        match_tier="exact",
                        relevance_score=1.0,
                        match_reasons=["Catalog standard inventory"],
                        matching_attributes=["Available catalogue item"],
                        different_attributes=[],
                        compatibility_explanation="Standard commercial inventory item.",
                    )
                )
        else:
            query_attrs = _extract_structured_attributes(cleaned_q)
            for p in normalized_products:
                tier, score, reasons, matching_attrs, different_attrs, explanation = _evaluate_product_match(
                    p, cleaned_q, query_attrs, tokens
                )
                if tier != "none" and score >= 0.20:
                    scored_items.append(
                        ProductMatchItem(
                            **p.model_dump(),
                            match_type=tier,
                            match_tier=tier,
                            relevance_score=score,
                            match_reasons=reasons or ["Catalogue product discovery"],
                            matching_attributes=matching_attrs,
                            different_attributes=different_attrs,
                            compatibility_explanation=explanation,
                        )
                    )

        # Separate into 4 distinct matching tiers
        exact_matches = [it for it in scored_items if it.match_tier == "exact"]
        similar_matches = [it for it in scored_items if it.match_tier == "similar"]
        alternative_matches = [it for it in scored_items if it.match_tier == "alternative"]
        related_matches = [it for it in scored_items if it.match_tier == "related"]

        # Sort all items
        tier_weight = {"exact": 4, "similar": 3, "alternative": 2, "related": 1}
        if sort == "price_asc":
            scored_items.sort(key=lambda x: x.retail_price)
        elif sort == "price_desc":
            scored_items.sort(key=lambda x: x.retail_price, reverse=True)
        elif sort == "newest":
            scored_items.sort(key=lambda x: x.created_at or "", reverse=True)
        else:  # relevance
            scored_items.sort(key=lambda x: (tier_weight.get(x.match_tier, 0), x.relevance_score), reverse=True)

        total = len(scored_items)
        total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 0
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_items = scored_items[start_idx:end_idx]

        has_exact = len(exact_matches) > 0
        if not has_exact and (len(similar_matches) > 0 or len(alternative_matches) > 0):
            suggestion_msg = (
                "We couldn't find an exact match for your product, but found similar and alternative products in our catalogue. "
                "You can inspect specifications below or initiate a custom demand."
            )
        elif total == 0 or (not has_exact and len(similar_matches) == 0 and len(alternative_matches) == 0):
            suggestion_msg = (
                "We couldn't find a product that fully matches your requirements. "
                "You can create a custom demand and connect with verified merchants."
            )
        else:
            suggestion_msg = None

        return ProductSearchResponse(
            items=paginated_items,
            exact_matches=exact_matches,
            similar_matches=similar_matches,
            alternative_matches=alternative_matches,
            related_matches=related_matches,
            total=total,
            exact_count=len(exact_matches),
            similar_count=len(similar_matches),
            alternative_count=len(alternative_matches),
            related_count=len(related_matches),
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            query=cleaned_q,
            has_exact_match=has_exact,
            suggestion_message=suggestion_msg,
        )

    @staticmethod
    def match_demand_parameters(request: ProductMatchRequest) -> ProductMatchResponse:
        """
        Evaluate customer demand parameters against catalog to determine if standard items exist or custom demand is required.
        """
        search_res = ProductService.search_and_match_products(
            query=request.query,
            category=request.category,
            max_price=request.target_price,
            only_active=True,
        )

        has_exact = search_res.has_exact_match and len(search_res.exact_matches) > 0
        if has_exact:
            recommendation = "use_catalog"
        elif len(search_res.similar_matches) > 0 or len(search_res.alternative_matches) > 0:
            recommendation = "view_alternatives"
        else:
            recommendation = "create_demand"

        first_item = search_res.items[0] if search_res.items else None
        target_cat = request.category or (first_item.category if first_item else "Industrial Hardware")
        target_price = request.target_price or (first_item.wholesale_price if first_item else 100.0)

        create_params = {
            "product": request.query or (first_item.name if first_item else ""),
            "category": target_cat,
            "targetPrice": target_price,
            "targetQuantity": request.target_quantity or (first_item.minimum_order_quantity if first_item else 5),
            "description": f"Custom specification for {request.query or 'requested item'}",
        }
        if request.specifications:
            create_params["specifications"] = request.specifications

        return ProductMatchResponse(
            matches=search_res.items,
            exact_matches=search_res.exact_matches,
            similar_matches=search_res.similar_matches,
            alternative_matches=search_res.alternative_matches,
            related_matches=search_res.related_matches,
            has_exact_match=has_exact,
            exact_match_count=search_res.exact_count,
            similar_match_count=search_res.similar_count,
            alternative_match_count=search_res.alternative_count,
            related_match_count=search_res.related_count,
            recommendation=recommendation,
            create_demand_params=create_params,
        )

    @staticmethod
    def get_personalized_recommendations(user_id: Optional[str] = None, limit: int = 8) -> List[ProductResponse]:
        """
        Produce personalized catalog recommendations using customer's past demands,
        orders, or active catalogue popularity if insufficient customer interaction history.
        """
        client = get_supabase_client()
        if not client:
            return []

        user_categories: List[str] = []
        if user_id:
            try:
                # Check user's created demands
                demands_res = safe_execute(lambda: get_supabase_client().table("demands").select("category").eq("customer_id", user_id).limit(10).execute())
                for d in (demands_res.data or []):
                    c = d.get("category")
                    if c and c not in user_categories:
                        user_categories.append(c)
            except Exception as e:
                logger.debug(f"Demands query for personalization skipped: {e}")

            try:
                # Check user's orders
                orders_res = safe_execute(lambda: get_supabase_client().table("orders").select("product_title").eq("customer_id", user_id).limit(10).execute())
                for o in (orders_res.data or []):
                    p_name = o.get("product_title")
                    # Try to extract category from title or match
                    pass
            except Exception as e:
                logger.debug(f"Orders query for personalization skipped: {e}")

        # Fetch active products
        res = safe_execute(lambda: get_supabase_client().table("products").select("*").execute())
        products = [_normalize_product(row) for row in (res.data or []) if row.get("in_stock", True)]

        if user_categories:
            matching = [p for p in products if p.category in user_categories]
            others = [p for p in products if p.category not in user_categories]
            # Prioritize matching categories then highest rated
            matching.sort(key=lambda x: (x.rating or 0, x.reviews_count or 0), reverse=True)
            others.sort(key=lambda x: (x.rating or 0, x.reviews_count or 0), reverse=True)
            combined = matching + others
            return combined[:limit]

        # Fallback for new customers with insufficient history: return catalogue highlights
        products.sort(key=lambda x: (x.rating or 0, x.reviews_count or 0), reverse=True)
        return products[:limit]

    @staticmethod
    def get_popular_products(limit: int = 8) -> List[ProductResponse]:
        """
        Return verified popular products ranked by actual reviews count, rating, and stock.
        """
        client = get_supabase_client()
        if not client:
            return []
        res = safe_execute(lambda: get_supabase_client().table("products").select("*").execute())
        products = [_normalize_product(row) for row in (res.data or []) if row.get("in_stock", True)]
        products.sort(key=lambda x: (x.reviews_count or 0, x.rating or 0), reverse=True)
        return products[:limit]

    @staticmethod
    def get_recently_added_products(limit: int = 8) -> List[ProductResponse]:
        """
        Return newly listed products sorted chronologically by database creation timestamp.
        """
        client = get_supabase_client()
        if not client:
            return []
        res = safe_execute(lambda: get_supabase_client().table("products").select("*").execute())
        products = [_normalize_product(row) for row in (res.data or []) if row.get("in_stock", True)]
        products.sort(key=lambda x: x.created_at or "", reverse=True)
        return products[:limit]

    @staticmethod
    def get_similar_and_alternatives(product_id: str, limit: int = 6) -> Dict[str, List[ProductMatchItem]]:
        """
        Given a product ID, find similar and alternative products from the catalogue.
        """
        product = ProductService.get_product_by_id_or_slug(product_id)
        if not product:
            return {"similar": [], "alternatives": [], "related": []}

        # Search using product's name and specs
        search_res = ProductService.search_and_match_products(
            query=f"{product.category} {product.name}",
            only_active=True,
            page_size=30,
        )

        # Filter out current product itself
        sim = [it for it in search_res.similar_matches if it.id != product.id]
        alt = [it for it in search_res.alternative_matches if it.id != product.id]
        rel = [it for it in search_res.related_matches if it.id != product.id]

        # If not enough similar, borrow from exact matches of different brands/models
        other_exacts = [it for it in search_res.exact_matches if it.id != product.id]
        for it in other_exacts:
            if it not in sim:
                sim.append(it)

        # Fallback to same category if sparse
        if len(sim) + len(alt) < 2:
            cat_res = ProductService.list_products(category=product.category, page_size=limit + 1)
            for it in cat_res.items:
                if it.id != product.id and not any(x.id == it.id for x in sim + alt + rel):
                    rel.append(
                        ProductMatchItem(
                            **it.model_dump(),
                            match_type="related",
                            match_tier="related",
                            relevance_score=0.7,
                            match_reasons=[f"Same category: {product.category}"],
                            matching_attributes=[f"Category: {product.category}"],
                            different_attributes=[],
                            compatibility_explanation=f"Related equipment within the {product.category} category.",
                        )
                    )

        return {
            "similar": sim[:limit],
            "alternatives": alt[:limit],
            "related": rel[:limit],
        }

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
                try:
                    uuid.UUID(str(created_by))
                    prof = safe_execute(lambda: get_supabase_client().table("profiles").select("id").eq("id", str(created_by)).limit(1).execute())
                    if prof.data:
                        db_payload["created_by"] = str(created_by)
                except Exception:
                    pass

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
            res = safe_execute(lambda: get_supabase_client().table("products").delete().eq("id", product_id).execute())
            return bool(res.data)
        else:
            # Soft delete / deactivate
            update_data: Dict[str, Any] = {
                "in_stock": False,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            try:
                safe_execute(lambda: get_supabase_client().table("products").update({**update_data, "status": "inactive"}).eq("id", product_id).execute())
            except Exception:
                safe_execute(lambda: get_supabase_client().table("products").update(update_data).eq("id", product_id).execute())
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
