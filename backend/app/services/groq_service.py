from typing import Any, Dict, List, Optional

from groq import Groq

from app.core.config import get_settings


class GroqService:
    """Reusable Groq client wrapper for AI-powered features."""

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.GROQ_API_KEY
        self.client = Groq(api_key=self.api_key) if self.api_key else None

    def is_configured(self) -> bool:
        return self.client is not None

    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: str = "openai/gpt-oss-20b",
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> str:
        if self.client is None:
            raise RuntimeError("Groq API key is not configured.")
        response = self.client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""


groq_service = GroqService()