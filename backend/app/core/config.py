import os
from functools import lru_cache
from typing import List, Union
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Determine base directory containing .env
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_ENV_FILE_PATH = os.path.join(_BACKEND_DIR, ".env")


class Settings(BaseSettings):
    """
    Application Settings configuration via Pydantic BaseSettings.
    Loads values from environment variables or backend/.env file.
    """
    model_config = SettingsConfigDict(
        env_file=(_ENV_FILE_PATH, ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    # Core Application
    PROJECT_NAME: str = "MarketTwin API"
    VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"

    # CORS
    ALLOWED_ORIGINS: Union[str, List[str]] = "http://localhost:5173,http://127.0.0.1:5173"

    # Supabase Configuration
    SUPABASE_URL: str = Field(default="", description="Supabase project URL")
    SUPABASE_KEY: str = Field(default="", description="Supabase anon public key")
    SUPABASE_SERVICE_ROLE_KEY: str = Field(default="", description="Supabase service role secret key")
    SUPABASE_JWT_SECRET: str = Field(default="", description="Supabase JWT secret for token verification")
    FRONTEND_URL: str = Field(default="http://localhost:5173", description="Frontend base URL for auth redirects")

    @property
    def cors_origins(self) -> List[str]:
        """Returns allowed origins parsed into a clean list of strings."""
        if isinstance(self.ALLOWED_ORIGINS, list):
            return self.ALLOWED_ORIGINS
        if isinstance(self.ALLOWED_ORIGINS, str):
            return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]
        return ["*"]

    @property
    def is_supabase_configured(self) -> bool:
        """Checks if Supabase credentials are valid non-placeholder values."""
        return bool(
            self.SUPABASE_URL
            and self.SUPABASE_KEY
            and "placeholder" not in self.SUPABASE_URL
            and "placeholder" not in self.SUPABASE_KEY
        )


@lru_cache()
def get_settings() -> Settings:
    """Returns cached instance of Settings."""
    return Settings()
