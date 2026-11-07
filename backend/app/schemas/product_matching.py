from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

ConstraintState = Literal["PASS", "FAIL", "UNKNOWN"]


class ConstraintEvaluation(BaseModel):
    source: str
    attribute: str
    requirement: str
    state: ConstraintState
    reason: str
    evidence: list[str] = Field(default_factory=list)


class PreferenceEvaluation(BaseModel):
    attribute: str
    preference: str
    state: ConstraintState
    reason: str
    evidence: list[str] = Field(default_factory=list)


class MatchedProduct(BaseModel):
    product_id: str
    name: Optional[str] = None
    brand: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    discount_price: Optional[float] = None
    effective_price: Optional[float] = None
    currency: Optional[str] = None
    images: list[str] = Field(default_factory=list)
    specifications: dict[str, Any] = Field(default_factory=dict)
    stock: Optional[int] = None
    delivery_days: Optional[float] = None
    rating: Optional[float] = None
    reviews: Optional[int] = None
    mandatory_results: list[ConstraintEvaluation] = Field(default_factory=list)
    preference_results: list[PreferenceEvaluation] = Field(default_factory=list)
    match_score: float = Field(ge=0, le=1)
    rating_confidence: Optional[float] = Field(default=None, ge=0, le=1)
    bayesian_rating: Optional[float] = Field(default=None, ge=0, le=5)
    estimated_total: Optional[float] = None
    estimated_total_note: Optional[str] = None
    missing_attributes: list[str] = Field(default_factory=list)
    explanation: str


class ProductMatchingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["matches_found", "no_exact_matches", "no_relevant_products"]
    catalogue_products_examined: int = Field(ge=0)
    catalogue_products_returned: int = Field(ge=0)
    catalogue_total_reported: Optional[int] = Field(default=None, ge=0)
    exact_match_count: int = Field(ge=0)
    near_match_count: int = Field(ge=0)
    best_product_id: Optional[str] = None
    products: list[MatchedProduct] = Field(default_factory=list)
    near_matches: list[MatchedProduct] = Field(default_factory=list)
    excluded_products: list[MatchedProduct] = Field(default_factory=list)
    unverified_products: list[MatchedProduct] = Field(default_factory=list)
    unresolved_requirements: list[str] = Field(default_factory=list)
    explanation: Optional[str] = None
