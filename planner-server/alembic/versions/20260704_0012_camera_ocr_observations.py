"""Add camera OCR observations."""

from alembic import op
import sqlalchemy as sa


revision = "20260704_0012"
down_revision = "20260703_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "camera_ocr_observations",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("camera_id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("site_id", sa.String(), nullable=True),
        sa.Column("frame_id", sa.String(), nullable=True),
        sa.Column("mode", sa.String(), nullable=False),
        sa.Column("mode_confidence", sa.Float(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("raw_ocr_lines_json", sa.JSON(), nullable=False),
        sa.Column("structured_fields_json", sa.JSON(), nullable=False),
        sa.Column("work_order_raw_text", sa.String(), nullable=True),
        sa.Column("gpt_summary_json", sa.JSON(), nullable=False),
        sa.Column("summary_status", sa.String(), nullable=False),
        sa.Column("summary_error", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["camera_id"], ["camera_devices.id"]),
        sa.ForeignKeyConstraint(["frame_id"], ["camera_frames.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["site_id"], ["site.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_camera_ocr_observations_camera_id"), "camera_ocr_observations", ["camera_id"])
    op.create_index(op.f("ix_camera_ocr_observations_captured_at"), "camera_ocr_observations", ["captured_at"])
    op.create_index(op.f("ix_camera_ocr_observations_created_at"), "camera_ocr_observations", ["created_at"])
    op.create_index(op.f("ix_camera_ocr_observations_frame_id"), "camera_ocr_observations", ["frame_id"])
    op.create_index(op.f("ix_camera_ocr_observations_mode"), "camera_ocr_observations", ["mode"])
    op.create_index(
        op.f("ix_camera_ocr_observations_organization_id"),
        "camera_ocr_observations",
        ["organization_id"],
    )
    op.create_index(op.f("ix_camera_ocr_observations_site_id"), "camera_ocr_observations", ["site_id"])
    op.create_index(op.f("ix_camera_ocr_observations_source"), "camera_ocr_observations", ["source"])
    op.create_index(
        op.f("ix_camera_ocr_observations_summary_status"),
        "camera_ocr_observations",
        ["summary_status"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_camera_ocr_observations_summary_status"), table_name="camera_ocr_observations")
    op.drop_index(op.f("ix_camera_ocr_observations_source"), table_name="camera_ocr_observations")
    op.drop_index(op.f("ix_camera_ocr_observations_site_id"), table_name="camera_ocr_observations")
    op.drop_index(op.f("ix_camera_ocr_observations_organization_id"), table_name="camera_ocr_observations")
    op.drop_index(op.f("ix_camera_ocr_observations_mode"), table_name="camera_ocr_observations")
    op.drop_index(op.f("ix_camera_ocr_observations_frame_id"), table_name="camera_ocr_observations")
    op.drop_index(op.f("ix_camera_ocr_observations_created_at"), table_name="camera_ocr_observations")
    op.drop_index(op.f("ix_camera_ocr_observations_captured_at"), table_name="camera_ocr_observations")
    op.drop_index(op.f("ix_camera_ocr_observations_camera_id"), table_name="camera_ocr_observations")
    op.drop_table("camera_ocr_observations")
