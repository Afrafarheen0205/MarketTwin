from app.core.supabase import get_supabase_client


def _count(table: str, **filters) -> int:
    client = get_supabase_client()
    if client is None:
        return 0
    query = client.table(table).select("id", count="exact")
    for k, v in filters.items():
        query = query.eq(k, v)
    res = query.execute()
    return res.count or 0


def overview() -> dict:
    return {
        "total_customers": _count("profiles", role="customer"),
        "total_merchants": _count("profiles", role="merchant"),
        "approved_merchants": _count("merchant_profiles", status="APPROVED"),
        "pending_merchants": _count("merchant_profiles", status="PENDING"),
        "total_products": _count("products"),
        "active_products": _count("products", in_stock=True),
        "total_demands": _count("demands"),
        "pending_demands": _count("demands", status="Submitted"),
        "total_demand_groups": _count("demand_groups"),
        "approved_demand_groups": _count("demand_groups", group_status="Approved"),
        "active_bidding_groups": _count("demand_groups", bidding_status="open"),
        "total_offers": _count("merchant_offers"),
        "total_orders": _count("orders"),
        "pending_orders": _count("orders", order_status="Pending Payment"),
        "completed_orders": _count("orders", order_status="Confirmed"),
        "total_payments": _count("payments", status="Captured"),
    }