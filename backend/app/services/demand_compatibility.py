import re
import unicodedata
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any, Mapping, Optional, Sequence


@dataclass(frozen=True)
class CompatibilityAssessment:
    status: str
    reasons: tuple[str, ...]
    optional_preference_score: float

    @property
    def compatible(self) -> bool:
        return self.status == "compatible"


@dataclass(frozen=True)
class SemanticCandidateEdge:
    demand_id_a: str
    demand_id_b: str
    cosine_distance: float


@dataclass(frozen=True)
class ClusterRejection:
    demand_ids: tuple[str, ...]
    status: str
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class ClusterPlan:
    groups: tuple[tuple[str, ...], ...]
    rejected_merges: tuple[ClusterRejection, ...]


_PRODUCT_FAMILIES = (
    ("headphones", re.compile(r"\b(?:headphones?|earphones?|earbuds?)\b", re.I)),
    ("smartphone", re.compile(r"\b(?:smart\s*phones?|mobile\s*phones?|cell\s*phones?|phones?)\b", re.I)),
    ("laptop", re.compile(r"\b(?:laptops?|notebooks?)\b", re.I)),
)
_KNOWN_BRANDS = (
    "acer", "apple", "asus", "beats", "bose", "dell", "google", "hp",
    "jbl", "lenovo", "motorola", "oneplus", "samsung", "sennheiser",
    "sony", "xiaomi",
)
_CATEGORY_SPLIT = re.compile(r"[/\\|>]+|[→›»]+")
_SPACE = re.compile(r"\s+")
_KNOWN_UNITS = (
    "terabytes", "terabyte", "tb", "tib", "gigabytes", "gigabyte", "gb", "gib",
    "megabytes", "megabyte", "mb", "mib", "kilobytes", "kilobyte", "kb", "kib",
    "bytes", "byte", "b", "kilograms", "kilogram", "kg", "grams", "gram", "g",
    "pounds", "pound", "lbs", "lb", "millimeters", "millimeter", "mm",
    "centimeters", "centimeter", "cm", "meters", "meter", "m", "inches", "inch",
    "in", "hours", "hour", "hrs", "hr", "minutes", "minute", "mins", "min", "mah",
    "generation", "generations", "gen",
)
_QUANTITY = re.compile(
    r"(?P<number>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*"
    r"(?P<unit>" + "|".join(_KNOWN_UNITS) + r")?\b",
    re.I,
)
_NUMERIC_ATTRIBUTES = {
    "ram", "storage", "processor", "processor generation", "battery life", "battery capacity",
    "weight", "length", "width", "height", "screen size",
}
_ATTRIBUTE_ALIASES = {
    "memory": "ram",
    "system memory": "ram",
    "memory size": "ram",
    "ssd": "storage",
    "ssd capacity": "storage",
    "storage capacity": "storage",
    "cpu": "processor",
    "cpu generation": "processor generation",
    "processor gen": "processor generation",
    "os support": "operating system",
    "operating system compatibility": "operating system",
    "os compatibility": "operating system",
    "windows 11 compatibility": "windows 11 support",
    "network support": "network technology",
    "connectivity": "network technology",
    "microphone quality": "microphone",
    "display": "display technology",
    "display type": "display technology",
    "colour": "color",
}
_EXACT_ATTRIBUTES = {
    "active noise cancellation", "bluetooth 5 2 or newer", "brand", "charging port",
    "color", "material", "network", "network technology", "noise cancellation",
    "operating system", "processor brand", "storage type", "usb type c charging",
    "windows 11 support",
}
_SAME_TEXT_ATTRIBUTES = {"application", "microphone"}


@dataclass(frozen=True)
class _NumericConstraint:
    dimension: str
    lower: Optional[Decimal]
    upper: Optional[Decimal]
    processor_tier: Optional[int] = None


def _text(value: Any) -> str:
    if value is None:
        return ""
    return _SPACE.sub(" ", unicodedata.normalize("NFKC", str(value)).casefold()).strip()


