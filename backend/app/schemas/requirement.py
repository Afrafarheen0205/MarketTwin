from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class NormalizedRequirementResponse(BaseModel):
    id: str
    demand_id: str
    extraction_version: str
    product_type: Optional[str] = None
    normalized_product_name: Optional[str] = None
    normalized_category: Optional[str] = None
    normalized_material: Optional[str] = None
    normalized_specifications: Dict[str, Any] = Field(default_factory=dict)
    normalized_dimensions: Dict[str, Any] = Field(default_factory=dict)
    mandatory_requirements: List[Dict[str, Any]] = Field(default_factory=list)
    optional_preferences: List[Dict[str, Any]] = Field(default_factory=list)
    commercial_constraints: Dict[str, Any] = Field(default_factory=dict)
    delivery_constraints: Dict[str, Any] = Field(default_factory=dict)
    missing_information: List[str] = Field(default_factory=list)
    clarification_questions: List[str] = Field(default_factory=list)
    validation_errors: List[str] = Field(default_factory=list)
    confidence_score: Optional[float] = None
    status: str
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class RequirementReviewRequest(BaseModel):
    normalized_product_name: Optional[str] = None
    normalized_material: Optional[str] = None
    normalized_specifications: Optional[Dict[str, Any]] = None
    mandatory_requirements: Optional[List[Dict[str, Any]]] = None
    optional_preferences: Optional[List[Dict[str, Any]]] = None
    commercial_constraints: Optional[Dict[str, Any]] = None
    delivery_constraints: Optional[Dict[str, Any]] = None
    status: Optional[str] = None