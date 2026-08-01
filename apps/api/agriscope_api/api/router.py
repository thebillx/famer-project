"""Root API router wiring."""

from __future__ import annotations

from apps.api.agriscope_api.core.config import SettingsSnapshot


def create_root_router(settings: SettingsSnapshot):
    from fastapi import APIRouter
    from apps.api.agriscope_api.api.v1.auth import router as auth_router
    from apps.api.agriscope_api.api.v1.farms import router as farms_router
    from apps.api.agriscope_api.api.v1.health import router as health_router
    from apps.api.agriscope_api.api.v1.organizations import router as organizations_router

    router = APIRouter()
    router.include_router(health_router)
    router.include_router(auth_router, prefix=settings.api_v1_prefix)
    router.include_router(farms_router, prefix=settings.api_v1_prefix)
    router.include_router(organizations_router, prefix=settings.api_v1_prefix)
    return router