def _normalized(record: Mapping[str, Any]) -> Mapping[str, Any]:
    value = record.get("normalized_requirements")
    return value if isinstance(value, Mapping) else record


def _category_parts(record: Mapping[str, Any]) -> tuple[str, ...]:
    normalized = _normalized(record)
    value = normalized.get("normalized_category") or record.get("category")
    if not isinstance(value, str):
        return ()
    parts = tuple(
        _text(part).strip(" .")
        for part in _CATEGORY_SPLIT.split(value)
        if _text(part).strip(" .")
    )
    return parts


def _category_compatible(left: tuple[str, ...], right: tuple[str, ...]) -> Optional[bool]:
    if not left or not right:
        return None
    shortest, longest = (left, right) if len(left) <= len(right) else (right, left)
    return any(longest[index:index + len(shortest)] == shortest for index in range(len(longest) - len(shortest) + 1))


def _identity(record: Mapping[str, Any]) -> Optional[tuple[str, Optional[str], Optional[str]]]:
    normalized = _normalized(record)
    name = (
        normalized.get("normalized_product_name")
        or normalized.get("product_type")
        or record.get("product_name")
        or record.get("title")
    )
    if not isinstance(name, str) or not name.strip():
        return None

    matches = [family for family, pattern in _PRODUCT_FAMILIES if pattern.search(name)]
    if len(matches) != 1:
        return None

    brand = _text(record.get("brand")) or None
    name_text = _text(name)
    if brand is None:
        brand = next((candidate for candidate in _KNOWN_BRANDS if re.search(rf"\b{re.escape(candidate)}\b", name_text)), None)

    subtype = None
    if matches[0] == "headphones":
        subtypes = {"over-ear": r"\bover\s*[- ]?ear\b", "on-ear": r"\bon\s*[- ]?ear\b", "in-ear": r"\bin\s*[- ]?ear\b"}
        found = [label for label, pattern in subtypes.items() if re.search(pattern, name_text)]
        if len(found) > 1:
            return None
        subtype = found[0] if found else None
    return matches[0], brand, subtype


def _canonical_attribute(value: Any) -> str:
    name = _text(value).replace("_", " ").replace("-", " ")
    name = _SPACE.sub(" ", name).strip()
    return _ATTRIBUTE_ALIASES.get(name, name)


def _requirement_entries(value: Any) -> list[tuple[str, Any]]:
    if isinstance(value, Mapping):
        if "name" in value and "value" in value:
            return [(str(value["name"]), value["value"])]
        return [(str(name), item) for name, item in value.items()]
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        entries = []
        for item in value:
            if not isinstance(item, Mapping):
                continue
            name = item.get("name") or item.get("type") or item.get("key")
            if name is not None and "value" in item:
                entries.append((str(name), item.get("value")))
        return entries
    return []


def _mandatory_by_attribute(record: Mapping[str, Any]) -> dict[str, list[Any]]:
    normalized = _normalized(record)
    requirements = normalized.get("mandatory_requirements")
    result: dict[str, list[Any]] = {}
    for name, value in _requirement_entries(requirements):
        if value is not None and _text(value):
            result.setdefault(_canonical_attribute(name), []).append(value)

    material = normalized.get("normalized_material")
    if material:
        result.setdefault("material", []).append(material)
    return result


