from decimal import Decimal

import pytest

from app.schemas.ai import AIConversationRequest, ConversationMessage, RequirementDraft
from app.services.ai.conversation_service import ConversationService, _extract_explicit_requirements
from app.services.ai.price_understanding import understand_price


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("My target price is ₹4,000.", {"target_unit_price": "4000", "currency": "INR", "price_type": "exact"}),
        ("I am expecting around 3500.", {"target_unit_price": "3500", "price_type": "approximate"}),
        ("Target price: 4k.", {"target_unit_price": "4000", "price_type": "exact"}),
        ("I want it for approximately ₹3,500.", {"target_unit_price": "3500", "currency": "INR", "price_type": "approximate"}),
        ("Around 2.5 thousand per unit.", {"target_unit_price": "2500", "price_type": "approximate"}),
        ("My expected price is 5000 INR.", {"target_unit_price": "5000", "currency": "INR", "price_type": "exact"}),
        ("Up to 5k per piece.", {"max_target_unit_price": "5000", "price_type": "maximum"}),
        ("My budget is ₹5,000 per unit.", {"max_target_unit_price": "5000", "currency": "INR", "price_type": "maximum"}),
        ("Not more than ₹4,000.", {"max_target_unit_price": "4000", "currency": "INR", "price_type": "maximum"}),
        ("At least ₹2,000.", {"min_target_unit_price": "2000", "currency": "INR", "price_type": "minimum"}),
        ("I don't want anything cheaper than 3k.", {"min_target_unit_price": "3000", "price_type": "minimum"}),
        ("Between ₹2,000 and ₹5,000.", {"min_target_unit_price": "2000", "max_target_unit_price": "5000", "currency": "INR", "price_type": "range"}),
        ("2k to 5k.", {"min_target_unit_price": "2000", "max_target_unit_price": "5000", "price_type": "range"}),
        ("Budget range is 3 to 6 thousand.", {"min_target_unit_price": "3000", "max_target_unit_price": "6000", "price_type": "range"}),
        ("Minimum 2k maximum 5k.", {"min_target_unit_price": "2000", "max_target_unit_price": "5000", "price_type": "range"}),
        ("Minimum \u20b92,000 and maximum \u20b95,000.", {"min_target_unit_price": "2000", "max_target_unit_price": "5000", "currency": "INR", "price_type": "range"}),
        ("Between 2,000 and 5,000 rupees.", {"min_target_unit_price": "2000", "max_target_unit_price": "5000", "currency": "INR", "price_type": "range"}),
        ("Budget around \u20b95,000.", {"target_unit_price": "5000", "currency": "INR", "price_type": "approximate"}),
        ("Under \u20b95,000.", {"max_target_unit_price": "5000", "currency": "INR", "price_type": "maximum"}),
        ("\u20b92k-\u20b95k per unit.", {"min_target_unit_price": "2000", "max_target_unit_price": "5000", "currency": "INR", "price_type": "range"}),
        ("Maximum budget of 5,000 INR.", {"max_target_unit_price": "5000", "currency": "INR", "price_type": "maximum"}),
        ("Around 2500–4000 per piece.", {"min_target_unit_price": "2500", "max_target_unit_price": "4000", "price_type": "range"}),
        ("My total budget is 1 lakh.", {"total_budget": "100000", "price_type": "total_budget"}),
        ("Expected price €500.", {"target_unit_price": "500", "currency": "EUR", "price_type": "exact"}),
    ],
)
def test_price_expression_normalizes_values_and_semantics(text, expected):
    interpreted = understand_price(text)
    assert interpreted.clarification is None
    for key, value in expected.items():
        assert interpreted.values[key] == value


def test_budget_ambiguity_requests_scope_instead_of_assuming_unit_or_total():
    interpreted = understand_price("My budget is ₹5,000.")

    assert interpreted.values["price_type"] == "ambiguous_budget"
    assert interpreted.values["price_clarification"]
    assert "min_target_unit_price" not in interpreted.values
    assert "max_target_unit_price" not in interpreted.values
    assert "total_budget" not in interpreted.values


