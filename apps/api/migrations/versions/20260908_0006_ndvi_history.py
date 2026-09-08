"""Add NDVI history after the applied observation-analysis revision.

The NDVI-history candidate was never part of the real repository history. It
is intentionally re-homed here so the applied 20260830_0005 revision remains
byte-for-byte immutable and a fresh upgrade cannot execute two revisions that
both create the same acquisition identity constraint.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260908_0006"
down_revision = "20260830_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "field_ndvi_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("field_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("acquisition_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("acquired_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("algorithm_version", sa.String(length=80), nullable=False),
        sa.Column("ndvi_mean", sa.Numeric(8, 6), nullable=False),
        sa.Column("ndvi_min", sa.Numeric(8, 6), nullable=False),
        sa.Column("ndvi_max", sa.Numeric(8, 6), nullable=False),
        sa.Column("ndvi_stddev", sa.Numeric(8, 6), nullable=False),
        sa.Column("sample_count", sa.Integer(), nullable=False),
        sa.Column("valid_sample_count", sa.Integer(), nullable=False),
        sa.Column("valid_pixel_ratio", sa.Numeric(7, 6), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["acquisition_id", "field_id", "organization_id"],
            ["field_acquisitions.id", "field_acquisitions.field_id", "field_acquisitions.organization_id"],
            name="fk_ndvi_snapshot_acquisition_field_organization",
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "field_id", "acquisition_id", "algorithm_version",
            name="uq_field_ndvi_snapshot_acquisition_algorithm",
        ),
        sa.CheckConstraint(
            "ndvi_min >= -1 AND ndvi_mean >= ndvi_min AND ndvi_max >= ndvi_mean AND ndvi_max <= 1",
            name="ck_field_ndvi_snapshot_value_order",
        ),
        sa.CheckConstraint(
            "ndvi_stddev >= 0 AND ndvi_stddev <= 1",
            name="ck_field_ndvi_snapshot_stddev",
        ),
        sa.CheckConstraint(
            "sample_count > 0 AND valid_sample_count > 0 AND valid_sample_count <= sample_count",
            name="ck_field_ndvi_snapshot_samples",
        ),
        sa.CheckConstraint(
            "valid_pixel_ratio > 0 AND valid_pixel_ratio <= 1",
            name="ck_field_ndvi_snapshot_valid_ratio",
        ),
    )
    op.create_index(
        "ix_field_ndvi_snapshots_field_acquired_at",
        "field_ndvi_snapshots",
        ["field_id", "acquired_at"],
    )
    op.create_index(
        "ix_field_ndvi_snapshots_organization_id",
        "field_ndvi_snapshots",
        ["organization_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_field_ndvi_snapshots_organization_id", table_name="field_ndvi_snapshots")
    op.drop_index("ix_field_ndvi_snapshots_field_acquired_at", table_name="field_ndvi_snapshots")
    op.drop_table("field_ndvi_snapshots")
