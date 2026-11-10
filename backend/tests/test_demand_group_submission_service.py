from copy import deepcopy

import pytest

from app.services import demand_group_submission_service as grouping_service
from app.services.demand_embedding_service import (
    EMBEDDING_DIMENSIONS,
    DemandEmbeddingCandidate,
    DemandEmbeddingResult,
)
from app.services.demand_group_submission_service import try_group_new_demand


class _EmbeddingHarness:
    def __init__(self):
        self.candidates = [DemandEmbeddingCandidate("existing-demand", 0.1, 0.9)]
        self.generate_error = None
        self.persist_error = None
        self.search_error = None
        self.generate_calls = []
        self.persist_calls = []
        self.search_calls = []

    async def generate(self, demand):
        self.generate_calls.append(demand)
        if self.generate_error:
            raise self.generate_error
        return DemandEmbeddingResult(
            embedding=[0.25] * EMBEDDING_DIMENSIONS,
            embedding_model="nomic-embed-text",
            embedding_version="v1",
            input_hash="hash-a",
        )

    def persist(self, demand_id, embedding, client=None):
        self.persist_calls.append((demand_id, embedding, client))
        if self.persist_error:
            raise self.persist_error
        return "saved"

    def search(self, query_embedding, **kwargs):
        self.search_calls.append((query_embedding, kwargs))
        if self.search_error:
            raise self.search_error
        return self.candidates


@pytest.fixture
def embeddings(monkeypatch):
    harness = _EmbeddingHarness()
    monkeypatch.setattr(grouping_service, "DemandEmbeddingService", lambda: harness)
    monkeypatch.setattr(grouping_service, "persist_demand_embedding", harness.persist)
    monkeypatch.setattr(grouping_service, "search_demand_embedding_candidates", harness.search)
    return harness


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, client, table):
        self.client = client
        self.table = table
        self.filters = {}

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def in_(self, column, values):
        self.filters[column] = list(values)
        return self

    def limit(self, _limit):
        return self

    def execute(self):
        rows = self.client.rows.get(self.table, [])
        return _Result([
            row for row in rows
            if all(
                row.get(column) in value if isinstance(value, list) else row.get(column) == value
                for column, value in self.filters.items()
            )
        ])


class _Rpc:
    def __init__(self, data):
        self.data = data

    def execute(self):
        return _Result(self.data)


class _Client:
    def __init__(self, rows):
        self.rows = rows
        self.rpc_calls = []
        self.fail_family_candidate_read = False

    def table(self, name):
        return _Query(self, name)

    def rpc(self, name, params):
        self.rpc_calls.append((name, params))
        if name == "list_demand_group_family_candidates_v1":
            if self.fail_family_candidate_read:
                raise RuntimeError("candidate list unavailable")
            return _Rpc(self.rows.get("demand_groups", []))
        if name == "attach_demand_to_canonical_group_v1":
            return _Rpc({
                "id": "new-demand",
                "group_id": params["p_target_group_id"] or "new-group",
                "grouping_status": "grouped",
            })
        return _Rpc({
            "id": "new-demand",
            "group_id": None,
            "grouping_status": "needs_review",
        })


def _demand(demand_id, group_id, customer_id, title, quantity, created_at):
    return {
        "id": demand_id,
        "group_id": group_id,
        "customer_id": customer_id,
        "title": title,
        "category": "Computers",
        "description": None,
        "technical_specifications": [],
        "target_quantity": quantity,
        "created_at": created_at,
        "updated_at": created_at,
        "status": "Submitted",
    }


def _normalized(demand_id, title):
    return {
        "demand_id": demand_id,
        "extraction_version": "v1",
        "product_type": title,
        "normalized_product_name": title,
        "normalized_category": "Computers",
        "mandatory_requirements": [],
        "optional_preferences": [],
        "commercial_constraints": {
            "minimum_target_unit_price": 100,
            "maximum_target_unit_price": 200,
            "currency": "USD",
        },
        "updated_at": "2026-01-01T00:00:00Z",
    }


