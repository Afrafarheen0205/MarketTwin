from decimal import Decimal

from app.services.demand_analysis_service import (
    EXACT,
    INCOMPATIBLE,
    SIMILAR,
    analyze_demands,
    compare_demands,
    is_eligible_demand,
)
from app.services.demand_opportunity import is_merchant_opportunity_eligible
from app.schemas.demand_analysis import DemandAnalysisResponse


def demand(
    demand_id="demand-1",
    customer_id="customer-1",
    colour="Orange",
    status="Submitted",
    **overrides,
):
    record = {
        "id": demand_id,
        "customer_id": customer_id,
        "demand_code": f"REF-{demand_id}",
        "product_name": "Wireless Earbuds",
        "category": "Electronics",
        "quantity": 1,
        "unit": "Piece",
        "minimum_target_unit_price": 50,
        "maximum_target_unit_price": 100,
        "currency": "USD",
        "status": status,
        "created_at": "2026-01-01T00:00:00Z",
        "normalized_requirements": {
            "mandatory_requirements": [
                {"name": "Colour", "value": colour},
                {"name": "Battery life", "value": "7 days"},
                {"name": "Vibration alert", "value": "Required"},
                {"name": "Light indicator", "value": "Required"},
            ],
            "optional_preferences": [],
            "delivery_constraints": {},
        },
    }
    record.update(overrides)
    return record


def test_identical_requirements_are_exact():
    current = demand("current", "customer-a")
    result = compare_demands(current, demand("other", "customer-b"))

    assert result is not None
    assert result.classification == EXACT


def test_confirmed_mandatory_conflict_is_incompatible():
    current = demand("current", "customer-a", colour="Orange")
    result = compare_demands(current, demand("other", "customer-b", colour="Blue"))

    assert result is not None
    assert result.classification == INCOMPATIBLE
    assert any("colour differs" in reason.lower() for reason in result.differences)


def test_missing_mandatory_specification_is_unknown_and_similar():
    current = demand("current", "customer-a")
    other = demand("other", "customer-b")
    other["normalized_requirements"]["mandatory_requirements"] = [
        item
        for item in other["normalized_requirements"]["mandatory_requirements"]
        if item["name"] != "Colour"
    ]

    result = compare_demands(current, other)

    assert result is not None
    assert result.classification == SIMILAR
    assert any("colour was not specified" in reason.lower() for reason in result.differences)


def test_additional_mandatory_specification_is_unknown_and_similar():
    current = demand("current", "customer-a")
    other = demand("other", "customer-b")
    other["normalized_requirements"]["mandatory_requirements"].append(
        {"name": "Waterproof rating", "value": "IPX7"}
    )

    result = compare_demands(current, other)

    assert result is not None
    assert result.classification == SIMILAR
    waterproof = next(
        item for item in result.comparisons if item.key == "Waterproof rating"
    )
    assert waterproof.state == "UNKNOWN"
    assert waterproof.current_value is None


def test_original_specification_values_are_preserved_for_display():
    current = demand("current", "customer-a", colour="Orange")
    other = demand("other", "customer-b", colour="Orange")
    result = compare_demands(current, other)

    assert result is not None
    colour = next(
        item for item in result.comparisons if item.key.casefold() == "colour"
    )
    assert colour.current_value == "Orange"
    assert colour.other_value == "Orange"


def test_unrelated_product_identity_is_excluded():
    current = demand("current", "customer-a")
    other = demand("other", "customer-b", product_name="Cast Iron Cookware")

    assert compare_demands(current, other) is None


def test_related_synonym_is_recognized():
    current = demand("current", "customer-a")
    other = demand("other", "customer-b", product_name="Bluetooth Earbuds")

    result = compare_demands(current, other)

    assert result is not None
    assert result.classification == SIMILAR


def test_category_mismatch_excludes_unrelated_demand():
    current = demand("current", "customer-a")
    other = demand("other", "customer-b", category="Home & Garden")

    assert compare_demands(current, other) is None


def test_optional_specification_difference_does_not_make_incompatible():
    current = demand("current", "customer-a")
    current["normalized_requirements"]["optional_preferences"] = [
        {"name": "Colour preference", "value": "Orange"}
    ]
    other = demand("other", "customer-b")
    other["normalized_requirements"]["optional_preferences"] = [
        {"name": "Colour preference", "value": "Blue"}
    ]

    result = compare_demands(current, other)

    assert result is not None
    assert result.classification == SIMILAR


def test_quantity_difference_is_a_known_difference_not_unknown():
    current = demand("current", "customer-a", quantity=5)
    other = demand("other", "customer-b", quantity=10)

    result = compare_demands(current, other)

    assert result is not None
    assert result.classification == SIMILAR
    quantity = next(
        item for item in result.comparisons if item.key == "quantity and unit"
    )
    assert quantity.state == "FAIL"


