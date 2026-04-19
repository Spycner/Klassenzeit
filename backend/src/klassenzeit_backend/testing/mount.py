"""Conditional mount helper for the test-only router.

Kept separate from ``main.py`` so the mount logic can be unit-tested
without spinning up the full application. Takes the environment name
as a plain string rather than a ``Settings`` instance so module-load
time in ``main.py`` does not require a validated ``Settings`` (which
needs ``KZ_DATABASE_URL``; unavailable during ``dump_openapi.py`` and
CI type regeneration).
"""

from fastapi import FastAPI

from klassenzeit_backend.testing.router import testing_router


def include_testing_router_if_enabled(app: FastAPI, env: str | None) -> None:
    """Attach the testing router to ``app`` iff ``env == "test"``.

    In any other environment the router is not mounted at all, so probing
    ``/__test__/*`` returns 404 without leaking the route shape.
    """
    if env == "test":
        app.include_router(testing_router)
