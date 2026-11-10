from scripts import reconcile_semantic_demand_groups as reconciliation


SURVIVOR_ID = "d1a44ed5-f108-40a1-94bc-5158953c056f"
SOURCE_ID = "22155daf-83dd-45b2-9ce0-0f79834bf209"


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, client, table):
        self.client = client
        self.table = table
        self.values = None
        self.column = None

    def select(self, *_args, **_kwargs):
        return self

    def in_(self, column, values):
        self.column = column
        self.values = set(values)
        return self

    def execute(self):
        rows = self.client.rows.get(self.table, [])
        if self.values is not None:
            rows = [row for row in rows if row.get(self.column) in self.values]
        return _Result(rows)


class _Client:
    def __init__(self, rows):
        self.rows = rows

    def table(self, name):
        return _Query(self, name)


def _group(group_id, title, created_at, quantity):
    return {
        "id": group_id,
        "product_title": title,
        "category": "Computers",
        "group_status": "Proposed",
        "status": "Forming",
        "bidding_status": "closed",
        "approved_at": None,
        "approved_by": None,
        "bidding_start": None,
        "bidding_deadline": None,
        "offers_count": 0,
        "lowest_offer_price": None,
        "top_offer_merchant": None,
        "threshold_quantity": 1,
        "deadline": None,
        "currency": None,
        "total_quantity": quantity,
        "total_requested_quantity": quantity,
        "participants_count": 1,
        "participating_demand_count": 1,
        "created_at": created_at,
    }


def _report_client(review=False):
    groups = [
        _group(SURVIVOR_ID, "laptop suitable", "2026-01-01T00:00:00Z", 1),
        _group(SOURCE_ID, "reliable laptop", "2026-01-02T00:00:00Z", 2),
    ]
    demands = [
        {"id": "demand-1", "group_id": SURVIVOR_ID, "customer_id": "customer-1", "target_quantity": 1, "status": "Submitted", "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z", "_source_normalized_updated_at": "2026-01-01T00:00:00Z"},
        {"id": "demand-2", "group_id": SOURCE_ID, "customer_id": "customer-1", "target_quantity": 2, "status": "Submitted", "created_at": "2026-01-02T00:00:00Z", "updated_at": "2026-01-02T00:00:00Z", "_source_normalized_updated_at": "2026-01-02T00:00:00Z"},
    ]
    memberships = [
        {"group_id": SURVIVOR_ID, "customer_id": "customer-1", "demand_id": "demand-1", "quantity_committed": 1, "membership_status": "active", "removed_at": None},
        {"group_id": SOURCE_ID, "customer_id": "customer-1", "demand_id": "demand-2", "quantity_committed": 2, "membership_status": "active", "removed_at": None},
    ]
    return _Client({
        "demand_groups": groups,
        "demand_group_members": memberships,
        "demand_group_reviews": ([{"group_id": SOURCE_ID}] if review else []),
        "customer_offer_selections": [],
        "merchant_offers": [],
        "orders": [],
    }), {group_id: {demand["id"]: demand for demand in demands if demand["group_id"] == group_id} for group_id in (SURVIVOR_ID, SOURCE_ID)}


def test_readonly_dry_run_includes_merge_plan_and_expected_quantity(monkeypatch):
    client, group_records = _report_client()
    monkeypatch.setattr(reconciliation, "get_supabase_service_client", lambda: client)

    plans = reconciliation._read_merge_plan_reports(
        [{"current_group_ids": [SURVIVOR_ID, SOURCE_ID], "compatibility": "compatible"}],
        group_records,
    )

    assert plans[0]["status"] == "ready_for_approval"
    assert plans[0]["survivor_group_id"] == SURVIVOR_ID
    assert plans[0]["source_group_id"] == SOURCE_ID
    assert plans[0]["expected_total_quantity"] == "3"
    assert plans[0]["database_preconditions_pending"] is True
    assert plans[0]["compatibility_report"]["status"] == "compatible"
    assert len(plans[0]["compatibility_report"]["normalized_revisions"]) == 2


def test_readonly_dry_run_surfaces_review_history_as_a_blocker(monkeypatch):
    client, group_records = _report_client(review=True)
    monkeypatch.setattr(reconciliation, "get_supabase_service_client", lambda: client)

    plans = reconciliation._read_merge_plan_reports(
        [{"current_group_ids": [SURVIVOR_ID, SOURCE_ID], "compatibility": "compatible"}],
        group_records,
    )

    assert plans[0]["status"] == "needs_review"
    assert plans[0]["reason"] == "blocking_reference:review"


def test_readonly_dry_run_attributes_selection_orders_without_group_ids(monkeypatch):
    client, group_records = _report_client()
    client.rows["customer_offer_selections"] = [
        {"id": "selection-1", "group_id": None, "demand_id": "demand-1"},
    ]
    client.rows["orders"] = [
        {"id": "order-1", "demand_id": None, "selection_id": "selection-1"},
    ]
    monkeypatch.setattr(reconciliation, "get_supabase_service_client", lambda: client)

    plans = reconciliation._read_merge_plan_reports(
        [{"current_group_ids": [SURVIVOR_ID, SOURCE_ID], "compatibility": "compatible"}],
        group_records,
    )

    assert plans[0]["status"] == "needs_review"
    assert plans[0]["reason"] == "blocking_reference:order,selection"


def test_readonly_dry_run_surfaces_group_only_offers(monkeypatch):
    client, group_records = _report_client()
    client.rows["merchant_offers"] = [
        {"id": "offer-1", "group_id": SOURCE_ID, "demand_id": None},
    ]
    monkeypatch.setattr(reconciliation, "get_supabase_service_client", lambda: client)

    plans = reconciliation._read_merge_plan_reports(
        [{"current_group_ids": [SURVIVOR_ID, SOURCE_ID], "compatibility": "compatible"}],
        group_records,
    )

    assert plans[0]["status"] == "needs_review"
    assert plans[0]["reason"] == "blocking_reference:active_offer"