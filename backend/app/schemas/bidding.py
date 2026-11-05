from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class OfferSubmitRequest(BaseModel):
    offered_product_name: str
    brand: Optional[str] = None
    model_number: Optional[str] = None
    description: Optional[str] = None
    material: Optional[str] = None
    material_grade: Optional[str] = None
    specifications: Dict[str, Any] = Field(default_factory=dict)
    certifications: List[str] = Field(default_factory=list)
    compliance_notes: Optional[str] = None
    offered_unit_price: float = Field(..., ge=0)
    currency: str = "USD"
    tax_amount: float = Field(default=0, ge=0)
    additional_charges: float = Field(default=0, ge=0)
    shipping_cost: float = Field(default=0, ge=0)
    final_quoted_amount: Optional[float] = Field(default=None, ge=0)
    minimum_order_quantity: Optional[int] = Field(default=None, ge=0)
    available_quantity: Optional[int] = Field(default=None, ge=0)
    production_lead_time: Optional[int] = Field(default=None, ge=0)
    dispatch_lead_time: Optional[int] = Field(default=None, ge=0)
    delivery_lead_time: Optional[int] = Field(default=None, ge=0)
    delivery_terms: Optional[str] = None
    offer_valid_until: Optional[str] = None
    merchant_remarks: Optional[str] = None
    merchant_name: Optional[str] = None
    merchant_rating: Optional[float] = None


class OpenBiddingRequest(BaseModel):
    start: str
    deadline: str