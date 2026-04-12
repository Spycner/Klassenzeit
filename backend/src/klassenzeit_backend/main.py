"""FastAPI entry point for the Klassenzeit backend.

The ``lifespan`` context manager owns the async engine, session factory,
settings, and rate limiter. They live on ``app.state`` rather than as
module-level globals so tests can override them.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker

from klassenzeit_backend.auth.rate_limit import LoginRateLimiter
from klassenzeit_backend.auth.routes import auth_router
from klassenzeit_backend.core.settings import get_settings
from klassenzeit_backend.db.engine import build_engine
from klassenzeit_solver import reverse_chars


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
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


app = FastAPI(title="Klassenzeit", lifespan=lifespan)
app.include_router(auth_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "solver_check": reverse_chars("ok")}
