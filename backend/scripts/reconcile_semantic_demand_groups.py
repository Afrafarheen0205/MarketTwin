import argparse
import json
import sys
from pathlib import Path
from typing import Any, Mapping

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings
from app.core.supabase import get_supabase_service_client
from app.services.demand_compatibility import (
    SemanticCandidateEdge,
    assess_group_compatibility,
    build_compatible_clusters,
)
from app.services.demand_normalization import (
    NORMALIZATION_VERSION,
    SOURCE_NORMALIZATION_VERSION,
    normalize_demand_v2,
)
from app.services.demand_embedding_service import (
    DemandEmbeddingReadError,
    DemandEmbeddingSearchError,
    build_embedding_input,
    calculate_embedding_input_hash,
    get_demand_embedding,
    search_demand_embedding_candidates,
)
from app.services.demand_group_merge_service import MergePlanError, plan_group_merge
from app.services.demand_service import get_demand
from app.services.normalized_requirement_service import get_normalized

CUSTOMER_ID = "4052c4af-bd4d-43c2-b412-8a8e266e939a"
DEMAND_IDS = (
    "576178d6-3fa1-4c3d-a5ba-114f587de39d",
    "434b388d-c91e-484a-a5c1-9c12cd4c71c5",
    "66859eb9-a8f6-4445-b586-6f69866329bc",
    "97ba2aa3-d436-4349-9380-bc86bc4117b2",
    "f285771c-3965-4a89-93d8-bad63491a633",
    "95e0770e-6656-4b3f-a0c9-3b412aa5529c",
    "956a636c-592d-4d8c-9d82-32b7de6e23f5",
)
MAX_COSINE_DISTANCE = 0.4


def _read_rows(response: Any) -> list[Mapping[str, Any]]:
    rows = getattr(response, "data", None)
    if not isinstance(rows, list) or any(not isinstance(row, Mapping) for row in rows):
        raise RuntimeError("database_read_response_invalid")
    return rows


def _embedding_input_data(demand: Mapping[str, Any], normalized: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "product_name": demand.get("title") or demand.get("product_name"),
        "product_type": normalized.get("product_type"),
        "category": demand.get("category"),
        "description": demand.get("description"),
        "normalized_requirements": normalized,
    }


def _load_existing_group_records(
    group_ids: set[str],
    source_normalization_version: str,
) -> dict[str, dict[str, dict[str, Any]]]:
    if not group_ids:
        return {}
    client = get_supabase_service_client()
    if client is None:
        raise RuntimeError("service_role_client_unavailable")

    group_demand_rows: dict[str, dict[str, dict[str, Any]]] = {}
    demand_ids: set[str] = set()
    membership_rows_by_group: dict[str, list[dict[str, Any]]] = {}
    for group_id in sorted(group_ids):
        demand_result = (
            client.table("demands")
            .select("*")
            .eq("group_id", group_id)
            .execute()
        )
        member_result = (
            client.table("demand_group_members")
            .select("demand_id, membership_status")
            .eq("group_id", group_id)
            .execute()
        )
        rows = _read_rows(demand_result)
        memberships = _read_rows(member_result)
        group_demand_rows[group_id] = {
            row["id"]: dict(row) for row in rows if row.get("id")
        }
        membership_rows_by_group[group_id] = [dict(row) for row in memberships]
        demand_ids.update(group_demand_rows[group_id])
        demand_ids.update(
            row["demand_id"]
            for row in membership_rows_by_group[group_id]
            if row.get("demand_id") and row.get("membership_status", "active") == "active"
        )

    missing_rows = demand_ids - set().union(
        *(set(rows) for rows in group_demand_rows.values())
    )
    if missing_rows:
        additional = (
            client.table("demands")
            .select("*")
            .in_("id", sorted(missing_rows))
            .execute()
        )
        additional_rows = _read_rows(additional)
        rows_by_id = {row["id"]: dict(row) for row in additional_rows if row.get("id")}
        for group_id, memberships in membership_rows_by_group.items():
            for membership in memberships:
                demand_id = membership.get("demand_id")
                if demand_id in rows_by_id and membership.get("membership_status", "active") == "active":
                    group_demand_rows[group_id][demand_id] = rows_by_id[demand_id]

    all_demand_ids = set().union(*(set(rows) for rows in group_demand_rows.values()))
    normalized_by_id: dict[str, Mapping[str, Any]] = {}
    if all_demand_ids:
        normalized_result = (
            client.table("demand_normalized_requirements")
            .select("*")
            .in_("demand_id", sorted(all_demand_ids))
            .eq("extraction_version", source_normalization_version)
            .execute()
        )
        normalized_by_id = {
            row["demand_id"]: row
            for row in _read_rows(normalized_result)
            if row.get("demand_id")
        }

    result: dict[str, dict[str, dict[str, Any]]] = {}
    for group_id, rows in group_demand_rows.items():
        result[group_id] = {}
        for demand_id, row in rows.items():
            source_normalized = normalized_by_id.get(demand_id, {})
            normalized_v2 = normalize_demand_v2(row, source_normalized)
            result[group_id][demand_id] = {
                **row,
                "normalized_requirements": normalized_v2,
                "_source_normalized_updated_at": source_normalized.get("updated_at"),
                "_source_normalized_snapshot": source_normalized,
                "_normalized_requirements_missing": demand_id not in normalized_by_id,
            }
    return result


