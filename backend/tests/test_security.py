from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.core import security


class _Query:
    def __init__(self, data=None, error=None):
        self.data = data
        self.error = error

    def select(self, *_args):
        return self

    def eq(self, *_args):
        return self

    def single(self):
        return self

    def execute(self):
        if self.error:
            raise self.error
        return SimpleNamespace(data=self.data)


class _Client:
    def __init__(self, user, profile=None, profile_error=None):
        self.auth = SimpleNamespace(get_user=lambda _token: SimpleNamespace(user=user))
        self._profile = _Query(profile, profile_error)
        self._merchant_profile = _Query({"status": "PENDING"})

    def table(self, name):
        if name == "profiles":
            return self._profile
        if name == "merchant_profiles":
            return self._merchant_profile
        raise AssertionError(f"Unexpected table: {name}")


def _credentials(token="test-token"):
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _user(**overrides):
    values = {
        "id": "user-1",
        "email": "user@example.test",
        "email_confirmed_at": "verified",
        "user_metadata": {"role": "customer"},
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_profile_role_overrides_user_editable_metadata(monkeypatch):
    monkeypatch.setattr(
        security,
        "get_supabase_client",
        lambda: _Client(_user(), profile={"role": "merchant"}),
    )

    current_user = security.get_current_user(_credentials())

    assert current_user["role"] == "merchant"
    with pytest.raises(HTTPException) as error:
        security.require_roles("customer")(current_user)
    assert error.value.status_code == 403


def test_profile_lookup_failure_does_not_fall_back_to_customer_metadata(monkeypatch):
    monkeypatch.setattr(
        security,
        "get_supabase_client",
        lambda: _Client(
            _user(),
            profile_error=RuntimeError("database unavailable"),
        ),
    )

    with pytest.raises(HTTPException) as error:
        security.get_current_user(_credentials())

    assert error.value.status_code == 503
    assert "database unavailable" not in error.value.detail


def test_missing_profile_role_is_denied_even_when_metadata_says_customer(monkeypatch):
    monkeypatch.setattr(
        security,
        "get_supabase_client",
        lambda: _Client(_user(), profile=None),
    )

    with pytest.raises(HTTPException) as error:
        security.get_current_user(_credentials())

    assert error.value.status_code == 403


def test_invalid_token_error_does_not_expose_provider_details(monkeypatch):
    secret_error = RuntimeError("sensitive provider diagnostic")
    client = _Client(_user())
    client.auth.get_user = lambda _token: (_ for _ in ()).throw(secret_error)
    monkeypatch.setattr(security, "get_supabase_client", lambda: client)

    with pytest.raises(HTTPException) as error:
        security.get_current_user(_credentials("private-token"))

    assert error.value.status_code == 401
    assert "sensitive provider diagnostic" not in error.value.detail
