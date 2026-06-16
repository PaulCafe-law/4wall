"""Add Industrial Data Engine job tables."""

from alembic import op
import sqlalchemy as sa


revision = "20260609_0008"
down_revision = "20260528_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "industrial_engine_jobs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("site_id", sa.String(), nullable=True),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("mode", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("current_stage", sa.String(), nullable=True),
        sa.Column("failure_reason", sa.String(), nullable=True),
        sa.Column("request_json", sa.JSON(), nullable=False),
        sa.Column("result_json", sa.JSON(), nullable=False),
        sa.Column("exports_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["useraccount.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["site_id"], ["site.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_industrial_engine_jobs_created_at"), "industrial_engine_jobs", ["created_at"], unique=False)
    op.create_index(
        op.f("ix_industrial_engine_jobs_created_by_user_id"),
        "industrial_engine_jobs",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_industrial_engine_jobs_current_stage"),
        "industrial_engine_jobs",
        ["current_stage"],
        unique=False,
    )
    op.create_index(op.f("ix_industrial_engine_jobs_mode"), "industrial_engine_jobs", ["mode"], unique=False)
    op.create_index(
        op.f("ix_industrial_engine_jobs_organization_id"),
        "industrial_engine_jobs",
        ["organization_id"],
        unique=False,
    )
    op.create_index(op.f("ix_industrial_engine_jobs_site_id"), "industrial_engine_jobs", ["site_id"], unique=False)
    op.create_index(op.f("ix_industrial_engine_jobs_status"), "industrial_engine_jobs", ["status"], unique=False)

    op.create_table(
        "industrial_engine_job_stages",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("job_id", sa.String(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("reason", sa.String(), nullable=True),
        sa.Column("output_json", sa.JSON(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["job_id"], ["industrial_engine_jobs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_industrial_engine_job_stages_job_id"),
        "industrial_engine_job_stages",
        ["job_id"],
        unique=False,
    )
    op.create_index(op.f("ix_industrial_engine_job_stages_name"), "industrial_engine_job_stages", ["name"], unique=False)
    op.create_index(
        op.f("ix_industrial_engine_job_stages_sequence"),
        "industrial_engine_job_stages",
        ["sequence"],
        unique=False,
    )
    op.create_index(
        op.f("ix_industrial_engine_job_stages_status"),
        "industrial_engine_job_stages",
        ["status"],
        unique=False,
    )

    op.create_table(
        "industrial_engine_input_assets",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("job_id", sa.String(), nullable=False),
        sa.Column("file_name", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("storage_key", sa.String(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["job_id"], ["industrial_engine_jobs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_industrial_engine_input_assets_created_at"),
        "industrial_engine_input_assets",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_industrial_engine_input_assets_job_id"),
        "industrial_engine_input_assets",
        ["job_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_industrial_engine_input_assets_job_id"), table_name="industrial_engine_input_assets")
    op.drop_index(op.f("ix_industrial_engine_input_assets_created_at"), table_name="industrial_engine_input_assets")
    op.drop_table("industrial_engine_input_assets")

    op.drop_index(op.f("ix_industrial_engine_job_stages_status"), table_name="industrial_engine_job_stages")
    op.drop_index(op.f("ix_industrial_engine_job_stages_sequence"), table_name="industrial_engine_job_stages")
    op.drop_index(op.f("ix_industrial_engine_job_stages_name"), table_name="industrial_engine_job_stages")
    op.drop_index(op.f("ix_industrial_engine_job_stages_job_id"), table_name="industrial_engine_job_stages")
    op.drop_table("industrial_engine_job_stages")

    op.drop_index(op.f("ix_industrial_engine_jobs_status"), table_name="industrial_engine_jobs")
    op.drop_index(op.f("ix_industrial_engine_jobs_site_id"), table_name="industrial_engine_jobs")
    op.drop_index(op.f("ix_industrial_engine_jobs_organization_id"), table_name="industrial_engine_jobs")
    op.drop_index(op.f("ix_industrial_engine_jobs_mode"), table_name="industrial_engine_jobs")
    op.drop_index(op.f("ix_industrial_engine_jobs_current_stage"), table_name="industrial_engine_jobs")
    op.drop_index(op.f("ix_industrial_engine_jobs_created_by_user_id"), table_name="industrial_engine_jobs")
    op.drop_index(op.f("ix_industrial_engine_jobs_created_at"), table_name="industrial_engine_jobs")
    op.drop_table("industrial_engine_jobs")