def test_within_budget_without_quantity_or_unit_scope_requests_clarification():
    interpreted = understand_price("Keep it within ₹5,000.")

    assert interpreted.values["price_type"] == "ambiguous_budget"
    assert "max_target_unit_price" not in interpreted.values
    assert "total_budget" not in interpreted.values


@pytest.mark.parametrize("text", ["Target price is $5,000.", "Expected price is ¥500."])
def test_ambiguous_currency_symbols_request_clarification(text):
    interpreted = understand_price(text)

    assert interpreted.clarification == "Which currency does that symbol refer to?"


def test_total_budget_and_quantity_derive_labeled_unit_budget_with_decimal():
    interpreted = understand_price(
        "I need 10 pieces within ₹40,000.",
        quantity=Decimal("10"),
    )

    assert interpreted.values["total_budget"] == "40000"
    assert interpreted.values["derived_max_unit_budget"] == "4000"
    assert interpreted.values["derived_unit_budget_source"] == "total_budget_divided_by_quantity"
    assert interpreted.values["derived_max_unit_budget_is_derived"] == "true"
    assert "max_target_unit_price" not in interpreted.values


def test_total_budget_with_quantity_in_sentence_is_not_unit_price():
    extracted = _extract_explicit_requirements(
        [ConversationMessage(role="user", content="Total budget is 50k for 20 units.")]
    )

    assert extracted.commercial_constraints["quantity"] == "20"
    assert extracted.commercial_constraints["total_budget"] == "50000"
    assert extracted.commercial_constraints["derived_max_unit_budget"] == "2500"
    assert "max_target_unit_price" not in extracted.commercial_constraints


def test_invalid_and_contradictory_ranges_request_clarification():
    reversed_range = understand_price("Price range is ₹5,000 to ₹2,000.")
    contradictory_clauses = understand_price("Minimum target price ₹5,000 and maximum target price ₹2,000.")

    assert "minimum is above its maximum" in reversed_range.clarification
    assert "minimum is above its maximum" in contradictory_clauses.clarification


def test_non_price_specification_numbers_are_not_extracted_as_prices():
    interpreted = understand_price("I need a laptop with 16GB RAM and a 512GB SSD.")

    assert interpreted.values == {}
    assert interpreted.clarification is None


def test_technical_measurement_range_is_not_interpreted_as_a_price():
    interpreted = understand_price("I need a laptop with 16 to 32 GB RAM.")

    assert interpreted.values == {}
    assert interpreted.clarification is None


class EmptyProvider:
    async def converse(self, message, history, requirement_draft):
        from app.schemas.ai import AIProviderResponse

        return AIProviderResponse(
            assistant_message="Captured.",
            requirement_draft=RequirementDraft(),
        )


@pytest.mark.parametrize(
    ("message", "expected_type", "expected_field"),
    [
        ("I need a smartwatch. I need 1 unit, with a minimum target unit price of ₹2,000 and a maximum target unit price of ₹5,000. Mandatory requirements: Heart-rate monitoring, Bluetooth connectivity, Water resistance, Android compatibility. Optional preferences: AMOLED display, GPS, Long battery life.", "range", ("min_target_unit_price", "2000")),
        ("I need 1 laptop. Around ₹50,000.", "approximate", ("target_unit_price", "50000")),
    ],
)
def test_conversation_integrates_price_and_preserves_known_constraints(
    message, expected_type, expected_field
):
    import anyio

    result = anyio.run(
        ConversationService(EmptyProvider()).respond,
        AIConversationRequest(message=message),
    )

    assert result.requirement_draft.commercial_constraints["price_type"] == expected_type
    assert result.requirement_draft.commercial_constraints[expected_field[0]] == expected_field[1]
    if "smartwatch" in message.casefold():
        assert result.requirement_draft.commercial_constraints["max_target_unit_price"] == "5000"
        assert result.requirement_draft.commercial_constraints["quantity"] == "1"
        assert result.requirement_draft.mandatory_requirements == {
            "heart_rate_monitoring": "required",
            "bluetooth_connectivity": "required",
            "water_resistance": "required",
            "android_compatibility": "required",
        }
        assert result.requirement_draft.optional_preferences == {
            "display": "AMOLED",
            "gps": "GPS",
            "battery_life": "Long",
        }
        assert "price_clarification" not in result.missing_essential_information


