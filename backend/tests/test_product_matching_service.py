import pytest

from app.schemas.ai import RequirementDraft
from app.services.buyora_catalogue_service import CatalogueProduct, CatalogueSnapshot
from app.services.product_matching_service import ProductMatchingService


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
            "Max Budget Unit Price": "INR 80000",
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

    assert "Max Budget Unit Price" not in draft.mandatory_requirements
    assert draft.commercial_constraints["maximum_target_unit_price"] == "80000"
    assert draft.commercial_constraints["currency"] == "INR"


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
            if result.attribute == "maximum_target_unit_price"
        ]
        assert len(budget_results) == 1
        assert not any(
            result.attribute.casefold() == "max budget unit price"
            for result in product.mandatory_results
        )


@pytest.mark.anyio
async def test_price_above_maximum_fails_and_is_excluded():
    response = await _service(
        [_laptop("LAPTOP-OVER-BUDGET", discount_price=80001)]
    ).match(_laptop_requirements())

    assert response.exact_match_count == 0
    assert not response.products
    assert len(response.excluded_products) == 1
    assert any(
        result.attribute == "maximum_target_unit_price" and result.state == "FAIL"
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
        result.attribute == "maximum_target_unit_price"
        and result.state == "UNKNOWN"
        for result in response.excluded_products[0].mandatory_results
    )
