"""Initial planner schema."""

from alembic import op
import sqlalchemy as sa


revision = "20260402_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "operatoraccount",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_operatoraccount_username"), "operatoraccount", ["username"], unique=True)
    op.create_table(
        "refreshtoken",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("operator_id", sa.String(), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["operator_id"], ["operatoraccount.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_refreshtoken_operator_id"), "refreshtoken", ["operator_id"], unique=False)
    op.create_table(
        "mission",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("mission_name", sa.String(), nullable=False),
        sa.Column("routing_mode", sa.String(), nullable=False),
        sa.Column("bundle_version", sa.String(), nullable=False),
        sa.Column("demo_mode", sa.Boolean(), nullable=False),
        sa.Column("planned_by_operator_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("request_json", sa.JSON(), nullable=False),
        sa.Column("response_json", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["planned_by_operator_id"], ["operatoraccount.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "missionartifact",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("mission_id", sa.String(), nullable=False),
        sa.Column("artifact_name", sa.String(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("checksum_sha256", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("storage_key", sa.String(), nullable=False),
        sa.Column("cache_control", sa.String(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["mission_id"], ["mission.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_missionartifact_artifact_name"), "missionartifact", ["artifact_name"], unique=False)
    op.create_index(op.f("ix_missionartifact_mission_id"), "missionartifact", ["mission_id"], unique=False)
    op.create_table(
        "flight",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("mission_id", sa.String(), nullable=False),
        sa.Column("operator_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_event_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_telemetry_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["mission_id"], ["mission.id"]),
        sa.ForeignKeyConstraint(["operator_id"], ["operatoraccount.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_flight_mission_id"), "flight", ["mission_id"], unique=False)
    op.create_table(
        "flightevent",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("flight_id", sa.String(), nullable=False),
        sa.Column("mission_id", sa.String(), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("event_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["flight_id"], ["flight.id"]),
        sa.ForeignKeyConstraint(["mission_id"], ["mission.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_flightevent_flight_id"), "flightevent", ["flight_id"], unique=False)
    op.create_index(op.f("ix_flightevent_mission_id"), "flightevent", ["mission_id"], unique=False)
    op.create_table(
        "telemetrybatch",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("flight_id", sa.String(), nullable=False),
        sa.Column("mission_id", sa.String(), nullable=False),
        sa.Column("sample_count", sa.Integer(), nullable=False),
        sa.Column("first_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["flight_id"], ["flight.id"]),
        sa.ForeignKeyConstraint(["mission_id"], ["mission.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_telemetrybatch_flight_id"), "telemetrybatch", ["flight_id"], unique=False)
    op.create_index(op.f("ix_telemetrybatch_mission_id"), "telemetrybatch", ["mission_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_telemetrybatch_mission_id"), table_name="telemetrybatch")
    op.drop_index(op.f("ix_telemetrybatch_flight_id"), table_name="telemetrybatch")
    op.drop_table("telemetrybatch")
    op.drop_index(op.f("ix_flightevent_mission_id"), table_name="flightevent")
    op.drop_index(op.f("ix_flightevent_flight_id"), table_name="flightevent")
    op.drop_table("flightevent")
    op.drop_index(op.f("ix_flight_mission_id"), table_name="flight")
    op.drop_table("flight")
    op.drop_index(op.f("ix_missionartifact_mission_id"), table_name="missionartifact")
    op.drop_index(op.f("ix_missionartifact_artifact_name"), table_name="missionartifact")
    op.drop_table("missionartifact")
    op.drop_table("mission")
    op.drop_index(op.f("ix_refreshtoken_operator_id"), table_name="refreshtoken")
    op.drop_table("refreshtoken")
    op.drop_index(op.f("ix_operatoraccount_username"), table_name="operatoraccount")
    op.drop_table("operatoraccount")
