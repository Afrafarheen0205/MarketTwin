import hashlib
import json
from datetime import datetime
from types import SimpleNamespace

import httpx
import pytest

from app.core.config import Settings
from app.services import demand_embedding_service as embedding_service_module
from app.services.ai.base import AIProviderInvalidResponse, AIProviderTimeout, AIProviderUnavailable
from app.services.demand_embedding_service import (
    EMBEDDING_DIMENSIONS,
    DemandEmbeddingCandidate,
    DemandEmbeddingService,
    DemandEmbeddingPersistenceError,
    DemandEmbeddingResult,
    DemandEmbeddingSearchError,
    build_embedding_input,
    persist_demand_embedding,
    search_demand_embedding_candidates,
)


def _demand():
    return {
        "product_name": "Wireless over-ear headphones",
        "product_type": "Wireless over-ear headphones",
        "category": "Electronics / Audio / Headphones",
        "description": "For work calls and entertainment.",
        "mandatory_requirements": {
            "battery_life": "at least 30 hours",
            "charging_port": "USB Type-C",
        },
        "optional_preferences": {"design": "foldable"},
    }


def _settings(**overrides):
    return Settings(
        _env_file=None,
        OLLAMA_EMBEDDING_BASE_URL="http://ollama.test",
        OLLAMA_EMBEDDING_MODEL="nomic-embed-test",
        OLLAMA_EMBEDDING_VERSION="test-v1",
        OLLAMA_EMBEDDING_TIMEOUT_SECONDS=12,
        **overrides,
    )


def _response(vector=None):
    return {"embeddings": [vector if vector is not None else [0.125] * EMBEDDING_DIMENSIONS]}


@pytest.mark.anyio
async def test_generate_uses_embed_endpoint_and_returns_structured_result():
    calls = []

    async def handle_request(request):
        calls.append(request)
        return httpx.Response(200, json=_response())

    service = DemandEmbeddingService(_settings(), httpx.MockTransport(handle_request))
    result = await service.generate(_demand())

    assert str(calls[0].url) == "http://ollama.test/api/embed"
    payload = json.loads(calls[0].content)
    assert payload["model"] == "nomic-embed-test"
    assert payload["input"] == build_embedding_input(_demand())
    assert len(result.embedding) == 768
    assert result.embedding_model == "nomic-embed-test"
    assert result.embedding_version == "test-v1"
    assert result.input_hash == hashlib.sha256(
        f"test-v1\0{payload['input']}".encode("utf-8")
    ).hexdigest()


@pytest.mark.anyio
async def test_generate_rejects_incorrect_dimensions():
    async def handle_request(_):
        return httpx.Response(200, json=_response([0.1] * (EMBEDDING_DIMENSIONS - 1)))

    service = DemandEmbeddingService(_settings(), httpx.MockTransport(handle_request))
    with pytest.raises(AIProviderInvalidResponse, match="exactly 768"):
        await service.generate(_demand())


@pytest.mark.anyio
@pytest.mark.parametrize(
    "body",
    [
        {},
        {"embeddings": []},
        {"embeddings": [[]]},
    ],
)
async def test_generate_rejects_empty_or_malformed_responses(body):
    async def handle_request(_):
        return httpx.Response(200, json=body)

    service = DemandEmbeddingService(_settings(), httpx.MockTransport(handle_request))
    with pytest.raises(AIProviderInvalidResponse):
        await service.generate(_demand())


@pytest.mark.anyio
async def test_generate_rejects_non_json_response():
    async def handle_request(_):
        return httpx.Response(200, text="not-json")

    service = DemandEmbeddingService(_settings(), httpx.MockTransport(handle_request))
    with pytest.raises(AIProviderInvalidResponse):
        await service.generate(_demand())


