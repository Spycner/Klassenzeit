"""Auth router — collects all auth sub-routers."""

from fastapi import APIRouter

from klassenzeit_backend.auth.routes.login import router as login_router

auth_router = APIRouter()
auth_router.include_router(login_router)
