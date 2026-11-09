from app.services.demand_compatibility import (
    SemanticCandidateEdge,
    assess_group_compatibility,
    build_compatible_clusters,
)


def _demand(
    name,
    category,
    mandatory=None,
    optional=None,
    minimum=100,
    maximum=200,
    currency="USD",
    brand=None,
):
    return {
        "id": name,
        "title": name,
        "brand": brand,
        "category": category,
        "normalized_requirements": {
            "product_type": name,
            "normalized_product_name": name,
            "normalized_category": category,
            "mandatory_requirements": mandatory or [],
            "optional_preferences": optional or [],
            "commercial_constraints": {
                "minimum_target_unit_price": minimum,
                "maximum_target_unit_price": maximum,
                "currency": currency,
            },
        },
    }


def _spec(name, value):
    return {"name": name, "value": value}


def test_laptop_pair_uses_persisted_schema_and_normalizes_capacity_units():
    first = _demand(
        "reliable laptop",
        "Computers",
        mandatory=[
            _spec("RAM", "minimum 16 GB"),
            _spec("SSD capacity", "at least 512 GB SSD"),
            _spec("processor", "Intel Core i5 13th-generation or newer"),
        ],
    )
    second = _demand(
        "laptop suitable",
        "Electronics > Computers > Laptops",
        mandatory=[
            _spec("memory", "at least 16384 MiB"),
            _spec("storage", "minimum 0.5 TB SSD"),
            _spec("CPU", "Intel Core i5 14th-generation or newer"),
        ],
    )

    assessment = assess_group_compatibility([first, second])

    assert assessment.status == "compatible"
    assert assessment.reasons == ()


def test_samsung_smartphone_pair_is_compatible():
    first = _demand(
        "Samsung 5G smartphone",
        "Electronics > Mobile Phones",
        mandatory=[_spec("network", "5G")],
    )
    second = _demand(
        "Samsung Galaxy smartphone suitable",
        "Mobile Phones",
        mandatory=[_spec("network", "5G")],
    )

    assessment = assess_group_compatibility([first, second])

    assert assessment.status == "compatible"


def test_over_ear_headphones_pair_is_compatible_and_optional_preferences_only_rank():
    first = _demand(
        "affordable wireless over-ear headphones",
        "Electronics > Audio > Headphones",
        mandatory=[_spec("battery life", "at least 30 hours")],
        optional=[_spec("color", "black")],
    )
    second = _demand(
        "Bluetooth over-ear headphones mainly",
        "Audio > Headphones",
        mandatory=[_spec("battery life", "at least 40 hours")],
        optional=[_spec("color", "white")],
    )

    assessment = assess_group_compatibility([first, second])

    assert assessment.status == "compatible"
    assert assessment.optional_preference_score == 0


def test_headphones_with_disjoint_budgets_are_rejected():
    first = _demand("wireless over-ear headphones", "Headphones", minimum=100, maximum=150)
    second = _demand("Bluetooth over-ear headphones", "Headphones", minimum=151, maximum=220)

    assessment = assess_group_compatibility([first, second])

    assert assessment.status == "rejected"
    assert "budget_intersection_empty" in assessment.reasons


def test_incompatible_numeric_mandatory_specs_are_rejected():
    first = _demand("reliable laptop", "Computers", mandatory=[_spec("RAM", "at least 16GB")])
    second = _demand("laptop suitable", "Computers", mandatory=[_spec("memory", "at most 8 GB")])

    assessment = assess_group_compatibility([first, second])

    assert assessment.status == "rejected"
    assert "mandatory_intersection_empty:ram" in assessment.reasons


def test_cross_category_or_product_family_is_rejected():
    laptop = _demand("reliable laptop", "Computers")
    phone = _demand("Samsung smartphone", "Mobile Phones")

    assessment = assess_group_compatibility([laptop, phone])

    assert assessment.status == "rejected"
    assert "category_mismatch" in assessment.reasons
    assert "product_identity_mismatch" in assessment.reasons