@pytest.mark.anyio
@pytest.mark.parametrize("invalid_value", [float("nan"), float("inf"), float("-inf")])
async def test_generate_rejects_non_finite_values(invalid_value):
    vector = [0.1] * EMBEDDING_DIMENSIONS
    vector[0] = invalid_value

    async def handle_request(_):
        return httpx.Response(
            200,
            content=json.dumps(_response(vector), allow_nan=True),
            headers={"content-type": "application/json"},
        )

    service = DemandEmbeddingService(_settings(), httpx.MockTransport(handle_request))
    with pytest.raises(AIProviderInvalidResponse, match="non-finite"):
        await service.generate(_demand())


@pytest.mark.anyio
async def test_generate_maps_connection_failure_to_unavailable():
    async def handle_request(request):
        raise httpx.ConnectError("connection refused", request=request)

    service = DemandEmbeddingService(_settings(), httpx.MockTransport(handle_request))
    with pytest.raises(AIProviderUnavailable):
        await service.generate(_demand())


@pytest.mark.anyio
async def test_generate_maps_timeout_to_timeout_error():
    async def handle_request(request):
        raise httpx.ReadTimeout("timed out", request=request)

    service = DemandEmbeddingService(_settings(), httpx.MockTransport(handle_request))
    with pytest.raises(AIProviderTimeout):
        await service.generate(_demand())


@pytest.mark.anyio
async def test_generate_maps_http_errors_to_unavailable():
    async def handle_request(_):
        return httpx.Response(503, json={"error": "provider unavailable"})

    service = DemandEmbeddingService(_settings(), httpx.MockTransport(handle_request))
    with pytest.raises(AIProviderUnavailable):
        await service.generate(_demand())


def test_embedding_input_and_hash_are_deterministic_for_mapping_order():
    first = _demand()
    second = {
        **first,
        "mandatory_requirements": {
            "charging_port": "USB Type-C",
            "battery_life": "at least 30 hours",
        },
    }

    assert build_embedding_input(first) == build_embedding_input(second)


@pytest.mark.anyio
@pytest.mark.parametrize(
    "field,value",
    [
        ("description", "For conference calls."),
        ("category", "Electronics / Audio"),
        ("mandatory_requirements", {"battery_life": "at least 40 hours"}),
        ("optional_preferences", {"design": "on-ear"}),
    ],
)
async def test_input_hash_changes_when_relevant_demand_information_changes(field, value):
    async def handle_request(_):
        return httpx.Response(200, json=_response())

    service = DemandEmbeddingService(_settings(), httpx.MockTransport(handle_request))
    original = await service.generate(_demand())
    changed_demand = {**_demand(), field: value}
    changed = await service.generate(changed_demand)

    assert original.input_hash != changed.input_hash


def test_non_numeric_embedding_values_are_rejected():
    from app.services.demand_embedding_service import _validated_embedding

    vector = [0.1] * EMBEDDING_DIMENSIONS
    vector[0] = True
    with pytest.raises(AIProviderInvalidResponse, match="non-numeric"):
        _validated_embedding(_response(vector))


class FakeEmbeddingQuery:
    def __init__(self, client):
        self.client = client
        self.operation = None
        self.payload = None
        self.conflict_key = None

    def select(self, _columns):
        self.operation = "select"
        return self

    def eq(self, _column, value):
        self.client.selected_demand_id = value
        return self

    def upsert(self, payload, on_conflict):
        self.operation = "upsert"
        self.payload = payload
        self.conflict_key = on_conflict
        return self

    def execute(self):
        if self.client.fail_on == self.operation:
            raise ConnectionError("mock database connection failure")
        if self.operation == "select":
            data = [self.client.row] if self.client.row else []
            return SimpleNamespace(data=data)
        if self.operation == "upsert":
            self.client.upsert_calls.append(
                {"payload": self.payload, "on_conflict": self.conflict_key}
            )
            self.client.row = dict(self.payload)
            if self.client.empty_upsert_result:
                return SimpleNamespace(data=[])
            return SimpleNamespace(data=[self.client.row])
        raise AssertionError(f"Unexpected operation: {self.operation}")