def _unit_info(unit: Optional[str], attribute: str) -> Optional[tuple[str, Decimal]]:
    normalized = _text(unit)
    if attribute in {"ram", "storage"}:
        factors = {
            "b": Decimal("0.000000001"), "byte": Decimal("0.000000001"), "bytes": Decimal("0.000000001"),
            "kb": Decimal("0.000001"), "kilobyte": Decimal("0.000001"), "kilobytes": Decimal("0.000001"),
            "kib": Decimal("0.000001024"), "mb": Decimal("0.001"), "megabyte": Decimal("0.001"), "megabytes": Decimal("0.001"),
            "mib": Decimal("0.001048576"), "gb": Decimal("1"), "gigabyte": Decimal("1"), "gigabytes": Decimal("1"),
            "gib": Decimal("1.073741824"), "tb": Decimal("1000"), "terabyte": Decimal("1000"), "terabytes": Decimal("1000"),
            "tib": Decimal("1099.511627776"),
        }
        return ("data_gb", factors[normalized]) if normalized in factors else None
    if attribute == "weight":
        factors = {"kg": Decimal("1"), "kilogram": Decimal("1"), "kilograms": Decimal("1"), "g": Decimal("0.001"), "gram": Decimal("0.001"), "grams": Decimal("0.001"), "lb": Decimal("0.45359237"), "lbs": Decimal("0.45359237"), "pound": Decimal("0.45359237"), "pounds": Decimal("0.45359237")}
        return ("weight_kg", factors[normalized]) if normalized in factors else None
    if attribute in {"length", "width", "height"}:
        factors = {"mm": Decimal("1"), "millimeter": Decimal("1"), "millimeters": Decimal("1"), "cm": Decimal("10"), "centimeter": Decimal("10"), "centimeters": Decimal("10"), "m": Decimal("1000"), "meter": Decimal("1000"), "meters": Decimal("1000")}
        return ("length_mm", factors[normalized]) if normalized in factors else None
    if attribute == "battery life":
        factors = {"min": Decimal("1") / Decimal("60"), "mins": Decimal("1") / Decimal("60"), "minute": Decimal("1") / Decimal("60"), "minutes": Decimal("1") / Decimal("60"), "hr": Decimal("1"), "hrs": Decimal("1"), "hour": Decimal("1"), "hours": Decimal("1")}
        return ("time_hours", factors[normalized]) if normalized in factors else None
    if attribute == "battery capacity":
        return ("battery_capacity_mah", Decimal("1")) if normalized == "mah" else None
    if attribute == "screen size":
        factors = {"in": Decimal("1"), "inch": Decimal("1"), "inches": Decimal("1"), "cm": Decimal("0.3937007874"), "centimeter": Decimal("0.3937007874"), "centimeters": Decimal("0.3937007874")}
        return ("screen_inches", factors[normalized]) if normalized in factors else None
    return None


def _bound_qualifiers(value: str) -> tuple[bool, bool]:
    lower = bool(re.search(r"\b(?:minimum|min|at\s+least|no\s+less\s+than|or\s+newer|or\s+higher|or\s+more)\b|>=|≥|\+", value))
    upper = bool(re.search(r"\b(?:maximum|max|at\s+most|up\s+to|no\s+more\s+than)\b|<=|≤", value))
    return lower, upper


def _processor_constraint(value: str) -> tuple[Optional[_NumericConstraint], bool]:
    tier_match = re.search(r"\bi\s*([3579])\b", value)
    generation_match = re.search(r"\b(\d+)(?:st|nd|rd|th)?\s*[- ]?(?:generation|generations|gen)\b", value)
    if not tier_match or not generation_match:
        return None, bool(re.search(r"\d", value))
    try:
        generation = Decimal(generation_match.group(1))
    except InvalidOperation:
        return None, True
    lower, upper = _bound_qualifiers(value)
    if lower and upper:
        return None, True
    if lower:
        bounds = (generation, None)
    elif upper:
        bounds = (None, generation)
    else:
        bounds = (generation, generation)
    return _NumericConstraint("processor_generation", *bounds, processor_tier=int(tier_match.group(1))), False


