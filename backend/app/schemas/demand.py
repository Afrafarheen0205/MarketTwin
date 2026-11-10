import re
from datetime import date
from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class SpecificationEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=100)
    value: str = Field(..., min_length=1, max_length=500)
    unit: Optional[str] = Field(default=None, max_length=40)
    mandatory: bool = False

    @field_validator("name", "value", "unit")
    @classmethod
    def strip_specification_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Specification fields cannot be blank.")
        return value


class DimensionEntry(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    length: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    unit: Optional[str] = None


class DeliveryAddress(BaseModel):
    model_config = ConfigDict(extra="forbid")

    address: Optional[str] = Field(default=None, max_length=500)
    city: Optional[str] = Field(default=None, max_length=100)
    state: Optional[str] = Field(default=None, max_length=100)
    postal_code: Optional[str] = Field(default=None, max_length=32)
    instructions: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("address", "city", "state", "postal_code", "instructions")
    @classmethod
    def strip_delivery_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        return value or None


class DemandCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    product_name: str = Field(..., min_length=1, max_length=200)
    category: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=4000)
    brand: Optional[str] = Field(default=None, max_length=120)
    model_number: Optional[str] = Field(default=None, max_length=120)
    technical_specifications: List[SpecificationEntry] = Field(default_factory=list)
    dimensions: Optional[DimensionEntry] = None
    material: Optional[str] = Field(default=None, max_length=120)
    certifications: List[str] = Field(default_factory=list, max_length=50)
    quantity: Decimal = Field(..., gt=0, le=1_000_000_000)
    unit: str = Field(..., min_length=1, max_length=40)
    minimum_target_unit_price: Decimal = Field(..., gt=0, le=1_000_000_000_000)
    maximum_target_unit_price: Decimal = Field(..., gt=0, le=1_000_000_000_000)
    currency: str = Field(..., min_length=3, max_length=3)
    required_delivery_date: Optional[str] = Field(default=None, max_length=10)
    expected_lead_time: Optional[int] = Field(default=None, ge=0)
    delivery_address: Optional[DeliveryAddress] = None
    additional_requirements: Optional[str] = Field(default=None, max_length=4000)
    mandatory_requirements: Dict[str, str] = Field(default_factory=dict, max_length=32)
    optional_preferences: Dict[str, str] = Field(default_factory=dict, max_length=32)

    @field_validator(
        "product_name",
        "category",
        "unit",
        "description",
        "brand",
        "model_number",
        "material",
        "additional_requirements",
    )
    @classmethod
    def strip_demand_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not re.fullmatch(r"[A-Z]{3}", normalized):
            raise ValueError("Currency must be a three-letter ISO 4217 code.")
        return normalized

    @field_validator("required_delivery_date")
    @classmethod
    def validate_delivery_date(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        try:
            return date.fromisoformat(value).isoformat()
        except ValueError as exc:
            raise ValueError("Delivery date must be a valid ISO date (YYYY-MM-DD).") from exc

    @field_validator("certifications")
    @classmethod
    def validate_certifications(cls, values: List[str]) -> List[str]:
        cleaned = [value.strip() for value in values]
        if any(not value or len(value) > 120 for value in cleaned):
            raise ValueError("Certification names must be non-empty and at most 120 characters.")
        return cleaned

    @field_validator("mandatory_requirements", "optional_preferences")
    @classmethod
    def validate_requirement_maps(cls, values: Dict[str, str]) -> Dict[str, str]:
        cleaned: Dict[str, str] = {}
        seen_names = set()
        for key, value in values.items():
            name, requirement = key.strip(), value.strip()
            if not name or len(name) > 100 or not requirement or len(requirement) > 500:
                raise ValueError("Requirement names and values must be non-empty and within length limits.")
            if name.casefold() in seen_names:
                raise ValueError("Requirement names must be unique.")
            seen_names.add(name.casefold())
            cleaned[name] = requirement
        return cleaned

    @model_validator(mode="after")
    def validate_specifications(self):
        if len(self.technical_specifications) > 100:
            raise ValueError("At most 100 specifications may be submitted.")
        names = [entry.name.casefold() for entry in self.technical_specifications]
        if len(names) != len(set(names)):
            raise ValueError("Specification names must be unique.")
        if self.maximum_target_unit_price < self.minimum_target_unit_price:
            raise ValueError("Maximum target unit price must be greater than or equal to the minimum.")
        overlap = {
            name.casefold() for name in self.mandatory_requirements
        } & {
            name.casefold() for name in self.optional_preferences
        }
        if overlap:
            raise ValueError("A requirement cannot be both mandatory and an optional preference.")
        return self


class DemandUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    product_name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    brand: Optional[str] = None
    model_number: Optional[str] = None
    technical_specifications: Optional[List[SpecificationEntry]] = None
    dimensions: Optional[DimensionEntry] = None
    material: Optional[str] = None
    certifications: Optional[List[str]] = None
    quantity: Optional[Decimal] = Field(default=None, gt=0, le=1_000_000_000)
    unit: Optional[str] = None
    minimum_target_unit_price: Optional[Decimal] = Field(default=None, gt=0, le=1_000_000_000_000)
    maximum_target_unit_price: Optional[Decimal] = Field(default=None, gt=0, le=1_000_000_000_000)
    currency: Optional[str] = None
    required_delivery_date: Optional[str] = None
    expected_lead_time: Optional[int] = Field(default=None, ge=0)
    delivery_address: Optional[DeliveryAddress] = None
    additional_requirements: Optional[str] = None
    mandatory_requirements: Optional[Dict[str, str]] = Field(default=None, max_length=32)
    optional_preferences: Optional[Dict[str, str]] = Field(default=None, max_length=32)

    @field_validator(
        "product_name",
        "category",
        "description",
        "brand",
        "model_number",
        "unit",
        "material",
        "additional_requirements",
    )
    @classmethod
    def strip_updated_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value

    @field_validator(
        "mandatory_requirements",
        "optional_preferences",
    )
    @classmethod
    def validate_updated_requirement_maps(
        cls, values: Optional[Dict[str, str]]
    ) -> Optional[Dict[str, str]]:
        if values is None:
            return None
        cleaned: Dict[str, str] = {}
        seen_names = set()
        for key, value in values.items():
            name, requirement = key.strip(), value.strip()
            if not name or len(name) > 100 or not requirement or len(requirement) > 500:
                raise ValueError("Requirement names and values must be non-empty and within length limits.")
            if name.casefold() in seen_names:
                raise ValueError("Requirement names must be unique.")
            seen_names.add(name.casefold())
            cleaned[name] = requirement
        return cleaned

    @field_validator("currency")
    @classmethod
    def normalize_updated_currency(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip().upper()
        if not re.fullmatch(r"[A-Z]{3}", normalized):
            raise ValueError("Currency must be a three-letter ISO 4217 code.")
        return normalized

    @model_validator(mode="after")
    def validate_update(self):
        if (
            self.minimum_target_unit_price is not None
            and self.maximum_target_unit_price is not None
            and self.maximum_target_unit_price < self.minimum_target_unit_price
        ):
            raise ValueError("Maximum target unit price must be greater than or equal to the minimum.")
        requirement_edit = (
            "mandatory_requirements" in self.model_fields_set
            or "optional_preferences" in self.model_fields_set
        )
        if requirement_edit:
            required_fields = (
                "product_name",
                "category",
                "quantity",
                "unit",
                "minimum_target_unit_price",
                "maximum_target_unit_price",
                "currency",
                "mandatory_requirements",
                "optional_preferences",
            )
            if any(getattr(self, field) is None for field in required_fields):
                raise ValueError("Requirement edits must include the complete reviewed demand.")
            overlap = {
                name.casefold() for name in self.mandatory_requirements or {}
            } & {
                name.casefold() for name in self.optional_preferences or {}
            }
            if overlap:
                raise ValueError("A requirement cannot be both mandatory and an optional preference.")
        return self


class DemandResponse(BaseModel):
    id: str
    customer_id: Optional[str]
    group_id: Optional[str] = None
    group_reference: Optional[str] = None
    grouping_status: Optional[str] = None
    grouping_review_reason: Optional[str] = None
    participating_demand_count: Optional[int] = None
    participants_count: Optional[int] = None
    demand_code: Optional[str] = None
    product_name: str
    category: Optional[str] = None
    description: Optional[str] = None
    brand: Optional[str] = None
    model_number: Optional[str] = None
    technical_specifications: List[Dict[str, Any]] = Field(default_factory=list)
    dimensions: Dict[str, Any] = Field(default_factory=dict)
    material: Optional[str] = None
    certifications: List[str] = Field(default_factory=list)
    quantity: Decimal
    unit: Optional[str] = None
    minimum_target_unit_price: Optional[Decimal] = None
    maximum_target_unit_price: Optional[Decimal] = None
    currency: Optional[str] = None
    required_delivery_date: Optional[str] = None
    expected_lead_time: Optional[int] = None
    delivery_address: Dict[str, Any] = Field(default_factory=dict)
    additional_requirements: Optional[str] = None
    status: Optional[str] = None
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