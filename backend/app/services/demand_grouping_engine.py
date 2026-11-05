from typing import Any, Dict, List, Optional
from app.core.supabase import get_supabase_client


def _client():
    return get_supabase_client()


def _hard_compatible(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
    # Product type / category
    if a.get("normalized_product_type") and b.get("normalized_product_type"):
        if a["normalized_product_type"].lower() != b["normalized_product_type"].lower():
            return False
    if a.get("normalized_category") and b.get("normalized_category"):
        if a["normalized_category"].lower() != b["normalized_category"].lower():
            return False
    # Material
    if a.get("normalized_material") and b.get("normalized_material"):
        if a["normalized_material"].lower() != b["normalized_material"].lower():
            return False
    # Mandatory requirements compare
    ma = a.get("mandatory_requirements") or []
    mb = b.get("mandatory_requirements") or []
    # Require same mandatory types
    types_a = {r.get("type") for r in ma if isinstance(r, dict)}
    types_b = {r.get("type") for r in mb if isinstance(r, dict)}
    if types_a != types_b:
        return False
    # Certifications: subset check
    ca = set((a.get("commercial_constraints") or {}).get("certifications", []) if isinstance(a.get("commercial_constraints"), dict) else set())
    # certifications stored in normalized? use mandatory
    cert_a = set()
    cert_b = set()
    for r in ma:
        if isinstance(r, dict) and r.get("type") == "certifications":
            val = r.get("value")
            if isinstance(val, list):
                cert_a.update(val)
    for r in mb:
        if isinstance(r, dict) and r.get("type") == "certifications":
            val = r.get("value")
            if isinstance(val, list):
                cert_b.update(val)
    if cert_a and cert_b and not cert_a.issubset(cert_b) and not cert_b.issubset(cert_a):
        # require intersection equality for mandatory certs
        if cert_a != cert_b:
            return False
    return True


def generate_groups(triggered_by: Optional[str] = None) -> Dict[str, Any]:
    client = _client()
    if client is None:
        raise RuntimeError("Supabase is not configured.")

    # Fetch demands with completed normalized requirements
    demands_res = client.table("demands").select("*").in_("status", ["Submitted", "Under Review"]).execute()
    demands = demands_res.data or []
    # Fetch normalized requirements
    req_res = client.table("demand_normalized_requirements").select("*").execute()
    reqs = {r["demand_id"]: r for r in (req_res.data or [])}

    # Filter eligible: completed/needs clarification? require completed only
    eligible = []
    for d in demands:
        r = reqs.get(d["id"])
        if not r:
            continue
        if r.get("status") not in ("Completed", "Manually Reviewed"):
            continue
        if r.get("missing_information"):
            # allow but flag; still include? For grouping, require no missing mandatory? We'll include but mark.
            pass
        eligible.append((d, r))

    # Group by compatibility
    groups: List[List[tuple]] = []
    for item in eligible:
        placed = False
        for group in groups:
            if all(_hard_compatible(item[1], other[1]) for other in group):
                group.append(item)
                placed = True
                break
        if not placed:
            groups.append([item])

    # Only groups with >1 demand are proposed
    proposed_groups = [g for g in groups if len(g) > 1]

    # Save
    run_summary = {"groups": [], "eligible_demands": len(eligible)}
    total_processed = len(eligible)
    total_proposed = 0
    for group in proposed_groups:
        first = group[0][1]
        group_ref = f"GRP-{len(proposed_groups)}-{group[0][0]['id'][:6]}"
        group_payload = {
            "group_reference": group_ref,
            "group_code": group_ref,
            "normalized_product_type": first.get("normalized_product_name") or first.get("product_type"),
            "category": first.get("normalized_category"),
            "group_status": "Proposed",
            "total_requested_quantity": sum((d.get("quantity") or 0) for d, _ in group),
            "participating_demand_count": len(group),
            "currency": (group[0][1].get("commercial_constraints") or {}).get("currency"),
            "compatibility_summary": {
                "compatible": ["product type", "material", "mandatory requirements"],
                "differences": ["quantities", "budgets"],
            },
            "status": "Forming",
            "product_title": first.get("normalized_product_name") or first.get("product_type"),
            "threshold_quantity": 0,
            "total_quantity": sum((d.get("quantity") or 0) for d, _ in group),
            "participants_count": len(group),
        }
        gres = client.table("demand_groups").insert(group_payload).execute()
        if not gres.data:
            continue
        gid = gres.data[0]["id"]
        total_proposed += 1
        for d, r in group:
            client.table("demand_group_members").insert({
                "group_id": gid,
                "customer_id": d.get("customer_id"),
                "demand_id": d.get("id"),
                "quantity_committed": d.get("quantity"),
                "original_quantity": d.get("quantity"),
                "original_target_price": d.get("target_unit_price"),
                "original_budget": d.get("maximum_budget"),
                "membership_status": "active",
            }).execute()
            # update demand group_id
            client.table("demands").update({"group_id": gid, "status": "Grouped"}).eq("id", d.get("id")).execute()
        run_summary["groups"].append({"group_id": gid, "demands": [d.get("id") for d, _ in group]})

    # record run
    client.table("demand_group_runs").insert({
        "execution_status": "completed",
        "triggered_by": triggered_by,
        "total_demands_processed": total_processed,
        "total_groups_proposed": total_proposed,
        "execution_summary": run_summary,
        "completed_at": "now()",
    }).execute()

    return {
        "total_demands_processed": total_processed,
        "total_groups_proposed": total_proposed,
        "groups": run_summary["groups"],
    }