def test_incompatible_units_are_not_converted():
    current = demand("current", "customer-a")
    other = demand("other", "customer-b", unit="Kilogram")

    result = compare_demands(current, other)

    assert result is not None
    assert result.classification == INCOMPATIBLE


def test_different_currencies_are_incompatible_without_conversion():
    current = demand("current", "customer-a")
    other = demand("other", "customer-b", currency="INR")

    result = compare_demands(current, other)

    assert result is not None
    assert result.classification == INCOMPATIBLE
    assert any("different currencies" in reason for reason in result.differences)


def test_overlapping_price_ranges_are_similar_and_disjoint_ranges_are_incompatible():
    current = demand("current", "customer-a")
    overlapping = demand(
        "overlap",
        "customer-b",
        minimum_target_unit_price=Decimal("90"),
        maximum_target_unit_price=Decimal("150"),
    )
    disjoint = demand(
        "disjoint",
        "customer-c",
        minimum_target_unit_price=Decimal("101"),
        maximum_target_unit_price=Decimal("150"),
    )

    overlap_result = compare_demands(current, overlapping)
    disjoint_result = compare_demands(current, disjoint)

    assert overlap_result is not None
    assert overlap_result.classification == SIMILAR
    price_comparison = next(
        item for item in overlap_result.comparisons if item.key == "target unit price range"
    )
    assert price_comparison.state == "PASS"
    assert disjoint_result is not None
    assert disjoint_result.classification == INCOMPATIBLE


def test_partial_price_ranges_are_ineligible_but_legacy_unknown_ranges_are_retained():
    partial = demand("partial", "customer-b", maximum_target_unit_price=None)
    legacy = demand(
        "legacy",
        "customer-c",
        minimum_target_unit_price=None,
        maximum_target_unit_price=None,
        currency=None,
    )

    assert not is_eligible_demand(partial)
    assert is_eligible_demand(legacy)
    result = compare_demands(demand("current", "customer-a"), legacy)
    assert result is not None
    assert result.classification == SIMILAR
    price_comparison = next(
        item for item in result.comparisons if item.key == "target unit price range"
    )
    assert price_comparison.state == "UNKNOWN"


def test_opportunity_threshold_counts_distinct_customers_not_demand_rows():
    assert not is_merchant_opportunity_eligible(50)
    assert is_merchant_opportunity_eligible(51)

    current = demand("current", "requester", currency="INR")
    rows = [
        demand(
            f"match-{index}",
            f"customer-{index % 51}",
            quantity=2,
            currency="INR",
        )
        for index in range(70)
    ]
    response = analyze_demands(current, rows, "requester")

    assert response["summary"]["compatible_demand_count"] == 70
    assert response["summary"]["distinct_compatible_customers_count"] == 51
    assert response["summary"]["merchant_opportunity_eligible"] is True
    assert response["summary"]["total_requested_quantity"] == 140
    assert response["summary"]["aggregate_currency"] == "INR"


def test_delivery_constraints_are_compared():
    current = demand("current", "customer-a")
    current["normalized_requirements"]["delivery_constraints"] = {
        "delivery_duration": "within 2 weeks"
    }
    other = demand("other", "customer-b")
    other["normalized_requirements"]["delivery_constraints"] = {
        "delivery_duration": "within 6 weeks"
    }

    result = compare_demands(current, other)

    assert result is not None
    assert result.classification == INCOMPATIBLE
    delivery = next(item for item in result.comparisons if item.key.startswith("delivery"))
    assert delivery.state == "FAIL"


def test_legacy_delivery_fields_are_compared_without_exposing_address_values():
    current = demand(
        "current",
        "customer-a",
        required_delivery_date="2026-12-01",
        delivery_address={"city": "Toronto", "postal_code": "A1B2C3"},
    )
    other = demand(
        "other",
        "customer-b",
        required_delivery_date="2026-12-08",
        delivery_address={"city": "Montreal", "postal_code": "H1A1A1"},
    )

    result = compare_demands(current, other)

    assert result is not None
    assert result.classification == INCOMPATIBLE
    comparison_values = " ".join(
        f"{item.current_value or ''} {item.other_value or ''}"
        for item in result.comparisons
    )
    assert "Toronto" not in comparison_values
    assert "Montreal" not in comparison_values
    assert "A1B2C3" not in comparison_values


def test_legacy_technical_specifications_are_used():
    current = demand("current", "customer-a")
    current.pop("normalized_requirements")
    current["technical_specifications"] = [
        {"name": "Colour", "value": "Orange", "mandatory": True}
    ]
    other = demand("other", "customer-b")
    other.pop("normalized_requirements")
    other["technical_specifications"] = [
        {"name": "Colour", "value": "Blue", "mandatory": False}
    ]

    result = compare_demands(current, other)

    assert result is not None
    assert result.classification == SIMILAR


