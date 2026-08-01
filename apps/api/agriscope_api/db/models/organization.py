"""Organization ORM model."""

from __future__ import annotations

from uuid import UUID as PyUUID

from apps.api.agriscope_api.db.base import Base, TimestampMixin, mapped_column, uuid_pk

try:
    from sqlalchemy import String
    from sqlalchemy.orm import Mapped, relationship
except Exception:  # pragma: no cover
    String = None  # type: ignore[assignment]
    Mapped = object  # type: ignore[assignment]

    def relationship(*args, **kwargs):  # type: ignore[no-untyped-def]
        return None


class Organization(TimestampMixin, Base):
    __tablename__ = "organizations"

    id: Mapped[PyUUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    logo_url: Mapped[str | None] = mapped_column(String(500))
    plan_code: Mapped[str] = mapped_column(String(64), nullable=False, default="starter")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    default_locale: Mapped[str] = mapped_column(String(16), nullable=False, default="th")
    default_timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Bangkok")

    memberships = relationship("Membership", back_populates="organization")