def test_missing_mandatory_requirements_are_neutral():
    specified = _demand("reliable laptop", "Computers", mandatory=[_spec("RAM", "minimum 16GB")])
    unspecified = _demand("laptop suitable", "Computers", mandatory=[])

    assessment = assess_group_compatibility([specified, unspecified])

    assert assessment.status == "compatible"


def test_unsupported_numeric_format_returns_needs_review():
    first = _demand("reliable laptop", "Computers", mandatory=[_spec("RAM", "16 modules")])
    second = _demand("laptop suitable", "Computers", mandatory=[_spec("RAM", "32 modules")])

    assessment = assess_group_compatibility([first, second])

    assert assessment.status == "needs_review"
    assert "mandatory_numeric_unparsed:ram" in assessment.reasons


def test_group_budget_and_spec_intersections_cover_all_members():
    first = _demand(
        "reliable laptop", "Computers",
        mandatory=[_spec("RAM", "between 8GB and 16GB")],
    )
    second = _demand(
        "laptop suitable", "Computers",
        mandatory=[_spec("RAM", "between 12GB and 20GB")],
    )
    third = _demand(
        "business laptop", "Computers",
        mandatory=[_spec("RAM", "between 18GB and 32GB")],
    )

    assert assess_group_compatibility([first, second]).status == "compatible"
    assert assess_group_compatibility([second, third]).status == "compatible"
    whole_group = assess_group_compatibility([first, second, third])
    assert whole_group.status == "rejected"
    assert "mandatory_intersection_empty:ram" in whole_group.reasons

    plan = build_compatible_clusters(
        {"a": first, "b": second, "c": third},
        [
            SemanticCandidateEdge("a", "b", 0.1),
            SemanticCandidateEdge("b", "c", 0.2),
        ],
    )
    assert plan.groups == (("a", "b"),)
    assert len(plan.rejected_merges) == 1
    assert "mandatory_intersection_empty:ram" in plan.rejected_merges[0].reasons


def test_budget_intersection_requires_comparable_currency():
    usd = _demand("reliable laptop", "Computers", currency="USD")
    eur = _demand("laptop suitable", "Computers", currency="EUR")

    assessment = assess_group_compatibility([usd, eur])

    assert assessment.status == "needs_review"
    assert "budget_currency_mismatch" in assessment.reasons


def test_battery_capacity_accepts_thousands_separators_and_lower_bound_forms():
    demands = [
        _demand("Samsung smartphone", "Mobile Phones", mandatory=[
            _spec("battery_capacity", "4,500mAh or higher"),
        ]),
        _demand("Samsung mobile phone", "Mobile Phones", mandatory=[
            _spec("battery_capacity", "at least 4,500 mAh"),
        ]),
        _demand("Samsung mobile phone", "Mobile Phones", mandatory=[
            _spec("battery_capacity", "4500 mAh"),
        ]),
    ]

    assert assess_group_compatibility(demands).status == "compatible"


def test_incompatible_battery_capacity_thresholds_are_rejected():
    first = _demand("Samsung smartphone", "Mobile Phones", mandatory=[
        _spec("battery_capacity", "at least 4,500mAh"),
    ])
    second = _demand("Samsung mobile phone", "Mobile Phones", mandatory=[
        _spec("battery_capacity", "up to 4,499 mAh"),
    ])

    assessment = assess_group_compatibility([first, second])

    assert assessment.status == "rejected"
    assert "mandatory_intersection_empty:battery_capacity" in assessment.reasons


def test_bluetooth_version_prefixes_and_lower_bounds_are_compared():
    first = _demand("wireless headphones", "Headphones", mandatory=[
        _spec("bluetooth_version", "Bluetooth 5.2 or newer"),
    ])
    second = _demand("over-ear headphones", "Headphones", mandatory=[
        _spec("bluetooth_version", "5.2 or newer"),
    ])
    third = _demand("over-ear headphones", "Headphones", mandatory=[
        _spec("bluetooth_version", "at least 5.3"),
    ])

    assert assess_group_compatibility([first, second]).status == "compatible"
    assert assess_group_compatibility([first, third]).status == "compatible"


