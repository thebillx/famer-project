"""Persist selected satellite acquisitions.

Revision ID: 20260801_0003
Revises: 20260801_0002
Create Date: 2026-08-01
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260801_0003"
down_revision = "20260801_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_fields_id_organization_id",
        "fields",
        ["id", "organization_id"],
    )
    op.create_table(
        "field_acquisitions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("field_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("collection", sa.String(length=80), nullable=False),
        sa.Column("provider_item_id", sa.String(length=512), nullable=False),
        sa.Column("acquired_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("cloud_cover_percent", sa.Numeric(5, 2)),
        sa.Column("search_status", sa.String(length=40), nullable=False),
        sa.Column("searched_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("provider_metadata", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["field_id", "organization_id"],
            ["fields.id", "fields.organization_id"],
            name="fk_field_acquisitions_field_organization",
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("field_id", "provider", "provider_item_id", name="uq_field_acquisition_item"),
    )
    op.create_index("ix_field_acquisitions_field_id", "field_acquisitions", ["field_id"])
    op.create_index("ix_field_acquisitions_organization_id", "field_acquisitions", ["organization_id"])
    op.create_index("ix_field_acquisitions_acquired_at", "field_acquisitions", ["acquired_at"])


def downgrade() -> None:
    op.drop_index("ix_field_acquisitions_acquired_at", table_name="field_acquisitions")
    op.drop_index("ix_field_acquisitions_organization_id", table_name="field_acquisitions")
    op.drop_index("ix_field_acquisitions_field_id", table_name="field_acquisitions")
    op.drop_table("field_acquisitions")
    op.drop_constraint("uq_fields_id_organization_id", "fields", type_="unique")