class FakeEmbeddingClient:
    def __init__(self, row=None, fail_on=None, empty_upsert_result=False):
        self.row = row
        self.fail_on = fail_on
        self.empty_upsert_result = empty_upsert_result
        self.upsert_calls = []
        self.selected_demand_id = None

    def table(self, table_name):
        assert table_name == "demand_embeddings"
        return FakeEmbeddingQuery(self)


def _embedding_result(**overrides):
    values = {
        "embedding": [0.25] * EMBEDDING_DIMENSIONS,
        "embedding_model": "nomic-embed-text",
        "embedding_version": "v1",
        "input_hash": "hash-a",
    }
    values.update(overrides)
    return DemandEmbeddingResult(**values)


def _stored_row(**overrides):
    row = {
        "embedding_model": "nomic-embed-text",
        "embedding_version": "v1",
        "input_hash": "hash-a",
    }
    row.update(overrides)
    return row


def test_persist_demand_embedding_inserts_with_demand_id_and_metadata():
    client = FakeEmbeddingClient()

    outcome = persist_demand_embedding("demand-123", _embedding_result(), client)

    assert outcome == "saved"
    assert client.selected_demand_id == "demand-123"
    assert len(client.upsert_calls) == 1
    call = client.upsert_calls[0]
    assert call["on_conflict"] == "demand_id"
    assert {
        key: value for key, value in call["payload"].items() if key != "updated_at"
    } == {
        "demand_id": "demand-123",
        "embedding": [0.25] * EMBEDDING_DIMENSIONS,
        "embedding_model": "nomic-embed-text",
        "embedding_version": "v1",
        "input_hash": "hash-a",
    }
    datetime.fromisoformat(call["payload"]["updated_at"])


def test_persist_uses_service_role_client_by_default(monkeypatch):
    service_client = FakeEmbeddingClient()
    monkeypatch.setattr(
        embedding_service_module,
        "get_supabase_service_client",
        lambda: service_client,
    )

    assert persist_demand_embedding("demand-123", _embedding_result()) == "saved"
    assert len(service_client.upsert_calls) == 1


def test_persist_preserves_explicit_client_injection(monkeypatch):
    injected_client = FakeEmbeddingClient()

    def unexpected_default_client():
        pytest.fail("An explicitly injected client should be used directly.")

    monkeypatch.setattr(
        embedding_service_module,
        "get_supabase_service_client",
        unexpected_default_client,
    )

    assert persist_demand_embedding("demand-123", _embedding_result(), injected_client) == "saved"
    assert len(injected_client.upsert_calls) == 1


def test_persist_demand_embedding_skips_update_when_metadata_matches():
    client = FakeEmbeddingClient(row=_stored_row())

    outcome = persist_demand_embedding("demand-123", _embedding_result(), client)

    assert outcome == "unchanged"
    assert client.upsert_calls == []


def test_persist_demand_embedding_updates_when_input_hash_changes():
    client = FakeEmbeddingClient(row=_stored_row(input_hash="old-hash"))

    outcome = persist_demand_embedding(
        "demand-123",
        _embedding_result(input_hash="new-hash"),
        client,
    )

    assert outcome == "saved"
    assert client.upsert_calls[0]["payload"]["input_hash"] == "new-hash"


@pytest.mark.parametrize(
    "field,value",
    [("embedding_model", "another-model"), ("embedding_version", "v2")],
)
def test_persist_demand_embedding_updates_when_model_or_version_changes(field, value):
    client = FakeEmbeddingClient(row=_stored_row(**{field: "old-value"}))

    outcome = persist_demand_embedding(
        "demand-123",
        _embedding_result(**{field: value}),
        client,
    )

    assert outcome == "saved"
    assert client.upsert_calls[0]["payload"][field] == value


