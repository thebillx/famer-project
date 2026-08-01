"""User ORM model."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID as PyUUID

from apps.api.agriscope_api.db.base import Base, TimestampMixin, mapped_column, uuid_pk

try:
    from sqlalchemy import DateTime, String
    from sqlalchemy.orm import Mapped, relationship
except Exception:  # pragma: no cover
    DateTime = String = None  # type: ignore[assignment]
    Mapped = object  # type: ignore[assignment]

    def relationship(*args, **kwargs):  # type: ignore[no-untyped-def]
        return None


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[PyUUID] = uuid_pk()
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    display_name: Mapped[str] = mapped_column(String(160), nullable=False)
    locale: Mapped[str] = mapped_column(String(16), nullable=False, default="th")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Bangkok")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    memberships = relationship("Membership", back_populates="user")
