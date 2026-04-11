"""FastAPI session dependency.

The session factory is built at startup by the app's ``lifespan``
context manager and stashed on ``app.state.session_factory``. This
dependency yields one session per request from that factory, scoped
to the request lifetime via ``async with``.

No module-level globals: the factory is retrieved from
``request.app.state`` so tests can override it by swapping the whole
dependency via ``app.dependency_overrides``.
"""

from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    factory: async_sessionmaker[AsyncSession] = request.app.state.session_factory
    async with factory() as session:
        yield session
