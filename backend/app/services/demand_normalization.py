import re
import unicodedata
from typing import Any, Mapping, Optional, Sequence

NORMALIZATION_VERSION = "v2"
SOURCE_NORMALIZATION_VERSION = "v1"

_APPLICATION_ALIASES = {
    "software_development": (
        "software development", "programming", "coding", "web development",
    ),
    "developer_tools": ("development tools", "developer tools"),
    "education": ("college projects", "online classes", "online coursework"),
    "multitasking": ("multitasking", "smooth multitasking", "strong multitasking"),
    "productivity": ("general productivity", "productivity"),
    "everyday_use": ("good performance for daily tasks", "daily tasks", "everyday use", "daily use"),
    "social_media": ("social media",),
    "gaming": ("gaming",),
    "photography": ("photography",),
    "entertainment": ("entertainment",),
    "work": ("office work", "professional use", "work"),
    "online_meetings": ("online meetings", "video meetings", "video calls"),
    "music_listening": ("music listening", "listening to music", "music"),
}
_APPLICATION_TAG_BY_ALIAS = {
    alias: tag
    for tag, aliases in _APPLICATION_ALIASES.items()
    for alias in aliases
}
_APPLICATION_PATTERNS = tuple(
    (
        alias,
        re.compile(
            r"(?<![a-z0-9])"
            + re.escape(alias).replace(r"\ ", r"[\s_-]+")
            + r"(?![a-z0-9])",
            re.IGNORECASE,
        ),
    )
    for alias in sorted(_APPLICATION_TAG_BY_ALIAS, key=len, reverse=True)
)
_APPLICATION_EXPLICIT_REQUIREMENT = re.compile(
    r"\b(?:must\s+(?:support|provide|be\s+usable\s+for)|"
    r"should\s+support|need(?:s)?\s+to\s+support|required\s+for)\s+",
    re.IGNORECASE,
)
_BATTERY_SPEC_VALUE = re.compile(
    r"^\s*(?:(?:battery\s+capacity)\s*(?:of\s+|is\s+|:\s*)?)?"
    r"(?:(?:at\s+least|minimum(?:\s+of)?|min\.?|>=)\s*)?"
    r"(?P<amount>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*mAh"
    r"(?:\s*(?:or\s+(?:higher|more|above|greater)|and\s+above))?\s*[.!]?$",
    re.IGNORECASE,
)
_BATTERY_DESCRIPTION = re.compile(
    r"\bbattery\s+capacity\s*(?:of\s+|is\s+|:\s*)?"
    r"(?:(?:at\s+least|minimum(?:\s+of)?|min\.?|>=)\s*)?"
    r"(?P<amount>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*mAh"
    r"(?:\s*(?:or\s+(?:higher|more|above|greater)|and\s+above))?",
    re.IGNORECASE,
)
_CAPACITY_FRAGMENT = re.compile(
    r"battery\s+of\s+(?:at\s+least\s+)?\d+(?:\.\d+)?",
    re.IGNORECASE,
)
_SPLIT_CAPACITY_VALUE = re.compile(r"\d+(?:,\d{3})*\s*mAh", re.IGNORECASE)
_MICROPHONE_NAMES = {
    "microphone",
    "microphone quality",
    "built in microphone",
    "include a built in microphone",
    "clear built in microphone",
    "good quality built in microphone for clear calls",
}
_MICROPHONE_QUALITY_ALIASES = {
    "clarity": ("clear built in microphone", "clear microphone"),
    "good_quality": ("good quality", "good quality microphone"),
    "clear_calls": ("clear calls", "clear call quality"),
}


def _text(value: Any) -> str:
    if value is None:
        return ""
    text = unicodedata.normalize("NFKC", str(value)).casefold()
    text = text.replace("_", " ").replace("-", " ")
    return re.sub(r"\s+", " ", text).strip()


def _entries(value: Any) -> list[tuple[str, str]]:
    if isinstance(value, Mapping):
        if "name" in value and "value" in value:
            return [(str(value["name"]), str(value["value"]))]
        return [(str(name), str(item)) for name, item in value.items() if item is not None]
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        return [
            (str(item.get("name") or item.get("type") or item.get("key")), str(item["value"]))
            for item in value
            if isinstance(item, Mapping)
            and (item.get("name") or item.get("type") or item.get("key"))
            and item.get("value") is not None
        ]
    return []


def _application_tags(value: str, title: str = "") -> tuple[set[str], str]:
    text = _text(value)
    normalized_title = _text(title)
    if normalized_title and text.startswith(normalized_title):
        text = text[len(normalized_title):].strip()
    text = re.sub(r"^(?:for|mainly for|use case(?:s)?\s*:?|application\s*:? )\s*", "", text)

    tags: set[str] = set()
    remaining = text
    for alias, pattern in _APPLICATION_PATTERNS:
        if pattern.search(remaining):
            tags.add(_APPLICATION_TAG_BY_ALIAS[alias])
            remaining = pattern.sub(" ", remaining)
    remaining = re.sub(
        r"\b(?:and|or|for|in|at|the|a|an|my|use|mainly|of|to|with|support|"
        r"must|should|required|be|able|it|is|running|everyday)\b",
        " ",
        remaining,
    )
    unknown = re.sub(r"[^a-z0-9]+", " ", remaining).strip()
    return tags, unknown