def _numeric_constraint(attribute: str, value: Any) -> tuple[Optional[_NumericConstraint], bool]:
    text = _text(value)
    if attribute == "processor":
        return _processor_constraint(text)
    if attribute not in _NUMERIC_ATTRIBUTES:
        return None, False

    matches = list(_QUANTITY.finditer(text))
    if not matches or not any(match.group("unit") for match in matches):
        return None, bool(re.search(r"\d", text))
    if len(matches) > 1 and not re.search(r"\bbetween\b|\bfrom\b|\s-\s|\bto\b", text):
        return None, True

    values = []
    dimension = None
    previous_unit = None
    for match in matches:
        unit = match.group("unit") or previous_unit
        info = _unit_info(unit, attribute)
        if info is None:
            return None, True
        current_dimension, factor = info
        if dimension is not None and current_dimension != dimension:
            return None, True
        dimension = current_dimension
        previous_unit = unit
        try:
            values.append(Decimal(match.group("number").replace(",", "")) * factor)
        except InvalidOperation:
            return None, True

    if len(values) == 1:
        lower, upper = _bound_qualifiers(text)
        if lower and upper:
            return None, True
        if lower:
            bounds = (values[0], None)
        elif upper:
            bounds = (None, values[0])
        elif attribute == "battery capacity":
            bounds = (values[0], None)
        else:
            bounds = (values[0], values[0])
    else:
        if values[0] > values[1]:
            return None, True
        bounds = (values[0], values[1])
    return _NumericConstraint(dimension or "", *bounds), False


def _canonical_value(value: Any) -> str:
    if isinstance(value, Mapping):
        if "value" in value:
            return _canonical_value(value["value"])
        return " ".join(f"{_text(key)}:{_canonical_value(item)}" for key, item in sorted(value.items(), key=lambda pair: _text(pair[0])))
    if isinstance(value, (list, tuple, set)):
        return " | ".join(sorted(_canonical_value(item) for item in value))
    text = _text(value)
    if _canonical_attribute(value) == "material" or text in {"ss304", "ss 304", "stainless steel 304"}:
        return re.sub(r"\bss\s*304\b", "stainless steel 304", text)
    return text


def _network_technology(value: Any) -> Optional[str]:
    text = re.sub(r"[\s_-]+", "", _text(value))
    aliases = {
        "2g": "2g", "gsm": "2g", "3g": "3g", "umts": "3g",
        "4g": "4g", "lte": "4g", "4glte": "4g", "5g": "5g",
        "5gnr": "5g", "nr": "5g", "6g": "6g",
    }
    return aliases.get(text)


def _display_technology_set(value: Any) -> Optional[frozenset[str]]:
    alternatives = re.split(r"\s+or\s+", _text(value))
    technologies: set[str] = set()
    for alternative in alternatives:
        normalized = re.sub(r"\bdisplay\b", "", alternative).strip(" .")
        if normalized == "super amoled":
            technologies.add("super amoled")
        elif normalized == "amoled":
            technologies.add("amoled")
        else:
            return None
    return frozenset(technologies) if technologies else None


def _bluetooth_version_constraint(
    value: Any,
) -> Optional[tuple[Optional[tuple[int, ...]], Optional[tuple[int, ...]]]]:
    text = _text(value)
    matches = list(re.finditer(r"\d+(?:\.\d+)+", text))
    if len(matches) != 1:
        return None
    match = matches[0]
    version_parts = [int(part) for part in match.group().split(".")]
    while len(version_parts) > 1 and version_parts[-1] == 0:
        version_parts.pop()
    version = tuple(version_parts)

    remainder = text[:match.start()] + " " + text[match.end():]
    remainder = re.sub(
        r"\b(?:bluetooth|version|at\s+least|minimum(?:\s+of)?|or\s+newer|"
        r"or\s+later|and\s+above|or\s+above|at\s+most|maximum(?:\s+of)?|"
        r"up\s+to|or\s+older|or\s+earlier)\b",
        " ",
        remainder,
    )
    if re.sub(r"[\s.,:;]+", "", remainder):
        return None
    lower = bool(re.search(r"\b(?:at\s+least|minimum(?:\s+of)?|or\s+newer|or\s+later|and\s+above|or\s+above)\b", text))
    upper = bool(re.search(r"\b(?:at\s+most|maximum(?:\s+of)?|up\s+to|or\s+older|or\s+earlier)\b", text))
    if lower and upper:
        return None
    return (None, version) if upper else (version, None)


def _compare_versions(left: tuple[int, ...], right: tuple[int, ...]) -> int:
    width = max(len(left), len(right))
    padded_left = left + (0,) * (width - len(left))
    padded_right = right + (0,) * (width - len(right))
    return (padded_left > padded_right) - (padded_left < padded_right)


