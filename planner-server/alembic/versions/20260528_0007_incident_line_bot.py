"""Add incident loop and LINE Bot notification tables."""

from alembic import op
import sqlalchemy as sa


revision = "20260528_0007"
down_revision = "20260419_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "incidents",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("site_id", sa.String(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("severity", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("location_json", sa.JSON(), nullable=False),
        sa.Column("assignee_name", sa.String(), nullable=True),
        sa.Column("reporter_name", sa.String(), nullable=True),
        sa.Column("ai_summary", sa.String(), nullable=True),
        sa.Column("ai_confidence", sa.Float(), nullable=True),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("updated_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["useraccount.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["site_id"], ["site.id"]),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["useraccount.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_incidents_created_at"), "incidents", ["created_at"], unique=False)
    op.create_index(op.f("ix_incidents_created_by_user_id"), "incidents", ["created_by_user_id"], unique=False)
    op.create_index(op.f("ix_incidents_organization_id"), "incidents", ["organization_id"], unique=False)
    op.create_index(op.f("ix_incidents_severity"), "incidents", ["severity"], unique=False)
    op.create_index(op.f("ix_incidents_site_id"), "incidents", ["site_id"], unique=False)
    op.create_index(op.f("ix_incidents_source"), "incidents", ["source"], unique=False)
    op.create_index(op.f("ix_incidents_status"), "incidents", ["status"], unique=False)
    op.create_index(op.f("ix_incidents_title"), "incidents", ["title"], unique=False)
    op.create_index(op.f("ix_incidents_updated_by_user_id"), "incidents", ["updated_by_user_id"], unique=False)

    op.create_table(
        "incident_evidence",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("incident_id", sa.String(), nullable=False),
        sa.Column("evidence_type", sa.String(), nullable=False),
        sa.Column("url", sa.String(), nullable=True),
        sa.Column("text", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["incident_id"], ["incidents.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_incident_evidence_evidence_type"), "incident_evidence", ["evidence_type"], unique=False)
    op.create_index(op.f("ix_incident_evidence_incident_id"), "incident_evidence", ["incident_id"], unique=False)

    op.create_table(
        "incident_comments",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("incident_id", sa.String(), nullable=False),
        sa.Column("author_name", sa.String(), nullable=False),
        sa.Column("content", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["incident_id"], ["incidents.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_incident_comments_incident_id"), "incident_comments", ["incident_id"], unique=False)

    op.create_table(
        "incident_history",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("incident_id", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("from_value", sa.String(), nullable=True),
        sa.Column("to_value", sa.String(), nullable=True),
        sa.Column("actor_name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["incident_id"], ["incidents.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_incident_history_action"), "incident_history", ["action"], unique=False)
    op.create_index(op.f("ix_incident_history_created_at"), "incident_history", ["created_at"], unique=False)
    op.create_index(op.f("ix_incident_history_incident_id"), "incident_history", ["incident_id"], unique=False)

    op.create_table(
        "incident_line_notifications",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("incident_id", sa.String(), nullable=True),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("target_id", sa.String(), nullable=True),
        sa.Column("message", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("request_payload_json", sa.JSON(), nullable=False),
        sa.Column("response_payload_json", sa.JSON(), nullable=False),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["incident_id"], ["incidents.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_incident_line_notifications_action"), "incident_line_notifications", ["action"], unique=False)
    op.create_index(op.f("ix_incident_line_notifications_created_at"), "incident_line_notifications", ["created_at"], unique=False)
    op.create_index(op.f("ix_incident_line_notifications_incident_id"), "incident_line_notifications", ["incident_id"], unique=False)
    op.create_index(op.f("ix_incident_line_notifications_status"), "incident_line_notifications", ["status"], unique=False)
    op.create_index(op.f("ix_incident_line_notifications_target_id"), "incident_line_notifications", ["target_id"], unique=False)

    op.create_table(
        "line_webhook_events",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("event_key", sa.String(), nullable=False),
        sa.Column("source_type", sa.String(), nullable=True),
        sa.Column("source_id", sa.String(), nullable=True),
        sa.Column("event_type", sa.String(), nullable=True),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("processed_status", sa.String(), nullable=False),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_line_webhook_events_created_at"), "line_webhook_events", ["created_at"], unique=False)
    op.create_index(op.f("ix_line_webhook_events_event_key"), "line_webhook_events", ["event_key"], unique=True)
    op.create_index(op.f("ix_line_webhook_events_event_type"), "line_webhook_events", ["event_type"], unique=False)
    op.create_index(op.f("ix_line_webhook_events_processed_status"), "line_webhook_events", ["processed_status"], unique=False)
    op.create_index(op.f("ix_line_webhook_events_source_id"), "line_webhook_events", ["source_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_line_webhook_events_source_id"), table_name="line_webhook_events")
    op.drop_index(op.f("ix_line_webhook_events_processed_status"), table_name="line_webhook_events")
    op.drop_index(op.f("ix_line_webhook_events_event_type"), table_name="line_webhook_events")
    op.drop_index(op.f("ix_line_webhook_events_event_key"), table_name="line_webhook_events")
    op.drop_index(op.f("ix_line_webhook_events_created_at"), table_name="line_webhook_events")
    op.drop_table("line_webhook_events")

    op.drop_index(op.f("ix_incident_line_notifications_target_id"), table_name="incident_line_notifications")
    op.drop_index(op.f("ix_incident_line_notifications_status"), table_name="incident_line_notifications")
    op.drop_index(op.f("ix_incident_line_notifications_incident_id"), table_name="incident_line_notifications")
    op.drop_index(op.f("ix_incident_line_notifications_created_at"), table_name="incident_line_notifications")
    op.drop_index(op.f("ix_incident_line_notifications_action"), table_name="incident_line_notifications")
    op.drop_table("incident_line_notifications")

    op.drop_index(op.f("ix_incident_history_incident_id"), table_name="incident_history")
    op.drop_index(op.f("ix_incident_history_created_at"), table_name="incident_history")
    op.drop_index(op.f("ix_incident_history_action"), table_name="incident_history")
    op.drop_table("incident_history")

    op.drop_index(op.f("ix_incident_comments_incident_id"), table_name="incident_comments")
    op.drop_table("incident_comments")

    op.drop_index(op.f("ix_incident_evidence_incident_id"), table_name="incident_evidence")
    op.drop_index(op.f("ix_incident_evidence_evidence_type"), table_name="incident_evidence")
    op.drop_table("incident_evidence")

    op.drop_index(op.f("ix_incidents_updated_by_user_id"), table_name="incidents")
    op.drop_index(op.f("ix_incidents_title"), table_name="incidents")
    op.drop_index(op.f("ix_incidents_status"), table_name="incidents")
    op.drop_index(op.f("ix_incidents_source"), table_name="incidents")
    op.drop_index(op.f("ix_incidents_site_id"), table_name="incidents")
    op.drop_index(op.f("ix_incidents_severity"), table_name="incidents")
    op.drop_index(op.f("ix_incidents_organization_id"), table_name="incidents")
    op.drop_index(op.f("ix_incidents_created_by_user_id"), table_name="incidents")
    op.drop_index(op.f("ix_incidents_created_at"), table_name="incidents")
    op.drop_table("incidents")
