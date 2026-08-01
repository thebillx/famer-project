"""Persisted satellite acquisition metadata."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID as PyUUID

from apps.api.agriscope_api.db.base import Base, TimestampMixin, mapped_column, uuid_pk

try:
    from sqlalchemy import DateTime, ForeignKey, ForeignKeyConstraint, Numeric, String, UniqueConstraint
    from sqlalchemy.dialects.postgresql import JSONB, UUID
    from sqlalchemy.orm import Mapped
except Exception:  # pragma: no cover
    DateTime = None  # type: ignore[assignment]
    ForeignKey = None  # type: ignore[assignment]
    ForeignKeyConstraint = None  # type: ignore[assignment]
    JSONB = None  # type: ignore[assignment]
    Numeric = None  # type: ignore[assignment]
    String = None  # type: ignore[assignment]
    UniqueConstraint = None  # type: ignore[assignment]
    UUID = None  # type: ignore[assignment]
    Mapped = object  # type: ignore[assignment]


class FieldAcquisition(TimestampMixin, Base):
    __tablename__ = "field_acquisitions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["field_id", "organization_id"],
            ["fields.id", "fields.organization_id"],
            name="fk_field_acquisitions_field_organization",
            ondelete="RESTRICT",
        ),
        UniqueConstraint("field_id", "provider", "provider_item_id", name="uq_field_acquisition_item"),
    )

    id: Mapped[PyUUID] = uuid_pk()
    field_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    organization_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    collection: Mapped[str] = mapped_column(String(80), nullable=False)
    provider_item_id: Mapped[str] = mapped_column(String(512), nullable=False)
    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    cloud_cover_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    search_status: Mapped[str] = mapped_column(String(40), nullable=False)
    searched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    provider_metadata: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
