from decimal import Decimal
from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


Money = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2, allow_inf_nan=False)]


class OfferSubmitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    unit_price: Money
    min_order_quantity: Decimal = Field(gt=0, le=1_000_000_000, allow_inf_nan=False)
    delivery_days: int = Field(strict=True, ge=1, le=90)
    warranty_months: int = Field(strict=True, ge=6, le=120)
    spec_notes: str = Field(min_length=1, max_length=10000)
    shipping_terms: str = Field(min_length=1, max_length=2000)

    @field_validator("unit_price")
    @classmethod
    def canonical_price(cls, value: Decimal) -> Decimal:
        return value.quantize(Decimal("0.01"))


class OfferReviseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    unit_price: Money
    expected_unit_price: Money

    @field_validator("unit_price", "expected_unit_price")
    @classmethod
    def canonical_price(cls, value: Decimal) -> Decimal:
        return value.quantize(Decimal("0.01"))


class OfferSelectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    offer_id: UUID
    terms_accepted: bool = Field(strict=True)
    expected_unit_price: Money
    expected_quantity: Decimal = Field(gt=0, le=1_000_000_000, allow_inf_nan=False)


class MerchantOfferResponse(BaseModel):
    id: str
    offer_code: str
    group_id: str | None = None
    demand_id: str | None = None
    demand_title: str | None = None
    merchant_id: str | None = None
    merchant_name: str | None = None
    merchant_rating: Decimal | None = None
    unit_price: Decimal
    original_target_price: Decimal | None = None
    total_offer_amount: Decimal | None = None
    quoted_quantity: Decimal | None = None
    min_order_quantity: Decimal | None = None
    delivery_days: int | None = None
    warranty_months: int | None = None
    spec_notes: str | None = None
    shipping_terms: str | None = None
    status: Literal["Submitted", "Under Review", "Customer Approved", "Rejected"]
    submitted_date: date
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")


class MerchantOfferListResponse(BaseModel):
    items: list[MerchantOfferResponse]


class OpenBiddingRequest(BaseModel):
    start: str
    deadline: str