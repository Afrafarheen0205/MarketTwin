import asyncio
import logging
import sys
from pathlib import Path
from typing import Any, Optional

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.services.ai.base import (
    AIProviderInvalidResponse,
    AIProviderTimeout,
    AIProviderUnavailable,
)
from app.services.demand_embedding_service import (
    DemandEmbeddingService,
    DemandEmbeddingPersistenceError,
    persist_demand_embedding,
)
from app.services.demand_service import get_demand, list_demands
from app.services.normalized_requirement_service import get_normalized

CUSTOMER_ID = "4052c4af-bd4d-43c2-b412-8a8e266e939a"
ALREADY_PROCESSED_DEMAND_ID = "576178d6-3fa1-4c3d-a5ba-114f587de39d"
PAGE_SIZE = 100

logging.getLogger("markettwin.supabase").disabled = True


def _list_all_submitted_demands() -> list[dict[str, Any]]:
    demands = []
    page = 1
    total = 0

    while True:
        page_demands, total = list_demands(
            CUSTOMER_ID,
            page=page,
            page_size=PAGE_SIZE,
            status="Submitted",
        )
        demands.extend(page_demands)
        if len(demands) >= total:
            return demands
        if not page_demands:
            raise RuntimeError("Submitted demand listing returned incomplete pages.")
        page += 1


def _embedding_error_category(error: Exception) -> str:
    if isinstance(error, AIProviderTimeout):
        return "embedding_timeout"
    if isinstance(error, AIProviderUnavailable):
        return "embedding_unavailable"
    if isinstance(error, AIProviderInvalidResponse):
        return "invalid_embedding_response"
    return "embedding_generation_failed"


async def _process_demand(
    demand_id: str,
    embedding_service: DemandEmbeddingService,
) -> tuple[str, str]:
    try:
        demand = get_demand(CUSTOMER_ID, demand_id)
    except Exception:
        return demand_id, "demand_lookup_failed"
    if demand is None:
        return demand_id, "demand_not_found"
    if demand.get("status") != "Submitted":
        return demand_id, "status_changed"

    try:
        normalized = get_normalized(demand_id, version="v1")
    except Exception:
        return demand_id, "normalized_requirements_lookup_failed"
    if normalized is None:
        return demand_id, "normalized_requirements_missing"

    embedding_demand = {
        "product_name": demand.get("title") or demand.get("product_name"),
        "product_type": normalized.get("product_type"),
        "category": demand.get("category"),
        "description": demand.get("description"),
        "normalized_requirements": normalized,
    }
    try:
        result = await embedding_service.generate(embedding_demand)
    except Exception as exc:
        return demand_id, _embedding_error_category(exc)

    try:
        outcome = persist_demand_embedding(demand_id, result)
    except DemandEmbeddingPersistenceError:
        return demand_id, "persistence_failed"
    except Exception:
        return demand_id, "persistence_failed"
    return demand_id, outcome


async def run() -> int:
    try:
        demands = _list_all_submitted_demands()
    except Exception as exc:
        print(f"Submitted demand listing failed ({type(exc).__name__}).", file=sys.stderr)
        return 1

    embedding_service = DemandEmbeddingService()
    failures = 0
    skipped = 0
    processed = 0

    for item in demands:
        demand_id: Optional[str] = item.get("id")
        if not isinstance(demand_id, str) or not demand_id:
            print("unknown-demand-id: failed (missing_demand_id)")
            failures += 1
            continue
        if demand_id == ALREADY_PROCESSED_DEMAND_ID:
            print(f"{demand_id}: skipped (already_processed)")
            skipped += 1
            continue

        demand_id, outcome = await _process_demand(demand_id, embedding_service)
        if outcome in {"saved", "unchanged"}:
            print(f"{demand_id}: {outcome}")
            processed += 1
        else:
            print(f"{demand_id}: failed ({outcome})")
            failures += 1

    print(f"Backfill complete: processed={processed}, skipped={skipped}, failed={failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(run()))
    except KeyboardInterrupt:
        print("Embedding backfill interrupted.", file=sys.stderr)
        raise SystemExit(130)