def _read_merge_plan_reports(
    proposed_groups: list[Mapping[str, Any]],
    group_records: Mapping[str, Mapping[str, Mapping[str, Any]]],
) -> list[dict[str, Any]]:
    pairs = sorted({
        tuple(sorted(str(group_id) for group_id in proposal["current_group_ids"]))
        for proposal in proposed_groups
        if len(proposal.get("current_group_ids", [])) > 1
    })
    if not pairs:
        return []

    client = get_supabase_service_client()
    if client is None:
        raise RuntimeError("service_role_client_unavailable")
    group_ids = sorted({group_id for pair in pairs for group_id in pair})
    groups = {
        str(row["id"]): dict(row)
        for row in _read_rows(
            client.table("demand_groups").select("*").in_("id", group_ids).execute()
        )
        if row.get("id")
    }
    memberships = _read_rows(
        client.table("demand_group_members")
        .select("*")
        .in_("group_id", group_ids)
        .execute()
    )
    demands = [
        dict(demand)
        for group_id in group_ids
        for demand in group_records.get(group_id, {}).values()
    ]
    demand_ids = sorted({str(demand["id"]) for demand in demands if demand.get("id")})
    blockers_by_group = {group_id: set() for group_id in group_ids}

    review_rows = _read_rows(
        client.table("demand_group_reviews")
        .select("id,group_id")
        .in_("group_id", group_ids)
        .execute()
    )
    for row in review_rows:
        if row.get("group_id"):
            blockers_by_group[str(row["group_id"])].add("review")

    selections = _read_rows(
        client.table("customer_offer_selections")
        .select("id,group_id,demand_id")
        .in_("group_id", group_ids)
        .execute()
    )
    selection_ids = {str(row["id"]) for row in selections if row.get("id")}
    demand_group_by_id = {
        str(demand["id"]): str(demand["group_id"])
        for demand in demands
        if demand.get("id") and demand.get("group_id")
    }
    selection_group_by_id = {}
    for row in selections:
        selection_id = str(row["id"]) if row.get("id") else None
        group_id = row.get("group_id") or demand_group_by_id.get(str(row.get("demand_id")))
        if selection_id and group_id:
            selection_group_by_id[selection_id] = str(group_id)
        if group_id:
            blockers_by_group[str(group_id)].add("selection")
    if demand_ids:
        demand_selections = _read_rows(
            client.table("customer_offer_selections")
            .select("id,group_id,demand_id")
            .in_("demand_id", demand_ids)
            .execute()
        )
        for row in demand_selections:
            if row.get("id"):
                selection_id = str(row["id"])
                selection_ids.add(selection_id)
            else:
                selection_id = None
            group_id = row.get("group_id") or demand_group_by_id.get(str(row.get("demand_id")))
            if selection_id and group_id:
                selection_group_by_id[selection_id] = str(group_id)
            if group_id:
                blockers_by_group[str(group_id)].add("selection")

    group_offers = _read_rows(
        client.table("merchant_offers")
        .select("id,group_id,demand_id")
        .in_("group_id", group_ids)
        .execute()
    )
    for row in group_offers:
        if row.get("group_id"):
            blockers_by_group[str(row["group_id"])].add("active_offer")
    if demand_ids:
        demand_offers = _read_rows(
            client.table("merchant_offers")
            .select("id,group_id,demand_id")
            .in_("demand_id", demand_ids)
            .execute()
        )
        for row in demand_offers:
            for demand in demands:
                if str(demand.get("id")) == str(row.get("demand_id")):
                    blockers_by_group[str(demand["group_id"])].add("active_offer")

    if demand_ids or selection_ids:
        order_query = client.table("orders").select("id,demand_id,selection_id")
        if demand_ids:
            order_rows = _read_rows(order_query.in_("demand_id", demand_ids).execute())
        else:
            order_rows = []
        if selection_ids:
            order_rows.extend(_read_rows(
                client.table("orders")
                .select("id,demand_id,selection_id")
                .in_("selection_id", sorted(selection_ids))
                .execute()
            ))
        order_demand_ids = {str(row.get("demand_id")) for row in order_rows if row.get("demand_id")}
        for demand in demands:
            if str(demand.get("id")) in order_demand_ids:
                blockers_by_group[str(demand["group_id"])].add("order")
        ordered_selection_ids = {str(row.get("selection_id")) for row in order_rows if row.get("selection_id")}
        if ordered_selection_ids:
            for selection_id in ordered_selection_ids:
                group_id = selection_group_by_id.get(selection_id)
                if group_id:
                    blockers_by_group[group_id].add("order")

    redirects_by_source = {}
    for column in ("source_group_id", "target_group_id"):
        redirect_rows = _read_rows(
            client.table("demand_group_redirects")
            .select("source_group_id,target_group_id,merge_request_id,merged_by,merged_at")
            .in_(column, group_ids)
            .execute()
        )
        for row in redirect_rows:
            if row.get("source_group_id"):
                redirects_by_source[str(row["source_group_id"])] = row
                if str(row["source_group_id"]) in group_ids:
                    blockers_by_group[str(row["source_group_id"])].add("redirect")
    redirects = list(redirects_by_source.values())

    proposal_compatibility = {
        tuple(sorted(str(group_id) for group_id in proposal["current_group_ids"])): proposal["compatibility"]
        for proposal in proposed_groups
        if len(proposal.get("current_group_ids", [])) > 1
    }
    reports = []
    for pair in pairs:
        survivor_id, source_id = sorted(
            pair,
            key=lambda group_id: (
                str(groups.get(group_id, {}).get("created_at") or ""),
                group_id,
            ),
        )
        pair_demands = [
            demand for demand in demands
            if str(demand.get("group_id")) in {survivor_id, source_id}
        ]
        blockers = sorted(blockers_by_group[survivor_id] | blockers_by_group[source_id])
        try:
            plan = plan_group_merge(
                groups[survivor_id],
                groups[source_id],
                pair_demands,
                memberships,
                compatibility_status=proposal_compatibility[tuple(sorted(pair))],
                blockers=blockers,
                redirects=redirects,
            )
            report = plan.as_dict()
            report["compatibility_report"] = {
                "status": "compatible",
                "engine": "demand_compatibility_v2",
                "normalized_revisions": [
                    {
                        "demand_id": str(demand["id"]),
                        "demand_updated_at": demand.get("updated_at"),
                        "normalized_updated_at": demand.get("_source_normalized_updated_at"),
                        "normalized_snapshot": demand.get("_source_normalized_snapshot") or {},
                    }
                    for demand in sorted(pair_demands, key=lambda row: str(row.get("id")))
                ],
            }
            reports.append(report)
        except (MergePlanError, KeyError) as exc:
            reports.append({
                "status": "needs_review",
                "survivor_group_id": survivor_id,
                "source_group_id": source_id,
                "reason": str(exc) if isinstance(exc, MergePlanError) else "group_snapshot_missing",
                "database_preconditions_pending": True,
            })
    return reports


