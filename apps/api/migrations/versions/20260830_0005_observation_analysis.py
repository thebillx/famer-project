"""Add observation-scoped numeric NDVI raster cache."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision = "20260830_0005"
down_revision = "20260823_0004"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_unique_constraint("uq_field_acquisitions_id_field_organization", "field_acquisitions", ["id", "field_id", "organization_id"])
    op.create_table(
        "field_observation_analyses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("observation_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("field_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("acquired_at", sa.DateTime(timezone=True), nullable=False), sa.Column("algorithm_version", sa.String(80), nullable=False),
        sa.Column("ndvi_mean", sa.Numeric(8, 6), nullable=False), sa.Column("ndvi_min", sa.Numeric(8, 6), nullable=False), sa.Column("ndvi_max", sa.Numeric(8, 6), nullable=False), sa.Column("ndvi_stddev", sa.Numeric(8, 6), nullable=False),
        sa.Column("sample_count", sa.Integer(), nullable=False), sa.Column("valid_sample_count", sa.Integer(), nullable=False), sa.Column("valid_pixel_ratio", sa.Numeric(7, 6), nullable=False),
        sa.Column("raster_tiff", sa.LargeBinary(), nullable=False), sa.Column("raster_crs", sa.String(32), nullable=False), sa.Column("raster_bounds", postgresql.JSONB(), nullable=False), sa.Column("raster_width", sa.Integer(), nullable=False), sa.Column("raster_height", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["observation_id", "field_id", "organization_id"], ["field_acquisitions.id", "field_acquisitions.field_id", "field_acquisitions.organization_id"], name="fk_observation_analysis_acquisition_field_org", ondelete="RESTRICT"),
        sa.UniqueConstraint("observation_id", "algorithm_version", name="uq_observation_analysis_algorithm"),
        sa.CheckConstraint("ndvi_min >= -1 AND ndvi_mean >= ndvi_min AND ndvi_max >= ndvi_mean AND ndvi_max <= 1", name="ck_observation_analysis_ndvi_order"),
        sa.CheckConstraint("valid_pixel_ratio > 0 AND valid_pixel_ratio <= 1", name="ck_observation_analysis_valid_ratio"),
        sa.CheckConstraint("ndvi_stddev >= 0 AND ndvi_stddev <= 1", name="ck_observation_analysis_stddev"),
        sa.CheckConstraint("sample_count > 0 AND valid_sample_count > 0 AND valid_sample_count <= sample_count", name="ck_observation_analysis_samples"),
        sa.CheckConstraint("raster_crs = 'EPSG:4326'", name="ck_observation_analysis_crs"),
        sa.CheckConstraint("jsonb_array_length(raster_bounds) = 4 AND (raster_bounds->>0)::numeric < (raster_bounds->>2)::numeric AND (raster_bounds->>1)::numeric < (raster_bounds->>3)::numeric", name="ck_observation_analysis_bounds"),
        sa.CheckConstraint("octet_length(raster_tiff) <= 8388608", name="ck_observation_analysis_raster_bytes"),
        sa.CheckConstraint("raster_width > 0 AND raster_width <= 512 AND raster_height > 0 AND raster_height <= 512", name="ck_observation_analysis_raster_size"),
    )
    op.create_index("ix_observation_analyses_field_acquired", "field_observation_analyses", ["field_id", "acquired_at"])
    op.create_index("ix_field_observation_analyses_organization_id", "field_observation_analyses", ["organization_id"])

def downgrade() -> None:
    op.drop_index("ix_field_observation_analyses_organization_id", table_name="field_observation_analyses")
    op.drop_index("ix_observation_analyses_field_acquired", table_name="field_observation_analyses")
    op.drop_table("field_observation_analyses")
    op.drop_constraint("uq_field_acquisitions_id_field_organization", "field_acquisitions", type_="unique")
