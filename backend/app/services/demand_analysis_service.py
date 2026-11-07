import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, Iterable, List, Optional, Tuple

from app.services.demand_opportunity import is_merchant_opportunity_eligible

PASS = "PASS"
FAIL = "FAIL"
UNKNOWN = "UNKNOWN"

EXACT = "exact"
SIMILAR = "similar"
INCOMPATIBLE = "incompatible"

ELIGIBLE_STATUSES = {
    "pending",
    "submitted",
    "under review",
    "grouped",
    "offers received",
    "offers available",
    "bidding open",
    "approved",
    "accepted",
    "completed",
}
EXCLUDED_STATUSES = {"cancelled", "canceled", "expired", "draft", "unsubmitted"}

PRODUCT_FAMILIES = (
    {"wireless earbuds", "bluetooth earbuds", "wireless earphones", "bluetooth earphones"},
    {"scarf", "scarves"},
)
CATEGORY_FAMILIES = (
    {"clothing accessories", "clothing and accessories", "apparel", "fashion accessories"},
    {"electronics", "consumer electronics", "audio electronics"},
)


@dataclass
class Comparison:
    key: str
    current_value: Optional[str]
    other_value: Optional[str]
    state: str
    reason: str


@dataclass
class MatchResult:
    classification: str
    demand: Dict[str, Any]
    other_customer_id: Optional[str]
    explanation: str
    comparisons: List[Comparison]
    differences: List[str]


def normalize_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    normalized = re.sub(r"[^a-z0-9]+", " ", str(value).casefold()).strip()
    return normalized or None


def _family_match(left: Optional[str], right: Optional[str], families: Iterable[set]) -> bool:
    if not left or not right:
        return False
    if left == right:
        return True
    return any(left in family and right in family for family in families)


def _record_product_name(demand: Dict[str, Any]) -> Optional[str]:
    normalized = demand.get("normalized_requirements")
    normalized = normalized if isinstance(normalized, dict) else {}
    return normalize_text(
        demand.get("normalized_product_name")
        or demand.get("product_name")
        or demand.get("title")
        or demand.get("product_type")
        or normalized.get("normalized_product_name")
        or normalized.get("product_type")
    )


def _record_category(demand: Dict[str, Any]) -> Optional[str]:
    normalized = demand.get("normalized_requirements")
    normalized = normalized if isinstance(normalized, dict) else {}
    return normalize_text(
        demand.get("normalized_category")
        or demand.get("category")
        or normalized.get("normalized_category")
    )


def _normalized_group(demand: Dict[str, Any], group: str) -> Dict[str, Any]:
    normalized = demand.get("normalized_requirements")
    if isinstance(normalized, dict) and isinstance(normalized.get(group), dict):
        return normalized[group]
    value = demand.get(group)
    return value if isinstance(value, dict) else {}


def _first_value(demand: Dict[str, Any], fields: Iterable[str], group: str, keys: Iterable[str]) -> Any:
    for field in fields:
        value = demand.get(field)
        if value is not None and value != "":
            return value
    constraints = _normalized_group(demand, group)
    normalized_keys = {normalize_text(key) for key in keys}
    for key, value in constraints.items():
        if normalize_text(key) in normalized_keys and value is not None and value != "":
            return value
    return None


def _quantity(demand: Dict[str, Any]) -> Any:
    return _first_value(
        demand,
        ("quantity", "target_quantity"),
        "commercial_constraints",
        ("quantity",),
    )


def _unit(demand: Dict[str, Any]) -> Any:
    return _first_value(demand, ("unit",), "commercial_constraints", ("unit",))


def _price_range(demand: Dict[str, Any]) -> Tuple[Any, Any]:
    minimum = _first_value(
        demand,
        ("minimum_target_unit_price", "min_target_unit_price"),
        "commercial_constraints",
        ("minimum_target_unit_price", "min_target_unit_price"),
    )
    maximum = _first_value(
        demand,
        ("maximum_target_unit_price", "max_target_unit_price"),
        "commercial_constraints",
        ("maximum_target_unit_price", "max_target_unit_price"),
    )
    return minimum, maximum


def _currency(demand: Dict[str, Any]) -> Any:
    return _first_value(demand, ("currency",), "commercial_constraints", ("currency",))


