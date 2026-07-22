"""Add composite indexes for current camera status and frame lookup."""

from alembic import op
import sqlalchemy as sa


revision = "20260722_0018"
down_revision = "20260717_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("camera_devices", sa.Column("latest_frame_id", sa.String(), nullable=True))
    op.add_column("camera_devices", sa.Column("latest_storage_key", sa.String(), nullable=True))
    op.create_index("ix_camera_devices_latest_frame_id", "camera_devices", ["latest_frame_id"])
    op.create_index(
        "ix_camera_frames_uploaded_camera_captured_created",
        "camera_frames",
        ["camera_id", "upload_status", "captured_at", "created_at"],
        postgresql_where=sa.text("upload_status = 'uploaded'"),
    )
    op.execute(
        sa.text(
            """
            UPDATE camera_devices
            SET latest_frame_id = (
                    SELECT camera_frames.id
                    FROM camera_frames
                    WHERE camera_frames.camera_id = camera_devices.id
                      AND camera_frames.upload_status = 'uploaded'
                    ORDER BY camera_frames.captured_at DESC, camera_frames.created_at DESC
                    LIMIT 1
                ),
                latest_storage_key = (
                    SELECT camera_frames.storage_key
                    FROM camera_frames
                    WHERE camera_frames.camera_id = camera_devices.id
                      AND camera_frames.upload_status = 'uploaded'
                    ORDER BY camera_frames.captured_at DESC, camera_frames.created_at DESC
                    LIMIT 1
                )
            """
        )
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
    op.drop_index("ix_camera_devices_latest_frame_id", table_name="camera_devices")
    op.drop_column("camera_devices", "latest_storage_key")
    op.drop_column("camera_devices", "latest_frame_id")
