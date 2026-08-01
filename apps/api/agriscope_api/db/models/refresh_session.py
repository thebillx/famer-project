"""Database-backed refresh session model."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID as PyUUID

from apps.api.agriscope_api.db.base import Base, TimestampMixin, mapped_column, uuid_pk

try:
    from sqlalchemy import DateTime, ForeignKey, String
    from sqlalchemy.orm import Mapped, relationship
    from sqlalchemy.dialects.postgresql import UUID
except Exception:  # pragma: no cover
    DateTime = ForeignKey = String = None  # type: ignore[assignment]
    UUID = None  # type: ignore[assignment]
    Mapped = object  # type: ignore[assignment]

    def relationship(*args, **kwargs):  # type: ignore[no-untyped-def]
        return None


class RefreshSession(TimestampMixin, Base):
    __tablename__ = "refresh_sessions"

    id: Mapped[PyUUID] = uuid_pk()
    user_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    rotated_from: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("refresh_sessions.id", ondelete="SET NULL"), index=True
    )
    previous_session = relationship("RefreshSession", remote_side=[id])
