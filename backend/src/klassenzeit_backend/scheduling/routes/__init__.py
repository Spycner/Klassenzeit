"""Scheduling route collection."""

from fastapi import APIRouter

from klassenzeit_backend.scheduling.routes.subjects import router as subjects_router

scheduling_router = APIRouter()
scheduling_router.include_router(subjects_router)
