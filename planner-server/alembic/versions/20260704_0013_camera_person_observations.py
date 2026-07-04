"""Add camera person observations."""

from alembic import op
import sqlalchemy as sa


revision = "20260704_0013"
down_revision = "20260704_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "camera_person_observations",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("camera_id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("site_id", sa.String(), nullable=True),
        sa.Column("frame_id", sa.String(), nullable=True),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("image_width", sa.Integer(), nullable=False),
        sa.Column("image_height", sa.Integer(), nullable=False),
        sa.Column("calibration_id", sa.String(), nullable=True),
        sa.Column("detector_name", sa.String(), nullable=True),
        sa.Column("person_count", sa.Integer(), nullable=False),
        sa.Column("detections_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["camera_id"], ["camera_devices.id"]),
        sa.ForeignKeyConstraint(["frame_id"], ["camera_frames.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["site_id"], ["site.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_camera_person_observations_camera_id"), "camera_person_observations", ["camera_id"])
    op.create_index(
        "ix_camera_person_observations_camera_captured_at",
        "camera_person_observations",
        ["camera_id", "captured_at"],
    )
    op.create_index(op.f("ix_camera_person_observations_calibration_id"), "camera_person_observations", ["calibration_id"])
    op.create_index(op.f("ix_camera_person_observations_captured_at"), "camera_person_observations", ["captured_at"])
    op.create_index(op.f("ix_camera_person_observations_created_at"), "camera_person_observations", ["created_at"])
    op.create_index(op.f("ix_camera_person_observations_detector_name"), "camera_person_observations", ["detector_name"])
    op.create_index(op.f("ix_camera_person_observations_frame_id"), "camera_person_observations", ["frame_id"])
    op.create_index(
        op.f("ix_camera_person_observations_organization_id"),
        "camera_person_observations",
        ["organization_id"],
    )
    op.create_index(op.f("ix_camera_person_observations_person_count"), "camera_person_observations", ["person_count"])
    op.create_index(op.f("ix_camera_person_observations_site_id"), "camera_person_observations", ["site_id"])
    op.create_index(op.f("ix_camera_person_observations_source"), "camera_person_observations", ["source"])


def downgrade() -> None:
    op.drop_index(op.f("ix_camera_person_observations_source"), table_name="camera_person_observations")
    op.drop_index(op.f("ix_camera_person_observations_site_id"), table_name="camera_person_observations")
    op.drop_index(op.f("ix_camera_person_observations_person_count"), table_name="camera_person_observations")
    op.drop_index(op.f("ix_camera_person_observations_organization_id"), table_name="camera_person_observations")
    op.drop_index(op.f("ix_camera_person_observations_frame_id"), table_name="camera_person_observations")
    op.drop_index(op.f("ix_camera_person_observations_detector_name"), table_name="camera_person_observations")
    op.drop_index(op.f("ix_camera_person_observations_created_at"), table_name="camera_person_observations")
    op.drop_index(op.f("ix_camera_person_observations_captured_at"), table_name="camera_person_observations")
    op.drop_index(op.f("ix_camera_person_observations_calibration_id"), table_name="camera_person_observations")
    op.drop_index("ix_camera_person_observations_camera_captured_at", table_name="camera_person_observations")
    op.drop_index(op.f("ix_camera_person_observations_camera_id"), table_name="camera_person_observations")
    op.drop_table("camera_person_observations")
