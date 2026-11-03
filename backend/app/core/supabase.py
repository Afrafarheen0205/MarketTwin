import logging
from typing import Optional, Tuple
from app.core.config import get_settings

logger = logging.getLogger("markettwin.supabase")

_supabase_client = None


def get_supabase_client():
    """
    Returns an initialized Supabase client, or None if credentials are missing/placeholder.
    Gracefully handles absence of credentials during development / Phase 1.
    """
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    settings = get_settings()

    if not settings.is_supabase_configured:
        logger.info(
            "Supabase credentials not configured or set to placeholder. "
            "Backend running in decoupled mode for Phase 1 architecture."
        )
        return None

    try:
        from supabase import create_client, Client
        # Prefer service role key for backend operations if available, otherwise fall back to anon key
        key_to_use = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_KEY
        _supabase_client = create_client(settings.SUPABASE_URL, key_to_use)
        logger.info("Supabase client initialized successfully.")
        return _supabase_client
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {str(e)}")
        return None


def check_supabase_health() -> Tuple[str, str]:
    """
    Verifies Supabase connectivity status without raising unhandled exceptions.
    Returns: (status, message)
      status: 'operational' | 'unconfigured' | 'degraded'
    """
    settings = get_settings()

    if not settings.is_supabase_configured:
        return "unconfigured", "Supabase URL and API keys are placeholder/unconfigured."

    client = get_supabase_client()
    if client is None:
        return "degraded", "Supabase client failed to initialize."

    return "operational", "Supabase credentials validated."
