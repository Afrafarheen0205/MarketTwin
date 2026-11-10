import asyncio
import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest

SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "backfill_submitted_demand_embeddings.py"
SPEC = importlib.util.spec_from_file_location("backfill_submitted_demand_embeddings", SCRIPT_PATH)
backfill = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(backfill)


class FakeEmbeddingService:
    def __init__(self):
        self.inputs = []

    async def generate(self, demand):
        self.inputs.append(demand)
        if demand["product_name"] == "fails privately":
            raise RuntimeError("private product or provider details")
        return SimpleNamespace(
            embedding_model="nomic-embed-text",
            embedding_version="v1",
        )


def _demand_item(demand_id):
    return {"id": demand_id}


def _demand_record(demand_id, title="Laptop"):
    return {
        "id": demand_id,
        "status": "Submitted",
        "title": title,
        "category": "Computers",
        "description": "private description must not be printed",
        "customer_id": "private customer data must not be printed",
    }


def _normalized():
    return {
        "product_type": "Laptop",
        "mandatory_requirements": [{"name": "ram", "value": "16GB"}],
        "optional_preferences": [],
    }


def test_backfill_pages_lists_skips_processed_and_handles_saved_and_unchanged(monkeypatch, capsys):
    page_calls = []
    demand_calls = []
    normalized_calls = []
    persistence_calls = []
    embedding_service = FakeEmbeddingService()
    page_one_ids = [f"demand-{index}" for index in range(backfill.PAGE_SIZE - 1)]
    page_one_ids.insert(0, backfill.ALREADY_PROCESSED_DEMAND_ID)
    page_two_ids = ["demand-last"]

    def fake_list_demands(customer_id, page, page_size, status):
        page_calls.append((customer_id, page, page_size, status))
        items = page_one_ids if page == 1 else page_two_ids
        return [_demand_item(demand_id) for demand_id in items], len(page_one_ids) + len(page_two_ids)

    def fake_get_demand(customer_id, demand_id):
        demand_calls.append((customer_id, demand_id))
        return _demand_record(demand_id)

    def fake_get_normalized(demand_id, version):
        normalized_calls.append((demand_id, version))
        return _normalized()

    def fake_persist(demand_id, result):
        persistence_calls.append(demand_id)
        return "unchanged" if demand_id == "demand-last" else "saved"

    monkeypatch.setattr(backfill, "list_demands", fake_list_demands)
    monkeypatch.setattr(backfill, "get_demand", fake_get_demand)
    monkeypatch.setattr(backfill, "get_normalized", fake_get_normalized)
    monkeypatch.setattr(backfill, "persist_demand_embedding", fake_persist)
    monkeypatch.setattr(backfill, "DemandEmbeddingService", lambda: embedding_service)

    exit_code = asyncio.run(backfill.run())
    output = capsys.readouterr().out

    assert exit_code == 0
    assert [call[1] for call in page_calls] == [1, 2]
    assert all(call[0] == backfill.CUSTOMER_ID and call[3] == "Submitted" for call in page_calls)
    assert all(demand_id != backfill.ALREADY_PROCESSED_DEMAND_ID for _, demand_id in demand_calls)
    assert len(embedding_service.inputs) == len(page_one_ids) - 1 + len(page_two_ids)
    assert all(version == "v1" for _, version in normalized_calls)
    assert len(persistence_calls) == len(embedding_service.inputs)
    assert f"{backfill.ALREADY_PROCESSED_DEMAND_ID}: skipped (already_processed)" in output
    assert "demand-last: unchanged" in output
    assert "private description" not in output
    assert "private customer data" not in output


def test_backfill_continues_after_an_individual_generation_failure(monkeypatch, capsys):
    ids = ["demand-fails", "demand-succeeds"]
    processed_ids = []
    embedding_service = FakeEmbeddingService()

    monkeypatch.setattr(
        backfill,
        "list_demands",
        lambda customer_id, page, page_size, status: ([_demand_item(item) for item in ids], len(ids)),
    )
    monkeypatch.setattr(
        backfill,
        "get_demand",
        lambda customer_id, demand_id: _demand_record(
            demand_id,
            "fails privately" if demand_id == "demand-fails" else "Laptop",
        ),
    )
    monkeypatch.setattr(backfill, "get_normalized", lambda demand_id, version: _normalized())
    monkeypatch.setattr(backfill, "persist_demand_embedding", lambda demand_id, result: processed_ids.append(demand_id) or "saved")
    monkeypatch.setattr(backfill, "DemandEmbeddingService", lambda: embedding_service)

    exit_code = asyncio.run(backfill.run())
    output = capsys.readouterr().out

    assert exit_code == 1
    assert processed_ids == ["demand-succeeds"]
    assert "demand-fails: failed (embedding_generation_failed)" in output
    assert "demand-succeeds: saved" in output
    assert "private product or provider details" not in output
    assert "private description" not in output


@pytest.mark.parametrize("status", ["Grouped", "Cancelled", "Under Review"])
def test_backfill_does_not_generate_or_persist_when_status_changed(monkeypatch, status, capsys):
    demand_id = "demand-status-changed"
    persisted = []

    monkeypatch.setattr(
        backfill,
        "list_demands",
        lambda customer_id, page, page_size, status: ([_demand_item(demand_id)], 1),
    )
    monkeypatch.setattr(
        backfill,
        "get_demand",
        lambda customer_id, value: {**_demand_record(value), "status": status},
    )
    monkeypatch.setattr(
        backfill,
        "get_normalized",
        lambda *_args, **_kwargs: pytest.fail("Normalization lookup should not run after status changes."),
    )
    monkeypatch.setattr(
        backfill,
        "persist_demand_embedding",
        lambda *args: persisted.append(args),
    )

    class UnexpectedEmbeddingService:
        def __init__(self):
            pass

        async def generate(self, _demand):
            pytest.fail("Embedding generation should not run after status changes.")

    monkeypatch.setattr(backfill, "DemandEmbeddingService", UnexpectedEmbeddingService)

    exit_code = asyncio.run(backfill.run())
    output = capsys.readouterr().out

    assert exit_code == 1
    assert f"{demand_id}: failed (status_changed)" in output
    assert persisted == []