@pytest.mark.parametrize("fail_on", ["select", "upsert"])
def test_persist_demand_embedding_raises_safe_error_on_database_failure(fail_on, caplog):
    client = FakeEmbeddingClient(fail_on=fail_on)

    with pytest.raises(DemandEmbeddingPersistenceError, match="Could not persist"):
        persist_demand_embedding("demand-private", _embedding_result(), client)

    assert "demand-private" not in caplog.text
    assert "0.25" not in caplog.text
    assert "hash-a" not in caplog.text


def test_repeated_persistence_is_idempotent():
    client = FakeEmbeddingClient()
    result = _embedding_result()

    first = persist_demand_embedding("demand-123", result, client)
    second = persist_demand_embedding("demand-123", result, client)

    assert first == "saved"
    assert second == "unchanged"
    assert len(client.upsert_calls) == 1


def test_persist_demand_embedding_does_not_report_success_without_write_confirmation():
    client = FakeEmbeddingClient(empty_upsert_result=True)

    with pytest.raises(DemandEmbeddingPersistenceError, match="did not confirm"):
        persist_demand_embedding("demand-123", _embedding_result(), client)


class FakeEmbeddingRpc:
    def __init__(self, rows=None, failure=None):
        self.rows = rows if rows is not None else []
        self.failure = failure
        self.call = None

    def rpc(self, function_name, params):
        self.call = (function_name, params)
        return self

    def execute(self):
        if self.failure:
            raise self.failure
        return SimpleNamespace(data=self.rows)


def _candidate_row(demand_id, cosine_distance, **extra):
    return {"demand_id": demand_id, "cosine_distance": cosine_distance, **extra}


def _search(client, **overrides):
    options = {
        "query_embedding": [0.125] * EMBEDDING_DIMENSIONS,
        "embedding_model": "nomic-embed-text",
        "embedding_version": "v1",
        "client": client,
    }
    options.update(overrides)
    return search_demand_embedding_candidates(**options)


def test_search_candidates_passes_768_vector_and_explicit_version_filters():
    client = FakeEmbeddingRpc([])

    result = _search(client)

    function_name, params = client.call
    assert function_name == "search_demand_embedding_candidates_v1"
    assert len(params["p_query_embedding"]) == 768
    assert params["p_query_embedding"] == [0.125] * EMBEDDING_DIMENSIONS
    assert params["p_embedding_model"] == "nomic-embed-text"
    assert params["p_embedding_version"] == "v1"
    assert result == []


def test_search_candidates_matches_migration_rpc_contract():
    client = FakeEmbeddingRpc([_candidate_row("demand-123", 0.2)])
    query_embedding = [0.125] * EMBEDDING_DIMENSIONS

    result = search_demand_embedding_candidates(
        query_embedding=query_embedding,
        embedding_model="nomic-embed-text",
        embedding_version="v1",
        exclude_demand_id="demand-self",
        candidate_limit=7,
        max_cosine_distance=0.35,
        client=client,
    )

    function_name, params = client.call
    assert function_name == "search_demand_embedding_candidates_v1"
    assert params == {
        "p_query_embedding": query_embedding,
        "p_exclude_demand_id": "demand-self",
        "p_candidate_limit": 7,
        "p_max_cosine_distance": 0.35,
        "p_embedding_model": "nomic-embed-text",
        "p_embedding_version": "v1",
    }
    assert result == [DemandEmbeddingCandidate("demand-123", 0.2, 0.8)]


def test_search_uses_service_role_client_by_default(monkeypatch):
    service_client = FakeEmbeddingRpc([])
    monkeypatch.setattr(
        embedding_service_module,
        "get_supabase_service_client",
        lambda: service_client,
    )

    assert _search(None) == []
    assert service_client.call[0] == "search_demand_embedding_candidates_v1"


