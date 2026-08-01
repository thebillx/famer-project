"""Runtime dependency wiring for FastAPI."""

from __future__ import annotations

from collections.abc import AsyncIterator

from apps.api.agriscope_api.core.config import SettingsSnapshot

try:
    from fastapi import Request
except Exception:  # pragma: no cover
    Request = object  # type: ignore[assignment]


def get_settings(request: Request) -> SettingsSnapshot:
    return request.app.state.settings


async def get_db_session(request: Request) -> AsyncIterator[object]:
    session_factory = request.app.state.session_factory
    session = session_factory()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