def _optional_score(records: Sequence[Mapping[str, Any]]) -> float:
    values_by_key: dict[str, list[str]] = {}
    for record in records:
        normalized = _normalized(record)
        for name, value in _requirement_entries(normalized.get("optional_preferences")):
            if value is not None and _text(value):
                values_by_key.setdefault(_canonical_attribute(name), []).append(_canonical_value(value))
    compared = [values for values in values_by_key.values() if len(values) > 1]
    if not compared:
        return 0.0
    return sum(len(set(values)) == 1 for values in compared) / len(compared)


def _check_budget_intersection(records: Sequence[Mapping[str, Any]], reasons: list[str], review_reasons: list[str]) -> None:
    intervals: list[tuple[Optional[Decimal], Optional[Decimal], Optional[str]]] = []
    for record in records:
        normalized = _normalized(record)
        commercial = normalized.get("commercial_constraints")
        if not isinstance(commercial, Mapping):
            commercial = {}
        minimum = commercial.get("minimum_target_unit_price", commercial.get("min_target_unit_price"))
        maximum = commercial.get("maximum_target_unit_price", commercial.get("max_target_unit_price"))
        currency = commercial.get("currency") or record.get("currency")
        if minimum is None and maximum is None:
            continue
        try:
            low = Decimal(str(minimum)) if minimum is not None else None
            high = Decimal(str(maximum)) if maximum is not None else None
            if (low is not None and not low.is_finite()) or (high is not None and not high.is_finite()):
                raise InvalidOperation
        except (InvalidOperation, ValueError, TypeError):
            review_reasons.append("budget_unparseable")
            continue
        normalized_currency = _text(currency).upper() if currency else None
        if not normalized_currency:
            review_reasons.append("budget_currency_missing")
            continue
        if low is not None and high is not None and low > high:
            reasons.append("invalid_budget_interval")
            continue
        intervals.append((low, high, normalized_currency))

    currencies = {currency for _, _, currency in intervals}
    if len(currencies) > 1:
        review_reasons.append("budget_currency_mismatch")
        return
    if len(intervals) < 2:
        return
    lowers = [low for low, _, _ in intervals if low is not None]
    uppers = [high for _, high, _ in intervals if high is not None]
    lower = max(lowers) if lowers else None
    upper = min(uppers) if uppers else None
    if lower is not None and upper is not None and lower > upper:
        reasons.append("budget_intersection_empty")


