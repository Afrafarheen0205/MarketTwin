from decimal import Decimal

from app.services.demand_mapping import (
    database_row_to_api_response,
    database_row_to_normalized_demand,
    demand_request_to_database_payload,
)


def test_demand_payload_uses_verified_live_columns_and_separate_requirement_sets():
    payload = demand_request_to_database_payload(
        "profile-1",
        {
            "product_name": "Industrial tank",
            "category": "Industrial",
            "quantity": Decimal("1.25"),
            "unit": "units",
            "minimum_target_unit_price": Decimal("100.50"),
            "maximum_target_unit_price": Decimal("200.75"),
            "currency": "INR",
            "mandatory_requirements": {"material": "SS 304"},
            "optional_preferences": {"brand": "Acme"},
        },
        "submission-1",
    )

    assert payload["title"] == "Industrial tank"
    assert payload["target_quantity"] == "1.25"
    assert payload["min_target_unit_price"] == "100.50"
    assert payload["max_target_unit_price"] == "200.75"
    assert payload["currency"] == "INR"
    assert "product_name" not in payload
    assert "quantity" not in payload
    assert "target_price" not in payload
    normalized = payload["normalized_requirements"]
    assert normalized["mandatory_requirements"] == [
        {"name": "material", "value": "SS 304"}
    ]
    assert normalized["optional_preferences"] == [
        {"name": "brand", "value": "Acme"}
    ]
    assert normalized["commercial_constraints"]["minimum_target_unit_price"] == "100.50"


def test_database_response_maps_actual_fields_without_fabricating_reference():
    response = database_row_to_api_response(
        {
            "id": "demand-1",
            "title": "Industrial tank",
            "target_quantity": 1.25,
            "min_target_unit_price": 100.5,
            "max_target_unit_price": 200.75,
            "currency": "INR",
            "demand_code": None,
        }
    )

    assert response["product_name"] == "Industrial tank"
    assert response["quantity"] == 1.25
    assert response["minimum_target_unit_price"] == 100.5
    assert response["maximum_target_unit_price"] == 200.75
    assert response["demand_code"] is None


def test_analysis_mapping_does_not_expose_delivery_address():
    demand = database_row_to_normalized_demand(
        {
            "id": "demand-1",
            "customer_id": "customer-1",
            "title": "Industrial tank",
            "delivery_address": {"address": "Private address"},
        },
        {
            "delivery_constraints": {
                "required_delivery_date": "2026-12-01",
                "delivery_address": "Private address",
                "additional_delivery_requirements": "Call first",
            }
        },
    )

    assert "delivery_address" not in demand["normalized_requirements"]["delivery_constraints"]
    assert demand["normalized_requirements"]["delivery_constraints"] == {
        "required_delivery_date": "2026-12-01"
    }
