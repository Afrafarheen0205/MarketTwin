import asyncio
import logging
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.services.demand_embedding_service import (
    DemandEmbeddingService,
    persist_demand_embedding,
)
from app.services.demand_service import get_demand
from app.services.normalized_requirement_service import get_normalized

DEMAND_ID = "576178d6-3fa1-4c3d-a5ba-114f587de39d"
CUSTOMER_ID = "4052c4af-bd4d-43c2-b412-8a8e266e939a"

logging.getLogger("markettwin.supabase").disabled = True


async def run() -> int:
    try:
        demand = get_demand(CUSTOMER_ID, DEMAND_ID)
        if demand is None:
            print("Target demand was not found for the configured customer.", file=sys.stderr)
            return 1
        if demand.get("status") != "Submitted":
            print("Target demand is not Submitted; embedding run aborted.", file=sys.stderr)
            return 1

        normalized = get_normalized(DEMAND_ID, version="v1")
        if normalized is None:
            print("Target demand has no normalized requirements version v1.", file=sys.stderr)
            return 1

        embedding_demand = {
            "product_name": demand.get("title") or demand.get("product_name"),
            "product_type": normalized.get("product_type"),
            "category": demand.get("category"),
            "description": demand.get("description"),
            "normalized_requirements": normalized,
        }
        result = await DemandEmbeddingService().generate(embedding_demand)
        save_result = persist_demand_embedding(DEMAND_ID, result)
    except Exception as exc:
        print(f"One-demand embedding run failed ({type(exc).__name__}).", file=sys.stderr)
        return 1

    print(f"Demand UUID: {DEMAND_ID}")
    print(f"Embedding model: {result.embedding_model}")
    print(f"Embedding version: {result.embedding_version}")
    print(f"Persistence result: {save_result}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(run()))
    except KeyboardInterrupt:
        print("One-demand embedding run interrupted.", file=sys.stderr)
        raise SystemExit(130)
