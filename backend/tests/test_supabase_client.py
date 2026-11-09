import ssl
from types import SimpleNamespace

import httpx
import pytest
import supabase
import truststore

from app.core import supabase as supabase_module


def test_supabase_client_uses_verified_system_ca_and_preserves_headers(monkeypatch):
    settings = SimpleNamespace(
        SUPABASE_URL="https://project.supabase.co",
        SUPABASE_KEY="test-publishable-key",
        SUPABASE_SERVICE_ROLE_KEY="test-secret-key",
        is_supabase_configured=True,
    )
    monkeypatch.setattr(supabase_module, "get_settings", lambda: settings)
    monkeypatch.setattr(supabase_module, "_supabase_client", None)

    client = supabase_module.get_supabase_client()

    assert client is not None
    auth_client = client.auth
    assert isinstance(auth_client._http_client, httpx.Client)
    ssl_context = auth_client._http_client._transport._pool._ssl_context
    assert isinstance(ssl_context, truststore.SSLContext)
    assert ssl_context.verify_mode == ssl.CERT_REQUIRED
    assert ssl_context.check_hostname is True

    headers = {name.lower(): value for name, value in auth_client._headers.items()}
    assert headers["user-agent"] == "MarketTwin-backend/1.0"
    assert "apikey" in headers
    assert headers["authorization"].startswith("Bearer ")
    assert "x-client-info" in headers

    auth_client.close()


def test_service_client_uses_only_service_role_key_and_caches(monkeypatch):
    settings = SimpleNamespace(
        SUPABASE_URL="https://project.supabase.co",
        SUPABASE_KEY="test-anon-key",
        SUPABASE_SERVICE_ROLE_KEY="test-service-role-key",
    )
    created = []
    expected_client = object()

    def create_client(url, key, options):
        created.append((url, key, options))
        return expected_client

    monkeypatch.setattr(supabase_module, "get_settings", lambda: settings)
    monkeypatch.setattr(supabase_module, "_supabase_service_client", None)
    monkeypatch.setattr(supabase, "create_client", create_client)

    client = supabase_module.get_supabase_service_client()

    assert client is expected_client
    assert created[0][0] == settings.SUPABASE_URL
    assert created[0][1] == settings.SUPABASE_SERVICE_ROLE_KEY
    assert supabase_module.get_supabase_service_client() is expected_client
    assert len(created) == 1


@pytest.mark.parametrize("anon_key", ["", "test-anon-key"])
def test_service_client_requires_service_role_key_without_anon_fallback(monkeypatch, anon_key):
    settings = SimpleNamespace(
        SUPABASE_URL="https://project.supabase.co",
        SUPABASE_KEY=anon_key,
        SUPABASE_SERVICE_ROLE_KEY="",
    )

    def unexpected_client_creation(*_args, **_kwargs):
        pytest.fail("A service client must not be created without its service-role key.")

    monkeypatch.setattr(supabase_module, "get_settings", lambda: settings)
    monkeypatch.setattr(supabase_module, "_supabase_service_client", None)
    monkeypatch.setattr(supabase, "create_client", unexpected_client_creation)

    assert supabase_module.get_supabase_service_client() is None


def test_service_client_rejects_placeholder_service_role_key(monkeypatch):
    settings = SimpleNamespace(
        SUPABASE_URL="https://project.supabase.co",
        SUPABASE_KEY="test-anon-key",
        SUPABASE_SERVICE_ROLE_KEY="your-service-role-placeholder",
    )

    monkeypatch.setattr(supabase_module, "get_settings", lambda: settings)
    monkeypatch.setattr(supabase_module, "_supabase_service_client", None)
    monkeypatch.setattr(
        supabase,
        "create_client",
        lambda *_args, **_kwargs: pytest.fail("Placeholder credentials must not be used."),
    )

    assert supabase_module.get_supabase_service_client() is None