def _application_requirements(
    demand: Mapping[str, Any],
    normalized_v1: Mapping[str, Any],
) -> dict[str, list[str]]:
    required: set[str] = set()
    intended: set[str] = set()
    preferred: set[str] = set()
    unknown: set[str] = set()
    title = str(demand.get("title") or demand.get("product_name") or "")

    for field, destination in (
        ("mandatory_requirements", required),
        ("optional_preferences", preferred),
    ):
        for name, value in _entries(normalized_v1.get(field)):
            normalized_name = _text(name)
            if normalized_name == "application":
                explicit = _APPLICATION_EXPLICIT_REQUIREMENT.search(value)
                phrase = value[explicit.end():] if explicit else value
                tags, remainder = _application_tags(phrase, title)
                (required if explicit else intended if field == "mandatory_requirements" else preferred).update(tags)
                if remainder:
                    unknown.add(value.strip())
                continue

            tags, remainder = _application_tags(name)
            if tags and not remainder:
                explicit = _APPLICATION_EXPLICIT_REQUIREMENT.search(value)
                if explicit:
                    explicit_tags, explicit_remainder = _application_tags(value[explicit.end():], title)
                    required.update(explicit_tags or tags)
                    if explicit_remainder:
                        unknown.add(value.strip())
                else:
                    (intended if field == "mandatory_requirements" else preferred).update(tags)
                continue
            if any(alias in normalized_name for alias in ("application", "use case", "usecase")):
                tags, remainder = _application_tags(value, title)
                destination.update(tags)
                if remainder:
                    unknown.add(value.strip())

    for specification in demand.get("technical_specifications") or []:
        if not isinstance(specification, Mapping):
            continue
        name = str(specification.get("name") or "")
        value = str(specification.get("value") or "")
        if _text(name) == "application":
            explicit = _APPLICATION_EXPLICIT_REQUIREMENT.search(value)
            phrase = value[explicit.end():] if explicit else value
            tags, remainder = _application_tags(phrase, title)
            destination = (
                required
                if explicit
                else intended if specification.get("mandatory") is True else preferred
            )
            destination.update(tags)
            if remainder:
                unknown.add(value.strip())
            continue
        tags, remainder = _application_tags(name)
        if tags and not remainder:
            explicit = _APPLICATION_EXPLICIT_REQUIREMENT.search(value)
            if explicit:
                explicit_tags, explicit_remainder = _application_tags(value[explicit.end():], title)
                required.update(explicit_tags or tags)
                if explicit_remainder:
                    unknown.add(value.strip())
            else:
                destination = intended if specification.get("mandatory") is True else preferred
                destination.update(tags)

    return {
        "mandatory_tags": sorted(required),
        "intended_use_tags": sorted(intended),
        "preferred_tags": sorted(preferred),
        "unknown_phrases": sorted(unknown),
    }


def _parse_battery_capacity(value: Any) -> Optional[str]:
    match = _BATTERY_SPEC_VALUE.fullmatch(str(value or ""))
    if not match:
        return None
    amount = match.group("amount").replace(",", "")
    return f"at least {amount} mAh"


def _verified_battery_capacities(
    demand: Mapping[str, Any],
) -> dict[str, list[str]]:
    values = {"mandatory_requirements": set(), "optional_preferences": set()}
    source_values: set[str] = set()
    for specification in demand.get("technical_specifications") or []:
        if isinstance(specification, Mapping) and _text(specification.get("name")) in {
            "battery capacity", "battery capacity mah",
        }:
            parsed = _parse_battery_capacity(specification.get("value"))
            if parsed:
                source_values.add(parsed)
                field = "mandatory_requirements" if specification.get("mandatory") is True else "optional_preferences"
                values[field].add(parsed)
    description = str(demand.get("description") or "")
    for match in _BATTERY_DESCRIPTION.finditer(description):
        parsed = _parse_battery_capacity(match.group(0))
        if parsed:
            source_values.add(parsed)
            sentence_start = max(description.rfind(mark, 0, match.start()) for mark in ".!?\n") + 1
            lead = description[sentence_start:match.start()].casefold()
            if re.search(r"\b(?:prefer|would like|nice to have)\b", lead):
                values["optional_preferences"].add(parsed)
            else:
                values["mandatory_requirements"].add(parsed)
    return {
        **{field: sorted(items) for field, items in values.items()},
        "source_values": sorted(source_values),
    }


