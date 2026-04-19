"""Unit tests for the conditional mount helper."""

from fastapi import FastAPI
from fastapi.routing import APIRoute

from klassenzeit_backend.core.settings import Settings
from klassenzeit_backend.testing.mount import include_testing_router_if_enabled


def _fake_settings(env: str) -> Settings:
    """Build a Settings instance with a fixed env value."""
    return Settings(
        env=env,  # ty: ignore[invalid-argument-type]  # type: ignore[arg-type]
        database_url="postgresql+psycopg://u:p@localhost/x",  # ty: ignore[invalid-argument-type]  # type: ignore[arg-type]
    )


def _route_paths(app: FastAPI) -> set[str]:
    """Return the set of path strings for all APIRoute entries on ``app``."""
    return {r.path for r in app.routes if isinstance(r, APIRoute)}


def test_mounts_when_env_is_test() -> None:
    app = FastAPI()
    include_testing_router_if_enabled(app, _fake_settings("test"))
    paths = _route_paths(app)
    assert "/__test__/health" in paths
    assert "/__test__/reset" in paths


def test_does_not_mount_when_env_is_dev() -> None:
    app = FastAPI()
    include_testing_router_if_enabled(app, _fake_settings("dev"))
    paths = _route_paths(app)
    assert "/__test__/health" not in paths
    assert "/__test__/reset" not in paths


def test_does_not_mount_when_env_is_prod() -> None:
    app = FastAPI()
    include_testing_router_if_enabled(app, _fake_settings("prod"))
    paths = _route_paths(app)
    assert "/__test__/health" not in paths
    assert "/__test__/reset" not in paths
