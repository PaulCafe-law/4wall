"""Decision ledger: decision points, roster, skill matrix, zones, mold rules."""

from alembic import op
import sqlalchemy as sa


revision = "20260707_0014"
down_revision = "20260704_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "decision_points",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("site_id", sa.String(), nullable=True),
        sa.Column("domain", sa.String(), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("subject_ref", sa.String(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("plan_json", sa.JSON(), nullable=False),
        sa.Column("prediction_json", sa.JSON(), nullable=False),
        sa.Column("predicted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_json", sa.JSON(), nullable=False),
        sa.Column("actual_recorded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("consistent", sa.Boolean(), nullable=True),
        sa.Column("attribution", sa.String(), nullable=False),
        sa.Column("attribution_note", sa.String(), nullable=True),
        sa.Column("attributed_by", sa.String(), nullable=True),
        sa.Column("attributed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["site_id"], ["site.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_decision_points_organization_id"), "decision_points", ["organization_id"])
    op.create_index(op.f("ix_decision_points_domain"), "decision_points", ["domain"])
    op.create_index(op.f("ix_decision_points_source"), "decision_points", ["source"])
    op.create_index(op.f("ix_decision_points_event_type"), "decision_points", ["event_type"])
    op.create_index(op.f("ix_decision_points_subject_ref"), "decision_points", ["subject_ref"])
    op.create_index(op.f("ix_decision_points_occurred_at"), "decision_points", ["occurred_at"])
    op.create_index(op.f("ix_decision_points_consistent"), "decision_points", ["consistent"])
    op.create_index(op.f("ix_decision_points_attribution"), "decision_points", ["attribution"])
    op.create_index(op.f("ix_decision_points_status"), "decision_points", ["status"])
    op.create_index("ix_decision_points_org_occurred_at", "decision_points", ["organization_id", "occurred_at"])

    op.create_table(
        "shift_roster_entries",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("work_date", sa.String(), nullable=False),
        sa.Column("shift", sa.String(), nullable=False),
        sa.Column("person_name", sa.String(), nullable=False),
        sa.Column("zone_name", sa.String(), nullable=True),
        sa.Column("machine_nos_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_shift_roster_entries_organization_id"), "shift_roster_entries", ["organization_id"])
    op.create_index(op.f("ix_shift_roster_entries_shift"), "shift_roster_entries", ["shift"])
    op.create_index(op.f("ix_shift_roster_entries_work_date"), "shift_roster_entries", ["work_date"])
    op.create_index(op.f("ix_shift_roster_entries_person_name"), "shift_roster_entries", ["person_name"])
    op.create_index("ix_shift_roster_org_date", "shift_roster_entries", ["organization_id", "work_date"])

    op.create_table(
        "skill_matrix_entries",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("person_name", sa.String(), nullable=False),
        sa.Column("machine_no", sa.String(), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_skill_matrix_entries_organization_id"), "skill_matrix_entries", ["organization_id"])
    op.create_index(op.f("ix_skill_matrix_entries_person_name"), "skill_matrix_entries", ["person_name"])
    op.create_index(op.f("ix_skill_matrix_entries_machine_no"), "skill_matrix_entries", ["machine_no"])
    op.create_index(
        "ix_skill_matrix_org_person_machine",
        "skill_matrix_entries",
        ["organization_id", "person_name", "machine_no"],
        unique=True,
    )

    op.create_table(
        "semantic_zones",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("site_id", sa.String(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("x_min", sa.Float(), nullable=False),
        sa.Column("x_max", sa.Float(), nullable=False),
        sa.Column("z_min", sa.Float(), nullable=False),
        sa.Column("z_max", sa.Float(), nullable=False),
        sa.Column("machine_nos_json", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["site_id"], ["site.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_semantic_zones_organization_id"), "semantic_zones", ["organization_id"])
    op.create_index(op.f("ix_semantic_zones_site_id"), "semantic_zones", ["site_id"])
    op.create_index(op.f("ix_semantic_zones_name"), "semantic_zones", ["name"])
    op.create_index(op.f("ix_semantic_zones_is_active"), "semantic_zones", ["is_active"])

    op.create_table(
        "mold_maintenance_rules",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("mold_no", sa.String(), nullable=False),
        sa.Column("threshold_count", sa.Integer(), nullable=False),
        sa.Column("current_count", sa.Integer(), nullable=False),
        sa.Column("counter_source", sa.String(), nullable=False),
        sa.Column("last_reset_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_alert_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_mold_maintenance_rules_organization_id"), "mold_maintenance_rules", ["organization_id"])
    op.create_index(op.f("ix_mold_maintenance_rules_mold_no"), "mold_maintenance_rules", ["mold_no"])
    op.create_index(
        "ix_mold_rules_org_mold",
        "mold_maintenance_rules",
        ["organization_id", "mold_no"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_table("mold_maintenance_rules")
    op.drop_table("semantic_zones")
    op.drop_table("skill_matrix_entries")
    op.drop_table("shift_roster_entries")
    op.drop_table("decision_points")
