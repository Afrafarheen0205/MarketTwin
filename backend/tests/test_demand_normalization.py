from copy import deepcopy

from app.services.demand_normalization import NORMALIZATION_VERSION, normalize_demand_v2


def _normalized(mandatory=None, optional=None):
    return {
        "extraction_version": "v1",
        "product_type": "wireless headphones",
        "normalized_product_name": "wireless headphones",
        "normalized_category": "Electronics / Audio / Headphones",
        "normalized_specifications": {},
        "mandatory_requirements": mandatory or [],
        "optional_preferences": optional or [],
        "commercial_constraints": {},
    }


def _entry(name, value):
    return {"name": name, "value": value}


def test_application_phrases_map_to_explicit_intended_use_tags():
    source = _normalized(mandatory=[
        _entry("application", "software development, programming, college projects, and multitasking"),
    ])

    normalized = normalize_demand_v2({"title": "laptop"}, source)

    assert normalized["extraction_version"] == NORMALIZATION_VERSION == "v2"
    assert normalized["application_requirements"] == {
        "mandatory_tags": [],
        "intended_use_tags": ["education", "multitasking", "software_development"],
        "preferred_tags": [],
        "unknown_phrases": [],
    }
    assert normalized["mandatory_requirements"] == []


def test_explicit_mandatory_use_case_and_named_mandatory_tags_are_preserved():
    source = _normalized(mandatory=[
        _entry("application", "must support gaming"),
        _entry("social_media", "required"),
    ])

    normalized = normalize_demand_v2({"title": "smartphone"}, source)

    assert normalized["application_requirements"]["mandatory_tags"] == ["gaming"]
    assert normalized["application_requirements"]["intended_use_tags"] == ["social_media"]
    assert normalized["mandatory_requirements"] == []


def test_generic_mandatory_flags_on_use_case_specs_remain_intended_use():
    demand = {
        "title": "Samsung smartphone",
        "technical_specifications": [
            {"name": "social_media", "value": "required", "mandatory": True},
            {"name": "good_performance_for_daily_tasks", "value": "required", "mandatory": True},
        ],
    }

    normalized = normalize_demand_v2(demand, _normalized())

    assert normalized["application_requirements"]["mandatory_tags"] == []
    assert normalized["application_requirements"]["intended_use_tags"] == ["everyday_use", "social_media"]


def test_application_synonyms_use_union_semantics_and_unknowns_need_review():
    left = normalize_demand_v2(
        {"title": "laptop"},
        _normalized(mandatory=[_entry("application", "coding and college projects")]),
    )
    right = normalize_demand_v2(
        {"title": "laptop"},
        _normalized(mandatory=[_entry("application", "programming and entertainment")]),
    )

    assert left["application_requirements"]["intended_use_tags"] == ["education", "software_development"]
    assert right["application_requirements"]["intended_use_tags"] == ["entertainment", "software_development"]

    unknown = normalize_demand_v2(
        {"title": "laptop"},
        _normalized(mandatory=[_entry("application", "quantum field telemetry")]),
    )
    assert unknown["application_requirements"]["unknown_phrases"] == ["quantum field telemetry"]


def test_microphone_presence_and_quality_are_separate_and_not_equated():
    clear = normalize_demand_v2(
        {"title": "headphones"},
        _normalized(mandatory=[_entry("microphone", "clear built-in microphone")]),
    )
    quality = normalize_demand_v2(
        {"title": "headphones"},
        _normalized(mandatory=[
            _entry("microphone_quality", "good-quality built-in microphone for clear calls"),
        ]),
    )
    presence_only = normalize_demand_v2(
        {"title": "headphones"},
        _normalized(mandatory=[_entry("microphone", "built-in")]),
    )

    assert clear["microphone_requirements"] == {
        "presence_required": True,
        "presence_preferred": False,
        "quality_tags": ["clarity"],
        "preferred_quality_tags": [],
        "unknown_phrases": [],
    }
    assert quality["microphone_requirements"] == {
        "presence_required": True,
        "presence_preferred": False,
        "quality_tags": ["clear_calls", "good_quality"],
        "preferred_quality_tags": [],
        "unknown_phrases": [],
    }
    assert presence_only["microphone_requirements"] == {
        "presence_required": True,
        "presence_preferred": False,
        "quality_tags": [],
        "preferred_quality_tags": [],
        "unknown_phrases": [],
    }


def test_optional_microphone_remains_a_preference():
    normalized = normalize_demand_v2(
        {"title": "headphones"},
        _normalized(optional=[_entry("microphone", "built-in")]),
    )

    assert normalized["microphone_requirements"] == {
        "presence_required": False,
        "presence_preferred": True,
        "quality_tags": [],
        "preferred_quality_tags": [],
        "unknown_phrases": [],
    }


def test_battery_fragments_are_removed_only_when_source_is_complete():
    source = _normalized(mandatory=[
        _entry("battery_capacity", "4,500mAh or higher"),
        _entry("capacity", "battery of 4"),
        _entry("or_higher", "500mah"),
        _entry("500mah", "500mAh"),
        _entry("application", "daily tasks and photography"),
    ])
    source["normalized_specifications"] = {
        "battery_capacity": "4,500mAh or higher",
        "capacity": "battery of 4",
        "or_higher": "500mah",
        "500mah": "500mAh",
    }
    demand = {
        "title": "Samsung smartphone",
        "description": "It must have a battery capacity of 4,500mAh or higher.",
        "technical_specifications": [
            {"name": "battery_capacity", "value": "4,500mAh or higher", "mandatory": True},
            {"name": "capacity", "value": "battery of 4", "mandatory": True},
        ],
    }
    original = deepcopy(source)

    normalized = normalize_demand_v2(demand, source)

    assert source == original
    assert normalized["battery_capacity_source_verified"] is True
    assert normalized["mandatory_requirements"] == [
        _entry("battery_capacity", "at least 4500 mAh"),
    ]
    assert "capacity" not in normalized["normalized_specifications"]
    assert "or_higher" not in normalized["normalized_specifications"]
    assert "500mah" not in normalized["normalized_specifications"]


def test_battery_fragments_are_preserved_when_source_does_not_verify_full_value():
    source = _normalized(mandatory=[
        _entry("capacity", "battery of 4"),
        _entry("or_higher", "500mah"),
    ])

    normalized = normalize_demand_v2(
        {"title": "Samsung smartphone", "description": "A battery of 4 and 500mAh or higher."},
        source,
    )

    assert normalized["battery_capacity_source_verified"] is False
    assert normalized["mandatory_requirements"] == source["mandatory_requirements"]


def test_conflicting_battery_sources_do_not_repair_fragments():
    source = _normalized(mandatory=[
        _entry("battery_capacity", "4,500mAh or higher"),
        _entry("capacity", "battery of 4"),
    ])
    demand = {
        "title": "Samsung smartphone",
        "description": "Battery capacity of 5,000mAh or higher.",
        "technical_specifications": [
            {"name": "battery_capacity", "value": "4,500mAh or higher", "mandatory": True},
        ],
    }

    normalized = normalize_demand_v2(demand, source)

    assert normalized["battery_capacity_source_conflict"] is True
    assert normalized["battery_capacity_source_verified"] is False
    assert normalized["mandatory_requirements"] == source["mandatory_requirements"]