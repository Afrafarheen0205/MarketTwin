from decimal import Decimal
import re
from typing import Any, Dict, Optional
import unicodedata
from app.services.demand_family_taxonomy import canonical_demand_family


def _jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_jsonable(item) for item in value]
    return value


_PRODUCT_FAMILY_DETAILS = re.compile(
    r"\b(?:with|featuring|including|equipped\s+with|having)\b.*$",
    re.IGNORECASE,
)
_PRODUCT_FAMILY_COLORS = re.compile(
    r"\b(?:black|blue|brown|gold|gray|green|grey|orange|pink|purple|red|"
    r"silver|white|yellow)\b",
    re.IGNORECASE,
)


def product_family_key(product_name: str) -> str:
    family = unicodedata.normalize("NFKC", product_name).casefold()
    family = _PRODUCT_FAMILY_DETAILS.sub("", family)
    family = _PRODUCT_FAMILY_COLORS.sub(" ", family)
    family = re.sub(r"[^a-z0-9]+", " ", family)
    family = " ".join(family.split())
    return {"smart watches": "smartwatch", "smartwatches": "smartwatch"}.get(
        family,
        family,
    )


def _specification_sets(payload: Dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    mandatory = [
        {"name": name, "value": value}
        for name, value in payload.get("mandatory_requirements", {}).items()
    ]
    optional = [
        {"name": name, "value": value}
        for name, value in payload.get("optional_preferences", {}).items()
    ]
    for specification in payload.get("technical_specifications", []):
        entry = {
            "name": specification["name"],
            "value": specification["value"],
        }
        (mandatory if specification.get("mandatory") is True else optional).append(entry)

    if payload.get("brand"):
        entry = {"name": "brand", "value": payload["brand"]}
        target = mandatory if "brand" in payload.get("mandatory_requirements", {}) else optional
        target.append(entry)
    if payload.get("model_number"):
        entry = {"name": "model number", "value": payload["model_number"]}
        target = (
            mandatory
            if "model number" in payload.get("mandatory_requirements", {})
            or "model_number" in payload.get("mandatory_requirements", {})
            else optional
        )
        target.append(entry)
    def unique(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        result: dict[tuple[str, str], dict[str, Any]] = {}
        for item in items:
            result[(item["name"].casefold(), item["value"].casefold())] = item
        return list(result.values())

    return unique(mandatory), unique(optional)


def _normalized_requirements(payload: Dict[str, Any]) -> Dict[str, Any]:
    mandatory, optional = _specification_sets(payload)
    specs = {
        item["name"]: item["value"]
        for item in (*mandatory, *optional)
    }
    dimensions = payload.get("dimensions") or {}
    delivery = {
        key: value
        for key, value in {
            "required_delivery_date": payload.get("required_delivery_date"),
            "expected_lead_time": payload.get("expected_lead_time"),
        }.items()
        if value is not None
    }
    if payload.get("additional_requirements"):
        delivery["additional_delivery_requirements"] = payload["additional_requirements"]

    return _jsonable({
        "extraction_version": "v1",
        "product_type": payload["product_name"],
        "product_family_key": product_family_key(payload["product_name"]),
        "normalized_product_name": payload["product_name"],
        "normalized_category": payload["category"],
        "normalized_material": payload.get("material"),
        "normalized_specifications": specs,
        "normalized_dimensions": dimensions,
        "mandatory_requirements": mandatory,
        "optional_preferences": optional,
        "commercial_constraints": {
            "quantity": payload["quantity"],
            "unit": payload["unit"],
            "minimum_target_unit_price": payload["minimum_target_unit_price"],
            "maximum_target_unit_price": payload["maximum_target_unit_price"],
            "currency": payload["currency"],
        },
        "delivery_constraints": delivery,
        "missing_information": [],
        "clarification_questions": [],
        "validation_errors": [],
        "status": "Completed",
    })


def demand_request_to_database_payload(
    customer_id: str,
    payload: Dict[str, Any],
    submission_id: Optional[str] = None,
) -> Dict[str, Any]:
    canonical_family = canonical_demand_family(
        payload["product_name"],
        payload["category"],
    )
    database_payload = {
        "customer_id": customer_id,
        "title": payload["product_name"],
        "category": payload["category"],
        "description": payload.get("description"),
        "brand": payload.get("brand"),
        "model_number": payload.get("model_number"),
        "technical_specifications": payload.get("technical_specifications") or [],
        "dimensions": payload.get("dimensions") or {},
        "certifications": payload.get("certifications") or [],
        "target_quantity": payload["quantity"],
        "unit": payload["unit"],
        "min_target_unit_price": payload["minimum_target_unit_price"],
        "max_target_unit_price": payload["maximum_target_unit_price"],
        "currency": payload["currency"],
        "expected_lead_time": payload.get("expected_lead_time"),
        "delivery_address": payload.get("delivery_address") or {},
        "additional_requirements": payload.get("additional_requirements"),
        "status": "Submitted",
        "canonical_product_family_key": (
            canonical_family.product_family_key if canonical_family else None
        ),
        "canonical_category_key": canonical_family.category_key if canonical_family else None,
        "normalized_requirements": _normalized_requirements(payload),
    }
    if submission_id is not None:
        database_payload["submission_id"] = submission_id
    return _jsonable(database_payload)


def database_row_to_api_response(row: Dict[str, Any]) -> Dict[str, Any]:
    group = row.get("demand_groups")
    if isinstance(group, list):
        group = group[0] if group else None
    if not isinstance(group, dict):
        group = {}
    return {
        "id": str(row["id"]),
        "customer_id": str(row["customer_id"]) if row.get("customer_id") else None,
        "group_id": str(row["group_id"]) if row.get("group_id") else None,
        "grouping_status": row.get("grouping_status"),
        "grouping_review_reason": row.get("grouping_review_reason"),
        "group_reference": group.get("group_reference"),
        "participating_demand_count": group.get("participating_demand_count"),
        "participants_count": group.get("participants_count"),
        "demand_code": row.get("demand_code"),
        "product_name": row.get("title"),
        "category": row.get("category"),
        "description": row.get("description"),
        "brand": row.get("brand"),
        "model_number": row.get("model_number"),
        "technical_specifications": row.get("technical_specifications") or [],
        "dimensions": row.get("dimensions") or {},
        "certifications": row.get("certifications") or [],
        "quantity": row.get("target_quantity"),
        "unit": row.get("unit"),
        "minimum_target_unit_price": row.get("min_target_unit_price"),
        "maximum_target_unit_price": row.get("max_target_unit_price"),
        "currency": row.get("currency"),
        "expected_lead_time": row.get("expected_lead_time"),
        "delivery_address": row.get("delivery_address") or {},
        "additional_requirements": row.get("additional_requirements"),
        "status": row.get("status"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def database_row_to_normalized_demand(
    row: Dict[str, Any],
    normalized_requirements: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    normalized = normalized_requirements or {}
    delivery = normalized.get("delivery_constraints")
    if isinstance(delivery, dict):
        normalized = {
            **normalized,
            "delivery_constraints": {
                key: value
                for key, value in delivery.items()
                if key in {
                    "required_delivery_date",
                    "expected_lead_time",
                    "delivery_duration",
                    "delivery_requirement",
                }
            },
        }
    demand = {
        **row,
        "product_name": row.get("title"),
        "quantity": row.get("target_quantity"),
        "minimum_target_unit_price": row.get("min_target_unit_price"),
        "maximum_target_unit_price": row.get("max_target_unit_price"),
        "normalized_requirements": normalized,
    }
    return demand
