"""Membership ORM model."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID as PyUUID

from apps.api.agriscope_api.db.base import Base, mapped_column, uuid_pk

try:
    from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
    from sqlalchemy.orm import Mapped, relationship
    from sqlalchemy.dialects.postgresql import UUID
except Exception:  # pragma: no cover
    DateTime = ForeignKey = String = UniqueConstraint = None  # type: ignore[assignment]
    UUID = None  # type: ignore[assignment]
    Mapped = object  # type: ignore[assignment]

    def relationship(*args, **kwargs):  # type: ignore[no-untyped-def]
        return None


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_membership_org_user"),)

    id: Mapped[PyUUID] = uuid_pk()
    organization_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    user_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    invited_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    organization = relationship("Organization", back_populates="memberships")
    user = relationship("User", back_populates="memberships", foreign_keys=[user_id])