def _candidate_client(candidate_budget=(100, 200), unknown=False):
    existing = _demand(
        "existing-demand",
        "group-1",
        "customer-old",
        "reliable laptop",
        2,
        "2026-01-01T00:00:00Z",
    )
    existing_normalized = _normalized(existing["id"], existing["title"])
    existing_normalized["commercial_constraints"].update({
        "minimum_target_unit_price": candidate_budget[0],
        "maximum_target_unit_price": candidate_budget[1],
    })
    if unknown:
        existing_normalized["mandatory_requirements"] = [
            {"name": "unrecognized_constraint", "value": "opaque"},
        ]
    group = {
        "id": "group-1",
        "product_title": "reliable laptop",
        "category": "Computers",
        "group_status": "Proposed",
        "status": "Forming",
        "bidding_status": "closed",
        "approved_at": None,
        "approved_by": None,
        "offers_count": 0,
        "created_at": "2026-01-01T00:00:00Z",
    }
    member = {
        "group_id": "group-1",
        "customer_id": "customer-old",
        "demand_id": "existing-demand",
        "quantity_committed": 2,
        "membership_status": "active",
        "removed_at": None,
    }
    new_demand = _demand(
        "new-demand",
        None,
        "customer-new",
        "laptop suitable",
        3,
        "2026-01-02T00:00:00Z",
    )
    rows = {
        "demand_normalized_requirements": [
            _normalized("new-demand", "laptop suitable"),
            existing_normalized,
        ],
        "demand_groups": [group],
        "demand_group_redirects": [],
        "demands": [existing],
        "demand_group_members": [member],
    }
    return _Client(rows), new_demand


def _append_candidate_group(client, group_id, budget=(100, 200), created_at="2026-01-03T00:00:00Z"):
    demand_id = f"{group_id}-demand"
    customer_id = f"{group_id}-customer"
    existing = _demand(
        demand_id,
        group_id,
        customer_id,
        "reliable laptop",
        1,
        created_at,
    )
    normalized = _normalized(demand_id, existing["title"])
    normalized["commercial_constraints"].update({
        "minimum_target_unit_price": budget[0],
        "maximum_target_unit_price": budget[1],
    })
    client.rows["demand_groups"].append({
        "id": group_id,
        "product_title": "reliable laptop",
        "category": "Computers",
        "group_status": "Proposed",
        "status": "Forming",
        "bidding_status": "closed",
        "approved_at": None,
        "approved_by": None,
        "offers_count": 0,
        "created_at": created_at,
    })
    client.rows["demands"].append(existing)
    client.rows["demand_normalized_requirements"].append(normalized)
    client.rows["demand_group_members"].append({
        "group_id": group_id,
        "customer_id": customer_id,
        "demand_id": demand_id,
        "quantity_committed": 1,
        "membership_status": "active",
        "removed_at": None,
    })
    return demand_id


@pytest.mark.anyio
async def test_compatible_candidate_is_attached_with_snapshot(embeddings):
    client, demand = _candidate_client()

    result = await try_group_new_demand(demand, client)

    assert result["grouping_status"] == "grouped"
    name, params = next(
        (name, params) for name, params in client.rpc_calls
        if name == "attach_demand_to_canonical_group_v1"
    )
    assert name == "attach_demand_to_canonical_group_v1"
    assert params["p_target_group_id"] == "group-1"
    assert params["p_product_family_key"] == "laptop"
    assert params["p_expected_candidate_group_ids"] == ["group-1"]
    assert params["p_candidate_snapshots"][0]["demand_ids"] == ["existing-demand"]
    assert params["p_candidate_snapshots"][0]["memberships"][0]["customer_id"] == "customer-old"
    revision = params["p_candidate_snapshots"][0]["revisions"][0]
    assert revision["normalized_snapshot"]["product_type"] == "reliable laptop"
    assert "updated_at" not in revision["normalized_snapshot"]
    assert len(embeddings.generate_calls) == 1
    assert embeddings.persist_calls[0][0] == "new-demand"
    assert embeddings.search_calls[0][1]["exclude_demand_id"] == "new-demand"
    assert all(
        name not in {"propose_demand_group_merge_v1", "merge_demand_group_request_v1"}
        for name, _ in client.rpc_calls
    )


@pytest.mark.anyio
async def test_incompatible_budget_candidate_creates_a_separate_group(embeddings):
    client, demand = _candidate_client(candidate_budget=(300, 400))

    result = await try_group_new_demand(demand, client)

    assert result["grouping_status"] == "grouped"
    _, params = next(
        (name, params) for name, params in client.rpc_calls
        if name == "attach_demand_to_canonical_group_v1"
    )
    assert params["p_target_group_id"] is None
    assert params["p_singleton_reason"] == "no_compatible_existing_group"


@pytest.mark.anyio
async def test_unresolved_mandatory_requirement_stays_in_needs_review(embeddings):
    client, demand = _candidate_client(unknown=True)

    result = await try_group_new_demand(demand, client)

    assert result["grouping_status"] == "needs_review"
    assert client.rpc_calls[-1] == (
        "set_demand_grouping_review_v1",
        {
            "p_demand_id": "new-demand",
            "p_customer_id": "customer-new",
            "p_reason": "candidate_compatibility_unresolved",
        },
    )


