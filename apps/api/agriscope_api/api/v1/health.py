"""Health endpoints."""

from __future__ import annotations

from apps.api.agriscope_api.core.config import load_settings, validate_settings

try:
    from fastapi import APIRouter
except Exception:  # pragma: no cover
    APIRouter = None  # type: ignore[assignment]


router = APIRouter(tags=["health"]) if APIRouter else None


if router:

    @router.get("/health/live")
    async def live() -> dict[str, str]:
        return {"status": "live"}

    @router.get("/health/ready")
    async def ready() -> dict[str, str]:
        settings = load_settings()
        issues = validate_settings(settings)
        return {"status": "ready" if not issues else "not_ready"}

    @router.get("/health/dependencies")
    async def dependencies() -> dict[str, str]:
        return {
            "database": "not_checked",
            "redis": "not_checked",
            "object_storage": "not_checked",
        }
