from abc import ABC, abstractmethod
from typing import Sequence

from app.schemas.ai import AIProviderResponse, ConversationMessage, RequirementDraft


class AIProviderError(Exception):
    """Base class for safe, expected AI provider failures."""


class AIProviderUnavailable(AIProviderError):
    """The configured AI provider could not be reached or is unavailable."""


class AIProviderResourceError(AIProviderUnavailable):
    """The provider cannot run because required local resources are unavailable."""


class AIProviderTimeout(AIProviderError):
    """The AI provider did not respond within the configured timeout."""


class AIProviderInvalidResponse(AIProviderError):
    """The provider returned an empty, malformed, or invalid response."""

    def __init__(
        self,
        message: str,
        *,
        public_message: str | None = None,
    ) -> None:
        super().__init__(message)
        self.public_message = public_message


class AIProviderConfigurationError(AIProviderError):
    """The configured AI provider is unsupported or incomplete."""


class AIProvider(ABC):
    """Interface used by AI business logic independently of any provider."""

    @abstractmethod
    async def converse(
        self,
        message: str,
        history: Sequence[ConversationMessage],
        requirement_draft: RequirementDraft,
    ) -> AIProviderResponse:
        """Return a structured response for the current conversation turn."""
