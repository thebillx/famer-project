"""SQLAlchemy declarative base."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

try:
    from sqlalchemy import DateTime
    from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
    from sqlalchemy.dialects.postgresql import UUID
except Exception:  # pragma: no cover - dependency-light validation path
    DeclarativeBase = object  # type: ignore[misc,assignment]
    Mapped = object  # type: ignore[assignment]

    def mapped_column(*args, **kwargs):  # type: ignore[no-untyped-def]
        return None

    DateTime = None  # type: ignore[assignment]
    UUID = None  # type: ignore[assignment]


class Base(DeclarativeBase):  # type: ignore[misc,valid-type]
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


def uuid_pk():
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
