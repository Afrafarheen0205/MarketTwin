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
