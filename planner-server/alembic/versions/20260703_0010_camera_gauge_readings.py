"""Add camera gauge readings."""

from alembic import op
import sqlalchemy as sa


revision = "20260703_0010"
down_revision = "20260619_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "camera_gauge_readings",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("camera_id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("site_id", sa.String(), nullable=True),
        sa.Column("frame_id", sa.String(), nullable=True),
        sa.Column("gauge_id", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("value", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("raw_position", sa.Float(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["camera_id"], ["camera_devices.id"]),
        sa.ForeignKeyConstraint(["frame_id"], ["camera_frames.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["site_id"], ["site.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_camera_gauge_readings_camera_id"), "camera_gauge_readings", ["camera_id"], unique=False)
    op.create_index(
        op.f("ix_camera_gauge_readings_captured_at"),
        "camera_gauge_readings",
        ["captured_at"],
        unique=False,
    )
    op.create_index(op.f("ix_camera_gauge_readings_created_at"), "camera_gauge_readings", ["created_at"], unique=False)
    op.create_index(op.f("ix_camera_gauge_readings_frame_id"), "camera_gauge_readings", ["frame_id"], unique=False)
    op.create_index(op.f("ix_camera_gauge_readings_gauge_id"), "camera_gauge_readings", ["gauge_id"], unique=False)
    op.create_index(
        op.f("ix_camera_gauge_readings_organization_id"),
        "camera_gauge_readings",
        ["organization_id"],
        unique=False,
    )
    op.create_index(op.f("ix_camera_gauge_readings_site_id"), "camera_gauge_readings", ["site_id"], unique=False)
    op.create_index(op.f("ix_camera_gauge_readings_source"), "camera_gauge_readings", ["source"], unique=False)
    op.create_index(op.f("ix_camera_gauge_readings_status"), "camera_gauge_readings", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_camera_gauge_readings_status"), table_name="camera_gauge_readings")
    op.drop_index(op.f("ix_camera_gauge_readings_source"), table_name="camera_gauge_readings")
    op.drop_index(op.f("ix_camera_gauge_readings_site_id"), table_name="camera_gauge_readings")
    op.drop_index(op.f("ix_camera_gauge_readings_organization_id"), table_name="camera_gauge_readings")
    op.drop_index(op.f("ix_camera_gauge_readings_gauge_id"), table_name="camera_gauge_readings")
    op.drop_index(op.f("ix_camera_gauge_readings_frame_id"), table_name="camera_gauge_readings")
    op.drop_index(op.f("ix_camera_gauge_readings_created_at"), table_name="camera_gauge_readings")
    op.drop_index(op.f("ix_camera_gauge_readings_captured_at"), table_name="camera_gauge_readings")
    op.drop_index(op.f("ix_camera_gauge_readings_camera_id"), table_name="camera_gauge_readings")
    op.drop_table("camera_gauge_readings")
