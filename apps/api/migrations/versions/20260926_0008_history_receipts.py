"""Persist completed bounded observation-history receipts."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260926_0008"
down_revision = "20260908_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "field_backfill_receipts",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("field_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("geometry_hash", sa.String(length=64), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="COMPLETED"),
        sa.Column("pages_discovered", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("catalog_found_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("persisted_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rejected_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("no_history_reason", sa.String(length=160), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["field_id", "organization_id"],
            ["fields.id", "fields.organization_id"],
            name="fk_field_backfill_receipts_field_organization",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name="fk_field_backfill_receipts_organization",
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "field_id",
            "geometry_hash",
            "start_at",
            "end_at",
            name="uq_field_backfill_receipt_identity",
        ),
        sa.CheckConstraint("start_at <= end_at", name="ck_field_backfill_receipt_range"),
        sa.CheckConstraint("status = 'COMPLETED'", name="ck_field_backfill_receipt_completed"),
        sa.CheckConstraint("pages_discovered >= 0", name="ck_field_backfill_receipt_pages"),
        sa.CheckConstraint("catalog_found_count >= 0", name="ck_field_backfill_receipt_catalog_count"),
        sa.CheckConstraint("persisted_count >= 0", name="ck_field_backfill_receipt_persisted_count"),
        sa.CheckConstraint("rejected_count >= 0", name="ck_field_backfill_receipt_rejected_count"),
    )
    op.create_index(
        "ix_field_backfill_receipts_field_started",
        "field_backfill_receipts",
        ["field_id", "started_at"],
    )
    op.create_index(
        "ix_field_backfill_receipts_organization_id",
        "field_backfill_receipts",
        ["organization_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_field_backfill_receipts_organization_id",
        table_name="field_backfill_receipts",
    )
    op.drop_index(
        "ix_field_backfill_receipts_field_started",
        table_name="field_backfill_receipts",
    )
    op.drop_table("field_backfill_receipts")
