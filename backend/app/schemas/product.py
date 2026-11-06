import re
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


def generate_slug(name: str, suffix: str = "") -> str:
    """Generate a clean URL-friendly slug from product title."""
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip().lower()).strip("-")
    if suffix:
        return f"{cleaned}-{suffix}".strip("-")
    return cleaned


class ProductBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255, description="Product title")
    slug: Optional[str] = Field(default=None, description="URL-friendly unique slug")
    description: Optional[str] = Field(default="", description="Detailed product description")
    category: str = Field(..., min_length=2, max_length=100, description="Product taxonomy category")
    brand: Optional[str] = Field(default="", description="Manufacturer or brand name")
    model_number: Optional[str] = Field(default="", description="Manufacturer model / SKU number")
    specifications: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Technical specifications key-value object")
    unit: Optional[str] = Field(default="piece", description="Sales unit (e.g. piece, unit, set, module, box)")
    retail_price: float = Field(..., ge=0, description="Standard retail catalog price")
    wholesale_price: float = Field(..., ge=0, description="Targeted bulk / wholesale offer price")
    minimum_order_quantity: Optional[int] = Field(default=1, ge=1, description="Minimum order quantity (MOQ)")
    available_quantity: Optional[int] = Field(default=0, ge=0, description="Currently available warehouse inventory")
    images: Optional[List[str]] = Field(default_factory=list, description="Array of product image URLs")
    status: Optional[str] = Field(default="active", pattern="^(active|inactive)$", description="Product catalog status")


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    slug: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = Field(default=None, min_length=2, max_length=100)
    brand: Optional[str] = None
    model_number: Optional[str] = None
    specifications: Optional[Dict[str, Any]] = None
    unit: Optional[str] = None
    retail_price: Optional[float] = Field(default=None, ge=0)
    wholesale_price: Optional[float] = Field(default=None, ge=0)
    minimum_order_quantity: Optional[int] = Field(default=None, ge=1)
    available_quantity: Optional[int] = Field(default=None, ge=0)
    images: Optional[List[str]] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class ProductResponse(ProductBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    # Backward-compatibility aliases for existing frontend components
    market_price: Optional[float] = None
    min_demand_price: Optional[float] = None
    in_stock: Optional[bool] = None
    image_url: Optional[str] = None
    sku: Optional[str] = None
    rating: Optional[float] = 5.0
    reviews_count: Optional[int] = 0


class ProductListResponse(BaseModel):
    items: List[ProductResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class ProductMatchItem(ProductResponse):
    """Product item annotated with search relevance, multi-tier matching category, and structured explanations."""
    match_type: str = Field(default="exact", pattern="^(exact|similar|alternative|related)$", description="'exact' | 'similar' | 'alternative' | 'related'")
    match_tier: str = Field(default="exact", pattern="^(exact|similar|alternative|related)$", description="'exact' | 'similar' | 'alternative' | 'related'")
    relevance_score: float = Field(default=1.0, ge=0.0, le=1.0, description="Normalized match relevance score between 0.0 and 1.0")
    match_reasons: List[str] = Field(default_factory=list, description="Explanatory human-readable reasons why this product matched or is suggested")
    matching_attributes: List[str] = Field(default_factory=list, description="Key specifications or attributes that align with query")
    different_attributes: List[str] = Field(default_factory=list, description="Key specifications or attributes that differ from query (e.g., material grade, capacity)")
    compatibility_explanation: str = Field(default="", description="Technical assessment of compatibility and trade-offs")


class ProductSearchResponse(BaseModel):
    """Comprehensive search response separating exact matches, similar suggestions, alternatives, and related items."""
    items: List[ProductMatchItem] = Field(default_factory=list, description="All matching products sorted according to requested sort order")
    exact_matches: List[ProductMatchItem] = Field(default_factory=list, description="List of items meeting strict exact matching criteria")
    similar_matches: List[ProductMatchItem] = Field(default_factory=list, description="List of items meeting highly similar functional specifications")
    alternative_matches: List[ProductMatchItem] = Field(default_factory=list, description="List of alternative products (different material grade, capacity, etc.)")
    related_matches: List[ProductMatchItem] = Field(default_factory=list, description="List of related products in the same category or workflow")
    total: int = Field(default=0, description="Total matching items across all tiers")
    exact_count: int = Field(default=0, description="Number of exact matches found")
    similar_count: int = Field(default=0, description="Number of highly similar matches found")
    alternative_count: int = Field(default=0, description="Number of alternative matches found")
    related_count: int = Field(default=0, description="Number of related matches found")
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=12, ge=1)
    total_pages: int = Field(default=0, ge=0)
    query: str = Field(default="", description="Sanitized query string searched")
    has_exact_match: bool = Field(default=True, description="True if at least one exact match was identified")
    suggestion_message: Optional[str] = Field(default=None, description="Guidance message when exact matches are missing")


class ProductMatchRequest(BaseModel):
    """Payload to match customer demand parameters or structured specifications against existing catalogue."""
    query: Optional[str] = Field(default=None, description="Free-text product or demand query")
    category: Optional[str] = Field(default=None, description="Target product category")
    specifications: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Required specifications key-value map")
    target_price: Optional[float] = Field(default=None, ge=0, description="Buyer target ceiling price")
    target_quantity: Optional[int] = Field(default=None, ge=1, description="Desired order quantity")


class ProductMatchResponse(BaseModel):
    """Detailed matching evaluation result for customer demand requests."""
    matches: List[ProductMatchItem] = Field(default_factory=list)
    exact_matches: List[ProductMatchItem] = Field(default_factory=list)
    similar_matches: List[ProductMatchItem] = Field(default_factory=list)
    alternative_matches: List[ProductMatchItem] = Field(default_factory=list)
    related_matches: List[ProductMatchItem] = Field(default_factory=list)
    has_exact_match: bool = False
    exact_match_count: int = 0
    similar_match_count: int = 0
    alternative_match_count: int = 0
    related_match_count: int = 0
    recommendation: str = Field(default="browse", description="'use_catalog' | 'view_alternatives' | 'create_demand'")
    create_demand_params: Dict[str, Any] = Field(default_factory=dict, description="Pre-filled query parameters to pass to demand creation flow")

