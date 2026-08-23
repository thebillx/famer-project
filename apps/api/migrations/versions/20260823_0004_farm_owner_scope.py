"""Persist farm ownership and enforce same-organization membership integrity.

Revision ID: 20260823_0004
Revises: 20260801_0003
Create Date: 2026-08-23
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260823_0004"
down_revision = "20260801_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("farms", sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=True))

    # Assign legacy rows only when there is exactly one active organization
    # owner. Ambiguity aborts the transaction instead of guessing an owner.
    ambiguous = (
        op.get_bind()
        .execute(
            sa.text(
                """
            SELECT f.organization_id
            FROM farms f
            LEFT JOIN memberships m
              ON m.organization_id = f.organization_id
             AND m.status = 'active'
             AND m.role = 'organization_owner'
            GROUP BY f.organization_id
            HAVING COUNT(DISTINCT m.user_id) <> 1
            """
            )
        )
        .scalars()
        .all()
    )
    if ambiguous:
        raise RuntimeError(
            "Cannot backfill farms.owner_user_id: each organization with farms "
            "must have exactly one active organization_owner"
        )

    op.execute(
        sa.text(
            """
            UPDATE farms f
            SET owner_user_id = m.user_id
            FROM memberships m
            WHERE m.organization_id = f.organization_id
              AND m.status = 'active'
              AND m.role = 'organization_owner'
            """
        )
    )
    op.alter_column("farms", "owner_user_id", nullable=False)
    op.create_index("ix_farms_owner_user_id", "farms", ["owner_user_id"])
    op.create_foreign_key(
        "fk_farms_owner_membership",
        "farms",
        "memberships",
        ["organization_id", "owner_user_id"],
        ["organization_id", "user_id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint("fk_farms_owner_membership", "farms", type_="foreignkey")
    op.drop_index("ix_farms_owner_user_id", table_name="farms")
    op.drop_column("farms", "owner_user_id")
