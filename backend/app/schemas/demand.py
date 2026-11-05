from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class SpecificationEntry(BaseModel):
    name: str
    value: str
    unit: Optional[str] = None
    mandatory: bool = False


class DimensionEntry(BaseModel):
    length: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    unit: Optional[str] = None


class DeliveryAddress(BaseModel):
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    instructions: Optional[str] = None


class DemandCreateRequest(BaseModel):
    product_name: str = Field(..., min_length=1)
    category: Optional[str] = None
    description: Optional[str] = None
    brand: Optional[str] = None
    model_number: Optional[str] = None
    technical_specifications: List[SpecificationEntry] = Field(default_factory=list)
    dimensions: Optional[DimensionEntry] = None
    material: Optional[str] = None
    certifications: List[str] = Field(default_factory=list)
    quantity: float = Field(..., gt=0)
    unit: str = Field(..., min_length=1)
    target_unit_price: Optional[float] = Field(default=None, ge=0)
    maximum_budget: Optional[float] = Field(default=None, ge=0)
    currency: str = "USD"
    required_delivery_date: Optional[str] = None
    expected_lead_time: Optional[int] = Field(default=None, ge=0)
    delivery_address: Optional[DeliveryAddress] = None
    additional_requirements: Optional[str] = None


class DemandUpdateRequest(BaseModel):
    product_name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    brand: Optional[str] = None
    model_number: Optional[str] = None
    technical_specifications: Optional[List[SpecificationEntry]] = None
    dimensions: Optional[DimensionEntry] = None
    material: Optional[str] = None
    certifications: Optional[List[str]] = None
    quantity: Optional[float] = Field(default=None, gt=0)
    unit: Optional[str] = None
    target_unit_price: Optional[float] = Field(default=None, ge=0)
    maximum_budget: Optional[float] = Field(default=None, ge=0)
    currency: Optional[str] = None
    required_delivery_date: Optional[str] = None
    expected_lead_time: Optional[int] = Field(default=None, ge=0)
    delivery_address: Optional[DeliveryAddress] = None
    additional_requirements: Optional[str] = None


class DemandResponse(BaseModel):
    id: str
    customer_id: str
    product_name: str
    category: Optional[str] = None
    description: Optional[str] = None
    brand: Optional[str] = None
    model_number: Optional[str] = None
    technical_specifications: List[Dict[str, Any]] = Field(default_factory=list)
    dimensions: Dict[str, Any] = Field(default_factory=dict)
    material: Optional[str] = None
    certifications: List[str] = Field(default_factory=list)
    quantity: float
    unit: str
    target_unit_price: Optional[float] = None
    maximum_budget: Optional[float] = None
    currency: str
    required_delivery_date: Optional[str] = None
    expected_lead_time: Optional[int] = None
    delivery_address: Dict[str, Any] = Field(default_factory=dict)
    additional_requirements: Optional[str] = None
    status: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class DemandListResponse(BaseModel):
    items: List[DemandResponse]
    total: int
    page: int
    page_size: int


class AttachmentResponse(BaseModel):
    id: str
    demand_id: str
    file_name: str
    file_path: str
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    uploaded_at: Optional[str] = None