import pytest

from app.services import offer_validation_service


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, client, table):
        self.client = client
        self.table = table
        self.selected = None
        self.filters = {}
        self.upserted = None
        self.single_row = False

    def select(self, columns):
        self.selected = columns
        return self

    def limit(self, _limit):
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def single(self):
        self.single_row = True
        return self

    def in_(self, column, values):
        self.filters[column] = values
        return self

    def is_(self, column, value):
        self.filters[column] = None
        return self

    def upsert(self, data, **_kwargs):
        self.upserted = data
        return self

    def execute(self):
        if self.table == "merchant_offers" and self.selected == "group_id":
            if not self.client.group_id_supported:
                raise RuntimeError("column merchant_offers.group_id does not exist")
            return _Result([])
        if self.table == "demands":
            data = self.client.demand
            return _Result(data[0] if self.single_row else data)
        if self.table == "merchant_offers":
            data = [offer for offer in self.client.offer if all(offer.get(key) in value if isinstance(value, list) else offer.get(key) == value for key, value in self.filters.items())]
            return _Result(data[0] if self.single_row else data)
        if self.table == "demand_group_members":
            return _Result(self.client.members)
        if self.table == "demand_groups":
            self.client.group_lookups.append(self.filters["id"])
            data = self.client.group
            return _Result(data[0] if self.single_row else data)
        if self.table == "customer_offer_eligibility":
            self.client.eligibility_writes.append(self.upserted)
            return _Result([])
        return _Result([])


class _Client:
    def __init__(self, group_id_supported=True):
        self.group_id_supported = group_id_supported
        self.demand = [{"id": "demand-1", "customer_id": "customer-1", "target_quantity": 3, "group_id": "redirected-group"}]
        self.offer = [{
            "id": "offer-1",
            "group_id": "canonical-group",
            "status": "Submitted",
            "unit_price": "19.95",
            "min_order_quantity": 2,
            "merchant_id": "merchant-1",
        }]
        self.group = [{"id": "canonical-group", "bidding_status": "open"}]
        self.members = [{"group_id": "canonical-group"}]
        self.group_lookups = []
        self.eligibility_writes = []

    def table(self, name):
        return _Query(self, name)


def test_offer_validation_uses_canonical_group(monkeypatch):
    client = _Client()
    monkeypatch.setattr(offer_validation_service, "_client", lambda: client)
    monkeypatch.setattr(
        offer_validation_service,
        "resolve_group_ids",
        lambda group_ids, client: {group_id: "canonical-group" for group_id in group_ids},
    )

    result = offer_validation_service.validate_offer("customer-1", "demand-1", "offer-1")

    assert result["status"] == "Eligible"
    assert result["offer"]["group_id"] == "canonical-group"
    assert client.eligibility_writes == []


def test_offer_validation_fails_before_writing_without_group_id_column(monkeypatch):
    client = _Client(group_id_supported=False)
    monkeypatch.setattr(offer_validation_service, "_client", lambda: client)

    with pytest.raises(RuntimeError, match="merchant_offers.group_id is missing"):
        offer_validation_service.validate_offer("customer-1", "demand-1", "offer-1")

    assert client.eligibility_writes == []


@pytest.mark.parametrize("quantity,minimum,status", [
    (3, 2, "Eligible"), ("0.75", "0.5", "Eligible"),
    ("0.125", "0.25", "Not Eligible"), (1, 2, "Not Eligible"),
    (None, 1, "Not Eligible"),
])
def test_eligibility_uses_target_quantity(quantity, minimum, status):
    result = offer_validation_service.evaluate_offer({"target_quantity": quantity, "quantity": 999}, {
        "status": "Submitted", "merchant_id": "merchant", "unit_price": "19.95", "min_order_quantity": minimum,
    })
    assert result["status"] == status


def test_legacy_offer_is_visible_only_for_its_owned_demand(monkeypatch):
    client = _Client()
    client.members = []
    client.demand[0]["group_id"] = None
    client.offer[0].update(demand_id="demand-1", group_id=None)
    monkeypatch.setattr(offer_validation_service, "_client", lambda: client)
    assert len(offer_validation_service.get_offers_for_customer("customer-1", "demand-1")) == 1
    assert offer_validation_service.get_offers_for_customer("customer-1", "other-demand") == []


def test_missing_membership_does_not_expose_group_offers(monkeypatch):
    client = _Client()
    client.members = []
    monkeypatch.setattr(offer_validation_service, "_client", lambda: client)
    monkeypatch.setattr(offer_validation_service, "resolve_group_ids", lambda ids, client: {group_id: "canonical-group" for group_id in ids})
    with pytest.raises(PermissionError):
        offer_validation_service.validate_offer("customer-1", "demand-1", "offer-1")
    assert client.eligibility_writes == []


def test_acceptance_is_one_rpc_with_explicit_consent_and_expected_price(monkeypatch):
    from decimal import Decimal
    calls = []
    monkeypatch.setattr(offer_validation_service, "_offer_rpc", lambda name, params: calls.append((name, params)) or {"id": "selection", "order": {"id": "order"}})
    result = offer_validation_service.select_offer("customer", "demand", "offer", True, Decimal("19.95"), 3)
    assert result["order"]["id"] == "order"
    assert calls == [("accept_merchant_offer_v1", {
        "p_customer_id": "customer", "p_demand_id": "demand", "p_offer_id": "offer",
        "p_terms_accepted": True, "p_expected_unit_price": "19.95",
        "p_expected_quantity": "3",
    })]
    with pytest.raises(ValueError):
        offer_validation_service.select_offer("customer", "demand", "offer", False, Decimal("19.95"), 3)
    assert len(calls) == 1
