"""Health endpoints."""

from __future__ import annotations

from apps.api.agriscope_api.core.config import validate_settings
from apps.api.agriscope_api.core.errors import ApiException
from apps.api.agriscope_api.db.session import check_database

try:
    from fastapi import APIRouter, Request
except Exception:  # pragma: no cover
    APIRouter = None  # type: ignore[assignment]
    Request = object  # type: ignore[assignment]


router = APIRouter(tags=["health"]) if APIRouter else None


if router:

    @router.get("/health/live")
    async def live() -> dict[str, str]:
        return {"status": "live"}

    @router.get("/health/ready")
    async def ready(request: Request) -> dict[str, str]:
        settings = request.app.state.settings
        issues = validate_settings(settings)
        if issues:
            raise ApiException("not_ready", "Service is not ready", 503)
        try:
            database_ready = await check_database(request.app.state.db_engine)
        except Exception:
            database_ready = False
        if not database_ready:
            raise ApiException("not_ready", "Service is not ready", 503)
        return {"status": "ready"}

    @router.get("/health/dependencies")
    async def dependencies(request: Request) -> dict[str, str]:
        try:
            database = "ok" if await check_database(request.app.state.db_engine) else "unavailable"
        except Exception:
            database = "unavailable"
        return {
            "database": database,
            "redis": "not_checked",
            "object_storage": "not_checked",
        }
