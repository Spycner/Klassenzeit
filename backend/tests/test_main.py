"""Tests for the FastAPI app factory in ``klassenzeit_backend.main``."""

import pytest

import klassenzeit_backend.core.logging as logging_module
import klassenzeit_backend.main as main_module
from klassenzeit_backend.main import build_app


def test_prod_env_hides_openapi_docs_and_redoc() -> None:
    """KZ_ENV=prod disables the schema, Swagger UI, and ReDoc endpoints."""
    app = build_app(env="prod")
    assert app.openapi_url is None
    assert app.docs_url is None
    assert app.redoc_url is None


def test_dev_env_mounts_openapi_docs_and_redoc() -> None:
    """KZ_ENV=dev keeps the schema, Swagger UI, and ReDoc endpoints mounted."""
    app = build_app(env="dev")
    assert app.openapi_url == "/api/openapi.json"
    assert app.docs_url == "/api/docs"
    assert app.redoc_url == "/api/redoc"


def test_unset_env_mounts_openapi_docs_and_redoc() -> None:
    """env=None (e.g. scripts/dump_openapi.py) keeps docs mounted."""
    app = build_app(env=None)
    assert app.openapi_url == "/api/openapi.json"
    assert app.docs_url == "/api/docs"
    assert app.redoc_url == "/api/redoc"


def test_build_app_calls_configure_logging(monkeypatch: pytest.MonkeyPatch) -> None:
    """build_app(env=...) must call configure_logging before returning."""
    calls: list[dict] = []

    def fake_configure_logging(**kwargs: object) -> None:
        calls.append(kwargs)

    monkeypatch.setattr(main_module, "configure_logging", fake_configure_logging)
    monkeypatch.setattr(logging_module, "_configured", False)

    main_module.build_app(env="dev")
    assert len(calls) == 1
    assert "env" in calls[0]
    assert "log_format" in calls[0]
    assert "log_level" in calls[0]
