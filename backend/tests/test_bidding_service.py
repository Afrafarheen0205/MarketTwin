import re
from types import SimpleNamespace

import pytest
from postgrest.exceptions import APIError

from app.services import bidding_service
from tests.test_offer_contract import offer_payload


class RpcClient:
    def __init__(self, error=None):
        self.calls = []
        self.error = error

    def table(self, name):
        raise AssertionError("Offer writes must not use REST table operations")

    def rpc(self, name, parameters):
        self.calls.append((name, parameters))
        return self

    def execute(self):
        if self.error:
            raise self.error
        return SimpleNamespace(data={"id": "offer-1", "group_id": "canonical-group"})


def test_submission_uses_one_atomic_rpc_and_database_resolves_redirect(monkeypatch):
    client = RpcClient()
    monkeypatch.setattr(bidding_service, "get_supabase_service_client", lambda: client)
    result = bidding_service.submit_offer("authenticated-merchant", "redirected-group", offer_payload())
    assert result["group_id"] == "canonical-group"
    assert len(client.calls) == 1
    name, parameters = client.calls[0]
    assert name == "submit_merchant_offer_v1"
    assert parameters["p_group_id"] == "redirected-group"
    assert parameters["p_merchant_id"] == "authenticated-merchant"
    assert parameters["p_terms"] == {**offer_payload(), "min_order_quantity": "1"}
    assert re.fullmatch(r"OFF-[0-9A-F]{32}", parameters["p_offer_code"])


def test_offer_codes_are_not_group_merchant_prefixes(monkeypatch):
    client = RpcClient()
    monkeypatch.setattr(bidding_service, "get_supabase_service_client", lambda: client)
    for _ in range(2):
        bidding_service.submit_offer("same-merchant", "same-group", offer_payload())
    assert client.calls[0][1]["p_offer_code"] != client.calls[1][1]["p_offer_code"]


@pytest.mark.parametrize("code,message,error", [
    ("PGRST202", "missing RPC", RuntimeError),
    ("42703", "missing group_id", RuntimeError),
    ("42501", "denied", RuntimeError),
    ("P0001", "OFFER_DUPLICATE", bidding_service.OfferConflict),
    ("23505", "constraint details", bidding_service.OfferConflict),
    ("P0001", "OFFER_STALE_PRICE", bidding_service.OfferConflict),
    ("P0001", "OFFER_GROUP_CLOSED", bidding_service.OfferConflict),
    ("P0001", "OFFER_LEGACY_QUANTITY", bidding_service.OfferConflict),
    ("P0001", "OFFER_INVALID_TERMS", ValueError),
])
def test_rpc_errors_fail_closed_without_rest_fallback(monkeypatch, code, message, error):
    client = RpcClient(APIError({"code": code, "message": message, "details": None, "hint": None}))
    monkeypatch.setattr(bidding_service, "get_supabase_service_client", lambda: client)
    with pytest.raises(error):
        bidding_service.submit_offer("merchant", "group", offer_payload())
    assert len(client.calls) == 1


def test_revision_uses_authenticated_owner_and_expected_price(monkeypatch):
    client = RpcClient()
    monkeypatch.setattr(bidding_service, "get_supabase_service_client", lambda: client)
    bidding_service.revise_offer("merchant", "offer", {"unit_price": "18.00", "expected_unit_price": "19.95"})
    assert client.calls == [("revise_merchant_offer_v1", {
        "p_merchant_id": "merchant", "p_offer_id": "offer",
        "p_unit_price": "18.00", "p_expected_unit_price": "19.95",
    })]


def test_unconfigured_service_client_fails_closed(monkeypatch):
    monkeypatch.setattr(bidding_service, "get_supabase_service_client", lambda: None)
    with pytest.raises(RuntimeError, match="unavailable"):
        bidding_service.submit_offer("merchant", "group", offer_payload())