def _delivery_constraints(demand: Dict[str, Any]) -> Dict[str, Any]:
    constraints = _normalized_group(demand, "delivery_constraints").copy()
    for field in ("required_delivery_date", "expected_lead_time"):
        value = demand.get(field)
        if value is not None and value != "" and value != {}:
            constraints.setdefault(field, value)
    return {
        normalized_key: value
        for key, value in constraints.items()
        if (normalized_key := normalize_text(key)) and value is not None and value != ""
    }


def _normalized_constraint_value(value: Any) -> Optional[str]:
    if isinstance(value, dict):
        value = json.dumps(value, sort_keys=True, separators=(",", ":"))
    return normalize_text(value)


def _is_related_identity(current: Dict[str, Any], other: Dict[str, Any]) -> bool:
    left = _record_product_name(current)
    right = _record_product_name(other)
    if _family_match(left, right, PRODUCT_FAMILIES):
        return True
    return bool(left and right and left == right)


def _as_spec_map(value: Any) -> Dict[str, str]:
    result: Dict[str, str] = {}
    if isinstance(value, dict):
        for key, item in value.items():
            if isinstance(item, dict):
                item = item.get("value")
            normalized_key = normalize_text(key)
            normalized_value = normalize_text(item)
            if normalized_key and normalized_value:
                result[normalized_key] = normalized_value
    elif isinstance(value, list):
        for item in value:
            if not isinstance(item, dict):
                continue
            key = normalize_text(item.get("name") or item.get("type") or item.get("key"))
            item_value = normalize_text(item.get("value"))
            if key and item_value:
                result[key] = item_value
    return result


def _specification_sets(demand: Dict[str, Any]) -> Tuple[Dict[str, str], Dict[str, str]]:
    normalized = demand.get("normalized_requirements")
    normalized = normalized if isinstance(normalized, dict) else {}
    mandatory: Dict[str, str] = {}
    optional: Dict[str, str] = {}

    def collect(entries: Any, target: Dict[str, str]) -> None:
        if isinstance(entries, dict):
            target.update(_as_spec_map(entries))
        elif isinstance(entries, list):
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                key = normalize_text(entry.get("name") or entry.get("type") or entry.get("key"))
                value = normalize_text(entry.get("value"))
                if key and value:
                    target[key] = value

    collect(normalized.get("mandatory_requirements"), mandatory)
    collect(normalized.get("optional_preferences"), optional)
    collect(demand.get("mandatory_requirements"), mandatory)
    collect(demand.get("optional_preferences"), optional)
    collect(normalized.get("normalized_specifications"), optional)
    collect(demand.get("normalized_specifications"), optional)
    for spec in demand.get("technical_specifications") or []:
        if not isinstance(spec, dict):
            continue
        key = normalize_text(spec.get("name") or spec.get("key"))
        value = normalize_text(spec.get("value"))
        if key and value:
            (mandatory if spec.get("mandatory") is True else optional)[key] = value

    specs = demand.get("specs")
    if isinstance(specs, dict):
        collect(specs.get("mandatory_requirements"), mandatory)
        collect(specs.get("optional_preferences"), optional)
        collect(specs.get("technical_specifications"), optional)
        reserved = {
            "mandatory_requirements",
            "optional_preferences",
            "technical_specifications",
        }
        for key, value in specs.items():
            if key in reserved:
                continue
            target = mandatory if isinstance(value, dict) and value.get("mandatory") is True else optional
            collect({key: value}, target)
    return mandatory, optional


def _raw_specification_map(demand: Dict[str, Any]) -> Dict[str, Tuple[str, str]]:
    normalized = demand.get("normalized_requirements")
    normalized = normalized if isinstance(normalized, dict) else {}
    result: Dict[str, Tuple[str, str]] = {}

    def collect(entries: Any) -> None:
        if isinstance(entries, dict):
            entries = [
                {"name": key, **(value if isinstance(value, dict) else {"value": value})}
                for key, value in entries.items()
            ]
        if not isinstance(entries, list):
            return
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            name = entry.get("name") or entry.get("type") or entry.get("key")
            value = entry.get("value")
            key = normalize_text(name)
            if key and value is not None and str(value).strip():
                result[key] = (str(name), str(value))

    collect(normalized.get("mandatory_requirements"))
    collect(normalized.get("optional_preferences"))
    collect(demand.get("mandatory_requirements"))
    collect(demand.get("optional_preferences"))
    collect(normalized.get("normalized_specifications"))
    collect(demand.get("normalized_specifications"))
    collect(demand.get("technical_specifications"))
    specs = demand.get("specs")
    if isinstance(specs, dict):
        collect(specs.get("mandatory_requirements"))
        collect(specs.get("optional_preferences"))
        collect(specs.get("technical_specifications"))
        reserved = {
            "mandatory_requirements",
            "optional_preferences",
            "technical_specifications",
        }
        collect({key: value for key, value in specs.items() if key not in reserved})
    return result


