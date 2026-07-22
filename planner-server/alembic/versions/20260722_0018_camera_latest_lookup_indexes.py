"""Add composite indexes for current camera status and frame lookup."""

from alembic import op
import sqlalchemy as sa


revision = "20260722_0018"
down_revision = "20260717_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_camera_frames_uploaded_camera_captured_created",
        "camera_frames",
        ["camera_id", "upload_status", "captured_at", "created_at"],
        postgresql_where=sa.text("upload_status = 'uploaded'"),
    )
    op.create_index(
        "ix_camera_person_observations_camera_captured_created",
        "camera_person_observations",
        ["camera_id", "captured_at", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_camera_person_observations_camera_captured_created",
        table_name="camera_person_observations",
    )
    op.drop_index(
        "ix_camera_frames_uploaded_camera_captured_created",
        table_name="camera_frames",
    )
