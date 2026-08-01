"""Field ORM model."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID as PyUUID

from apps.api.agriscope_api.db.base import Base, TimestampMixin, mapped_column, uuid_pk

try:
    from geoalchemy2 import Geometry
    from sqlalchemy import ForeignKey, ForeignKeyConstraint, Numeric, String
    from sqlalchemy.dialects.postgresql import UUID
    from sqlalchemy.orm import Mapped, relationship
except Exception:  # pragma: no cover
    Geometry = None  # type: ignore[assignment]
    ForeignKey = None  # type: ignore[assignment]
    ForeignKeyConstraint = None  # type: ignore[assignment]
    Numeric = None  # type: ignore[assignment]
    String = None  # type: ignore[assignment]
    UUID = None  # type: ignore[assignment]
    Mapped = object  # type: ignore[assignment]

    def relationship(*args, **kwargs):  # type: ignore[no-untyped-def]
        return None


class Field(TimestampMixin, Base):
    __tablename__ = "fields"
    __table_args__ = (
        ForeignKeyConstraint(
            ["farm_id", "organization_id"],
            ["farms.id", "farms.organization_id"],
            name="fk_fields_farm_organization",
            ondelete="RESTRICT",
        ),
    )

    id: Mapped[PyUUID] = uuid_pk()
    farm_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    organization_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    geometry = mapped_column(Geometry(geometry_type="POLYGON", srid=4326), nullable=False)
    area_sqm: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    area_rai: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active", index=True)

    farm = relationship("Farm", back_populates="fields")
