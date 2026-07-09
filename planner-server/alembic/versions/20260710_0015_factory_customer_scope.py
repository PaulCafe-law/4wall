"""Add factory customer product mode and camera status query indexes."""

from alembic import op
import sqlalchemy as sa


revision = "20260710_0015"
down_revision = "20260707_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organization",
        sa.Column("product_mode", sa.String(), nullable=False, server_default="building_route"),
    )
    op.create_index(op.f("ix_organization_product_mode"), "organization", ["product_mode"])

    op.create_index(
        "ix_camera_frames_camera_captured_created",
        "camera_frames",
        ["camera_id", "captured_at", "created_at"],
    )
    op.create_index(
        "ix_camera_frames_camera_upload_status",
        "camera_frames",
        ["camera_id", "upload_status"],
    )
    op.create_index(
        "ix_camera_frames_camera_analysis_status",
        "camera_frames",
        ["camera_id", "analysis_status"],
    )
    op.create_index(
        "ix_camera_gauge_readings_camera_gauge_captured",
        "camera_gauge_readings",
        ["camera_id", "gauge_id", "captured_at", "created_at"],
    )
    op.create_index(
        "ix_camera_ocr_observations_camera_captured",
        "camera_ocr_observations",
        ["camera_id", "captured_at", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_camera_ocr_observations_camera_captured", table_name="camera_ocr_observations")
    op.drop_index("ix_camera_gauge_readings_camera_gauge_captured", table_name="camera_gauge_readings")
    op.drop_index("ix_camera_frames_camera_analysis_status", table_name="camera_frames")
    op.drop_index("ix_camera_frames_camera_upload_status", table_name="camera_frames")
    op.drop_index("ix_camera_frames_camera_captured_created", table_name="camera_frames")
    op.drop_index(op.f("ix_organization_product_mode"), table_name="organization")
    op.drop_column("organization", "product_mode")
