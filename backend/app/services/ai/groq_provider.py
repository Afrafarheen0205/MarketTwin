
import json
import logging
from typing import Optional, Sequence

from groq import (
    AsyncGroq,
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
)
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.schemas.ai import (
    AIProviderResponse,
    ConversationMessage,
    RequirementDraft,
)
from app.services.ai.base import (
    AIProvider,
    AIProviderConfigurationError,
    AIProviderInvalidResponse,
    AIProviderTimeout,
    AIProviderUnavailable,
)
from app.services.ai.ollama_provider import (
    _SYSTEM_PROMPT,
    _normalize_provider_response,
    _retry_instruction,
    _validation_error_details,
)

logger = logging.getLogger("markettwin.ai.groq")

GROQ_MODEL = "openai/gpt-oss-20b"

_MAX_ATTEMPTS = 2
_REQUEST_TIMEOUT_SECONDS = 250.0


class GroqProvider(AIProvider):
    """Groq adapter for structured AI requirement conversations."""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self._settings = settings or get_settings()

        if not self._settings.GROQ_API_KEY:
            raise AIProviderConfigurationError(
                "Groq API key is not configured."
            )

        self._client = AsyncGroq(
            api_key=self._settings.GROQ_API_KEY,
            timeout=_REQUEST_TIMEOUT_SECONDS,
        )

    async def converse(
        self,
        message: str,
        history: Sequence[ConversationMessage],
        requirement_draft: RequirementDraft,
    ) -> AIProviderResponse:

        messages = [
            {
                "role": "system",
                "content": (
                    f"{_SYSTEM_PROMPT}\n\n"
                    "Return only one valid JSON object containing exactly "
                    "these top-level fields: assistant_message and "
                    "requirement_draft.\n"
                    "The requirement_draft must contain product_name, "
                    "product_type, category, mandatory_requirements, "
                    "optional_preferences, commercial_constraints, "
                    "and delivery_constraints.\n\n"
                    "Current structured draft:\n"
                    f"{json.dumps(requirement_draft.model_dump(), ensure_ascii=False)}\n\n"
                    "Preserve all previously collected facts unless the "
                    "customer explicitly corrects them."
                ),
            },
            *[
                {"role": item.role, "content": item.content}
                for item in history
            ],
            {"role": "user", "content": message},
        ]

        for attempt in range(_MAX_ATTEMPTS):
            try:
                response = await self._client.chat.completions.create(
                    model=GROQ_MODEL,
                    messages=messages,
                    temperature=0.1,
                    max_completion_tokens=4096,
                    response_format={"type": "json_object"},
                )

            except APITimeoutError as exc:
                raise AIProviderTimeout(
                    "Groq did not respond in time."
                ) from exc

            except APIConnectionError as exc:
                raise AIProviderUnavailable(
                    "Could not connect to Groq."
                ) from exc

            except APIStatusError as exc:
                logger.warning(
                    "Groq returned HTTP status %s.",
                    exc.status_code,
                )
                raise AIProviderUnavailable(
                    "Groq is currently unavailable."
                ) from exc

            try:
                content = response.choices[0].message.content

                if not isinstance(content, str) or not content.strip():
                    raise ValueError("Empty Groq response.")

                parsed_response = json.loads(content)

                normalized_response = _normalize_provider_response(
                    parsed_response
                )

                return AIProviderResponse.model_validate(
                    normalized_response
                )

            except (
                json.JSONDecodeError,
                KeyError,
                IndexError,
                TypeError,
                ValueError,
                ValidationError,
            ) as exc:

                validation_details = (
                    _validation_error_details(exc)
                    if isinstance(exc, ValidationError)
                    else []
                )

                logger.warning(
                    "Groq returned invalid structured response "
                    "(attempt %s/%s).",
                    attempt + 1,
                    _MAX_ATTEMPTS,
                )

                if attempt + 1 == _MAX_ATTEMPTS:
                    raise AIProviderInvalidResponse(
                        "Groq could not produce a valid structured response."
                    ) from exc

                messages[0]["content"] += (
                    "\n\n" + _retry_instruction(validation_details)
                )

        raise AIProviderInvalidResponse(
            "Groq could not produce a valid response."
        )
