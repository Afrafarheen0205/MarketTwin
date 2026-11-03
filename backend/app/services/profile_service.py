from typing import Any, Dict, Optional

from app.core.supabase import get_supabase_client


def get_profile(user_id: str) -> Optional[Dict[str, Any]]:
    client = get_supabase_client()
    if client is None:
        return None
    try:
        result = client.table("profiles").select("*").eq("id", user_id).single().execute()
        return result.data
    except Exception:
        return None


def get_customer_profile(user_id: str) -> Optional[Dict[str, Any]]:
    client = get_supabase_client()
    if client is None:
        return None
    try:
        result = client.table("customer_profiles").select("*").eq("id", user_id).single().execute()
        return result.data
    except Exception:
        return None


def get_merchant_profile(user_id: str) -> Optional[Dict[str, Any]]:
    client = get_supabase_client()
    if client is None:
        return None
    try:
        result = client.table("merchant_profiles").select("*").eq("id", user_id).single().execute()
        return result.data
    except Exception:
        return None