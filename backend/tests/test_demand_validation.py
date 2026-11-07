import asyncio
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.v1.endpoints import demands
from app.core.security import require_roles
from app.schemas.demand import DemandCreateRequest, DemandUpdateRequest


def valid_payload(**overrides):
    payload = {
        "product_name": "Red Scarf",
        "category": "Clothing & Accessories",
        "quantity": 1,
        "unit": "Piece",
        "minimum_target_unit_price": "10.00",
        "maximum_target_unit_price": "20.00",
        "currency": "usd",
        "technical_specifications": [
            {"name": "Colour", "value": "Red", "mandatory": True},
            {"name": "Material", "value": "Wool", "mandatory": False},
        ],
    }
    payload.update(overrides)
    return payload


def test_demand_payload_normalizes_text_and_preserves_specification_types():
    request = DemandCreateRequest.model_validate(valid_payload())

    assert request.currency == "USD"
    assert [(item.name, item.mandatory) for item in request.technical_specifications] == [
        ("Colour", True),
        ("Material", False),
    ]


@pytest.mark.parametrize(
    "overrides",
    [
        {"product_name": "  "},
        {"category": ""},
        {"quantity": 0},
        {"quantity": -1},
        {"minimum_target_unit_price": 0},
        {"maximum_target_unit_price": 9.99},
        {"currency": "US"},
        {"required_delivery_date": "2026-02-31"},
        {"technical_specifications": [{"name": " ", "value": "Red"}]},
        {"customer_id": "spoofed-customer"},
    ],
)
def test_invalid_or_untrusted_demand_payload_is_rejected(overrides):
    with pytest.raises(ValidationError):
        DemandCreateRequest.model_validate(valid_payload(**overrides))


def test_missing_required_demand_fields_are_rejected():
    with pytest.raises(ValidationError):
        DemandCreateRequest.model_validate({"quantity": 1, "unit": "piece"})


def test_reviewed_requirement_edit_requires_complete_price_and_commercial_fields():
    with pytest.raises(ValidationError):
        DemandUpdateRequest.model_validate(
            {
                "mandatory_requirements": {"material": "SS 304"},
                "optional_preferences": {},
            }
        )

    request = DemandUpdateRequest.model_validate(
        {
            "product_name": "Industrial tank",
            "category": "Industrial",
            "quantity": "1.25",
            "unit": "units",
            "minimum_target_unit_price": "100.50",
            "maximum_target_unit_price": "200.75",
            "currency": "inr",
            "mandatory_requirements": {"material": "SS 304"},
            "optional_preferences": {"brand": "Acme"},
        }
    )
    assert request.quantity == 1.25
    assert request.currency == "INR"


def test_requirement_edit_cannot_make_a_specification_mandatory_and_optional():
    with pytest.raises(ValidationError):
        DemandUpdateRequest.model_validate(
            {
                "product_name": "Industrial tank",
                "category": "Industrial",
                "quantity": 1,
                "unit": "unit",
                "minimum_target_unit_price": 100,
                "maximum_target_unit_price": 200,
                "currency": "USD",
                "mandatory_requirements": {"material": "SS 304"},
                "optional_preferences": {"Material": "SS 304"},
            }
        )


def test_unverified_customer_is_rejected():
    customer_guard = require_roles("customer")

    with pytest.raises(HTTPException) as error:
        customer_guard(
            {
                "id": "customer-1",
                "role": "customer",
                "email_confirmed_at": None,
            }
        )

    assert error.value.status_code == 403


def test_non_customer_role_is_rejected():
    customer_guard = require_roles("customer")

    with pytest.raises(HTTPException) as error:
        customer_guard(
            {
                "id": "merchant-1",
                "role": "merchant",
                "email_confirmed_at": "verified",
            }
        )

    assert error.value.status_code == 403


def test_create_route_does_not_attempt_unverified_database_write(monkeypatch):
    def unexpected_write(*_args, **_kwargs):
        pytest.fail("database write must remain blocked until schema verification")

    monkeypatch.setattr(demands, "create_demand", unexpected_write)
    payload = DemandCreateRequest.model_validate(valid_payload())

    with pytest.raises(HTTPException) as error:
        asyncio.run(
            demands.create_customer_demand(
                payload,
                {"id": "verified-customer", "role": "customer"},
                uuid4(),
            )
        )

    assert error.value.status_code == 503


def test_analysis_route_does_not_return_unverified_counts(monkeypatch):
    def unexpected_read(*_args, **_kwargs):
        pytest.fail("analysis data access must remain blocked until schema verification")

    monkeypatch.setattr(demands, "list_demands", unexpected_read)

    with pytest.raises(HTTPException) as error:
        asyncio.run(
            demands.analyze_customer_demand(
                "demand-1",
                page=1,
                page_size=20,
                classification="all",
                current_user={
                    "id": "verified-customer",
                    "role": "customer",
                    "email_confirmed_at": "verified",
                },
            )
        )

    assert error.value.status_code == 503


def test_update_route_is_gated_until_database_migration_is_verified(monkeypatch):
    monkeypatch.setattr(
        demands,
        "get_settings",
        lambda: type("Settings", (), {"DEMAND_PERSISTENCE_ENABLED": False})(),
    )
    with pytest.raises(HTTPException) as error:
        asyncio.run(
            demands.update_customer_demand(
                "demand-1",
                DemandUpdateRequest(),
                {"id": "verified-customer", "role": "customer"},
            )
        )

    assert error.value.status_code == 503


def test_response_maps_real_demand_code_without_fabricating_one():
    record = {
        "id": "demand-1",
        "customer_id": "customer-1",
        "demand_code": "DM-1001",
        "title": "Red Scarf",
        "target_quantity": 1,
        "min_target_unit_price": 10,
        "max_target_unit_price": 20,
        "unit": "Piece",
        "currency": "USD",
        "status": "Pending",
    }

    response = demands._to_response(record)
    missing_code_response = demands._to_response({**record, "demand_code": None})

    assert response.demand_code == "DM-1001"
    assert str(response.minimum_target_unit_price) == "10"
    assert str(response.maximum_target_unit_price) == "20"
    assert missing_code_response.demand_code is None


def test_demand_listing_preserves_backend_pagination_and_total(monkeypatch):
    observed = {}

    def list_page(customer_id, page, page_size, status=None, search=None):
        observed.update(
            customer_id=customer_id,
            page=page,
            page_size=page_size,
            status=status,
            search=search,
        )
        return [], 37

    monkeypatch.setattr(demands, "list_demands", list_page)
    response = asyncio.run(
        demands.get_customer_demands(
            page=2,
            page_size=20,
            status_filter=None,
            search=None,
            current_user={"id": "customer-1"},
        )
    )

    assert observed == {
        "customer_id": "customer-1",
        "page": 2,
        "page_size": 20,
        "status": None,
        "search": None,
    }
    assert response.total == 37
    assert response.page == 2
