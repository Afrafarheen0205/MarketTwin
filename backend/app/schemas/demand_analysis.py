from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

ComparisonState = Literal["PASS", "FAIL", "UNKNOWN"]
DemandClassification = Literal["exact", "similar", "incompatible"]


class DemandComparison(BaseModel):
    key: str
    current_value: Optional[str] = None
    other_value: Optional[str] = None
    state: ComparisonState
    reason: str


class PublicDemandSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    demand_code: Optional[str] = None
    product_name: Optional[str] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    model_number: Optional[str] = None
    technical_specifications: List[Dict[str, object]] = Field(default_factory=list)
    quantity: Optional[Decimal] = None
    unit: Optional[str] = None
    minimum_target_unit_price: Optional[Decimal] = None
    maximum_target_unit_price: Optional[Decimal] = None
    currency: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[str] = None


class DemandAnalysisResult(BaseModel):
    classification: DemandClassification
    demand: PublicDemandSummary
    explanation: str
    comparisons: List[DemandComparison] = Field(default_factory=list)
    differences: List[str] = Field(default_factory=list)


class DemandAnalysisSummary(BaseModel):
    my_existing_demands_count: int = Field(ge=0)
    exact_match_count: int = Field(ge=0)
    similar_match_count: int = Field(ge=0)
    incompatible_match_count: int = Field(ge=0)
    distinct_exact_customers_count: int = Field(ge=0)
    distinct_similar_customers_count: int = Field(ge=0)
    compatible_demand_count: int = Field(ge=0)
    distinct_compatible_customers_count: int = Field(ge=0)
    merchant_opportunity_eligible: bool
    total_requested_quantity: Optional[Decimal] = None
    total_requested_quantity_unit: Optional[str] = None
    aggregate_minimum_target_unit_price: Optional[Decimal] = None
    aggregate_maximum_target_unit_price: Optional[Decimal] = None
    aggregate_currency: Optional[str] = None
    common_mandatory_requirements: List[Dict[str, str]] = Field(default_factory=list)
    important_differences: List[str] = Field(default_factory=list)


class DemandAnalysisPagination(BaseModel):
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total: int = Field(ge=0)
    total_pages: int = Field(ge=0)
    classification: Literal["all", "exact", "similar", "incompatible"]


class DemandAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_demand: PublicDemandSummary
    summary: DemandAnalysisSummary
    results: List[DemandAnalysisResult]
    pagination: DemandAnalysisPagination
    generated_at: datetime
