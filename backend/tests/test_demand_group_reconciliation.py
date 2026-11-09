import json
from types import SimpleNamespace

from scripts import reconcile_semantic_demand_groups as reconciliation
from app.services.demand_embedding_service import (
    EMBEDDING_DIMENSIONS,
    StoredDemandEmbedding,
    build_embedding_input,
    calculate_embedding_input_hash,
    get_demand_embedding,
    DemandEmbeddingCandidate,
)


class _ReadQuery:
    def __init__(self, client, table):
        self.client = client
        self.table_name = table
        self.filters = {}
        self.columns = None

    def select(self, columns):
        self.client.operations.append((self.table_name, "select"))
        self.columns = columns
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def in_(self, column, values):
        self.filters[column] = values
        return self

    def limit(self, _limit):
        return self

    def execute(self):
        rows = self.client.rows.get(self.table_name, [])
        selected = []
        for row in rows:
            matches = all(
                row.get(column) in value if isinstance(value, list) else row.get(column) == value
                for column, value in self.filters.items()
            )
            if matches:
                selected.append(row)
        return SimpleNamespace(data=selected)


class _ReadOnlyClient:
    def __init__(self, rows):
        self.rows = rows
        self.operations = []

    def table(self, table_name):
        return _ReadQuery(self, table_name)


def _demand(demand_id, group_id):
    return {
        "id": demand_id,
        "title": "Samsung Galaxy smartphone",
        "category": "Electronics / Mobile Phones",
        "description": "Business smartphone",
        "group_id": group_id,
    }


def _normalized(demand_id):
    return {
        "demand_id": demand_id,
        "extraction_version": "v1",
        "product_type": "Samsung Galaxy smartphone",
        "normalized_product_name": "Samsung Galaxy smartphone",
        "normalized_category": "Electronics / Mobile Phones",
        "mandatory_requirements": [],
        "optional_preferences": [],
        "commercial_constraints": {},
    }


def test_get_demand_embedding_reads_vector_and_metadata_without_writes():
    demand_id = reconciliation.DEMAND_IDS[0]
    vector = [0.125] * EMBEDDING_DIMENSIONS
    client = _ReadOnlyClient({
        "demand_embeddings": [{
            "demand_id": demand_id,
            "embedding": json.dumps(vector),
            "embedding_model": "nomic-embed-text",
            "embedding_version": "v1",
            "input_hash": "current-hash",
        }]
    })

    result = get_demand_embedding(demand_id, client=client)

    assert result == StoredDemandEmbedding(vector, "nomic-embed-text", "v1", "current-hash")
    assert client.operations == [("demand_embeddings", "select")]


def test_dry_run_deduplicates_pairs_and_reads_existing_groups_only(monkeypatch):
    demand_id_a, demand_id_b = reconciliation.DEMAND_IDS[:2]
    group_id_a, group_id_b = "group-a", "group-b"
    demands = {
        demand_id_a: _demand(demand_id_a, group_id_a),
        demand_id_b: _demand(demand_id_b, group_id_b),
    }
    normalized_rows = {demand_id: _normalized(demand_id) for demand_id in demands}
    vectors = {demand_id: [0.25] * EMBEDDING_DIMENSIONS for demand_id in demands}
    settings = SimpleNamespace(
        OLLAMA_EMBEDDING_MODEL="nomic-embed-text",
        OLLAMA_EMBEDDING_VERSION="embedding-v1",
    )
    database = _ReadOnlyClient({
        "demands": list(demands.values()),
        "demand_group_members": [],
        "demand_normalized_requirements": list(normalized_rows.values()),
    })
    search_calls = []
    normalized_versions = []

    monkeypatch.setattr(reconciliation, "get_settings", lambda: settings)
    monkeypatch.setattr(
        reconciliation,
        "get_demand",
        lambda _customer_id, demand_id: demands.get(demand_id),
    )
    monkeypatch.setattr(
        reconciliation,
        "get_normalized",
        lambda demand_id, version: normalized_versions.append(version) or normalized_rows.get(demand_id),
    )

    def stored_embedding(demand_id):
        demand = demands[demand_id]
        normalized = normalized_rows[demand_id]
        input_data = reconciliation._embedding_input_data(demand, normalized)
        input_hash = calculate_embedding_input_hash(build_embedding_input(input_data), "embedding-v1")
        return StoredDemandEmbedding(vectors[demand_id], "nomic-embed-text", "embedding-v1", input_hash)

    monkeypatch.setattr(reconciliation, "get_demand_embedding", stored_embedding)

    def search_candidates(vector, **kwargs):
        search_calls.append(kwargs["exclude_demand_id"])
        other_id = demand_id_b if kwargs["exclude_demand_id"] == demand_id_a else demand_id_a
        return [DemandEmbeddingCandidate(other_id, 0.1, 0.9)]

    monkeypatch.setattr(reconciliation, "search_demand_embedding_candidates", search_candidates)
    monkeypatch.setattr(reconciliation, "get_supabase_service_client", lambda: database)

    report = reconciliation.build_dry_run_report()

    assert report["mode"] == "dry_run"
    assert report["writes_enabled"] is False
    assert report["apply_available"] is False
    assert report["compatibility_normalization_version"] == "v2"
    assert normalized_versions == ["v1"] * len(demands)
    assert report["embedding_version"] == "embedding-v1"
    assert [row["embedding_status"] for row in report["embedding_status"][:2]] == ["reused", "reused"]
    assert len(report["candidate_pairs"]) == 1
    pair = report["candidate_pairs"][0]
    assert pair["demand_ids"] == sorted([demand_id_a, demand_id_b])
    assert pair["cosine_distance"] == 0.1
    assert pair["compatibility"] == "compatible"
    assert len(report["proposed_groups"]) == 1
    assert report["proposed_groups"][0]["current_group_ids"] == [group_id_a, group_id_b]
    assert report["proposed_groups"][0]["requires_existing_group_reconciliation"] is True
    assert len(search_calls) == 2
    assert all(operation == "select" for _, operation in database.operations)

    database.rows["demand_normalized_requirements"] = [normalized_rows[demand_id_a]]
    incomplete_report = reconciliation.build_dry_run_report()
    assert incomplete_report["proposed_groups"][0]["compatibility"] == "needs_review"
    assert "existing_group_normalized_requirements_missing" in incomplete_report["proposed_groups"][0]["reasons"]


def test_dry_run_does_not_regenerate_missing_embeddings(monkeypatch):
    demand_id = reconciliation.DEMAND_IDS[0]
    demand = _demand(demand_id, None)
    normalized = _normalized(demand_id)
    monkeypatch.setattr(
        reconciliation,
        "get_settings",
        lambda: SimpleNamespace(
            OLLAMA_EMBEDDING_MODEL="nomic-embed-text",
            OLLAMA_EMBEDDING_VERSION="embedding-v1",
        ),
    )
    monkeypatch.setattr(
        reconciliation,
        "get_demand",
        lambda _customer_id, requested_id: demand if requested_id == demand_id else None,
    )
    monkeypatch.setattr(
        reconciliation,
        "get_normalized",
        lambda requested_id, version: normalized if requested_id == demand_id else None,
    )
    monkeypatch.setattr(reconciliation, "get_demand_embedding", lambda _demand_id: None)

    report = reconciliation.build_dry_run_report()

    assert len(report["embedding_status"]) == len(reconciliation.DEMAND_IDS)
    assert report["embedding_status"][0]["embedding_status"] == "embedding_missing"
    assert all(row["embedding_status"] == "demand_not_found" for row in report["embedding_status"][1:])
    assert report["candidate_pairs"] == []
    assert report["proposed_groups"] == []