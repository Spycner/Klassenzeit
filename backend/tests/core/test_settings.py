"""Tests for the Settings class — env loading, prefix, defaults."""

import pytest
from pydantic import ValidationError

from klassenzeit_backend.core.settings import Settings


def test_settings_reads_kz_prefixed_env(monkeypatch) -> None:
    monkeypatch.setenv(
        "KZ_DATABASE_URL",
        "postgresql+psycopg://u:p@localhost:5432/kz",
    )
    monkeypatch.setenv("KZ_DB_POOL_SIZE", "7")
    monkeypatch.setenv("KZ_DB_MAX_OVERFLOW", "14")
    monkeypatch.setenv("KZ_DB_ECHO", "true")

    settings = Settings()  # ty: ignore[missing-argument]

    assert str(settings.database_url).startswith("postgresql+psycopg://")
    assert settings.db_pool_size == 7
    assert settings.db_max_overflow == 14
    assert settings.db_echo is True


def test_settings_applies_defaults(monkeypatch) -> None:
    monkeypatch.setenv(
        "KZ_DATABASE_URL",
        "postgresql+psycopg://u:p@localhost:5432/kz",
    )
    monkeypatch.delenv("KZ_DB_POOL_SIZE", raising=False)
    monkeypatch.delenv("KZ_DB_MAX_OVERFLOW", raising=False)
    monkeypatch.delenv("KZ_DB_ECHO", raising=False)

    settings = Settings(_env_file=None)  # ty: ignore[missing-argument, unknown-argument]

    assert settings.db_pool_size == 5
    assert settings.db_max_overflow == 10
    assert settings.db_echo is False


def test_auth_settings_defaults(monkeypatch) -> None:
    monkeypatch.setenv(
        "KZ_DATABASE_URL",
        "postgresql+psycopg://u:p@localhost:5432/kz",
    )
    settings = Settings(_env_file=None)  # ty: ignore[missing-argument, unknown-argument]

    assert settings.cookie_secure is True
    assert settings.cookie_domain is None
    assert settings.session_ttl_days == 14
    assert settings.password_min_length == 12
    assert settings.login_max_attempts == 5
    assert settings.login_lockout_minutes == 15


def test_auth_settings_from_env(monkeypatch) -> None:
    monkeypatch.setenv(
        "KZ_DATABASE_URL",
        "postgresql+psycopg://u:p@localhost:5432/kz",
    )
    monkeypatch.setenv("KZ_COOKIE_SECURE", "false")
    monkeypatch.setenv("KZ_COOKIE_DOMAIN", "example.com")
    monkeypatch.setenv("KZ_SESSION_TTL_DAYS", "7")
    monkeypatch.setenv("KZ_PASSWORD_MIN_LENGTH", "16")
    monkeypatch.setenv("KZ_LOGIN_MAX_ATTEMPTS", "3")
    monkeypatch.setenv("KZ_LOGIN_LOCKOUT_MINUTES", "30")

    settings = Settings(_env_file=None)  # ty: ignore[missing-argument, unknown-argument]

    assert settings.cookie_secure is False
    assert settings.cookie_domain == "example.com"
    assert settings.session_ttl_days == 7
    assert settings.password_min_length == 16
    assert settings.login_max_attempts == 3
    assert settings.login_lockout_minutes == 30


def test_env_defaults_to_dev(monkeypatch: pytest.MonkeyPatch) -> None:
    """KZ_ENV unset should default to ``"dev"``."""
    monkeypatch.setenv("KZ_DATABASE_URL", "postgresql+psycopg://u:p@localhost/x")
    monkeypatch.delenv("KZ_ENV", raising=False)
    s = Settings(_env_file=None)  # ty: ignore[missing-argument, unknown-argument]
    assert s.env == "dev"


def test_env_reads_kz_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """KZ_ENV=test should set env to ``"test"``."""
    monkeypatch.setenv("KZ_DATABASE_URL", "postgresql+psycopg://u:p@localhost/x")
    monkeypatch.setenv("KZ_ENV", "test")
    s = Settings(_env_file=None)  # ty: ignore[missing-argument, unknown-argument]
    assert s.env == "test"


def test_env_rejects_unknown_value(monkeypatch: pytest.MonkeyPatch) -> None:
    """Unknown env values raise a validation error."""
    monkeypatch.setenv("KZ_DATABASE_URL", "postgresql+psycopg://u:p@localhost/x")
    monkeypatch.setenv("KZ_ENV", "staging")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)  # ty: ignore[missing-argument, unknown-argument]
