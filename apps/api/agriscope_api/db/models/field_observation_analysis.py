"""Quality-approved cached analysis for one field observation."""
from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from uuid import UUID as PyUUID
from apps.api.agriscope_api.db.base import Base, TimestampMixin, mapped_column, uuid_pk
try:
    from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, Index, Integer, LargeBinary, Numeric, String, UniqueConstraint
    from sqlalchemy.dialects.postgresql import JSONB, UUID
    from sqlalchemy.orm import Mapped
except Exception:  # pragma: no cover
    CheckConstraint = DateTime = ForeignKeyConstraint = Index = Integer = LargeBinary = None  # type: ignore[assignment]
    Numeric = String = UniqueConstraint = JSONB = UUID = None  # type: ignore[assignment]
    Mapped = object  # type: ignore[assignment]

class FieldObservationAnalysis(TimestampMixin, Base):
    __tablename__ = "field_observation_analyses"
    __table_args__ = (
        ForeignKeyConstraint(["observation_id", "field_id", "organization_id"], ["field_acquisitions.id", "field_acquisitions.field_id", "field_acquisitions.organization_id"], name="fk_observation_analysis_acquisition_field_org", ondelete="RESTRICT"),
        UniqueConstraint("observation_id", "algorithm_version", "geometry_hash", name="uq_observation_analysis_analysis_identity"),
        CheckConstraint("ndvi_min >= -1 AND ndvi_mean >= ndvi_min AND ndvi_max >= ndvi_mean AND ndvi_max <= 1", name="ck_observation_analysis_ndvi_order"),
        CheckConstraint("valid_pixel_ratio > 0 AND valid_pixel_ratio <= 1", name="ck_observation_analysis_valid_ratio"),
        CheckConstraint("ndvi_stddev >= 0 AND ndvi_stddev <= 1", name="ck_observation_analysis_stddev"),
        CheckConstraint("sample_count > 0 AND valid_sample_count > 0 AND valid_sample_count <= sample_count", name="ck_observation_analysis_samples"),
        CheckConstraint("raster_crs = 'EPSG:4326'", name="ck_observation_analysis_crs"),
        CheckConstraint("jsonb_array_length(raster_bounds) = 4 AND (raster_bounds->>0)::numeric < (raster_bounds->>2)::numeric AND (raster_bounds->>1)::numeric < (raster_bounds->>3)::numeric", name="ck_observation_analysis_bounds"),
        CheckConstraint("octet_length(raster_tiff) <= 8388608", name="ck_observation_analysis_raster_bytes"),
        CheckConstraint("raster_width > 0 AND raster_width <= 512 AND raster_height > 0 AND raster_height <= 512", name="ck_observation_analysis_raster_size"),
        Index("ix_observation_analyses_field_acquired", "field_id", "acquired_at"),
    )
    id: Mapped[PyUUID] = uuid_pk()
    observation_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    field_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    organization_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
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
    raster_tiff: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    raster_crs: Mapped[str] = mapped_column(String(32), nullable=False)
    raster_bounds: Mapped[list[float]] = mapped_column(JSONB, nullable=False)
    raster_width: Mapped[int] = mapped_column(Integer, nullable=False)
    raster_height: Mapped[int] = mapped_column(Integer, nullable=False)