def test_incompatible_bluetooth_version_thresholds_are_rejected():
    first = _demand("wireless headphones", "Headphones", mandatory=[
        _spec("bluetooth_version", "at least Bluetooth 5.2"),
    ])
    second = _demand("over-ear headphones", "Headphones", mandatory=[
        _spec("bluetooth_version", "up to 5.1"),
    ])

    assessment = assess_group_compatibility([first, second])

    assert assessment.status == "rejected"
    assert "mandatory_intersection_empty:bluetooth_version" in assessment.reasons


def test_display_technology_alternatives_require_a_shared_supported_value():
    alternatives = _demand("Samsung smartphone", "Mobile Phones", mandatory=[
        _spec("display_type", "Super AMOLED or AMOLED"),
    ])
    amoled = _demand("Samsung mobile phone", "Mobile Phones", mandatory=[
        _spec("display", "AMOLED display"),
    ])

    assessment = assess_group_compatibility([alternatives, amoled])

    assert assessment.status == "compatible"

    super_amoled_only = _demand("Samsung smartphone", "Mobile Phones", mandatory=[
        _spec("display_type", "Super AMOLED"),
    ])
    plain_amoled_only = _demand("Samsung mobile phone", "Mobile Phones", mandatory=[
        _spec("display", "AMOLED"),
    ])
    incompatible = assess_group_compatibility([super_amoled_only, plain_amoled_only])

    assert incompatible.status == "rejected"
    assert "mandatory_intersection_empty:display_technology" in incompatible.reasons


def test_os_and_windows_support_aliases_compare_as_exact_values():
    first = _demand("reliable laptop", "Computers", mandatory=[
        _spec("os_support", "Windows 11"),
        _spec("windows_11_support", "required"),
    ])
    second = _demand("business laptop", "Computers", mandatory=[
        _spec("os_compatibility", "windows 11"),
        _spec("windows_11_compatibility", "required"),
    ])

    assert assess_group_compatibility([first, second]).status == "compatible"


def test_network_aliases_match_only_the_same_known_technology():
    first = _demand("Samsung smartphone", "Mobile Phones", mandatory=[
        _spec("network_support", "5g"),
    ])
    same = _demand("Samsung mobile phone", "Mobile Phones", mandatory=[
        _spec("connectivity", "5G"),
    ])
    different = _demand("Samsung mobile phone", "Mobile Phones", mandatory=[
        _spec("connectivity", "4G LTE"),
    ])

    assert assess_group_compatibility([first, same]).status == "compatible"
    conflict = assess_group_compatibility([first, different])
    assert conflict.status == "rejected"
    assert "mandatory_value_conflict:network_technology" in conflict.reasons


def test_malformed_battery_capacity_fragments_remain_needs_review():
    first = _demand("Samsung smartphone", "Mobile Phones", mandatory=[
        _spec("capacity", "battery of 4"),
    ])
    second = _demand("Samsung mobile phone", "Mobile Phones", mandatory=[
        _spec("capacity", "battery of at least 4"),
    ])

    assessment = assess_group_compatibility([first, second])

    assert assessment.status == "needs_review"
    assert "mandatory_value_unparsed:capacity" in assessment.reasons


def test_different_free_text_applications_remain_needs_review():
    first = _demand("reliable laptop", "Computers", mandatory=[
        _spec("application", "software development and college projects"),
    ])
    second = _demand("business laptop", "Computers", mandatory=[
        _spec("application", "coding and running development tools"),
    ])

    assessment = assess_group_compatibility([first, second])

    assert assessment.status == "needs_review"
    assert "mandatory_value_unparsed:application" in assessment.reasons


def test_microphone_alias_does_not_equate_different_quality_descriptions():
    first = _demand("wireless headphones", "Headphones", mandatory=[
        _spec("microphone", "clear built-in microphone"),
    ])
    second = _demand("over-ear headphones", "Headphones", mandatory=[
        _spec("microphone_quality", "good-quality microphone for clear calls"),
    ])

    assessment = assess_group_compatibility([first, second])

    assert assessment.status == "needs_review"
    assert "mandatory_value_unparsed:microphone" in assessment.reasons