def test_price_context_survives_follow_up_without_reasking():
    import anyio
    from app.schemas.ai import AIConversationRequest

    first = anyio.run(
        ConversationService(EmptyProvider()).respond,
        AIConversationRequest(message="I need a smartwatch. Around ₹5,000."),
    )
    second = anyio.run(
        ConversationService(EmptyProvider()).respond,
        AIConversationRequest(
            message="I need 1 unit.",
            history=[
                ConversationMessage(role="user", content="I need a smartwatch. Around ₹5,000."),
                ConversationMessage(role="assistant", content=first.assistant_message),
            ],
            requirement_draft=first.requirement_draft,
        ),
    )

    assert second.requirement_draft.commercial_constraints["target_unit_price"] == "5000"
    assert second.ready_for_confirmation is True
    assert not any("price" in question.casefold() for question in second.clarification_questions)


@pytest.mark.parametrize(
    ("answer", "expected_key", "expected_value"),
    [
        ("Per unit.", "max_target_unit_price", "10000"),
        ("For the whole order.", "total_budget", "10000"),
    ],
)
def test_ambiguous_budget_scope_is_resolved_without_losing_quantity(
    answer, expected_key, expected_value
):
    import anyio

    first = anyio.run(
        ConversationService(EmptyProvider()).respond,
        AIConversationRequest(
            message="I need 2 units of a smartwatch. My budget is ₹10,000."
        ),
    )
    second = anyio.run(
        ConversationService(EmptyProvider()).respond,
        AIConversationRequest(
            message=answer,
            history=[
                ConversationMessage(
                    role="user",
                    content="I need 2 units of a smartwatch. My budget is ₹10,000.",
                ),
                ConversationMessage(role="assistant", content=first.assistant_message),
            ],
            requirement_draft=first.requirement_draft,
        ),
    )

    commercial = second.requirement_draft.commercial_constraints
    assert commercial[expected_key] == expected_value
    assert "budget" not in commercial
    assert "price_clarification" not in commercial
    assert commercial["quantity"] == "2"
    if expected_key == "total_budget":
        assert commercial["derived_max_unit_budget"] == "5000"
        assert commercial["derived_max_unit_budget_is_derived"] == "true"


def test_contradictory_bounds_across_turns_request_clarification():
    import anyio

    first = anyio.run(
        ConversationService(EmptyProvider()).respond,
        AIConversationRequest(
            message="I need 1 laptop. Minimum target price is ₹5,000."
        ),
    )
    second = anyio.run(
        ConversationService(EmptyProvider()).respond,
        AIConversationRequest(
            message="Maximum target price is ₹2,000.",
            history=[
                ConversationMessage(
                    role="user",
                    content="I need 1 laptop. Minimum target price is ₹5,000.",
                ),
                ConversationMessage(role="assistant", content=first.assistant_message),
            ],
            requirement_draft=first.requirement_draft,
        ),
    )

    assert second.requirement_draft.commercial_constraints[
        "min_target_unit_price"
    ] == "5000"
    assert second.requirement_draft.commercial_constraints[
        "max_target_unit_price"
    ] == "2000"
    assert "price_clarification" in second.missing_essential_information


def test_unsupported_currency_in_model_draft_requests_clarification():
    import anyio

    result = anyio.run(
        ConversationService(EmptyProvider()).respond,
        AIConversationRequest(
            message="I need 1 laptop.",
            requirement_draft=RequirementDraft(
                product_name="Laptop",
                commercial_constraints={
                    "target_unit_price": "5000",
                    "price_type": "exact",
                    "currency": "XYZ",
                },
            ),
        ),
    )

    assert "price_clarification" in result.missing_essential_information
