"""FastAPI entry point for the Klassenzeit backend.

The ``lifespan`` context manager owns the async engine, session factory,
settings, and rate limiter. They live on ``app.state`` rather than as
module-level globals so tests can override them.
"""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker

from klassenzeit_backend.auth.rate_limit import LoginRateLimiter
from klassenzeit_backend.auth.routes import auth_router
from klassenzeit_backend.core.logging import configure_logging
from klassenzeit_backend.core.settings import get_settings
from klassenzeit_backend.db.engine import build_engine
from klassenzeit_backend.scheduling.routes import scheduling_router
from klassenzeit_backend.testing.mount import include_testing_router_if_enabled


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage app lifecycle: initialize shared state on startup, dispose engine on shutdown."""
    settings = get_settings()
    engine = build_engine()
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = async_sessionmaker(
        engine,
        expire_on_commit=False,
    )
    app.state.rate_limiter = LoginRateLimiter(
        max_attempts=settings.login_max_attempts,
        lockout_minutes=settings.login_lockout_minutes,
    )
    try:
        yield
    finally:
        await engine.dispose()


health_router = APIRouter(tags=["health"])


@health_router.get("/health")
async def health() -> dict[str, str]:
    """Return a simple health-check response."""
    return {"status": "ok"}


def build_app(env: str | None) -> FastAPI:
    """Construct the FastAPI app with env-gated routes.

    Staging and production both run with ``KZ_ENV=prod``; the OpenAPI
    schema, Swagger UI, and ReDoc endpoints are disabled there to
    reduce API-shape recon for unauthenticated attackers. Dev and test
    environments keep them mounted at the usual paths.

    ``dump_openapi.py`` reads ``app.openapi()`` directly in-process and
    is unaffected by ``openapi_url=None``: the schema generator runs
    off the registered routes, not the HTTP endpoint.
    """
    settings = get_settings()
    configure_logging(
        env=settings.env,
        log_format=settings.log_format,
        log_level=settings.log_level,
    )
    is_prod = env == "prod"
    new_app = FastAPI(
        title="Klassenzeit",
        lifespan=lifespan,
        openapi_url=None if is_prod else "/api/openapi.json",
        docs_url=None if is_prod else "/api/docs",
        redoc_url=None if is_prod else "/api/redoc",
    )
    new_app.include_router(auth_router, prefix="/api")
    new_app.include_router(scheduling_router, prefix="/api")
    new_app.include_router(health_router, prefix="/api")
    include_testing_router_if_enabled(new_app, env)
    return new_app


# Routing decisions happen at import time. Reading ``KZ_ENV`` directly from
# ``os.environ`` avoids constructing a full ``Settings`` at module load: the
# ``dump_openapi`` script and CI type regeneration import this module without
# a ``KZ_DATABASE_URL`` available. The factory only needs the env name, so
# the lighter dependency is appropriate.

app = build_app(os.environ.get("KZ_ENV"))
