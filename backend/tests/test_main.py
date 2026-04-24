"""Tests for the FastAPI app factory in ``klassenzeit_backend.main``."""

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
