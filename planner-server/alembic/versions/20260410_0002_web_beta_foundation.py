"""Add web beta tenancy, billing, and audit foundation."""

from alembic import op
import sqlalchemy as sa


revision = "20260410_0002"
down_revision = "20260402_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "useraccount",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_useraccount_email"), "useraccount", ["email"], unique=True)

    op.create_table(
        "organization",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_organization_name"), "organization", ["name"], unique=False)
    op.create_index(op.f("ix_organization_slug"), "organization", ["slug"], unique=True)

    op.create_table(
        "webrefreshtoken",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["useraccount.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_webrefreshtoken_user_id"), "webrefreshtoken", ["user_id"], unique=False)

    op.create_table(
        "organizationmembership",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=True),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["useraccount.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_organizationmembership_organization_id"), "organizationmembership", ["organization_id"], unique=False)
    op.create_index(op.f("ix_organizationmembership_role"), "organizationmembership", ["role"], unique=False)
    op.create_index(op.f("ix_organizationmembership_user_id"), "organizationmembership", ["user_id"], unique=False)

    op.create_table(
        "invite",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("invited_by_user_id", sa.String(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["invited_by_user_id"], ["useraccount.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_invite_email"), "invite", ["email"], unique=False)
    op.create_index(op.f("ix_invite_organization_id"), "invite", ["organization_id"], unique=False)
    op.create_index(op.f("ix_invite_role"), "invite", ["role"], unique=False)
    op.create_index(op.f("ix_invite_token_hash"), "invite", ["token_hash"], unique=True)

    op.create_table(
        "site",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("external_ref", sa.String(), nullable=True),
        sa.Column("address", sa.String(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("notes", sa.String(), nullable=False),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("updated_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["useraccount.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["useraccount.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_site_name"), "site", ["name"], unique=False)
    op.create_index(op.f("ix_site_organization_id"), "site", ["organization_id"], unique=False)

    op.create_table(
        "billinginvoice",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("invoice_number", sa.String(), nullable=False),
        sa.Column("currency", sa.String(), nullable=False),
        sa.Column("subtotal", sa.Integer(), nullable=False),
        sa.Column("tax", sa.Integer(), nullable=False),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("payment_instructions", sa.String(), nullable=False),
        sa.Column("attachment_refs", sa.JSON(), nullable=False),
        sa.Column("notes", sa.String(), nullable=False),
        sa.Column("payment_note", sa.String(), nullable=False),
        sa.Column("receipt_ref", sa.String(), nullable=False),
        sa.Column("void_reason", sa.String(), nullable=False),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("updated_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["useraccount.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["useraccount.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_billinginvoice_invoice_number"), "billinginvoice", ["invoice_number"], unique=True)
    op.create_index(op.f("ix_billinginvoice_organization_id"), "billinginvoice", ["organization_id"], unique=False)
    op.create_index(op.f("ix_billinginvoice_status"), "billinginvoice", ["status"], unique=False)

    op.create_table(
        "auditevent",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=True),
        sa.Column("actor_user_id", sa.String(), nullable=True),
        sa.Column("actor_operator_id", sa.String(), nullable=True),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("target_type", sa.String(), nullable=True),
        sa.Column("target_id", sa.String(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["actor_operator_id"], ["operatoraccount.id"]),
        sa.ForeignKeyConstraint(["actor_user_id"], ["useraccount.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_auditevent_action"), "auditevent", ["action"], unique=False)
    op.create_index(op.f("ix_auditevent_actor_operator_id"), "auditevent", ["actor_operator_id"], unique=False)
    op.create_index(op.f("ix_auditevent_actor_user_id"), "auditevent", ["actor_user_id"], unique=False)
    op.create_index(op.f("ix_auditevent_organization_id"), "auditevent", ["organization_id"], unique=False)
    op.create_index(op.f("ix_auditevent_target_id"), "auditevent", ["target_id"], unique=False)
    op.create_index(op.f("ix_auditevent_target_type"), "auditevent", ["target_type"], unique=False)

    with op.batch_alter_table("mission") as batch_op:
        batch_op.add_column(sa.Column("organization_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("site_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("requested_by_user_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("status", sa.String(), nullable=False, server_default="ready"))
        batch_op.create_index(op.f("ix_mission_organization_id"), ["organization_id"], unique=False)
        batch_op.create_index(op.f("ix_mission_site_id"), ["site_id"], unique=False)
        batch_op.create_index(op.f("ix_mission_requested_by_user_id"), ["requested_by_user_id"], unique=False)
        batch_op.create_index(op.f("ix_mission_status"), ["status"], unique=False)
        batch_op.create_foreign_key("fk_mission_organization_id_organization", "organization", ["organization_id"], ["id"])
        batch_op.create_foreign_key("fk_mission_site_id_site", "site", ["site_id"], ["id"])
        batch_op.create_foreign_key("fk_mission_requested_by_user_id_useraccount", "useraccount", ["requested_by_user_id"], ["id"])
    with op.batch_alter_table("mission") as batch_op:
        batch_op.alter_column("status", server_default=None)

    with op.batch_alter_table("missionartifact") as batch_op:
        batch_op.add_column(sa.Column("organization_id", sa.String(), nullable=True))
        batch_op.create_index(op.f("ix_missionartifact_organization_id"), ["organization_id"], unique=False)
        batch_op.create_foreign_key(
            "fk_missionartifact_organization_id_organization",
            "organization",
            ["organization_id"],
            ["id"],
        )

    with op.batch_alter_table("flight") as batch_op:
        batch_op.add_column(sa.Column("organization_id", sa.String(), nullable=True))
        batch_op.create_index(op.f("ix_flight_organization_id"), ["organization_id"], unique=False)
        batch_op.create_foreign_key("fk_flight_organization_id_organization", "organization", ["organization_id"], ["id"])


def downgrade() -> None:
    with op.batch_alter_table("flight") as batch_op:
        batch_op.drop_constraint("fk_flight_organization_id_organization", type_="foreignkey")
        batch_op.drop_index(op.f("ix_flight_organization_id"))
        batch_op.drop_column("organization_id")

    with op.batch_alter_table("missionartifact") as batch_op:
        batch_op.drop_constraint("fk_missionartifact_organization_id_organization", type_="foreignkey")
        batch_op.drop_index(op.f("ix_missionartifact_organization_id"))
        batch_op.drop_column("organization_id")

    with op.batch_alter_table("mission") as batch_op:
        batch_op.drop_constraint("fk_mission_requested_by_user_id_useraccount", type_="foreignkey")
        batch_op.drop_constraint("fk_mission_site_id_site", type_="foreignkey")
        batch_op.drop_constraint("fk_mission_organization_id_organization", type_="foreignkey")
        batch_op.drop_index(op.f("ix_mission_status"))
        batch_op.drop_index(op.f("ix_mission_requested_by_user_id"))
        batch_op.drop_index(op.f("ix_mission_site_id"))
        batch_op.drop_index(op.f("ix_mission_organization_id"))
        batch_op.drop_column("status")
        batch_op.drop_column("requested_by_user_id")
        batch_op.drop_column("site_id")
        batch_op.drop_column("organization_id")

    op.drop_index(op.f("ix_auditevent_target_type"), table_name="auditevent")
    op.drop_index(op.f("ix_auditevent_target_id"), table_name="auditevent")
    op.drop_index(op.f("ix_auditevent_organization_id"), table_name="auditevent")
    op.drop_index(op.f("ix_auditevent_actor_user_id"), table_name="auditevent")
    op.drop_index(op.f("ix_auditevent_actor_operator_id"), table_name="auditevent")
    op.drop_index(op.f("ix_auditevent_action"), table_name="auditevent")
    op.drop_table("auditevent")

    op.drop_index(op.f("ix_billinginvoice_status"), table_name="billinginvoice")
    op.drop_index(op.f("ix_billinginvoice_organization_id"), table_name="billinginvoice")
    op.drop_index(op.f("ix_billinginvoice_invoice_number"), table_name="billinginvoice")
    op.drop_table("billinginvoice")

    op.drop_index(op.f("ix_site_organization_id"), table_name="site")
    op.drop_index(op.f("ix_site_name"), table_name="site")
    op.drop_table("site")

    op.drop_index(op.f("ix_invite_token_hash"), table_name="invite")
    op.drop_index(op.f("ix_invite_role"), table_name="invite")
    op.drop_index(op.f("ix_invite_organization_id"), table_name="invite")
    op.drop_index(op.f("ix_invite_email"), table_name="invite")
    op.drop_table("invite")

    op.drop_index(op.f("ix_organizationmembership_user_id"), table_name="organizationmembership")
    op.drop_index(op.f("ix_organizationmembership_role"), table_name="organizationmembership")
    op.drop_index(op.f("ix_organizationmembership_organization_id"), table_name="organizationmembership")
    op.drop_table("organizationmembership")

    op.drop_index(op.f("ix_webrefreshtoken_user_id"), table_name="webrefreshtoken")
    op.drop_table("webrefreshtoken")

    op.drop_index(op.f("ix_organization_slug"), table_name="organization")
    op.drop_index(op.f("ix_organization_name"), table_name="organization")
    op.drop_table("organization")

    op.drop_index(op.f("ix_useraccount_email"), table_name="useraccount")
    op.drop_table("useraccount")
