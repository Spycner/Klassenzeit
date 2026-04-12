"""Async engine factory.

One engine per process, created at FastAPI startup (see
``main.py``'s lifespan). Not a module-level singleton — tests build
their own engine in ``conftest.py`` bound to the test database.
"""

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from klassenzeit_backend.core.settings import get_settings


def build_engine() -> AsyncEngine:
    """Build and return a configured async SQLAlchemy engine."""
    settings = get_settings()
    return create_async_engine(
        str(settings.database_url),
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        echo=settings.db_echo,
        pool_pre_ping=True,
    )
