"""Async database wiring without import-time connections."""

from __future__ import annotations

from collections.abc import AsyncIterator

try:
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
except Exception:  # pragma: no cover - dependency-light validation path
    AsyncSession = object  # type: ignore[assignment]
    async_sessionmaker = None  # type: ignore[assignment]
    create_async_engine = None  # type: ignore[assignment]

    def text(value: str) -> str:
        return value

from apps.api.agriscope_api.core.config import SettingsSnapshot


def create_engine(settings: SettingsSnapshot):
    if create_async_engine is None:
        raise RuntimeError("SQLAlchemy is required for database access")
    return create_async_engine(
        settings.database_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )


def create_session_factory(engine):
    if async_sessionmaker is None:
        raise RuntimeError("SQLAlchemy is required for database access")
    return async_sessionmaker(engine, expire_on_commit=False)


async def session_scope(session_factory) -> AsyncIterator[AsyncSession]:
    session = session_factory()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


async def check_database(engine) -> bool:
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    return True
