import pytest

from app.services import demand_service


class Result:
    def __init__(self, data):
        self.data = data
        self.count = len(data) if isinstance(data, list) else None


class Query:
    def __init__(self, table_name, records):
        self.table_name = table_name
        self.records = records

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        return Result(self.records.get(self.table_name, []))


class Client:
    def __init__(self, records):
        self.records = records
        self.rpc_call = None

    def table(self, table_name):
        return Query(table_name, self.records)

    def rpc(self, function_name, params):
        self.rpc_call = (function_name, params)
        return QueryResult(self.records["updated_demand"])


class QueryResult:
    def __init__(self, data):
        self.data = data

    def execute(self):
        return Result(self.data)


class AnalysisResult:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class AnalysisQuery:
    def __init__(self, table_name, current, records, normalized, page_limit):
        self.table_name = table_name
        self.current = current
        self.records = records
        self.normalized = normalized
        self.page_limit = page_limit
        self.page_range = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def range(self, start, end):
        self.page_range = (start, end)
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self.table_name == "demand_normalized_requirements":
            return AnalysisResult(self.normalized)
        if self.page_range is None:
            return AnalysisResult([self.current])
        start, end = self.page_range
        page_end = min(end + 1, start + self.page_limit)
        return AnalysisResult(self.records[start:page_end], len(self.records))


class AnalysisClient:
    def __init__(self, current, records, normalized=None, page_limit=500):
        self.current = current
        self.records = records
        self.normalized = normalized or []
        self.page_limit = page_limit

    def table(self, table_name):
        return AnalysisQuery(
            table_name,
            self.current,
            self.records,
            self.normalized,
            self.page_limit,
        )


def test_confirmed_requirement_edit_uses_owner_scoped_atomic_rpc(monkeypatch):
    existing = {
        "id": "demand-1",
        "customer_id": "customer-1",
        "demand_code": "MT-REFERENCE",
        "title": "Old tank",
        "category": "Industrial",
        "target_quantity": 1,
        "unit": "unit",
        "min_target_unit_price": 100,
        "max_target_unit_price": 200,
        "currency": "INR",
        "status": "Submitted",
        "delivery_address": {"city": "Pune"},
        "technical_specifications": [
            {"name": "Material", "value": "SS 304", "mandatory": True}
        ],
    }
    normalized = {
        "normalized_material": "SS 304",
        "mandatory_requirements": [{"name": "Material", "value": "SS 304"}],
        "optional_preferences": [],
        "delivery_constraints": {"required_delivery_date": "2026-12-01"},
    }
    saved = {**existing, "title": "Updated tank", "target_quantity": 1.25}
    client = Client(
        {
            "demands": [existing],
            "demand_normalized_requirements": [normalized],
            "updated_demand": saved,
        }
    )
    monkeypatch.setattr(demand_service, "_client", lambda: client)

    result = demand_service.update_demand(
        "customer-1",
        "demand-1",
        {
            "product_name": "Updated tank",
            "category": "Industrial",
            "quantity": 1.25,
            "unit": "units",
            "minimum_target_unit_price": 110,
            "maximum_target_unit_price": 220,
            "currency": "INR",
            "mandatory_requirements": {"Material": "SS 316"},
            "optional_preferences": {"Brand": "Acme"},
            "technical_specifications": [
                {"name": "Material", "value": "SS 316", "mandatory": True},
                {"name": "Brand", "value": "Acme", "mandatory": False},
            ],
        },
    )

    assert result["id"] == "demand-1"
    assert client.rpc_call is not None
    function_name, params = client.rpc_call
    assert function_name == "update_customer_demand_v1"
    assert params["p_customer_id"] == "customer-1"
    assert params["p_demand_id"] == "demand-1"
    assert params["p_demand"]["title"] == "Updated tank"
    assert params["p_demand"]["target_quantity"] == 1.25
    assert params["p_demand"]["delivery_address"] == {"city": "Pune"}
    assert params["p_demand"]["normalized_requirements"]["mandatory_requirements"] == [
        {"name": "Material", "value": "SS 316"}
    ]


def test_analysis_fetches_all_pages_and_rejects_truncated_pages(monkeypatch):
    current = {
        "id": "current",
        "customer_id": "customer-1",
        "title": "Tank",
        "category": "Industrial",
    }
    records = [
        {
            "id": f"demand-{index}",
            "customer_id": f"customer-{index}",
            "title": "Tank",
            "category": "Industrial",
            "demand_normalized_requirements": [],
        }
        for index in range(501)
    ]
    monkeypatch.setattr(
        demand_service,
        "_client",
        lambda: AnalysisClient(current, records),
    )

    _, fetched = demand_service.get_analysis_dataset("customer-1", "current")

    assert len(fetched) == 501
    assert "customer_id" in fetched[0]
    monkeypatch.setattr(
        demand_service,
        "_client",
        lambda: AnalysisClient(current, records, page_limit=100),
    )
    with pytest.raises(RuntimeError, match="incomplete dataset"):
        demand_service.get_analysis_dataset("customer-1", "current")
