"""Preserve geometry identity for derived observation measurements."""

from alembic import op
import sqlalchemy as sa


revision = "20260908_0007"
down_revision = "20260908_0006"
branch_labels = None
depends_on = None


def _has_constraint(table_name: str, constraint_name: str) -> bool:
    return bool(
        op.get_bind()
        .execute(
            sa.text(
                """
                SELECT 1 FROM pg_constraint
                WHERE conrelid = to_regclass(:table_name) AND conname = :constraint_name
                """
            ),
            {"table_name": table_name, "constraint_name": constraint_name},
        )
        .scalar()
    )


def _has_column(table_name: str, column_name: str) -> bool:
    return bool(
        op.get_bind()
        .execute(
            sa.text(
                """
                SELECT 1 FROM information_schema.columns
                WHERE table_name = :table_name AND column_name = :column_name
                """
            ),
            {"table_name": table_name, "column_name": column_name},
        )
        .scalar()
    )


def _ensure_lineage(table_name: str, old_constraint: str, new_constraint: str) -> None:
    if not _has_column(table_name, "geometry_hash"):
        op.add_column(table_name, sa.Column("geometry_hash", sa.String(64), nullable=True))
    if _has_constraint(table_name, old_constraint):
        op.drop_constraint(old_constraint, table_name, type_="unique")
    if not _has_constraint(table_name, new_constraint):
        columns = (
            ["observation_id", "algorithm_version", "geometry_hash"]
            if table_name == "field_observation_analyses"
            else ["field_id", "acquisition_id", "algorithm_version", "geometry_hash"]
        )
        op.create_unique_constraint(
            new_constraint,
            table_name,
            columns,
        )


def _assert_downgrade_is_lossless() -> None:
    checks = (
        (
            "field_observation_analyses",
            "observation_id, algorithm_version",
        ),
        (
            "field_ndvi_snapshots",
            "field_id, acquisition_id, algorithm_version",
        ),
    )
    for table_name, identity_columns in checks:
        duplicate = op.get_bind().execute(
            sa.text(
                f"""
                SELECT 1
                FROM {table_name}
                GROUP BY {identity_columns}
                HAVING count(*) > 1
                LIMIT 1
                """
            )
        ).scalar()
        if duplicate:
            raise RuntimeError(
                f"cannot downgrade geometry lineage while {table_name} contains "
                "multiple historical geometry identities for one legacy cache key"
            )


def upgrade() -> None:
    _ensure_lineage(
        "field_observation_analyses",
        "uq_observation_analysis_algorithm",
        "uq_observation_analysis_analysis_identity",
    )
    _ensure_lineage(
        "field_ndvi_snapshots",
        "uq_field_ndvi_snapshot_acquisition_algorithm",
        "uq_field_ndvi_snapshot_analysis_identity",
    )


def downgrade() -> None:
    _assert_downgrade_is_lossless()
    if _has_constraint("field_observation_analyses", "uq_observation_analysis_analysis_identity"):
        op.drop_constraint(
            "uq_observation_analysis_analysis_identity",
            "field_observation_analyses",
            type_="unique",
        )
    if _has_constraint("field_ndvi_snapshots", "uq_field_ndvi_snapshot_analysis_identity"):
        op.drop_constraint(
            "uq_field_ndvi_snapshot_analysis_identity",
            "field_ndvi_snapshots",
            type_="unique",
        )
    if _has_column("field_observation_analyses", "geometry_hash"):
        op.drop_column("field_observation_analyses", "geometry_hash")
    if _has_column("field_ndvi_snapshots", "geometry_hash"):
        op.drop_column("field_ndvi_snapshots", "geometry_hash")
    if not _has_constraint("field_observation_analyses", "uq_observation_analysis_algorithm"):
        op.create_unique_constraint(
            "uq_observation_analysis_algorithm",
            "field_observation_analyses",
            ["observation_id", "algorithm_version"],
        )
    if not _has_constraint("field_ndvi_snapshots", "uq_field_ndvi_snapshot_acquisition_algorithm"):
        op.create_unique_constraint(
            "uq_field_ndvi_snapshot_acquisition_algorithm",
            "field_ndvi_snapshots",
            ["field_id", "acquisition_id", "algorithm_version"],
        )
