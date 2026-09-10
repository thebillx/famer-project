"""Persisted quality-approved NDVI summary."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID as PyUUID

from apps.api.agriscope_api.db.base import Base, TimestampMixin, mapped_column, uuid_pk

try:
    from sqlalchemy import (
        CheckConstraint,
        DateTime,
        ForeignKeyConstraint,
        Index,
        Integer,
        Numeric,
        String,
        UniqueConstraint,
    )
    from sqlalchemy.dialects.postgresql import UUID
    from sqlalchemy.orm import Mapped
except Exception:  # pragma: no cover
    DateTime = None  # type: ignore[assignment]
    CheckConstraint = None  # type: ignore[assignment]
    ForeignKeyConstraint = None  # type: ignore[assignment]
    Index = None  # type: ignore[assignment]
    Integer = None  # type: ignore[assignment]
    Numeric = None  # type: ignore[assignment]
    String = None  # type: ignore[assignment]
    UniqueConstraint = None  # type: ignore[assignment]
    UUID = None  # type: ignore[assignment]
    Mapped = object  # type: ignore[assignment]


class FieldNdviSnapshot(TimestampMixin, Base):
    __tablename__ = "field_ndvi_snapshots"
    __table_args__ = (
        ForeignKeyConstraint(
            ["acquisition_id", "field_id", "organization_id"],
            [
                "field_acquisitions.id",
                "field_acquisitions.field_id",
                "field_acquisitions.organization_id",
            ],
            name="fk_ndvi_snapshot_acquisition_field_organization",
            ondelete="RESTRICT",
        ),
        UniqueConstraint(
            "field_id",
            "acquisition_id",
            "algorithm_version",
            "geometry_hash",
            name="uq_field_ndvi_snapshot_analysis_identity",
        ),
        CheckConstraint(
            "ndvi_min >= -1 AND ndvi_mean >= ndvi_min AND ndvi_max >= ndvi_mean AND ndvi_max <= 1",
            name="ck_field_ndvi_snapshot_value_order",
        ),
        CheckConstraint(
            "ndvi_stddev >= 0 AND ndvi_stddev <= 1",
            name="ck_field_ndvi_snapshot_stddev",
        ),
        CheckConstraint(
            "sample_count > 0 AND valid_sample_count > 0 AND valid_sample_count <= sample_count",
            name="ck_field_ndvi_snapshot_samples",
        ),
        CheckConstraint(
            "valid_pixel_ratio > 0 AND valid_pixel_ratio <= 1",
            name="ck_field_ndvi_snapshot_valid_ratio",
        ),
        Index(
            "ix_field_ndvi_snapshots_field_acquired_at",
            "field_id",
            "acquired_at",
        ),
    )

    id: Mapped[PyUUID] = uuid_pk()
    field_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    organization_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    acquisition_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    algorithm_version: Mapped[str] = mapped_column(String(80), nullable=False)
    geometry_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ndvi_mean: Mapped[Decimal] = mapped_column(Numeric(8, 6), nullable=False)
    ndvi_min: Mapped[Decimal] = mapped_column(Numeric(8, 6), nullable=False)
    ndvi_max: Mapped[Decimal] = mapped_column(Numeric(8, 6), nullable=False)
    ndvi_stddev: Mapped[Decimal] = mapped_column(Numeric(8, 6), nullable=False)
    sample_count: Mapped[int] = mapped_column(Integer, nullable=False)
    valid_sample_count: Mapped[int] = mapped_column(Integer, nullable=False)
    valid_pixel_ratio: Mapped[Decimal] = mapped_column(Numeric(7, 6), nullable=False)
