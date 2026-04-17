"""Add phase 1 demo control-plane and reporting tables."""

from alembic import op
import sqlalchemy as sa


revision = "20260417_0003"
down_revision = "20260410_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inspectionroute",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("site_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("waypoints_json", sa.JSON(), nullable=False),
        sa.Column("planning_parameters_json", sa.JSON(), nullable=False),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("updated_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["useraccount.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["site_id"], ["site.id"]),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["useraccount.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_inspectionroute_name"), "inspectionroute", ["name"], unique=False)
    op.create_index(op.f("ix_inspectionroute_organization_id"), "inspectionroute", ["organization_id"], unique=False)
    op.create_index(op.f("ix_inspectionroute_site_id"), "inspectionroute", ["site_id"], unique=False)

    op.create_table(
        "inspectiontemplate",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("site_id", sa.String(), nullable=False),
        sa.Column("route_id", sa.String(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("inspection_profile_json", sa.JSON(), nullable=False),
        sa.Column("alert_rules_json", sa.JSON(), nullable=False),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("updated_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["useraccount.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["route_id"], ["inspectionroute.id"]),
        sa.ForeignKeyConstraint(["site_id"], ["site.id"]),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["useraccount.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_inspectiontemplate_name"), "inspectiontemplate", ["name"], unique=False)
    op.create_index(op.f("ix_inspectiontemplate_organization_id"), "inspectiontemplate", ["organization_id"], unique=False)
    op.create_index(op.f("ix_inspectiontemplate_route_id"), "inspectiontemplate", ["route_id"], unique=False)
    op.create_index(op.f("ix_inspectiontemplate_site_id"), "inspectiontemplate", ["site_id"], unique=False)

    op.create_table(
        "inspectionschedule",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("site_id", sa.String(), nullable=False),
        sa.Column("route_id", sa.String(), nullable=True),
        sa.Column("template_id", sa.String(), nullable=True),
        sa.Column("planned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("recurrence", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("alert_rules_json", sa.JSON(), nullable=False),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("updated_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["useraccount.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["route_id"], ["inspectionroute.id"]),
        sa.ForeignKeyConstraint(["site_id"], ["site.id"]),
        sa.ForeignKeyConstraint(["template_id"], ["inspectiontemplate.id"]),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["useraccount.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_inspectionschedule_organization_id"), "inspectionschedule", ["organization_id"], unique=False)
    op.create_index(op.f("ix_inspectionschedule_route_id"), "inspectionschedule", ["route_id"], unique=False)
    op.create_index(op.f("ix_inspectionschedule_site_id"), "inspectionschedule", ["site_id"], unique=False)
    op.create_index(op.f("ix_inspectionschedule_status"), "inspectionschedule", ["status"], unique=False)
    op.create_index(op.f("ix_inspectionschedule_template_id"), "inspectionschedule", ["template_id"], unique=False)

    op.create_table(
        "dispatchrecord",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("mission_id", sa.String(), nullable=False),
        sa.Column("route_id", sa.String(), nullable=True),
        sa.Column("template_id", sa.String(), nullable=True),
        sa.Column("schedule_id", sa.String(), nullable=True),
        sa.Column("dispatched_by_user_id", sa.String(), nullable=True),
        sa.Column("assignee", sa.String(), nullable=True),
        sa.Column("execution_target", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("dispatched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["dispatched_by_user_id"], ["useraccount.id"]),
        sa.ForeignKeyConstraint(["mission_id"], ["mission.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["route_id"], ["inspectionroute.id"]),
        sa.ForeignKeyConstraint(["schedule_id"], ["inspectionschedule.id"]),
        sa.ForeignKeyConstraint(["template_id"], ["inspectiontemplate.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_dispatchrecord_mission_id"), "dispatchrecord", ["mission_id"], unique=False)
    op.create_index(op.f("ix_dispatchrecord_organization_id"), "dispatchrecord", ["organization_id"], unique=False)
    op.create_index(op.f("ix_dispatchrecord_route_id"), "dispatchrecord", ["route_id"], unique=False)
    op.create_index(op.f("ix_dispatchrecord_schedule_id"), "dispatchrecord", ["schedule_id"], unique=False)
    op.create_index(op.f("ix_dispatchrecord_status"), "dispatchrecord", ["status"], unique=False)
    op.create_index(op.f("ix_dispatchrecord_template_id"), "dispatchrecord", ["template_id"], unique=False)
    op.create_index(op.f("ix_dispatchrecord_dispatched_by_user_id"), "dispatchrecord", ["dispatched_by_user_id"], unique=False)

    op.create_table(
        "inspectioneventrecord",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("mission_id", sa.String(), nullable=False),
        sa.Column("site_id", sa.String(), nullable=True),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("severity", sa.String(), nullable=False),
        sa.Column("summary", sa.String(), nullable=False),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("evidence_artifact_names_json", sa.JSON(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["mission_id"], ["mission.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["site_id"], ["site.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_inspectioneventrecord_category"), "inspectioneventrecord", ["category"], unique=False)
    op.create_index(op.f("ix_inspectioneventrecord_detected_at"), "inspectioneventrecord", ["detected_at"], unique=False)
    op.create_index(op.f("ix_inspectioneventrecord_mission_id"), "inspectioneventrecord", ["mission_id"], unique=False)
    op.create_index(op.f("ix_inspectioneventrecord_organization_id"), "inspectioneventrecord", ["organization_id"], unique=False)
    op.create_index(op.f("ix_inspectioneventrecord_severity"), "inspectioneventrecord", ["severity"], unique=False)
    op.create_index(op.f("ix_inspectioneventrecord_site_id"), "inspectioneventrecord", ["site_id"], unique=False)
    op.create_index(op.f("ix_inspectioneventrecord_source"), "inspectioneventrecord", ["source"], unique=False)
    op.create_index(op.f("ix_inspectioneventrecord_status"), "inspectioneventrecord", ["status"], unique=False)

    op.create_table(
        "inspectionreport",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("mission_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("summary", sa.String(), nullable=True),
        sa.Column("event_count", sa.Integer(), nullable=False),
        sa.Column("artifact_name", sa.String(), nullable=True),
        sa.Column("mode", sa.String(), nullable=False),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("updated_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["useraccount.id"]),
        sa.ForeignKeyConstraint(["mission_id"], ["mission.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["useraccount.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_inspectionreport_created_by_user_id"), "inspectionreport", ["created_by_user_id"], unique=False)
    op.create_index(op.f("ix_inspectionreport_mission_id"), "inspectionreport", ["mission_id"], unique=False)
    op.create_index(op.f("ix_inspectionreport_mode"), "inspectionreport", ["mode"], unique=False)
    op.create_index(op.f("ix_inspectionreport_organization_id"), "inspectionreport", ["organization_id"], unique=False)
    op.create_index(op.f("ix_inspectionreport_status"), "inspectionreport", ["status"], unique=False)
    op.create_index(op.f("ix_inspectionreport_updated_by_user_id"), "inspectionreport", ["updated_by_user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_inspectionreport_updated_by_user_id"), table_name="inspectionreport")
    op.drop_index(op.f("ix_inspectionreport_status"), table_name="inspectionreport")
    op.drop_index(op.f("ix_inspectionreport_organization_id"), table_name="inspectionreport")
    op.drop_index(op.f("ix_inspectionreport_mode"), table_name="inspectionreport")
    op.drop_index(op.f("ix_inspectionreport_mission_id"), table_name="inspectionreport")
    op.drop_index(op.f("ix_inspectionreport_created_by_user_id"), table_name="inspectionreport")
    op.drop_table("inspectionreport")

    op.drop_index(op.f("ix_inspectioneventrecord_status"), table_name="inspectioneventrecord")
    op.drop_index(op.f("ix_inspectioneventrecord_source"), table_name="inspectioneventrecord")
    op.drop_index(op.f("ix_inspectioneventrecord_site_id"), table_name="inspectioneventrecord")
    op.drop_index(op.f("ix_inspectioneventrecord_severity"), table_name="inspectioneventrecord")
    op.drop_index(op.f("ix_inspectioneventrecord_organization_id"), table_name="inspectioneventrecord")
    op.drop_index(op.f("ix_inspectioneventrecord_mission_id"), table_name="inspectioneventrecord")
    op.drop_index(op.f("ix_inspectioneventrecord_detected_at"), table_name="inspectioneventrecord")
    op.drop_index(op.f("ix_inspectioneventrecord_category"), table_name="inspectioneventrecord")
    op.drop_table("inspectioneventrecord")

    op.drop_index(op.f("ix_dispatchrecord_dispatched_by_user_id"), table_name="dispatchrecord")
    op.drop_index(op.f("ix_dispatchrecord_template_id"), table_name="dispatchrecord")
    op.drop_index(op.f("ix_dispatchrecord_status"), table_name="dispatchrecord")
    op.drop_index(op.f("ix_dispatchrecord_schedule_id"), table_name="dispatchrecord")
    op.drop_index(op.f("ix_dispatchrecord_route_id"), table_name="dispatchrecord")
    op.drop_index(op.f("ix_dispatchrecord_organization_id"), table_name="dispatchrecord")
    op.drop_index(op.f("ix_dispatchrecord_mission_id"), table_name="dispatchrecord")
    op.drop_table("dispatchrecord")

    op.drop_index(op.f("ix_inspectionschedule_template_id"), table_name="inspectionschedule")
    op.drop_index(op.f("ix_inspectionschedule_status"), table_name="inspectionschedule")
    op.drop_index(op.f("ix_inspectionschedule_site_id"), table_name="inspectionschedule")
    op.drop_index(op.f("ix_inspectionschedule_route_id"), table_name="inspectionschedule")
    op.drop_index(op.f("ix_inspectionschedule_organization_id"), table_name="inspectionschedule")
    op.drop_table("inspectionschedule")

    op.drop_index(op.f("ix_inspectiontemplate_site_id"), table_name="inspectiontemplate")
    op.drop_index(op.f("ix_inspectiontemplate_route_id"), table_name="inspectiontemplate")
    op.drop_index(op.f("ix_inspectiontemplate_organization_id"), table_name="inspectiontemplate")
    op.drop_index(op.f("ix_inspectiontemplate_name"), table_name="inspectiontemplate")
    op.drop_table("inspectiontemplate")

    op.drop_index(op.f("ix_inspectionroute_site_id"), table_name="inspectionroute")
    op.drop_index(op.f("ix_inspectionroute_organization_id"), table_name="inspectionroute")
    op.drop_index(op.f("ix_inspectionroute_name"), table_name="inspectionroute")
    op.drop_table("inspectionroute")