def _check_mandatory_intersections(
    records: Sequence[Mapping[str, Any]],
    reasons: list[str],
    review_reasons: list[str],
) -> None:
    requirements = [_mandatory_by_attribute(record) for record in records]
    attributes = set().union(*(set(mapping) for mapping in requirements))
    for attribute in sorted(attributes):
        values = [value for mapping in requirements for value in mapping.get(attribute, [])]
        if not values:
            continue

        if len(values) < 2:
            if attribute == "network technology":
                if _network_technology(values[0]) is None:
                    review_reasons.append("mandatory_value_unparsed:network_technology")
            elif attribute == "display technology":
                if _display_technology_set(values[0]) is None:
                    review_reasons.append("mandatory_value_unparsed:display_technology")
            elif attribute == "bluetooth version":
                if _bluetooth_version_constraint(values[0]) is None:
                    review_reasons.append("mandatory_value_unparsed:bluetooth_version")
            elif attribute in _NUMERIC_ATTRIBUTES:
                constraint, needs_review = _numeric_constraint(attribute, values[0])
                if needs_review or constraint is None:
                    review_reasons.append(f"mandatory_numeric_unparsed:{attribute.replace(' ', '_')}")
            elif (
                attribute not in _EXACT_ATTRIBUTES
                and attribute not in _SAME_TEXT_ATTRIBUTES
                and attribute != "certifications"
            ):
                review_reasons.append(f"mandatory_value_unparsed:{attribute.replace(' ', '_')}")
            continue

        if attribute == "network technology":
            technologies = [_network_technology(value) for value in values]
            if any(technology is None for technology in technologies):
                review_reasons.append("mandatory_value_unparsed:network_technology")
            elif len(set(technologies)) > 1:
                reasons.append("mandatory_value_conflict:network_technology")
            continue

        if attribute == "display technology":
            supported_sets = [_display_technology_set(value) for value in values]
            if any(supported is None for supported in supported_sets):
                review_reasons.append("mandatory_value_unparsed:display_technology")
                continue
            intersection = set(supported_sets[0] or ())
            for supported in supported_sets[1:]:
                intersection.intersection_update(supported or ())
            if not intersection:
                reasons.append("mandatory_intersection_empty:display_technology")
            continue

        if attribute == "bluetooth version":
            constraints = [_bluetooth_version_constraint(value) for value in values]
            if any(constraint is None for constraint in constraints):
                review_reasons.append("mandatory_value_unparsed:bluetooth_version")
                continue
            parsed = [constraint for constraint in constraints if constraint is not None]
            lowers = [lower for lower, _ in parsed if lower is not None]
            uppers = [upper for _, upper in parsed if upper is not None]
            lower = max(lowers, key=lambda version: version) if lowers else None
            upper = min(uppers, key=lambda version: version) if uppers else None
            if lower is not None and upper is not None and _compare_versions(lower, upper) > 0:
                reasons.append("mandatory_intersection_empty:bluetooth_version")
            continue

        if attribute in _NUMERIC_ATTRIBUTES:
            parsed = [_numeric_constraint(attribute, value) for value in values]
            if any(needs_review for _, needs_review in parsed) or any(constraint is None for constraint, _ in parsed):
                review_reasons.append(f"mandatory_numeric_unparsed:{attribute.replace(' ', '_')}")
                continue
            constraints = [constraint for constraint, _ in parsed if constraint is not None]
            dimensions = {constraint.dimension for constraint in constraints}
            tiers = {constraint.processor_tier for constraint in constraints if constraint.processor_tier is not None}
            if len(dimensions) != 1 or (attribute == "processor" and len(tiers) > 1):
                review_reasons.append(f"mandatory_numeric_incomparable:{attribute.replace(' ', '_')}")
                continue
            lowers = [constraint.lower for constraint in constraints if constraint.lower is not None]
            uppers = [constraint.upper for constraint in constraints if constraint.upper is not None]
            lower = max(lowers) if lowers else None
            upper = min(uppers) if uppers else None
            if lower is not None and upper is not None and lower > upper:
                reasons.append(f"mandatory_intersection_empty:{attribute.replace(' ', '_')}")
            continue

        canonical_values = [_canonical_value(value) for value in values]
        if attribute in _SAME_TEXT_ATTRIBUTES and len(set(canonical_values)) == 1:
            continue
        if attribute in _EXACT_ATTRIBUTES:
            if len(set(canonical_values)) == 1:
                continue
            reasons.append(f"mandatory_value_conflict:{attribute.replace(' ', '_')}")
        elif attribute == "certifications":
            continue
        else:
            review_reasons.append(f"mandatory_value_unparsed:{attribute.replace(' ', '_')}")


def _check_versioned_requirements(
    records: Sequence[Mapping[str, Any]],
    review_reasons: list[str],
) -> None:
    microphone_quality_sets: list[frozenset[str]] = []
    for record in records:
        normalized = _normalized(record)
        applications = normalized.get("application_requirements")
        if isinstance(applications, Mapping) and applications.get("unknown_phrases"):
            review_reasons.append("application_use_case_unrecognized")
        microphone = normalized.get("microphone_requirements")
        if isinstance(microphone, Mapping):
            if microphone.get("unknown_phrases"):
                review_reasons.append("microphone_quality_unrecognized")
            tags = microphone.get("quality_tags")
            if isinstance(tags, Sequence) and not isinstance(tags, (str, bytes)) and tags:
                microphone_quality_sets.append(frozenset(str(tag) for tag in tags))
        if normalized.get("battery_capacity_source_conflict") is True:
            review_reasons.append("battery_capacity_source_conflict")
    if len(set(microphone_quality_sets)) > 1:
        review_reasons.append("microphone_quality_semantics_unresolved")