def test_v2_application_tags_use_union_semantics_and_unknowns_need_review():
    first = _demand("reliable laptop", "Computers")
    first["normalized_requirements"].update({
        "mandatory_requirements": [],
        "application_requirements": {
            "mandatory_tags": ["gaming"],
            "intended_use_tags": ["software_development"],
            "preferred_tags": [],
            "unknown_phrases": [],
        },
        "microphone_requirements": {
            "presence_required": False,
            "quality_tags": [],
            "unknown_phrases": [],
        },
    })
    second = _demand("business laptop", "Computers")
    second["normalized_requirements"].update({
        "mandatory_requirements": [],
        "application_requirements": {
            "mandatory_tags": ["social_media"],
            "intended_use_tags": ["education"],
            "preferred_tags": [],
            "unknown_phrases": [],
        },
        "microphone_requirements": {
            "presence_required": False,
            "quality_tags": [],
            "unknown_phrases": [],
        },
    })

    assert assess_group_compatibility([first, second]).status == "compatible"

    second["normalized_requirements"]["application_requirements"]["unknown_phrases"] = [
        "quantum field telemetry",
    ]
    assessment = assess_group_compatibility([first, second])
    assert assessment.status == "needs_review"
    assert "application_use_case_unrecognized" in assessment.reasons


def test_v2_microphone_presence_unions_but_distinct_quality_stays_needs_review():
    first = _demand("wireless headphones", "Headphones")
    first["normalized_requirements"].update({
        "mandatory_requirements": [],
        "microphone_requirements": {
            "presence_required": True,
            "quality_tags": ["clarity"],
            "unknown_phrases": [],
        },
    })
    presence_only = _demand("over-ear headphones", "Headphones")
    presence_only["normalized_requirements"].update({
        "mandatory_requirements": [],
        "microphone_requirements": {
            "presence_required": True,
            "quality_tags": [],
            "unknown_phrases": [],
        },
    })
    other_quality = _demand("Bluetooth headphones", "Headphones")
    other_quality["normalized_requirements"].update({
        "mandatory_requirements": [],
        "microphone_requirements": {
            "presence_required": True,
            "quality_tags": ["good_quality", "clear_calls"],
            "unknown_phrases": [],
        },
    })

    assert assess_group_compatibility([first, presence_only]).status == "compatible"
    assessment = assess_group_compatibility([first, other_quality])
    assert assessment.status == "needs_review"
    assert "microphone_quality_semantics_unresolved" in assessment.reasons


def test_v2_conflicting_battery_sources_need_review():
    first = _demand("Samsung smartphone", "Mobile Phones")
    first["normalized_requirements"].update({
        "battery_capacity_source_conflict": True,
        "mandatory_requirements": [],
    })
    second = _demand("Samsung mobile phone", "Mobile Phones")
    second["normalized_requirements"]["mandatory_requirements"] = []

    assessment = assess_group_compatibility([first, second])

    assert assessment.status == "needs_review"
    assert "battery_capacity_source_conflict" in assessment.reasons


def test_unknown_identical_mandatory_values_remain_needs_review():
    first = _demand("reliable laptop", "Computers", mandatory=[
        _spec("unrecognized_constraint", "opaque value"),
    ])
    second = _demand("business laptop", "Computers", mandatory=[
        _spec("unrecognized_constraint", "opaque value"),
    ])

    assessment = assess_group_compatibility([first, second])

    assert assessment.status == "needs_review"
    assert "mandatory_value_unparsed:unrecognized_constraint" in assessment.reasons


def test_known_headphone_feature_flags_allow_exact_matching():
    first = _demand("wireless headphones", "Headphones", mandatory=[
        _spec("active_noise_cancellation", "required"),
        _spec("bluetooth_5_2_or_newer", "required"),
        _spec("noise_cancellation", "Active Noise Cancellation"),
        _spec("usb_type_c_charging", "required"),
    ])
    second = _demand("over-ear headphones", "Headphones", mandatory=[
        _spec("active_noise_cancellation", "required"),
        _spec("bluetooth_5_2_or_newer", "required"),
        _spec("noise_cancellation", "Active Noise Cancellation"),
        _spec("usb_type_c_charging", "required"),
    ])

    assert assess_group_compatibility([first, second]).status == "compatible"