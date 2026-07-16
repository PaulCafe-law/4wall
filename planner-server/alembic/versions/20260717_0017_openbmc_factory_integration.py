"""Add tenant-scoped OpenBMC connectors, telemetry, events, and commands."""

from alembic import op
import sqlalchemy as sa


revision = "20260717_0017"
down_revision = "20260712_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "openbmc_connectors",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("site_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("version", sa.String(), nullable=False),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_observation_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_code", sa.String(), nullable=True),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('active', 'disabled', 'revoked')",
            name="ck_openbmc_connectors_status",
        ),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["useraccount.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["site_id"], ["site.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id",
            "site_id",
            "name",
            name="uq_openbmc_connectors_org_site_name",
        ),
        sa.UniqueConstraint(
            "id",
            "organization_id",
            "site_id",
            name="uq_openbmc_connectors_id_org_site",
        ),
        sa.UniqueConstraint("token_hash", name="uq_openbmc_connectors_token_hash"),
    )
    _create_indexes(
        "openbmc_connectors",
        (
            "organization_id",
            "site_id",
            "name",
            "status",
            "last_heartbeat_at",
            "last_observation_at",
            "created_by_user_id",
            "created_at",
        ),
    )

    op.create_table(
        "openbmc_devices",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("site_id", sa.String(), nullable=False),
        sa.Column("connector_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("external_ref", sa.String(), nullable=False),
        sa.Column("device_type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("capabilities_json", sa.JSON(), nullable=False),
        sa.Column("last_observed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_ingested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('active', 'disabled')", name="ck_openbmc_devices_status"),
        sa.CheckConstraint("device_type IN ('raspberry_pi_5')", name="ck_openbmc_devices_type"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["useraccount.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["site_id"], ["site.id"]),
        sa.ForeignKeyConstraint(
            ["connector_id", "organization_id", "site_id"],
            ["openbmc_connectors.id", "openbmc_connectors.organization_id", "openbmc_connectors.site_id"],
            name="fk_openbmc_devices_connector_binding",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "connector_id",
            "external_ref",
            name="uq_openbmc_devices_connector_external_ref",
        ),
        sa.UniqueConstraint(
            "id",
            "organization_id",
            "site_id",
            name="uq_openbmc_devices_id_org_site",
        ),
        sa.UniqueConstraint(
            "id",
            "connector_id",
            "organization_id",
            "site_id",
            name="uq_openbmc_devices_id_connector_org_site",
        ),
    )
    _create_indexes(
        "openbmc_devices",
        (
            "organization_id",
            "site_id",
            "connector_id",
            "name",
            "external_ref",
            "device_type",
            "status",
            "last_observed_at",
            "last_ingested_at",
            "created_by_user_id",
            "created_at",
        ),
    )
    op.create_index(
        "ix_openbmc_devices_org_site_status",
        "openbmc_devices",
        ["organization_id", "site_id", "status"],
    )

    op.create_table(
        "openbmc_telemetry_observations",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("device_id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("site_id", sa.String(), nullable=False),
        sa.Column("source_observation_id", sa.String(), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("collector_received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ingested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("collector_stale", sa.Boolean(), nullable=False),
        sa.Column("temperature_c", sa.Float(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("health", sa.String(), nullable=False),
        sa.Column("fan_json", sa.JSON(), nullable=False),
        sa.Column("thresholds_json", sa.JSON(), nullable=False),
        sa.Column("raw_schema_version", sa.String(), nullable=False),
        sa.CheckConstraint(
            "status IN ('normal', 'warning', 'critical', 'unknown')",
            name="ck_openbmc_observations_status",
        ),
        sa.CheckConstraint(
            "health IN ('ok', 'warning', 'critical', 'unknown')",
            name="ck_openbmc_observations_health",
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["site_id"], ["site.id"]),
        sa.ForeignKeyConstraint(
            ["device_id", "organization_id", "site_id"],
            ["openbmc_devices.id", "openbmc_devices.organization_id", "openbmc_devices.site_id"],
            name="fk_openbmc_observations_device_binding",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "device_id",
            "source_observation_id",
            name="uq_openbmc_observations_device_source",
        ),
    )
    _create_indexes(
        "openbmc_telemetry_observations",
        ("device_id", "organization_id", "site_id", "source_observation_id", "observed_at", "ingested_at", "status", "health"),
    )
    op.create_index(
        "ix_openbmc_observations_device_observed_ingested",
        "openbmc_telemetry_observations",
        ["device_id", "observed_at", "ingested_at"],
    )

    op.create_table(
        "openbmc_event_records",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("device_id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("site_id", sa.String(), nullable=False),
        sa.Column("source_event_key", sa.String(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("severity", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("message", sa.String(), nullable=False),
        sa.Column("details_json", sa.JSON(), nullable=False),
        sa.Column("ingested_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "severity IN ('info', 'warning', 'critical')",
            name="ck_openbmc_events_severity",
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["site_id"], ["site.id"]),
        sa.ForeignKeyConstraint(
            ["device_id", "organization_id", "site_id"],
            ["openbmc_devices.id", "openbmc_devices.organization_id", "openbmc_devices.site_id"],
            name="fk_openbmc_events_device_binding",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "device_id",
            "source_event_key",
            name="uq_openbmc_events_device_source",
        ),
    )
    _create_indexes(
        "openbmc_event_records",
        ("device_id", "organization_id", "site_id", "source_event_key", "occurred_at", "severity", "source", "code", "ingested_at"),
    )
    op.create_index(
        "ix_openbmc_events_device_occurred",
        "openbmc_event_records",
        ["device_id", "occurred_at", "ingested_at"],
    )

    op.create_table(
        "openbmc_commands",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("device_id", sa.String(), nullable=False),
        sa.Column("connector_id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("site_id", sa.String(), nullable=False),
        sa.Column("command_type", sa.String(), nullable=False),
        sa.Column("arguments_json", sa.JSON(), nullable=False),
        sa.Column("reason", sa.String(), nullable=False),
        sa.Column("request_idempotency_key", sa.String(), nullable=True),
        sa.Column("proposal_hash", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("active_slot", sa.Boolean(), nullable=True),
        sa.Column("proposed_by_user_id", sa.String(), nullable=False),
        sa.Column("proposed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("confirmed_by_user_id", sa.String(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmation_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("execution_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("claim_lease_hash", sa.String(), nullable=True),
        sa.Column("claim_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("local_command_id", sa.String(), nullable=True),
        sa.Column("result_json", sa.JSON(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failure_code", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "command_type IN ('fan_boost', 'reset_dry_run')",
            name="ck_openbmc_commands_type",
        ),
        sa.CheckConstraint(
            "status IN ('awaiting_confirmation', 'queued', 'claimed', 'accepted_by_collector', "
            "'delivered_to_agent', 'succeeded', 'failed', 'expired', 'cancelled', 'rejected')",
            name="ck_openbmc_commands_status",
        ),
        sa.ForeignKeyConstraint(["confirmed_by_user_id"], ["useraccount.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["proposed_by_user_id"], ["useraccount.id"]),
        sa.ForeignKeyConstraint(["site_id"], ["site.id"]),
        sa.ForeignKeyConstraint(
            ["device_id", "connector_id", "organization_id", "site_id"],
            [
                "openbmc_devices.id",
                "openbmc_devices.connector_id",
                "openbmc_devices.organization_id",
                "openbmc_devices.site_id",
            ],
            name="fk_openbmc_commands_device_binding",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "device_id",
            "active_slot",
            name="uq_openbmc_commands_device_active_slot",
        ),
        sa.UniqueConstraint(
            "organization_id",
            "proposed_by_user_id",
            "request_idempotency_key",
            name="uq_openbmc_commands_proposer_idempotency",
        ),
    )
    _create_indexes(
        "openbmc_commands",
        (
            "device_id",
            "connector_id",
            "organization_id",
            "site_id",
            "command_type",
            "request_idempotency_key",
            "proposal_hash",
            "status",
            "active_slot",
            "proposed_by_user_id",
            "proposed_at",
            "confirmed_by_user_id",
            "confirmed_at",
            "confirmation_expires_at",
            "execution_expires_at",
            "claim_lease_hash",
            "claim_expires_at",
            "completed_at",
            "failure_code",
            "created_at",
        ),
    )
    op.create_index(
        "ix_openbmc_commands_connector_status_created",
        "openbmc_commands",
        ["connector_id", "status", "created_at"],
    )
    op.create_index(
        "ix_openbmc_commands_device_status",
        "openbmc_commands",
        ["device_id", "status"],
    )


def downgrade() -> None:
    op.drop_table("openbmc_commands")
    op.drop_table("openbmc_event_records")
    op.drop_table("openbmc_telemetry_observations")
    op.drop_table("openbmc_devices")
    op.drop_table("openbmc_connectors")


def _create_indexes(table: str, columns: tuple[str, ...]) -> None:
    for column in columns:
        op.create_index(op.f(f"ix_{table}_{column}"), table, [column], unique=False)
