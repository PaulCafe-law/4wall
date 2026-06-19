"""Add factory camera ingest tables."""

from alembic import op
import sqlalchemy as sa


revision = "20260619_0009"
down_revision = "20260609_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "camera_devices",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("site_id", sa.String(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("device_token_hash", sa.String(), nullable=False),
        sa.Column("rtsp_configured", sa.Boolean(), nullable=False),
        sa.Column("sampling_interval_seconds", sa.Integer(), nullable=False),
        sa.Column("retention_days", sa.Integer(), nullable=False),
        sa.Column("local_spool_hours", sa.Integer(), nullable=False),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_frame_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(), nullable=True),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["useraccount.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["site_id"], ["site.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_camera_devices_created_at"), "camera_devices", ["created_at"], unique=False)
    op.create_index(
        op.f("ix_camera_devices_created_by_user_id"),
        "camera_devices",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_index(op.f("ix_camera_devices_device_token_hash"), "camera_devices", ["device_token_hash"], unique=True)
    op.create_index(op.f("ix_camera_devices_name"), "camera_devices", ["name"], unique=False)
    op.create_index(op.f("ix_camera_devices_organization_id"), "camera_devices", ["organization_id"], unique=False)
    op.create_index(op.f("ix_camera_devices_site_id"), "camera_devices", ["site_id"], unique=False)
    op.create_index(op.f("ix_camera_devices_status"), "camera_devices", ["status"], unique=False)

    op.create_table(
        "camera_frames",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("camera_id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("site_id", sa.String(), nullable=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("storage_key", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("checksum_sha256", sa.String(), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("upload_status", sa.String(), nullable=False),
        sa.Column("analysis_status", sa.String(), nullable=False),
        sa.Column("upload_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["camera_id"], ["camera_devices.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["site_id"], ["site.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_camera_frames_analysis_status"), "camera_frames", ["analysis_status"], unique=False)
    op.create_index(op.f("ix_camera_frames_camera_id"), "camera_frames", ["camera_id"], unique=False)
    op.create_index(op.f("ix_camera_frames_captured_at"), "camera_frames", ["captured_at"], unique=False)
    op.create_index(op.f("ix_camera_frames_checksum_sha256"), "camera_frames", ["checksum_sha256"], unique=False)
    op.create_index(op.f("ix_camera_frames_created_at"), "camera_frames", ["created_at"], unique=False)
    op.create_index(op.f("ix_camera_frames_organization_id"), "camera_frames", ["organization_id"], unique=False)
    op.create_index(op.f("ix_camera_frames_site_id"), "camera_frames", ["site_id"], unique=False)
    op.create_index(op.f("ix_camera_frames_storage_key"), "camera_frames", ["storage_key"], unique=False)
    op.create_index(op.f("ix_camera_frames_upload_expires_at"), "camera_frames", ["upload_expires_at"], unique=False)
    op.create_index(op.f("ix_camera_frames_upload_status"), "camera_frames", ["upload_status"], unique=False)

    op.create_table(
        "equipment_watch_zones",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("camera_id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("equipment_name", sa.String(), nullable=False),
        sa.Column("roi_json", sa.JSON(), nullable=False),
        sa.Column("expected_state", sa.String(), nullable=False),
        sa.Column("alert_on_states_json", sa.JSON(), nullable=False),
        sa.Column("min_confidence", sa.Float(), nullable=False),
        sa.Column("severity", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["camera_id"], ["camera_devices.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_equipment_watch_zones_camera_id"), "equipment_watch_zones", ["camera_id"], unique=False)
    op.create_index(op.f("ix_equipment_watch_zones_created_at"), "equipment_watch_zones", ["created_at"], unique=False)
    op.create_index(
        op.f("ix_equipment_watch_zones_equipment_name"),
        "equipment_watch_zones",
        ["equipment_name"],
        unique=False,
    )
    op.create_index(op.f("ix_equipment_watch_zones_is_active"), "equipment_watch_zones", ["is_active"], unique=False)
    op.create_index(op.f("ix_equipment_watch_zones_name"), "equipment_watch_zones", ["name"], unique=False)
    op.create_index(
        op.f("ix_equipment_watch_zones_organization_id"),
        "equipment_watch_zones",
        ["organization_id"],
        unique=False,
    )
    op.create_index(op.f("ix_equipment_watch_zones_severity"), "equipment_watch_zones", ["severity"], unique=False)

    op.create_table(
        "equipment_state_observations",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("camera_id", sa.String(), nullable=False),
        sa.Column("frame_id", sa.String(), nullable=False),
        sa.Column("watch_zone_id", sa.String(), nullable=True),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("site_id", sa.String(), nullable=True),
        sa.Column("state", sa.String(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("reason", sa.String(), nullable=True),
        sa.Column("model_output_json", sa.JSON(), nullable=False),
        sa.Column("incident_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["camera_id"], ["camera_devices.id"]),
        sa.ForeignKeyConstraint(["frame_id"], ["camera_frames.id"]),
        sa.ForeignKeyConstraint(["incident_id"], ["incidents.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["site_id"], ["site.id"]),
        sa.ForeignKeyConstraint(["watch_zone_id"], ["equipment_watch_zones.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_equipment_state_observations_camera_id"),
        "equipment_state_observations",
        ["camera_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_equipment_state_observations_created_at"),
        "equipment_state_observations",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_equipment_state_observations_frame_id"),
        "equipment_state_observations",
        ["frame_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_equipment_state_observations_incident_id"),
        "equipment_state_observations",
        ["incident_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_equipment_state_observations_organization_id"),
        "equipment_state_observations",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_equipment_state_observations_site_id"),
        "equipment_state_observations",
        ["site_id"],
        unique=False,
    )
    op.create_index(op.f("ix_equipment_state_observations_state"), "equipment_state_observations", ["state"], unique=False)
    op.create_index(
        op.f("ix_equipment_state_observations_status"),
        "equipment_state_observations",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_equipment_state_observations_watch_zone_id"),
        "equipment_state_observations",
        ["watch_zone_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_equipment_state_observations_watch_zone_id"), table_name="equipment_state_observations")
    op.drop_index(op.f("ix_equipment_state_observations_status"), table_name="equipment_state_observations")
    op.drop_index(op.f("ix_equipment_state_observations_state"), table_name="equipment_state_observations")
    op.drop_index(op.f("ix_equipment_state_observations_site_id"), table_name="equipment_state_observations")
    op.drop_index(op.f("ix_equipment_state_observations_organization_id"), table_name="equipment_state_observations")
    op.drop_index(op.f("ix_equipment_state_observations_incident_id"), table_name="equipment_state_observations")
    op.drop_index(op.f("ix_equipment_state_observations_frame_id"), table_name="equipment_state_observations")
    op.drop_index(op.f("ix_equipment_state_observations_created_at"), table_name="equipment_state_observations")
    op.drop_index(op.f("ix_equipment_state_observations_camera_id"), table_name="equipment_state_observations")
    op.drop_table("equipment_state_observations")

    op.drop_index(op.f("ix_equipment_watch_zones_severity"), table_name="equipment_watch_zones")
    op.drop_index(op.f("ix_equipment_watch_zones_organization_id"), table_name="equipment_watch_zones")
    op.drop_index(op.f("ix_equipment_watch_zones_name"), table_name="equipment_watch_zones")
    op.drop_index(op.f("ix_equipment_watch_zones_is_active"), table_name="equipment_watch_zones")
    op.drop_index(op.f("ix_equipment_watch_zones_equipment_name"), table_name="equipment_watch_zones")
    op.drop_index(op.f("ix_equipment_watch_zones_created_at"), table_name="equipment_watch_zones")
    op.drop_index(op.f("ix_equipment_watch_zones_camera_id"), table_name="equipment_watch_zones")
    op.drop_table("equipment_watch_zones")

    op.drop_index(op.f("ix_camera_frames_upload_status"), table_name="camera_frames")
    op.drop_index(op.f("ix_camera_frames_upload_expires_at"), table_name="camera_frames")
    op.drop_index(op.f("ix_camera_frames_storage_key"), table_name="camera_frames")
    op.drop_index(op.f("ix_camera_frames_site_id"), table_name="camera_frames")
    op.drop_index(op.f("ix_camera_frames_organization_id"), table_name="camera_frames")
    op.drop_index(op.f("ix_camera_frames_created_at"), table_name="camera_frames")
    op.drop_index(op.f("ix_camera_frames_checksum_sha256"), table_name="camera_frames")
    op.drop_index(op.f("ix_camera_frames_captured_at"), table_name="camera_frames")
    op.drop_index(op.f("ix_camera_frames_camera_id"), table_name="camera_frames")
    op.drop_index(op.f("ix_camera_frames_analysis_status"), table_name="camera_frames")
    op.drop_table("camera_frames")

    op.drop_index(op.f("ix_camera_devices_status"), table_name="camera_devices")
    op.drop_index(op.f("ix_camera_devices_site_id"), table_name="camera_devices")
    op.drop_index(op.f("ix_camera_devices_organization_id"), table_name="camera_devices")
    op.drop_index(op.f("ix_camera_devices_name"), table_name="camera_devices")
    op.drop_index(op.f("ix_camera_devices_device_token_hash"), table_name="camera_devices")
    op.drop_index(op.f("ix_camera_devices_created_by_user_id"), table_name="camera_devices")
    op.drop_index(op.f("ix_camera_devices_created_at"), table_name="camera_devices")
    op.drop_table("camera_devices")
