import asyncio
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.schemas.ai import RequirementDraft
from app.services import order_service


def _product(
    *,
    product_id="catalogue-1",
    effective_price=Decimal("10.50"),
    currency="USD",
    stock=4,
    mandatory_states=("PASS",),
    mandatory_sources=None,
):
    sources = mandatory_sources or ("mandatory_requirements",) * len(mandatory_states)
    results = [
        SimpleNamespace(state=state, source=source)
        for state, source in zip(mandatory_states, sources)
    ]
    return SimpleNamespace(
        product_id=product_id,
        effective_price=effective_price,
        currency=currency,
        stock=stock,
        mandatory_results=results,
        model_dump=lambda mode: {
            "product_id": product_id,
            "name": "Exact product",
            "mandatory_results": [{"state": state} for state in mandatory_states],
        },
    )


def _matching(monkeypatch, products):
    async def match(self, requirements, **_kwargs):
        return SimpleNamespace(
            products=products,
            near_matches=[],
            exact_match_count=len(products),
            catalogue_products_examined=len(products),
        )

    monkeypatch.setattr(order_service.ProductMatchingService, "match", match)


def _matching_groups(monkeypatch, products, near_matches):
    async def match(self, requirements, **_kwargs):
        return SimpleNamespace(
            products=products,
            near_matches=near_matches,
            exact_match_count=len(products),
            catalogue_products_examined=len(products) + len(near_matches),
        )

    monkeypatch.setattr(order_service.ProductMatchingService, "match", match)


def _run(coroutine):
    return asyncio.run(coroutine)


def test_exact_catalogue_product_creates_server_calculated_quote(monkeypatch):
    _matching(monkeypatch, [_product()])

    quote = _run(
        order_service.quote_exact_catalogue_product(
            RequirementDraft(),
            "catalogue-1",
            2,
        )
    )

    assert quote["unit_price"] == "10.50"
    assert quote["subtotal"] == "21.00"
    assert quote["total"] == "21.00"
    assert quote["currency"] == "USD"
    assert quote["product"]["product_id"] == "catalogue-1"
    assert quote["match_classification"] == "EXACT_MATCH"


def test_closest_alternative_can_be_purchased_with_actual_snapshot(monkeypatch):
    alternative = _product(
        product_id="alternative-1",
        mandatory_states=("UNKNOWN", "PASS"),
        mandatory_sources=("mandatory_requirements", "commercial_constraints"),
    )
    _matching_groups(monkeypatch, [], [alternative])

    quote = _run(
        order_service.quote_exact_catalogue_product(
            RequirementDraft(),
            "alternative-1",
            1,
            "CLOSEST_ALTERNATIVE",
        )
    )

    assert quote["product_id"] == "alternative-1"
    assert quote["product"]["product_id"] == "alternative-1"
    assert quote["match_classification"] == "CLOSEST_ALTERNATIVE"


def test_exact_selection_cannot_checkout_near_match(monkeypatch):
    alternative = _product(product_id="alternative-1")
    _matching_groups(monkeypatch, [], [alternative])

    with pytest.raises(PermissionError, match="selected match group"):
        _run(order_service.quote_exact_catalogue_product(
            RequirementDraft(), "alternative-1", 1, "EXACT_MATCH"
        ))


def test_alternative_with_failed_commercial_check_is_blocked(monkeypatch):
    alternative = _product(
        product_id="alternative-1",
        mandatory_states=("UNKNOWN", "FAIL"),
        mandatory_sources=("mandatory_requirements", "commercial_constraints"),
    )
    _matching_groups(monkeypatch, [], [alternative])

    with pytest.raises(PermissionError, match="commercial requirements"):
        _run(order_service.quote_exact_catalogue_product(
            RequirementDraft(), "alternative-1", 1, "CLOSEST_ALTERNATIVE"
        ))


def test_alternative_respects_stock_and_currency_validation(monkeypatch):
    unavailable = _product(product_id="alternative-1", stock=0)
    _matching_groups(monkeypatch, [], [unavailable])

    with pytest.raises(ValueError, match="exceeds the available stock"):
        _run(order_service.quote_exact_catalogue_product(
            RequirementDraft(), "alternative-1", 1, "CLOSEST_ALTERNATIVE"
        ))

    wrong_currency = _product(product_id="alternative-2", currency=None)
    _matching_groups(monkeypatch, [], [wrong_currency])

    with pytest.raises(ValueError, match="no verified price or currency"):
        _run(order_service.quote_exact_catalogue_product(
            RequirementDraft(), "alternative-2", 1, "CLOSEST_ALTERNATIVE"
        ))


@pytest.mark.parametrize("state", ["FAIL", "UNKNOWN"])
def test_failed_or_unknown_mandatory_requirement_blocks_purchase(monkeypatch, state):
    _matching(monkeypatch, [_product(mandatory_states=(state,))])

    with pytest.raises(PermissionError, match="unverified or failed"):
        _run(
            order_service.quote_exact_catalogue_product(
                RequirementDraft(),
                "catalogue-1",
                1,
            )
        )


def test_empty_mandatory_set_is_allowed_for_authoritatively_exact_product(monkeypatch):
    _matching(monkeypatch, [_product(mandatory_states=())])

    quote = _run(
        order_service.quote_exact_catalogue_product(
            RequirementDraft(),
            "catalogue-1",
            1,
        )
    )

    assert quote["total"] == "10.50"


def test_quantity_cannot_exceed_catalogue_stock(monkeypatch):
    _matching(monkeypatch, [_product(stock=1)])

    with pytest.raises(ValueError, match="exceeds the available stock"):
        _run(
            order_service.quote_exact_catalogue_product(
                RequirementDraft(),
                "catalogue-1",
                2,
            )
        )


def test_invalid_catalogue_price_is_rejected(monkeypatch):
    _matching(monkeypatch, [_product(effective_price=Decimal("NaN"))])

    with pytest.raises(ValueError, match="invalid price"):
        _run(
            order_service.quote_exact_catalogue_product(
                RequirementDraft(),
                "catalogue-1",
                1,
            )
        )


def test_catalogue_order_persistence_uses_only_verified_quote(monkeypatch):
    calls = {}

    def rpc(name, parameters):
        calls["name"] = name
        calls["parameters"] = parameters
        return {"id": "order-id"}

    monkeypatch.setattr(order_service, "_payment_rpc", rpc)
    quote = {
        "product_id": "catalogue-1",
        "product": {"name": "Exact product"},
        "quantity": 2,
        "unit_price": "10.50",
        "currency": "USD",
        "match_classification": "CLOSEST_ALTERNATIVE",
    }

    result = order_service.create_catalogue_order("customer-id", "idempotency-key", quote)

    assert result == {"id": "order-id"}
    assert calls["name"] == "create_catalogue_order_v1"
    assert calls["parameters"]["p_customer_id"] == "customer-id"
    assert calls["parameters"]["p_unit_price"] == "10.50"
    assert calls["parameters"]["p_quantity"] == 2
    assert calls["parameters"]["p_match_classification"] == "CLOSEST_ALTERNATIVE"
