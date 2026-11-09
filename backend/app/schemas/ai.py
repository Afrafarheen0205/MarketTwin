from typing import Literal, Optional
from decimal import Decimal, InvalidOperation

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator


_PROVIDER_PRICE_FIELDS = (
    "min_target_unit_price",
    "max_target_unit_price",
    "target_unit_price",
    "minimum_target_unit_price",
    "maximum_target_unit_price",
    "total_budget",
    "budget",
    "derived_max_unit_budget",
)


class ConversationMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)

    @field_validator("content")
    @classmethod
    def content_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message content cannot be blank.")
        return value


class RequirementDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_name: Optional[str] = Field(
        default=None,
        max_length=160,
        description="Product name stated by the customer.",
    )
    product_type: Optional[str] = Field(
        default=None,
        max_length=160,
        description="Product type stated or clearly identifiable from customer messages.",
    )
    category: Optional[str] = Field(
        default=None,
        max_length=120,
        description="Product category only when identifiable from customer messages.",
    )
    mandatory_requirements: dict[str, str] = Field(
        default_factory=dict,
        max_length=32,
        description=(
            "Explicitly required product attributes. Use keys such as material, capacity, "
            "and application; capacity is not purchase quantity."
        ),
    )
    optional_preferences: dict[str, str] = Field(
        default_factory=dict,
        max_length=32,
        description="Customer-stated optional likes and nice-to-have preferences only.",
    )
    commercial_constraints: dict[str, str] = Field(
        default_factory=dict,
        max_length=16,
        description=(
            "Commercial facts. Store purchase quantity as a numeric string under quantity, "
            "its unit separately under unit, and any stated budget under budget."
        ),
    )
    delivery_constraints: dict[str, str] = Field(
        default_factory=dict,
        max_length=16,
        description=(
            "Delivery facts stated by the customer, using location for destination and "
            "requirement for delivery timing or instructions."
        ),
    )

    @field_validator("product_name", "product_type", "category")
    @classmethod
    def optional_text_must_not_be_blank(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @field_validator(
        "mandatory_requirements",
        "optional_preferences",
        "commercial_constraints",
        "delivery_constraints",
    )
    @classmethod
    def validate_constraint_values(cls, values: dict[str, str]) -> dict[str, str]:
        for key, value in values.items():
            if not key.strip() or len(key) > 80:
                raise ValueError("Requirement names must contain 1 to 80 characters.")
            if not value.strip() or len(value) > 500:
                raise ValueError("Requirement values must contain 1 to 500 characters.")
        return {key.strip(): value.strip() for key, value in values.items()}

    @model_validator(mode="after")
    def prevent_mandatory_preference_overlap(self) -> "RequirementDraft":
        overlap = self.mandatory_requirements.keys() & self.optional_preferences.keys()
        if overlap:
            raise ValueError("A requirement cannot be both mandatory and an optional preference.")
        return self


class AIConversationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=4000)
    conversation_history: list[ConversationMessage] = Field(
        default_factory=list,
        max_length=12,
        validation_alias=AliasChoices("conversation_history", "history"),
        serialization_alias="conversation_history",
    )
    requirement_draft: Optional[RequirementDraft] = None

    @field_validator("message")
    @classmethod
    def message_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message cannot be blank.")
        return value

    @model_validator(mode="after")
    def limit_conversation_text(self) -> "AIConversationRequest":
        total_characters = len(self.message) + sum(len(item.content) for item in self.conversation_history)
        if total_characters > 16000:
            raise ValueError("Conversation text exceeds the allowed limit.")
        return self


class AIProviderResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assistant_message: str = Field(min_length=1, max_length=2000)
    requirement_draft: RequirementDraft

    @field_validator("assistant_message")
    @classmethod
    def assistant_message_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value or value.casefold() in {"null", "none", "undefined"}:
            raise ValueError("Assistant message must contain meaningful text.")
        return value

    @model_validator(mode="after")
    def validate_generated_price_values(self) -> "AIProviderResponse":
        commercial = self.requirement_draft.commercial_constraints
        for field in _PROVIDER_PRICE_FIELDS:
            value = commercial.get(field)
            if value is None:
                continue
            try:
                amount = Decimal(value)
            except InvalidOperation as exc:
                raise ValueError(f"{field} must be a positive numeric string.") from exc
            if not amount.is_finite() or amount <= 0:
                raise ValueError(f"{field} must be a positive numeric string.")
        return self


class AIConversationResponse(BaseModel):
    assistant_message: str
    status: Literal["collecting_information", "ready"]
    requirement_draft: RequirementDraft
    missing_essential_information: list[str] = Field(default_factory=list)
    clarification_questions: list[str] = Field(default_factory=list)
    ready_for_confirmation: bool
