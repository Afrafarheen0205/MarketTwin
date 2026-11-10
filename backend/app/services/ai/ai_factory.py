from app.core.config import Settings, get_settings
from app.services.ai.base import AIProvider, AIProviderConfigurationError
from app.services.ai.ollama_provider import OllamaProvider


def create_ai_provider(
    provider_name: str | None = None,
    settings: Settings | None = None,
) -> AIProvider:
    """Build the configured provider without coupling callers to its implementation."""
    settings = settings or get_settings()
    selected_provider = (provider_name or settings.AI_PROVIDER).strip().lower()

    if selected_provider == "ollama":
        return OllamaProvider(settings)
    raise AIProviderConfigurationError("The configured AI provider is not supported.")