def _normalize_unit(value: Any) -> Optional[str]:
    normalized = normalize_text(value)
    aliases = {
        "piece": "piece",
        "pieces": "piece",
        "pc": "piece",
        "pcs": "piece",
        "unit": "unit",
        "units": "unit",
        "kg": "kilogram",
        "kilogram": "kilogram",
        "kilograms": "kilogram",
        "box": "box",
        "boxes": "box",
    }
    return aliases.get(normalized, normalized)


def _number(value: Any) -> Optional[Decimal]:
    try:
        number = Decimal(str(value))
        return number if number.is_finite() and number >= 0 else None
    except (InvalidOperation, TypeError, ValueError):
        return None


def is_eligible_demand(demand: Dict[str, Any]) -> bool:
    status = normalize_text(demand.get("status"))
    quantity = _number(_quantity(demand))
    minimum, maximum = _price_range(demand)
    if (minimum is None) != (maximum is None):
        return False
    if minimum is not None:
        min_value = _number(minimum)
        max_value = _number(maximum)
        if (
            min_value is None
            or max_value is None
            or min_value <= 0
            or max_value < min_value
            or not _currency(demand)
        ):
            return False
    return (
        status in ELIGIBLE_STATUSES
        and status not in EXCLUDED_STATUSES
        and _record_product_name(demand) is not None
        and quantity is not None
        and quantity > 0
    )


def _safe_demand(demand: Dict[str, Any]) -> Dict[str, Any]:
    mandatory, optional = _specification_sets(demand)
    raw_specs = _raw_specification_map(demand)
    normalized = demand.get("normalized_requirements")
    normalized = normalized if isinstance(normalized, dict) else {}
    specs = []
    for key in dict.fromkeys([*mandatory, *optional]):
        name, value = raw_specs.get(key, (key, mandatory.get(key) or optional.get(key) or ""))
        specs.append({
            "name": name,
            "value": value,
            "mandatory": key in mandatory,
        })
    return {
        "id": str(demand.get("id") or ""),
        "demand_code": demand.get("demand_code"),
        "product_name": (
            demand.get("product_name")
            or demand.get("title")
            or demand.get("normalized_product_name")
            or demand.get("product_type")
            or normalized.get("normalized_product_name")
            or normalized.get("product_type")
        ),
        "category": (
            demand.get("category")
            or demand.get("normalized_category")
            or normalized.get("normalized_category")
        ),
        "brand": demand.get("brand") or demand.get("normalized_brand"),
        "model_number": demand.get("model_number") or demand.get("normalized_model"),
        "technical_specifications": specs,
        "quantity": _quantity(demand),
        "unit": _unit(demand),
        "minimum_target_unit_price": _price_range(demand)[0],
        "maximum_target_unit_price": _price_range(demand)[1],
        "currency": _currency(demand),
        "status": demand.get("status"),
        "created_at": demand.get("created_at"),
    }


