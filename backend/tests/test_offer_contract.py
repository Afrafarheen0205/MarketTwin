from decimal import Decimal
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.schemas.bidding import MerchantOfferListResponse, OfferReviseRequest, OfferSelectRequest, OfferSubmitRequest


def offer_payload():
    return {
        "unit_price": "19.95",
        "min_order_quantity": 1,
        "delivery_days": 7,
        "warranty_months": 36,
        "spec_notes": "Verified material specification",
        "shipping_terms": "Freight included",
    }


def test_canonical_offer_preserves_warranty_and_decimal_price():
    request = OfferSubmitRequest(**offer_payload())
    assert request.unit_price == Decimal("19.95")
    assert request.min_order_quantity == Decimal("1")
    assert request.warranty_months == 36
    assert request.model_dump(mode="json") == {**offer_payload(), "min_order_quantity": "1"}


@pytest.mark.parametrize("field", list(offer_payload()))
def test_every_form_field_is_required(field):
    payload = offer_payload()
    del payload[field]
    with pytest.raises(ValidationError):
        OfferSubmitRequest(**payload)


@pytest.mark.parametrize("field,value", [
    ("unit_price", "0"), ("unit_price", "-1"), ("unit_price", "1.001"),
    ("unit_price", "NaN"), ("unit_price", "Infinity"),
    ("unit_price", "10000000000.00"),
    ("min_order_quantity", 0), ("min_order_quantity", "NaN"),
    ("min_order_quantity", "1000000001"),
    ("min_order_quantity", True), ("delivery_days", 0), ("delivery_days", 91),
    ("warranty_months", 5), ("warranty_months", 121),
    ("spec_notes", "   "), ("shipping_terms", ""),
])
def test_invalid_offer_values_are_rejected(field, value):
    with pytest.raises(ValidationError):
        OfferSubmitRequest(**{**offer_payload(), field: value})


@pytest.mark.parametrize("field", [
    "merchant_id", "merchant_name", "merchant_rating", "status", "offer_code",
    "offered_unit_price", "offer_status", "final_quoted_amount", "available_quantity",
])
def test_identity_and_legacy_aliases_are_rejected(field):
    with pytest.raises(ValidationError):
        OfferSubmitRequest(**{**offer_payload(), field: "untrusted"})


def test_revision_requires_a_valid_expected_price():
    request = OfferReviseRequest(unit_price="18.00", expected_unit_price="19.95")
    assert request.unit_price == Decimal("18.00")
    with pytest.raises(ValidationError):
        OfferReviseRequest(unit_price="18.00")


@pytest.mark.parametrize("value,expected", [("1E2", "100.00"), ("19.9500", "19.95"), ("0.01", "0.01")])
def test_prices_serialize_as_fixed_decimal_for_rpc(value, expected):
    request = OfferSubmitRequest(**{**offer_payload(), "unit_price": value})
    assert request.model_dump(mode="json")["unit_price"] == expected


def test_fractional_minimum_quantity_is_preserved_for_rpc():
    request = OfferSubmitRequest(**{**offer_payload(), "min_order_quantity": "0.125"})
    assert request.min_order_quantity == Decimal("0.125")
    assert request.model_dump(mode="json")["min_order_quantity"] == "0.125"


def test_fractional_expected_quantity_is_preserved_for_acceptance_rpc():
    request = OfferSelectRequest(
        offer_id=UUID("8a39c83a-3bd7-4e31-bf18-2f57f970f1b3"),
        terms_accepted=True,
        expected_unit_price="19.95",
        expected_quantity="1.275",
    )

    assert request.expected_quantity == Decimal("1.275")
    assert request.model_dump(mode="json")["expected_quantity"] == "1.275"


def test_merchant_offer_list_preserves_unknown_legacy_currency():
    response = MerchantOfferListResponse(items=[{
        "id": "offer-legacy",
        "offer_code": "OFF-LEGACY",
        "unit_price": "19.95",
        "status": "Submitted",
        "submitted_date": "2026-01-01",
        "currency": None,
    }])

    assert response.items[0].currency is None