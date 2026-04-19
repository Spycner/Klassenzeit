"""Conditional mount helper for the test-only router.

Kept separate from ``main.py`` so the mount logic can be unit-tested
without spinning up the full application.
"""

from fastapi import FastAPI

from klassenzeit_backend.core.settings import Settings
from klassenzeit_backend.testing.router import testing_router


def include_testing_router_if_enabled(app: FastAPI, settings: Settings) -> None:
    """Attach the testing router to ``app`` iff ``settings.env == "test"``.

    In any other environment the router is not mounted at all, so probing
    ``/__test__/*`` returns 404 without leaking the route shape.
    """
    if settings.env == "test":
        app.include_router(testing_router)
