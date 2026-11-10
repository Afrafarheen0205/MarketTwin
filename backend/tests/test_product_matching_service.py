import asyncio

import pytest

from app.schemas.ai import RequirementDraft
from app.services import product_matching_service as matching_module
from app.services.buyora_catalogue_service import CatalogueProduct, CatalogueSnapshot
from app.services.product_matching_service import ProductMatchingService
from app.services import order_service


class _Catalogue:
    def __init__(self, products):
        self.products = products

    async def fetch_products(self):
        return CatalogueSnapshot(
            products=self.products,
            products_returned=len(self.products),
        )


class _ExplanationProvider:
    async def explain_product_matches(self, _evidence):
        return "Matches verified against catalogue evidence."


def _laptop(product_id, *, price=85000, discount_price=79999, currency="INR"):
    return CatalogueProduct(
        productId=product_id,
        name="Dell XPS 13 laptop",
        brand="Dell",
        category="Computers",
        price=price,
        discountPrice=discount_price,
        currency=currency,
        specifications={
            "Processor": "Intel Core i7",
            "RAM": "16GB",
            "Storage": "512GB SSD",
            "Display Size": "13.4 inches",
            "Display Type": "FHD+",
        },
        stock=1,
    )


def _laptop_requirements():
    return RequirementDraft(
        product_name="Dell XPS 13 laptop",
        product_type="Laptop",
        category="Computers",
        mandatory_requirements={
            "processor": "Intel Core i7",
            "ram": "16GB",
            "storage": "512GB SSD",
            "display_size": "13.4 inches",
            "display_type": "FHD+",
            "Price Type": "maximum",
            "Maximum unit price": {"value": "80,000", "currency": "INR"},
            "Minimum unit price": {"value": "70,000", "currency": "INR"},
            "Budget": {"value": "80,000", "currency": "INR"},
            "Quantity": "1",
            "Unit": "unit",
        },
        commercial_constraints={
            "quantity": "1",
            "unit": "unit",
            "currency": "INR",
        },
    )


def _service(products):
    return ProductMatchingService(
        catalogue_service=_Catalogue(products),
        explanation_provider=_ExplanationProvider(),
    )


def test_maximum_budget_attribute_is_normalized_as_commercial_constraint():
    draft = _laptop_requirements()

    assert "Price Type" not in draft.mandatory_requirements
    assert "Maximum unit price" not in draft.mandatory_requirements
    assert draft.commercial_constraints["maximum_target_unit_price"] == "80000"
    assert draft.commercial_constraints["minimum_target_unit_price"] == "70000"
    assert draft.commercial_constraints["currency"] == "INR"
    assert draft.commercial_constraints["price_type"] == "maximum"
    assert draft.commercial_constraints["quantity"] == "1"
    assert draft.commercial_constraints["unit"] == "unit"


@pytest.mark.anyio
async def test_discounted_price_at_or_below_maximum_is_exact_for_all_passing_specs():
    response = await _service(
        [
            _laptop("LAPTOP-101"),
            _laptop("LAPTOP-102"),
        ]
    ).match(_laptop_requirements())

    assert response.exact_match_count == 2
    assert {product.product_id for product in response.products} == {
        "LAPTOP-101",
        "LAPTOP-102",
    }
    for product in response.products:
        assert product.effective_price == 79999
        assert all(result.state == "PASS" for result in product.mandatory_results)
        budget_results = [
            result
            for result in product.mandatory_results
            if result.attribute == "max_target_unit_price"
        ]
        assert len(budget_results) == 1
        assert any(
            result.attribute == "min_target_unit_price"
            and result.state == "PASS"
            for result in product.mandatory_results
        )
        assert not any(
            result.attribute.casefold() in {"price type", "maximum unit price"}
            for result in product.mandatory_results
        )


