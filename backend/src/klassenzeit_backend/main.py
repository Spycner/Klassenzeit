"""FastAPI entry point for the Klassenzeit backend.

The ``lifespan`` context manager owns the async engine and the session
factory. They live on ``app.state`` rather than as module-level globals
so tests can override the dependency (``get_session``) without having
to monkey-patch module-scope state.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker

from klassenzeit_backend.db.engine import build_engine
from klassenzeit_solver import reverse_chars


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    engine = build_engine()
    app.state.engine = engine
    app.state.session_factory = async_sessionmaker(
        engine,
        expire_on_commit=False,
    )
    try:
        yield
    finally:
        await engine.dispose()


app = FastAPI(title="Klassenzeit", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "solver_check": reverse_chars("ok")}