@pytest.mark.anyio
async def test_compatible_candidate_does_not_override_another_unresolved_candidate(embeddings):
    client, demand = _candidate_client()
    unresolved_group = {
        **deepcopy(client.rows["demand_groups"][0]),
        "id": "group-2",
        "created_at": "2026-01-03T00:00:00Z",
    }
    unresolved_demand = _demand(
        "unresolved-demand",
        "group-2",
        "customer-unresolved",
        "reliable laptop",
        1,
        "2026-01-03T00:00:00Z",
    )
    unresolved_normalized = _normalized("unresolved-demand", "reliable laptop")
    unresolved_normalized["mandatory_requirements"] = [
        {"name": "unrecognized_constraint", "value": "opaque"},
    ]
    unresolved_member = {
        **deepcopy(client.rows["demand_group_members"][0]),
        "group_id": "group-2",
        "customer_id": "customer-unresolved",
        "demand_id": "unresolved-demand",
        "quantity_committed": 1,
    }
    client.rows["demand_groups"].append(unresolved_group)
    client.rows["demands"].append(unresolved_demand)
    client.rows["demand_normalized_requirements"].append(unresolved_normalized)
    client.rows["demand_group_members"].append(unresolved_member)
    embeddings.candidates.append(DemandEmbeddingCandidate("unresolved-demand", 0.2, 0.8))

    result = await try_group_new_demand(demand, client)

    assert result["grouping_status"] == "needs_review"
    assert client.rpc_calls[-1][0] == "set_demand_grouping_review_v1"
    assert all(name != "attach_demand_to_canonical_group_v1" for name, _ in client.rpc_calls)


@pytest.mark.anyio
async def test_unapproved_product_category_alias_never_queries_or_attaches(embeddings):
    client = _Client({})
    demand = _demand(
        "new-demand", None, "customer-new", "Bluetooth speaker", 1,
        "2026-01-01T00:00:00Z",
    )
    result = await try_group_new_demand(demand, client)

    assert result["group_id"] is None
    assert client.rpc_calls == []
    assert embeddings.generate_calls == []


@pytest.mark.anyio
async def test_unparsed_mandatory_requirement_without_candidates_stays_in_review(embeddings):
    client, demand = _candidate_client()
    client.rows["demand_groups"] = []
    client.rows["demand_group_members"] = []
    client.rows["demands"] = []
    client.rows["demand_normalized_requirements"][0]["mandatory_requirements"] = [
        {"name": "unrecognized_constraint", "value": "opaque"},
    ]
    embeddings.candidates = []

    result = await try_group_new_demand(demand, client)

    assert result["grouping_status"] == "needs_review"
    assert client.rpc_calls[-1][0] == "set_demand_grouping_review_v1"
    assert all(name != "attach_demand_to_canonical_group_v1" for name, _ in client.rpc_calls)


@pytest.mark.anyio
async def test_no_semantic_candidates_preserves_safe_singleton_creation(embeddings):
    client, demand = _candidate_client()
    client.rows["demand_groups"] = []
    client.rows["demand_group_members"] = []
    client.rows["demands"] = []
    embeddings.candidates = []

    result = await try_group_new_demand(demand, client)

    assert result["grouping_status"] == "grouped"
    _, params = next(call for call in client.rpc_calls if call[0] == "attach_demand_to_canonical_group_v1")
    assert params["p_target_group_id"] is None
    assert params["p_singleton_reason"] == "no_compatible_existing_group"


@pytest.mark.anyio
async def test_compatible_group_without_embeddings_is_still_assessed(embeddings):
    client, demand = _candidate_client()
    embeddings.candidates = []

    result = await try_group_new_demand(demand, client)

    assert result["group_id"] == "group-1"
    _, params = next(call for call in client.rpc_calls if call[0] == "attach_demand_to_canonical_group_v1")
    assert params["p_target_group_id"] == "group-1"
    assert params["p_expected_candidate_group_ids"] == ["group-1"]


@pytest.mark.anyio
async def test_compatible_group_beyond_twenty_search_hits_is_still_assessed(embeddings):
    client, demand = _candidate_client(candidate_budget=(300, 400))
    search_hit_ids = [
        _append_candidate_group(client, f"group-{index}", budget=(300, 400))
        for index in range(2, 22)
    ]
    compatible_demand_id = _append_candidate_group(client, "group-22")
    embeddings.candidates = [
        DemandEmbeddingCandidate(demand_id, 0.01 * index, 0.99)
        for index, demand_id in enumerate(search_hit_ids, start=1)
    ]

    result = await try_group_new_demand(demand, client)

    assert result["group_id"] == "group-22"
    _, params = next(call for call in client.rpc_calls if call[0] == "attach_demand_to_canonical_group_v1")
    assert params["p_target_group_id"] == "group-22"
    assert len(params["p_expected_candidate_group_ids"]) == 22
    assert compatible_demand_id not in {candidate.demand_id for candidate in embeddings.candidates}


