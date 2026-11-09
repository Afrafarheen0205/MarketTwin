import csv
import logging
import sys
import uuid
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.services.demand_service import list_demands

logging.getLogger("markettwin.supabase").disabled = True


def main() -> int:
    raw_customer_id = input(
        "Customer UUID from the current authenticated MarketTwin session: "
    ).strip()
    try:
        customer_id = str(uuid.UUID(raw_customer_id))
    except ValueError:
        print("A valid customer UUID is required.", file=sys.stderr)
        return 2

    try:
        demands, _ = list_demands(customer_id, status="Submitted")
    except Exception as exc:
        print(
            f"Unable to list submitted demands ({type(exc).__name__}).",
            file=sys.stderr,
        )
        return 1

    writer = csv.writer(sys.stdout, lineterminator="\n")
    writer.writerow(["Demand UUID", "Demand Code", "Product Name", "Status"])
    for demand in demands:
        writer.writerow(
            [
                demand.get("id", ""),
                demand.get("demand_code", ""),
                demand.get("title") or demand.get("product_name") or "",
                demand.get("status", ""),
            ]
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())