def compare_demands(current: Dict[str, Any], other: Dict[str, Any]) -> Optional[MatchResult]:
    if not _is_related_identity(current, other):
        return None
    current_category = _record_category(current)
    other_category = _record_category(other)
    category_related = _family_match(current_category, other_category, CATEGORY_FAMILIES)
    if current_category and other_category and not category_related:
        return None

    current_mandatory, current_optional = _specification_sets(current)
    other_mandatory, other_optional = _specification_sets(other)
    current_raw_specs = _raw_specification_map(current)
    other_raw_specs = _raw_specification_map(other)
    other_values = {**other_optional, **other_mandatory}
    comparisons: List[Comparison] = []
    differences: List[str] = []
    failures: List[str] = []
    unknowns: List[str] = []
    optional_differences: List[str] = []
    known_differences: List[str] = []

    comparisons.append(
        Comparison(
            "product identity",
            _safe_demand(current)["product_name"],
            _safe_demand(other)["product_name"],
            PASS if _record_product_name(current) == _record_product_name(other) else UNKNOWN,
            "Same normalized product identity."
            if _record_product_name(current) == _record_product_name(other)
            else "Recognized related product identity.",
        )
    )
    category_state = PASS if category_related else UNKNOWN
    category_reason = (
        "Categories match."
        if current_category and current_category == other_category
        else "Categories use compatible category labels."
        if category_related
        else "One or both categories are missing."
    )
    if category_state == UNKNOWN:
        unknowns.append(category_reason)
    comparisons.append(
        Comparison(
            "category",
            _safe_demand(current)["category"],
            _safe_demand(other)["category"],
            category_state,
            category_reason,
        )
    )

    for key, current_value in current_mandatory.items():
        other_value = other_mandatory.get(key)
        if other_value is None:
            state, reason = UNKNOWN, f"{key} was not specified in the existing demand."
            unknowns.append(reason)
        elif current_value == other_value:
            state, reason = PASS, f"{key} matches."
        else:
            state, reason = FAIL, f"{key} differs ({other_value} vs {current_value})."
            failures.append(reason)
        comparisons.append(
            Comparison(
                current_raw_specs.get(key, (key, current_value))[0],
                current_raw_specs.get(key, (key, current_value))[1],
                other_raw_specs.get(key, (key, other_value))[1] if other_value is not None else None,
                state,
                reason,
            )
        )
        if state != PASS:
            differences.append(reason)

    for key, other_value in other_mandatory.items():
        if key in current_mandatory:
            continue
        reason = f"{key} was not specified in the current demand."
        unknowns.append(reason)
        differences.append(reason)
        comparisons.append(
            Comparison(
                other_raw_specs.get(key, (key, other_value))[0],
                None,
                other_raw_specs.get(key, (key, other_value))[1],
                UNKNOWN,
                reason,
            )
        )

    for label, field in (("brand", "brand"), ("model", "model_number")):
        current_value = normalize_text(current.get(field))
        other_value = normalize_text(other.get(field))
        if not current_value:
            continue
        if not other_value:
            state, reason = UNKNOWN, f"{label.title()} was not specified in the existing demand."
            unknowns.append(reason)
        elif current_value == other_value:
            state, reason = PASS, f"{label.title()} matches."
        else:
            state, reason = FAIL, f"{label.title()} differs."
            failures.append(reason)
        comparisons.append(
            Comparison(label, current.get(field), other.get(field), state, reason)
        )
        if state != PASS:
            differences.append(reason)

    for key, current_value in current_optional.items():
        other_value = other_values.get(key)
        if other_value is None:
            reason = f"Optional preference {key} was not specified in the existing demand."
            differences.append(reason)
            comparisons.append(
                Comparison(
                    current_raw_specs.get(key, (key, current_value))[0],
                    current_raw_specs.get(key, (key, current_value))[1],
                    None,
                    UNKNOWN,
                    reason,
                )
            )
        elif current_value != other_value:
            reason = f"Optional preference {key} differs ({other_value} vs {current_value})."
            optional_differences.append(reason)
            comparisons.append(
                Comparison(
                    current_raw_specs.get(key, (key, current_value))[0],
                    current_raw_specs.get(key, (key, current_value))[1],
                    other_raw_specs.get(key, (key, other_value))[1],
                    FAIL,
                    reason,
                )
            )

    for key, other_value in other_optional.items():
        if key in current_optional or key in current_mandatory:
            continue
        reason = f"Optional preference {key} was not specified in the current demand."
        optional_differences.append(reason)
        differences.append(reason)
        comparisons.append(
            Comparison(
                other_raw_specs.get(key, (key, other_value))[0],
                None,
                other_raw_specs.get(key, (key, other_value))[1],
                UNKNOWN,
                reason,
            )
        )

    current_quantity = _number(_quantity(current))
    other_quantity = _number(_quantity(other))
    current_unit = _normalize_unit(_unit(current))
    other_unit = _normalize_unit(_unit(other))
    if current_unit and other_unit and current_unit != other_unit:
        reason = f"Units are incompatible ({other.get('unit')} vs {current.get('unit')})."
        failures.append(reason)
        differences.append(reason)
        state = FAIL
    elif not current_unit or not other_unit or current_quantity is None or other_quantity is None:
        state, reason = UNKNOWN, "Quantity or unit is not fully specified."
        unknowns.append(reason)
    elif current_quantity != other_quantity:
        state, reason = FAIL, "Quantities differ; neither demand was converted."
        known_differences.append(reason)
        differences.append(reason)
    else:
        state, reason = PASS, "Quantity and unit match."
    comparisons.append(
        Comparison("quantity and unit", str(current_quantity) if current_quantity is not None else None,
                   f"{other_quantity} {_unit(other) or ''}".strip() if other_quantity is not None else None,
                   state, reason)
    )

    current_min_raw, current_max_raw = _price_range(current)
    other_min_raw, other_max_raw = _price_range(other)
    current_min, current_max = _number(current_min_raw), _number(current_max_raw)
    other_min, other_max = _number(other_min_raw), _number(other_max_raw)
    current_currency = normalize_text(_currency(current))
    other_currency = normalize_text(_currency(other))
    if all(value is not None for value in (current_min, current_max, other_min, other_max)):
        if not current_currency or not other_currency:
            state, reason = UNKNOWN, "Target price currency is missing."
            unknowns.append(reason)
        elif current_currency != other_currency:
            state, reason = FAIL, "Target prices use different currencies and cannot be converted."
            failures.append(reason)
            differences.append(reason)
        elif current_max < other_min or other_max < current_min:
            state, reason = FAIL, "Target price ranges do not overlap."
            failures.append(reason)
            differences.append(reason)
        elif current_min == other_min and current_max == other_max:
            state, reason = PASS, "Target price ranges and currencies match."
        else:
            state, reason = PASS, "Target price ranges overlap and use the same currency."
            known_differences.append(reason)
            differences.append(reason)
    else:
        state, reason = UNKNOWN, "One or both demands do not specify a complete target price range."
        unknowns.append(reason)

    def price_text(lower: Optional[Decimal], upper: Optional[Decimal], currency: Any) -> Optional[str]:
        if lower is None or upper is None:
            return None
        return f"{lower:f}–{upper:f} {currency or ''}".strip()

    comparisons.append(
        Comparison(
            "target unit price range",
            price_text(current_min, current_max, _currency(current)),
            price_text(other_min, other_max, _currency(other)),
            state,
            reason,
        )
    )

    current_delivery = _delivery_constraints(current)
    other_delivery = _delivery_constraints(other)
    for key, value in current_delivery.items():
        normalized_key = key
        other_value = other_delivery.get(normalized_key)
        if other_value is None or str(other_value).strip() == "":
            state, reason = UNKNOWN, f"Delivery constraint {normalized_key} was not specified."
            unknowns.append(reason)
        elif _normalized_constraint_value(value) == _normalized_constraint_value(other_value):
            state, reason = PASS, f"Delivery constraint {normalized_key} matches."
        else:
            state, reason = FAIL, f"Delivery constraint {normalized_key} differs."
            failures.append(reason)
            differences.append(reason)
        comparisons.append(
            Comparison(
                f"delivery: {normalized_key}",
                "[specified]",
                "[specified]" if other_value else None,
                state,
                reason,
            )
        )

    if current_category and other_category and not category_related:
        failures.append("Categories are incompatible.")
    if failures:
        classification = INCOMPATIBLE
    elif (
        not unknowns
        and not optional_differences
        and not known_differences
        and _record_product_name(current) == _record_product_name(other)
    ):
        classification = EXACT
    else:
        classification = SIMILAR

    if classification == EXACT:
        explanation = "The product identity, required specifications, quantity, unit, target price range, and known constraints match."
    elif classification == INCOMPATIBLE:
        explanation = "This related demand conflicts with one or more requirements: " + "; ".join(failures)
    else:
        explanation = "This demand is similar, but some details are unknown or differ: " + "; ".join(unknowns + optional_differences + known_differences + differences)

    return MatchResult(
        classification=classification,
        demand=_safe_demand(other),
        other_customer_id=str(other.get("customer_id")) if other.get("customer_id") else None,
        explanation=explanation,
        comparisons=comparisons,
        differences=differences + unknowns + optional_differences,
    )


