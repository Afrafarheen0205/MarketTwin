from decimal import Decimal

from app.services.demand_mapping import (
    database_row_to_api_response,
    database_row_to_normalized_demand,
    demand_request_to_database_payload,
        product_family_key,
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

def test_product_family_key_ignores_color_and_individual_specifications():
    assert product_family_key("Red smartwatch with LED lights") == "smartwatch"
    assert product_family_key("red smartwatch with ladybug-print strap") == "smartwatch"
    assert product_family_key("Smartwatches") == "smartwatch"


def test_submission_payload_uses_exact_canonical_family_aliases_or_needs_review():
    known = demand_request_to_database_payload(
        "profile-1",
        {
            "product_name": "Samsung Galaxy smartphone suitable",
            "category": "Electronics -> Mobile Phones -> Samsung Smartphones",
            "quantity": 2,
            "unit": "phones",
            "minimum_target_unit_price": 100,
            "maximum_target_unit_price": 200,
            "currency": "USD",
        },
    )
    unknown = demand_request_to_database_payload(
        "profile-1",
        {
            "product_name": "Bluetooth speaker",
            "category": "Electronics",
            "quantity": 2,
            "unit": "units",
            "minimum_target_unit_price": 100,
            "maximum_target_unit_price": 200,
            "currency": "USD",
        },
    )

    assert known["normalized_requirements"]["product_family_key"] == "samsung galaxy smartphone suitable"
    assert known["canonical_product_family_key"] == "samsung_smartphone"
    assert known["canonical_category_key"] == "samsung_mobile_phones"
    assert unknown["canonical_product_family_key"] is None
    assert unknown["canonical_category_key"] is None


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
            "group_id": "group-1",
            "grouping_status": "needs_review",
            "demand_groups": {
                "group_reference": "GRP-123",
                "participating_demand_count": 4,
                "participants_count": 3,
            },
        }
    )

    assert response["product_name"] == "Industrial tank"
    assert response["quantity"] == 1.25
    assert response["minimum_target_unit_price"] == 100.5
    assert response["maximum_target_unit_price"] == 200.75
    assert response["demand_code"] is None
    assert response["group_id"] == "group-1"
    assert response["grouping_status"] == "needs_review"
    assert response["group_reference"] == "GRP-123"
    assert response["participating_demand_count"] == 4
    assert response["participants_count"] == 3


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