def test_search_preserves_explicit_client_injection(monkeypatch):
    injected_client = FakeEmbeddingRpc([])

    def unexpected_default_client():
        pytest.fail("An explicitly injected client should be used directly.")

    monkeypatch.setattr(
        embedding_service_module,
        "get_supabase_service_client",
        unexpected_default_client,
    )

    assert _search(injected_client) == []
    assert injected_client.call[0] == "search_demand_embedding_candidates_v1"


@pytest.mark.parametrize("vector", [[0.1] * (EMBEDDING_DIMENSIONS - 1)])
def test_search_candidates_rejects_incorrect_dimension_before_rpc(vector):
    client = FakeEmbeddingRpc()

    with pytest.raises(AIProviderInvalidResponse, match="768"):
        _search(client, query_embedding=vector)

    assert client.call is None


@pytest.mark.parametrize("invalid_value", [float("nan"), float("inf"), float("-inf")])
def test_search_candidates_rejects_non_finite_vector_values_before_rpc(invalid_value):
    vector = [0.1] * EMBEDDING_DIMENSIONS
    vector[0] = invalid_value
    client = FakeEmbeddingRpc()

    with pytest.raises(AIProviderInvalidResponse, match="finite"):
        _search(client, query_embedding=vector)

    assert client.call is None


def test_search_candidates_sorts_by_cosine_distance_and_returns_similarity_only():
    client = FakeEmbeddingRpc(
        [
            _candidate_row("demand-2", 0.3, embedding=[0.1] * EMBEDDING_DIMENSIONS),
            _candidate_row("demand-1", 0.1),
        ]
    )

    results = _search(client)

    assert results == [
        DemandEmbeddingCandidate("demand-1", 0.1, 0.9),
        DemandEmbeddingCandidate("demand-2", 0.3, 0.7),
    ]
    assert all(not hasattr(candidate, "embedding") for candidate in results)


def test_search_candidates_passes_limit_and_caps_returned_rows():
    client = FakeEmbeddingRpc(
        [_candidate_row(f"demand-{index}", index / 100) for index in range(5)]
    )

    results = _search(client, candidate_limit=2)

    assert client.call[1]["p_candidate_limit"] == 2
    assert [candidate.demand_id for candidate in results] == ["demand-0", "demand-1"]


def test_search_candidates_passes_and_applies_current_demand_exclusion():
    client = FakeEmbeddingRpc(
        [_candidate_row("demand-current", 0.1), _candidate_row("demand-other", 0.2)]
    )

    results = _search(client, exclude_demand_id="demand-current")

    assert client.call[1]["p_exclude_demand_id"] == "demand-current"
    assert [candidate.demand_id for candidate in results] == ["demand-other"]


def test_search_candidates_passes_and_applies_maximum_distance():
    client = FakeEmbeddingRpc(
        [_candidate_row("demand-near", 0.2), _candidate_row("demand-far", 0.8)]
    )

    results = _search(client, max_cosine_distance=0.5)

    assert client.call[1]["p_max_cosine_distance"] == 0.5
    assert [candidate.demand_id for candidate in results] == ["demand-near"]


def test_search_candidates_returns_empty_results():
    assert _search(FakeEmbeddingRpc([])) == []


def test_search_candidates_maps_rpc_failure_without_leaking_query_data(caplog):
    client = FakeEmbeddingRpc(failure=RuntimeError("private rpc details"))
    query_vector = [0.125] * EMBEDDING_DIMENSIONS

    with pytest.raises(DemandEmbeddingSearchError, match="Could not search"):
        _search(client, query_embedding=query_vector)

    assert "private rpc details" not in caplog.text
    assert "0.125" not in caplog.text


def test_search_candidates_rejects_invalid_rpc_scores_without_returning_vectors():
    client = FakeEmbeddingRpc([_candidate_row("demand-1", float("nan"))])

    with pytest.raises(DemandEmbeddingSearchError, match="invalid scores"):
        _search(client)