def analyze_demands(
    current: Dict[str, Any],
    all_demands: Iterable[Dict[str, Any]],
    current_customer_id: str,
    page: int = 1,
    page_size: int = 20,
    classification: str = "all",
) -> Dict[str, Any]:
    if page < 1 or page_size < 1 or page_size > 100:
        raise ValueError("Invalid pagination values.")
    if classification not in {"all", EXACT, SIMILAR, INCOMPATIBLE}:
        raise ValueError("Invalid classification.")

    eligible = [
        demand
        for demand in all_demands
        if is_eligible_demand(demand)
        and str(demand.get("id")) != str(current.get("id"))
    ]
    existing_mine = [
        demand for demand in eligible
        if str(demand.get("customer_id")) == str(current_customer_id)
    ]
    matches: List[MatchResult] = []
    for demand in eligible:
        if str(demand.get("customer_id")) == str(current_customer_id):
            continue
        match = compare_demands(current, demand)
        if match:
            matches.append(match)

    groups = {
        group: [match for match in matches if match.classification == group]
        for group in (EXACT, SIMILAR, INCOMPATIBLE)
    }
    selected = matches if classification == "all" else groups[classification]
    start = (page - 1) * page_size
    compatible = groups[EXACT] + groups[SIMILAR]
    compatible_customer_ids = {
        match.other_customer_id for match in compatible if match.other_customer_id
    }
    compatible_demands = [match.demand for match in compatible]
    quantities = [_number(item.get("quantity")) for item in compatible_demands]
    units = {_normalize_unit(item.get("unit")) for item in compatible_demands}
    total_quantity = (
        sum((quantity for quantity in quantities if quantity is not None), Decimal(0))
        if compatible_demands
        and len(units) == 1
        and None not in units
        and all(quantity is not None and quantity > 0 for quantity in quantities)
        else None
    )
    currencies = {
        str(item.get("currency")).strip().upper()
        if item.get("currency") is not None
        else None
        for item in compatible_demands
    }
    price_ranges = [
        (
            _number(item.get("minimum_target_unit_price")),
            _number(item.get("maximum_target_unit_price")),
        )
        for item in compatible_demands
    ]
    prices_aggregateable = bool(compatible_demands) and (
        len(currencies) == 1
        and None not in currencies
        and all(lower is not None and upper is not None for lower, upper in price_ranges)
    )
    common_requirements: Optional[Dict[str, str]] = None
    for item in compatible_demands:
        requirements = {
            normalize_text(spec.get("name")): str(spec.get("value"))
            for spec in item.get("technical_specifications", [])
            if spec.get("mandatory") is True
            and normalize_text(spec.get("name"))
            and spec.get("value") is not None
        }
        common_requirements = (
            requirements
            if common_requirements is None
            else {
                key: value
                for key, value in common_requirements.items()
                if requirements.get(key) == value
            }
        )
    aggregate_minimum = (
        min(lower for lower, _ in price_ranges if lower is not None)
        if prices_aggregateable
        else None
    )
    aggregate_maximum = (
        max(upper for _, upper in price_ranges if upper is not None)
        if prices_aggregateable
        else None
    )
    common_spec_values = [
        {"name": name, "value": value}
        for name, value in (common_requirements or {}).items()
    ]
    distinct_count = len(compatible_customer_ids)
    return {
        "current_demand": _safe_demand(current),
        "summary": {
            "my_existing_demands_count": len(existing_mine),
            "exact_match_count": len(groups[EXACT]),
            "similar_match_count": len(groups[SIMILAR]),
            "incompatible_match_count": len(groups[INCOMPATIBLE]),
            "distinct_exact_customers_count": len({
                match.other_customer_id
                for match in groups[EXACT]
                if match.other_customer_id
            }),
            "distinct_similar_customers_count": len({
                match.other_customer_id
                for match in groups[SIMILAR]
                if match.other_customer_id
            }),
            "compatible_demand_count": len(compatible_demands),
            "distinct_compatible_customers_count": distinct_count,
            "merchant_opportunity_eligible": is_merchant_opportunity_eligible(distinct_count),
            "total_requested_quantity": total_quantity,
            "total_requested_quantity_unit": next(iter(units)) if total_quantity is not None else None,
            "aggregate_minimum_target_unit_price": aggregate_minimum,
            "aggregate_maximum_target_unit_price": aggregate_maximum,
            "aggregate_currency": next(iter(currencies)) if prices_aggregateable else None,
            "common_mandatory_requirements": common_spec_values,
            "important_differences": list(dict.fromkeys(
                difference for match in compatible for difference in match.differences
            )),
        },
        "results": [
            {
                "classification": match.classification,
                "demand": match.demand,
                "explanation": match.explanation,
                "comparisons": [comparison.__dict__ for comparison in match.comparisons],
                "differences": match.differences,
            }
            for match in selected[start : start + page_size]
        ],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": len(selected),
            "total_pages": (len(selected) + page_size - 1) // page_size,
            "classification": classification,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
