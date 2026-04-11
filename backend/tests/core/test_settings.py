"""Tests for the Settings class — env loading, prefix, defaults."""

from klassenzeit_backend.core.settings import Settings


def test_settings_reads_kz_prefixed_env(monkeypatch) -> None:
    monkeypatch.setenv(
        "KZ_DATABASE_URL",
        "postgresql+asyncpg://u:p@localhost:5432/kz",
    )
    monkeypatch.setenv("KZ_DB_POOL_SIZE", "7")
    monkeypatch.setenv("KZ_DB_MAX_OVERFLOW", "14")
    monkeypatch.setenv("KZ_DB_ECHO", "true")

    settings = Settings()  # ty: ignore[missing-argument]

    assert str(settings.database_url).startswith("postgresql+asyncpg://")
    assert settings.db_pool_size == 7
    assert settings.db_max_overflow == 14
    assert settings.db_echo is True


def test_settings_applies_defaults(monkeypatch) -> None:
    monkeypatch.setenv(
        "KZ_DATABASE_URL",
        "postgresql+asyncpg://u:p@localhost:5432/kz",
    )
    monkeypatch.delenv("KZ_DB_POOL_SIZE", raising=False)
    monkeypatch.delenv("KZ_DB_MAX_OVERFLOW", raising=False)
    monkeypatch.delenv("KZ_DB_ECHO", raising=False)

    settings = Settings(_env_file=None)  # ty: ignore[missing-argument, unknown-argument]

    assert settings.db_pool_size == 5
    assert settings.db_max_overflow == 10
    assert settings.db_echo is False