def test_legacy_specs_json_is_used():
    current = demand("current", "customer-a")
    current.pop("normalized_requirements")
    current["specs"] = {"Colour": {"value": "Orange", "mandatory": True}}
    other = demand("other", "customer-b")
    other.pop("normalized_requirements")
    other["specs"] = {"Colour": {"value": "Blue", "mandatory": True}}

    result = compare_demands(current, other)

    assert result is not None
    assert result.classification == INCOMPATIBLE


def test_normalized_commercial_values_are_used_when_legacy_columns_are_missing():
    current = demand("current", "customer-a", quantity=None, unit=None, minimum_target_unit_price=None, maximum_target_unit_price=None, currency=None)
    other = demand("other", "customer-b", quantity=None, unit=None, minimum_target_unit_price=None, maximum_target_unit_price=None, currency=None)
    current["normalized_requirements"]["commercial_constraints"] = {
        "quantity": 1,
        "unit": "piece",
        "minimum_target_unit_price": 50,
        "maximum_target_unit_price": 100,
        "currency": "USD",
    }
    other["normalized_requirements"]["commercial_constraints"] = {
        "quantity": 1,
        "unit": "pieces",
        "minimum_target_unit_price": 50,
        "maximum_target_unit_price": 100,
        "currency": "USD",
    }

    result = compare_demands(current, other)

    assert result is not None
    assert result.classification == EXACT


def test_flat_normalized_requirement_record_is_supported():
    current = demand("current", "customer-a")
    other = demand("other", "customer-b")
    for record in (current, other):
        normalized = record.pop("normalized_requirements")
        record.pop("product_name")
        record.pop("category")
        record["normalized_product_name"] = "Wireless Earbuds"
        record["normalized_category"] = "Electronics"
        record["mandatory_requirements"] = normalized["mandatory_requirements"]
        record["optional_preferences"] = normalized["optional_preferences"]
        record["commercial_constraints"] = {
            "quantity": record["quantity"],
            "unit": record["unit"],
            "minimum_target_unit_price": record["minimum_target_unit_price"],
            "maximum_target_unit_price": record["maximum_target_unit_price"],
            "currency": record["currency"],
        }

    result = compare_demands(current, other)

    assert result is not None
    assert result.classification == EXACT
    assert result.demand["product_name"] == "Wireless Earbuds"
    assert result.demand["category"] == "Electronics"


def test_cancelled_and_incomplete_demands_are_ineligible():
    assert not is_eligible_demand(demand(status="Cancelled"))
    assert not is_eligible_demand(demand(quantity=0))
    assert not is_eligible_demand(demand(product_name=""))


def test_aggregates_exclude_current_and_own_matches_and_count_distinct_customers():
    current = demand("current", "customer-a")
    all_demands = [
        current,
        demand("mine-1", "customer-a"),
        demand("mine-2", "customer-a"),
        demand("other-1", "customer-b"),
        demand("other-2", "customer-b"),
        demand("other-3", "customer-c"),
        demand("cancelled", "customer-d", status="Cancelled"),
    ]

    response = analyze_demands(current, all_demands, "customer-a")

    assert response["summary"]["my_existing_demands_count"] == 2
    assert response["summary"]["exact_match_count"] == 3
    assert response["summary"]["distinct_exact_customers_count"] == 2
    assert {row["demand"]["id"] for row in response["results"]} == {
        "other-1",
        "other-2",
        "other-3",
    }
    assert all("customer_id" not in row["demand"] for row in response["results"])


def test_summary_counts_cover_all_pages():
    current = demand("current", "customer-a")
    all_demands = [
        demand(f"other-{index}", f"customer-{index + 2}")
        for index in range(25)
    ]

    page = analyze_demands(
        current,
        all_demands,
        "customer-a",
        page=2,
        page_size=10,
        classification=EXACT,
    )

    assert page["summary"]["exact_match_count"] == 25
    assert page["pagination"]["total"] == 25
    assert page["pagination"]["total_pages"] == 3
    assert len(page["results"]) == 10
    parsed = DemandAnalysisResponse.model_validate(page)
    assert parsed.summary.exact_match_count == 25


def test_presentation_does_not_return_other_customer_private_fields():
    current = demand("current", "customer-a")
    other = demand(
        "other",
        "customer-b",
        customer_name="Private Name",
        email="private@example.invalid",
        phone="555-0100",
        delivery_address={"address": "Private address"},
    )

    result = compare_demands(current, other)

    assert result is not None
    assert "customer_id" not in result.demand
    assert "email" not in result.demand
    assert "phone" not in result.demand
    assert "delivery_address" not in result.demand