@pytest.mark.anyio
async def test_compatible_group_beyond_cosine_threshold_is_still_assessed(embeddings):
    client, demand = _candidate_client(candidate_budget=(300, 400))
    _append_candidate_group(client, "compatible-group")
    embeddings.candidates = [DemandEmbeddingCandidate("existing-demand", 0.1, 0.9)]

    result = await try_group_new_demand(demand, client)

    assert result["group_id"] == "compatible-group"
    _, params = next(call for call in client.rpc_calls if call[0] == "attach_demand_to_canonical_group_v1")
    assert params["p_target_group_id"] == "compatible-group"


@pytest.mark.anyio
async def test_only_compatible_non_search_hit_group_is_selected(embeddings):
    client, demand = _candidate_client(candidate_budget=(300, 400))
    compatible_demand_id = _append_candidate_group(client, "compatible-group")
    embeddings.candidates = [DemandEmbeddingCandidate("existing-demand", 0.05, 0.95)]

    result = await try_group_new_demand(demand, client)

    assert result["group_id"] == "compatible-group"
    assert compatible_demand_id not in {candidate.demand_id for candidate in embeddings.candidates}


@pytest.mark.anyio
async def test_family_candidate_list_failure_routes_to_review_without_singleton(embeddings):
    client, demand = _candidate_client()
    client.fail_family_candidate_read = True

    result = await try_group_new_demand(demand, client)

    assert result["grouping_status"] == "needs_review"
    assert client.rpc_calls[-1][0] == "set_demand_grouping_review_v1"
    assert all(name != "attach_demand_to_canonical_group_v1" for name, _ in client.rpc_calls)


@pytest.mark.anyio
async def test_embedding_generation_failure_routes_to_review(embeddings):
    client, demand = _candidate_client()
    embeddings.generate_error = RuntimeError("provider unavailable")

    result = await try_group_new_demand(demand, client)

    assert result["grouping_status"] == "needs_review"
    assert client.rpc_calls[-1] == (
        "set_demand_grouping_review_v1",
        {
            "p_demand_id": "new-demand",
            "p_customer_id": "customer-new",
            "p_reason": "compatibility_assessment_failed",
        },
    )
    assert embeddings.persist_calls == []


@pytest.mark.anyio
async def test_embedding_persistence_failure_routes_to_review(embeddings):
    client, demand = _candidate_client()
    embeddings.persist_error = RuntimeError("write failed")

    result = await try_group_new_demand(demand, client)

    assert result["grouping_status"] == "needs_review"
    assert client.rpc_calls[-1][0] == "set_demand_grouping_review_v1"
    assert embeddings.search_calls == []
    assert all(name != "attach_demand_to_canonical_group_v1" for name, _ in client.rpc_calls)


@pytest.mark.anyio
async def test_candidate_rpc_failure_routes_to_review(embeddings):
    client, demand = _candidate_client()
    embeddings.search_error = RuntimeError("rpc unavailable")

    result = await try_group_new_demand(demand, client)

    assert result["grouping_status"] == "needs_review"
    assert client.rpc_calls[-1][0] == "set_demand_grouping_review_v1"
    assert all(name != "attach_demand_to_canonical_group_v1" for name, _ in client.rpc_calls)


@pytest.mark.anyio
async def test_ineligible_semantic_candidate_is_not_attached(embeddings):
    client, demand = _candidate_client()
    client.rows["demand_groups"][0]["status"] = "Approved"

    result = await try_group_new_demand(demand, client)

    assert result["grouping_status"] == "needs_review"
    assert client.rpc_calls[-1][0] == "set_demand_grouping_review_v1"
    assert all(name != "attach_demand_to_canonical_group_v1" for name, _ in client.rpc_calls)


@pytest.mark.anyio
async def test_same_customer_demands_delegate_quantity_aggregation_to_atomic_rpc(embeddings):
    client, demand = _candidate_client()
    client.rows["demands"][0]["customer_id"] = "customer-new"
    client.rows["demand_group_members"][0]["customer_id"] = "customer-new"

    result = await try_group_new_demand(demand, client)

    assert result["grouping_status"] == "grouped"
    _, params = next(call for call in client.rpc_calls if call[0] == "attach_demand_to_canonical_group_v1")
    assert params["p_customer_id"] == "customer-new"
    assert params["p_target_group_id"] == "group-1"
    assert params["p_candidate_snapshots"][0]["memberships"][0]["quantity_committed"] == 2


@pytest.mark.anyio
async def test_duplicate_grouping_retry_does_not_repeat_embedding_or_attachment(embeddings):
    client, demand = _candidate_client()

    first = await try_group_new_demand(demand, client)
    second = await try_group_new_demand(first, client)

    assert second == first
    assert len(embeddings.generate_calls) == 1
    assert len(embeddings.persist_calls) == 1
    assert len(embeddings.search_calls) == 1
    assert sum(name == "attach_demand_to_canonical_group_v1" for name, _ in client.rpc_calls) == 1