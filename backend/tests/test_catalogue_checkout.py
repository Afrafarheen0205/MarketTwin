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
):
    results = [SimpleNamespace(state=state) for state in mandatory_states]
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
    async def match(self, requirements):
        return SimpleNamespace(products=products)

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


def test_alternative_product_cannot_be_purchased(monkeypatch):
    _matching(monkeypatch, [_product()])

    with pytest.raises(PermissionError, match="not an exact match"):
        _run(
            order_service.quote_exact_catalogue_product(
                RequirementDraft(),
                "other",
                1,
            )
        )


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
    }

    result = order_service.create_catalogue_order("customer-id", "idempotency-key", quote)

    assert result == {"id": "order-id"}
    assert calls["name"] == "create_catalogue_order_v1"
    assert calls["parameters"]["p_customer_id"] == "customer-id"
    assert calls["parameters"]["p_unit_price"] == "10.50"
    assert calls["parameters"]["p_quantity"] == 2