@pytest.mark.anyio
async def test_commercial_budget_fields_never_enter_catalogue_attribute_matching(monkeypatch):
    evaluated_attributes = []
    evaluate_attribute = matching_module._evaluate_attribute

    def record_attribute(record, key, value, source, preference=False):
        evaluated_attributes.append(key.casefold())
        return evaluate_attribute(record, key, value, source, preference)

    monkeypatch.setattr(matching_module, "_evaluate_attribute", record_attribute)
    draft = RequirementDraft.model_construct(
        product_name="Dell XPS 13 laptop",
        product_type="Laptop",
        category="Computers",
        mandatory_requirements={
            "processor": "Intel Core i7",
            "ram": "16GB",
            "storage": "512GB SSD",
            "display_size": "13.4 inches",
            "display_type": "FHD+",
            "Price Type": "maximum",
            "Maximum unit price": {"value": "80,000", "currency": "INR"},
            "Budget": {"value": "80,000", "currency": "INR"},
            "Quantity": "1",
            "Unit": "unit",
        },
        optional_preferences={},
        commercial_constraints={"quantity": "1", "unit": "unit", "currency": "INR"},
        delivery_constraints={},
    )

    response = await _service([_laptop("LAPTOP-101")]).match(draft)

    assert evaluated_attributes == [
        "processor",
        "ram",
        "storage",
        "display_size",
        "display_type",
    ]
    assert response.exact_match_count == 1


@pytest.mark.anyio
async def test_price_above_maximum_fails_and_is_excluded():
    response = await _service(
        [_laptop("LAPTOP-OVER-BUDGET", discount_price=80001)]
    ).match(_laptop_requirements())

    assert response.exact_match_count == 0
    assert not response.products
    assert len(response.excluded_products) == 1
    assert any(
        result.attribute == "max_target_unit_price" and result.state == "FAIL"
        for result in response.excluded_products[0].mandatory_results
    )


@pytest.mark.anyio
async def test_currency_mismatch_is_unknown_and_not_exact():
    response = await _service(
        [_laptop("LAPTOP-CURRENCY-MISMATCH", currency="USD")]
    ).match(_laptop_requirements())

    assert response.exact_match_count == 0
    assert not response.products
    assert len(response.excluded_products) == 1
    assert any(
        result.attribute == "max_target_unit_price" and result.state == "UNKNOWN"
        for result in response.excluded_products[0].mandatory_results
    )


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("price", "currency"),
    [(None, "INR"), (79999, None)],
    ids=["missing-price", "missing-currency"],
)
async def test_unverifiable_price_or_currency_is_unknown_and_not_exact(price, currency):
    response = await _service(
        [
            _laptop(
                "LAPTOP-UNVERIFIED",
                price=price,
                discount_price=None,
                currency=currency,
            )
        ]
    ).match(_laptop_requirements())

    assert response.exact_match_count == 0
    assert not response.products
    assert len(response.excluded_products) == 1
    assert any(
        result.attribute == "max_target_unit_price"
        and result.state == "UNKNOWN"
        for result in response.excluded_products[0].mandatory_results
    )


@pytest.mark.anyio
async def test_unknown_technical_requirement_remains_unknown():
    draft = _laptop_requirements()
    draft.mandatory_requirements["touchscreen"] = "Yes"

    response = await _service([_laptop("LAPTOP-UNKNOWN-TECH")]).match(draft)

    assert response.exact_match_count == 0
    assert len(response.near_matches) == 1
    assert any(
        result.attribute == "touchscreen" and result.state == "UNKNOWN"
        for result in response.near_matches[0].mandatory_results
    )


def test_checkout_uses_corrected_matcher_result(monkeypatch):
    matcher = _service([_laptop("LAPTOP-101")])
    monkeypatch.setattr(order_service, "ProductMatchingService", lambda: matcher)

    quote = asyncio.run(
        order_service.quote_exact_catalogue_product(
            _laptop_requirements(),
            "LAPTOP-101",
            1,
        )
    )

    assert quote["product"]["product_id"] == "LAPTOP-101"
    assert quote["unit_price"] == "79999.00"
