"""Farm ORM model."""

from __future__ import annotations

from uuid import UUID as PyUUID

from apps.api.agriscope_api.db.base import Base, TimestampMixin, mapped_column, uuid_pk

try:
    from sqlalchemy import ForeignKey, String, UniqueConstraint
    from sqlalchemy.dialects.postgresql import UUID
    from sqlalchemy.orm import Mapped, relationship
except Exception:  # pragma: no cover
    ForeignKey = None  # type: ignore[assignment]
    String = None  # type: ignore[assignment]
    UniqueConstraint = None  # type: ignore[assignment]
    UUID = None  # type: ignore[assignment]
    Mapped = object  # type: ignore[assignment]

    def relationship(*args, **kwargs):  # type: ignore[no-untyped-def]
        return None


class Farm(TimestampMixin, Base):
    __tablename__ = "farms"
    __table_args__ = (UniqueConstraint("id", "organization_id", name="uq_farms_id_organization_id"),)

    id: Mapped[PyUUID] = uuid_pk()
    organization_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    province: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active", index=True)

    fields = relationship("Field", back_populates="farm")
