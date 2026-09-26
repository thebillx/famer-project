"""Persisted completed receipts for bounded observation discovery."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID as PyUUID

from apps.api.agriscope_api.db.base import Base, TimestampMixin, mapped_column, uuid_pk

try:
    from sqlalchemy import CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Integer, String, UniqueConstraint
    from sqlalchemy.dialects.postgresql import UUID
    from sqlalchemy.orm import Mapped
except Exception:  # pragma: no cover
    CheckConstraint = DateTime = ForeignKey = ForeignKeyConstraint = Integer = String = UniqueConstraint = None  # type: ignore[assignment]
    UUID = None  # type: ignore[assignment]
    Mapped = object  # type: ignore[assignment]


class FieldBackfillReceipt(TimestampMixin, Base):
    """One committed discovery result for a field geometry and UTC range."""

    __tablename__ = "field_backfill_receipts"
    __table_args__ = (
        ForeignKeyConstraint(
            ["field_id", "organization_id"],
            ["fields.id", "fields.organization_id"],
            name="fk_field_backfill_receipts_field_organization",
            ondelete="RESTRICT",
        ),
        UniqueConstraint(
            "field_id",
            "geometry_hash",
            "start_at",
            "end_at",
            name="uq_field_backfill_receipt_identity",
        ),
        CheckConstraint("start_at <= end_at", name="ck_field_backfill_receipt_range"),
        CheckConstraint("status = 'COMPLETED'", name="ck_field_backfill_receipt_completed"),
        CheckConstraint("pages_discovered >= 0", name="ck_field_backfill_receipt_pages"),
        CheckConstraint("catalog_found_count >= 0", name="ck_field_backfill_receipt_catalog_count"),
        CheckConstraint("persisted_count >= 0", name="ck_field_backfill_receipt_persisted_count"),
        CheckConstraint("rejected_count >= 0", name="ck_field_backfill_receipt_rejected_count"),
    )

    id: Mapped[PyUUID] = uuid_pk()
    field_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    organization_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    geometry_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="COMPLETED")
    pages_discovered: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    catalog_found_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    persisted_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rejected_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    no_history_reason: Mapped[str | None] = mapped_column(String(160), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