def _is_capacity_fragment(name: str, value: str) -> bool:
    normalized_name = _text(name)
    normalized_value = _text(value)
    if normalized_name == "capacity":
        return bool(_CAPACITY_FRAGMENT.fullmatch(normalized_value))
    if normalized_name == "or higher":
        return bool(_SPLIT_CAPACITY_VALUE.fullmatch(value))
    if re.fullmatch(r"\d+(?:,\d{3})*mAh", name, re.IGNORECASE):
        return bool(_SPLIT_CAPACITY_VALUE.fullmatch(value))
    return False


def _microphone_requirements(
    normalized_v1: Mapping[str, Any],
) -> dict[str, Any]:
    presence_required = False
    presence_preferred = False
    quality_tags: set[str] = set()
    preferred_quality_tags: set[str] = set()
    unknown: set[str] = set()
    quality_patterns = tuple(
        (tag, re.compile(r"(?<![a-z0-9])" + re.escape(alias) + r"(?![a-z0-9])", re.I))
        for tag, aliases in _MICROPHONE_QUALITY_ALIASES.items()
        for alias in aliases
    )

    for field, presence_target, quality_target in (
        ("mandatory_requirements", "required", quality_tags),
        ("optional_preferences", "preferred", preferred_quality_tags),
    ):
        for name, value in _entries(normalized_v1.get(field)):
            normalized_name = _text(name)
            combined = _text(f"{name} {value}")
            if "microphone" not in combined:
                continue
            if presence_target == "required":
                presence_required = True
            else:
                presence_preferred = True
            remainder = combined
            for tag, pattern in quality_patterns:
                if pattern.search(remainder):
                    quality_target.add(tag)
                    remainder = pattern.sub(" ", remainder)
            remainder = re.sub(
                r"\b(?:microphone|built in|quality|for|calls?|call|the|a|an|and|"
                r"required|include|including|must|good|clear)\b",
                " ",
                remainder,
            )
            remainder = re.sub(r"[^a-z0-9]+", " ", remainder).strip()
            if remainder:
                unknown.add(value.strip())
            if normalized_name not in _MICROPHONE_NAMES and not any(
                phrase in normalized_name for phrase in ("microphone", "built in microphone")
            ):
                unknown.add(name.strip())

    return {
        "presence_required": presence_required,
        "presence_preferred": presence_preferred,
        "quality_tags": sorted(quality_tags),
        "preferred_quality_tags": sorted(preferred_quality_tags),
        "unknown_phrases": sorted(unknown),
    }


def normalize_demand_v2(
    demand: Mapping[str, Any],
    normalized_v1: Mapping[str, Any],
) -> dict[str, Any]:
    """Derive v2 grouping data without mutating the stored v1 source row."""
    result = dict(normalized_v1)
    requirements: dict[str, list[dict[str, str]]] = {}
    verified_capacities = _verified_battery_capacities(demand)
    source_capacity_values = set(verified_capacities["source_values"])
    battery_capacity_conflict = len(source_capacity_values) > 1
    has_verified_capacity = len(source_capacity_values) == 1 and not battery_capacity_conflict

    for field in ("mandatory_requirements", "optional_preferences"):
        retained = []
        for name, value in _entries(normalized_v1.get(field)):
            normalized_name = _text(name)
            tags, remainder = _application_tags(name)
            is_application = normalized_name == "application" or bool(tags and not remainder)
            is_microphone = "microphone" in normalized_name or "microphone" in _text(value)
            if is_application or is_microphone:
                continue
            if has_verified_capacity and (
                normalized_name == "battery capacity"
                or _is_capacity_fragment(name, value)
            ):
                continue
            retained.append({"name": name, "value": value})
        requirements[field] = retained

    if has_verified_capacity:
        for field in ("mandatory_requirements", "optional_preferences"):
            values = verified_capacities[field]
            requirements[field].extend(
                {"name": "battery_capacity", "value": value}
                for value in values
            )

    result.update({
        "extraction_version": NORMALIZATION_VERSION,
        "mandatory_requirements": requirements["mandatory_requirements"],
        "optional_preferences": requirements["optional_preferences"],
        "application_requirements": _application_requirements(demand, normalized_v1),
        "microphone_requirements": _microphone_requirements(normalized_v1),
        "battery_capacity_source_verified": has_verified_capacity,
        "battery_capacity_source_conflict": battery_capacity_conflict,
    })
    if isinstance(normalized_v1.get("normalized_specifications"), Mapping):
        specifications = dict(normalized_v1["normalized_specifications"])
        if has_verified_capacity:
            for name in list(specifications):
                value = str(specifications[name])
                if _text(name) == "battery capacity" or _is_capacity_fragment(name, value):
                    del specifications[name]
            all_capacities = sorted({value for values in verified_capacities.values() for value in values})
            if len(all_capacities) == 1:
                specifications["battery_capacity"] = all_capacities[0]
        result["normalized_specifications"] = specifications
    return result