def build_dry_run_report() -> dict[str, Any]:
    settings = get_settings()
    model = settings.OLLAMA_EMBEDDING_MODEL
    embedding_version = settings.OLLAMA_EMBEDDING_VERSION
    source_normalization_version = SOURCE_NORMALIZATION_VERSION
    records_by_id: dict[str, dict[str, Any]] = {}
    vectors_by_id = {}
    embedding_status = []

    for demand_id in DEMAND_IDS:
        item: dict[str, Any] = {
            "demand_id": demand_id,
            "embedding_status": "not_checked",
            "current_group_id": None,
            "verification_reasons": [],
        }
        try:
            demand = get_demand(CUSTOMER_ID, demand_id)
        except Exception:
            item["embedding_status"] = "demand_read_failed"
            embedding_status.append(item)
            continue
        if demand is None:
            item["embedding_status"] = "demand_not_found"
            embedding_status.append(item)
            continue

        group_id = demand.get("group_id")
        item["current_group_id"] = str(group_id) if group_id else None
        try:
            normalized_v1 = get_normalized(demand_id, version=source_normalization_version)
        except Exception:
            item["embedding_status"] = "normalized_requirements_read_failed"
            embedding_status.append(item)
            continue
        if not isinstance(normalized_v1, Mapping):
            item["embedding_status"] = "normalized_requirements_missing"
            embedding_status.append(item)
            continue

        try:
            embedding_text = build_embedding_input(_embedding_input_data(demand, normalized_v1))
            expected_hash = calculate_embedding_input_hash(embedding_text, embedding_version)
            stored = get_demand_embedding(demand_id)
        except DemandEmbeddingReadError:
            item["embedding_status"] = "stored_embedding_read_failed"
            embedding_status.append(item)
            continue
        except Exception:
            item["embedding_status"] = "embedding_input_invalid"
            embedding_status.append(item)
            continue

        if stored is None:
            item["embedding_status"] = "embedding_missing"
            embedding_status.append(item)
            continue

        mismatches = []
        if stored.embedding_model != model:
            mismatches.append("model_mismatch")
        if stored.embedding_version != embedding_version:
            mismatches.append("version_mismatch")
        if stored.input_hash != expected_hash:
            mismatches.append("input_hash_mismatch")
        if mismatches:
            item["embedding_status"] = "embedding_stale"
            item["verification_reasons"] = mismatches
            embedding_status.append(item)
            continue

        item["embedding_status"] = "reused"
        embedding_status.append(item)
        vectors_by_id[demand_id] = stored.embedding
        normalized_v2 = normalize_demand_v2(demand, normalized_v1)
        records_by_id[demand_id] = {
            **demand,
            "normalized_requirements": normalized_v2,
        }

    candidate_pairs: dict[tuple[str, str], float] = {}
    search_failures = []
    for demand_id, vector in vectors_by_id.items():
        try:
            candidates = search_demand_embedding_candidates(
                vector,
                embedding_model=model,
                embedding_version=embedding_version,
                exclude_demand_id=demand_id,
                candidate_limit=100,
                max_cosine_distance=MAX_COSINE_DISTANCE,
            )
        except DemandEmbeddingSearchError:
            search_failures.append({"demand_id": demand_id, "reason": "candidate_search_failed"})
            continue
        for candidate in candidates:
            other_id = candidate.demand_id
            if other_id not in vectors_by_id or other_id == demand_id:
                continue
            pair = tuple(sorted((demand_id, other_id)))
            candidate_pairs[pair] = min(
                candidate_pairs.get(pair, candidate.cosine_distance),
                candidate.cosine_distance,
            )

    pair_rows = []
    compatible_edges = []
    for (demand_id_a, demand_id_b), distance in sorted(candidate_pairs.items()):
        assessment = assess_group_compatibility(
            [records_by_id[demand_id_a], records_by_id[demand_id_b]]
        )
        pair_rows.append({
            "demand_ids": [demand_id_a, demand_id_b],
            "cosine_distance": distance,
            "cosine_similarity": 1.0 - distance,
            "compatibility": assessment.status,
            "rejection_reasons": list(assessment.reasons),
            "optional_preference_score": assessment.optional_preference_score,
        })
        if assessment.compatible:
            compatible_edges.append(SemanticCandidateEdge(demand_id_a, demand_id_b, distance))

    cluster_plan = build_compatible_clusters(records_by_id, compatible_edges)
    current_group_ids = {
        item["current_group_id"]
        for item in embedding_status
        if item.get("current_group_id")
    }
    try:
        group_records = _load_existing_group_records(
            current_group_ids,
            SOURCE_NORMALIZATION_VERSION,
        )
        group_member_read_failed = False
    except Exception:
        group_records = {}
        group_member_read_failed = bool(current_group_ids)

    proposed_groups = []
    for demand_ids in cluster_plan.groups:
        existing_group_ids = sorted({
            str(records_by_id[demand_id].get("group_id"))
            for demand_id in demand_ids
            if records_by_id[demand_id].get("group_id")
        })
        expanded_records = {demand_id: records_by_id[demand_id] for demand_id in demand_ids}
        for group_id in existing_group_ids:
            expanded_records.update(group_records.get(group_id, {}))
        assessment = (
            assess_group_compatibility(list(expanded_records.values()))
            if len(expanded_records) >= 2
            else None
        )
        reasons = list(assessment.reasons) if assessment else []
        status = assessment.status if assessment else "compatible"
        missing_group_requirements = any(
            record.get("_normalized_requirements_missing")
            for record in expanded_records.values()
        )
        if missing_group_requirements:
            reasons.append("existing_group_normalized_requirements_missing")
            if status == "compatible":
                status = "needs_review"
        if group_member_read_failed and existing_group_ids:
            status = "needs_review"
            reasons.append("existing_group_members_read_failed")
        proposed_groups.append({
            "demand_ids": sorted(expanded_records),
            "current_group_ids": existing_group_ids,
            "compatibility": status,
            "reasons": list(dict.fromkeys(reasons)),
            "optional_preference_score": assessment.optional_preference_score if assessment else 0.0,
            "requires_existing_group_reconciliation": len(existing_group_ids) > 1,
        })

    try:
        merge_plans = _read_merge_plan_reports(proposed_groups, group_records)
        merge_plan_read_failed = False
    except Exception:
        merge_plans = [
            {
                "status": "needs_review",
                "reason": "merge_plan_read_failed",
                "database_preconditions_pending": True,
            }
        ]
        merge_plan_read_failed = True

    return {
        "mode": "dry_run",
        "writes_enabled": False,
        "embedding_model": model,
        "embedding_version": embedding_version,
        "compatibility_normalization_version": NORMALIZATION_VERSION,
        "embedding_status": embedding_status,
        "candidate_search_failures": search_failures,
        "candidate_pairs": pair_rows,
        "cluster_rejections": [
            {
                "demand_ids": list(rejection.demand_ids),
                "compatibility": rejection.status,
                "reasons": list(rejection.reasons),
            }
            for rejection in cluster_plan.rejected_merges
        ],
        "proposed_groups": proposed_groups,
        "merge_plans": merge_plans,
        "merge_plan_read_failed": merge_plan_read_failed,
        "apply_available": False,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only semantic demand grouping report.")
    parser.parse_args(argv)
    try:
        report = build_dry_run_report()
    except Exception as exc:
        print(json.dumps({"mode": "dry_run", "error": type(exc).__name__}), file=sys.stderr)
        return 1
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())