def assess_group_compatibility(records: Sequence[Mapping[str, Any]]) -> CompatibilityAssessment:
    """Assess whether every demand in a proposed group can be served together."""
    if len(records) < 2:
        return CompatibilityAssessment("needs_review", ("at_least_two_demands_required",), 0.0)

    rejection_reasons: list[str] = []
    review_reasons: list[str] = []
    categories = [_category_parts(record) for record in records]
    identities = [_identity(record) for record in records]

    if any(not category for category in categories):
        review_reasons.append("category_missing")
    elif any(_category_compatible(categories[0], category) is False for category in categories[1:]):
        rejection_reasons.append("category_mismatch")

    if any(identity is None for identity in identities):
        review_reasons.append("product_identity_unrecognized")
    else:
        families = {identity[0] for identity in identities if identity is not None}
        if len(families) > 1:
            rejection_reasons.append("product_identity_mismatch")
        brands = {identity[1] for identity in identities if identity is not None and identity[1]}
        if len(brands) > 1:
            rejection_reasons.append("product_brand_mismatch")
        subtypes = {identity[2] for identity in identities if identity is not None and identity[2]}
        if len(subtypes) > 1:
            rejection_reasons.append("product_subtype_mismatch")

    _check_mandatory_intersections(records, rejection_reasons, review_reasons)
    _check_versioned_requirements(records, review_reasons)
    _check_budget_intersection(records, rejection_reasons, review_reasons)

    reasons = tuple(dict.fromkeys((*rejection_reasons, *review_reasons)))
    status = "rejected" if rejection_reasons else "needs_review" if review_reasons else "compatible"
    return CompatibilityAssessment(status, reasons, _optional_score(records))


def assess_demand_grouping_readiness(record: Mapping[str, Any]) -> CompatibilityAssessment:
    """Check whether one demand is sufficiently understood for standalone grouping."""
    rejection_reasons: list[str] = []
    review_reasons: list[str] = []
    if not _category_parts(record):
        review_reasons.append("category_missing")
    if _identity(record) is None:
        review_reasons.append("product_identity_unrecognized")
    _check_mandatory_intersections([record], rejection_reasons, review_reasons)
    _check_versioned_requirements([record], review_reasons)
    _check_budget_intersection([record], rejection_reasons, review_reasons)
    reasons = tuple(dict.fromkeys((*rejection_reasons, *review_reasons)))
    status = "rejected" if rejection_reasons else "needs_review" if review_reasons else "compatible"
    return CompatibilityAssessment(status, reasons, 0.0)


def build_compatible_clusters(
    records_by_id: Mapping[str, Mapping[str, Any]],
    candidate_edges: Sequence[SemanticCandidateEdge],
) -> ClusterPlan:
    """Build deterministic clusters, checking whole-cluster compatibility at every merge."""
    clusters = [{demand_id} for demand_id in records_by_id]
    rejected: list[ClusterRejection] = []
    ordered_edges = sorted(
        candidate_edges,
        key=lambda edge: (edge.cosine_distance, edge.demand_id_a, edge.demand_id_b),
    )

    for edge in ordered_edges:
        if edge.demand_id_a not in records_by_id or edge.demand_id_b not in records_by_id:
            continue
        left = next((cluster for cluster in clusters if edge.demand_id_a in cluster), None)
        right = next((cluster for cluster in clusters if edge.demand_id_b in cluster), None)
        if left is None or right is None or left is right:
            continue
        combined_ids = sorted(left | right)
        assessment = assess_group_compatibility([records_by_id[item] for item in combined_ids])
        if assessment.compatible:
            left.update(right)
            clusters.remove(right)
        else:
            rejected.append(ClusterRejection(tuple(combined_ids), assessment.status, assessment.reasons))

    groups = tuple(
        sorted(
            (tuple(sorted(cluster)) for cluster in clusters if len(cluster) > 1),
            key=lambda group: group,
        )
    )
    return ClusterPlan(groups, tuple(rejected))