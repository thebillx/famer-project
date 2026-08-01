"""Farm and field persistence.

Revision ID: 20260801_0002
Revises: 20260801_0001
Create Date: 2026-08-01
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

try:
    from geoalchemy2 import Geometry
except Exception:  # pragma: no cover
    Geometry = None  # type: ignore[misc,assignment]

revision = "20260801_0002"
down_revision = "20260801_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "farms",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("province", sa.String(length=120)),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_farms_organization_id", "farms", ["organization_id"])
    op.create_index("ix_farms_status", "farms", ["status"])

    op.create_table(
        "fields",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "farm_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("farms.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("geometry", Geometry(geometry_type="POLYGON", srid=4326), nullable=False),
        sa.Column("area_sqm", sa.Numeric(14, 2), nullable=False),
        sa.Column("area_rai", sa.Numeric(14, 4), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_fields_farm_id", "fields", ["farm_id"])
    op.create_index("ix_fields_organization_id", "fields", ["organization_id"])
    op.create_index("ix_fields_status", "fields", ["status"])
    op.create_index("ix_fields_geometry", "fields", ["geometry"], postgresql_using="gist")


def downgrade() -> None:
    op.drop_index("ix_fields_geometry", table_name="fields", postgresql_using="gist")
    op.drop_index("ix_fields_status", table_name="fields")
    op.drop_index("ix_fields_organization_id", table_name="fields")
    op.drop_index("ix_fields_farm_id", table_name="fields")
    op.drop_table("fields")
    op.drop_index("ix_farms_status", table_name="farms")
    op.drop_index("ix_farms_organization_id", table_name="farms")
    op.drop_table("farms")
