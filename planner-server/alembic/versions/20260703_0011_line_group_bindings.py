"""Add LINE group bindings."""

from alembic import op
import sqlalchemy as sa


revision = "20260703_0011"
down_revision = "20260703_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "line_group_bindings",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("group_id", sa.String(), nullable=False),
        sa.Column("source_type", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("site_id", sa.String(), nullable=False),
        sa.Column("site_slug", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["site_id"], ["site.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_line_group_bindings_group_id"),
        "line_group_bindings",
        ["group_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_line_group_bindings_source_type"),
        "line_group_bindings",
        ["source_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_line_group_bindings_organization_id"),
        "line_group_bindings",
        ["organization_id"],
        unique=False,
    )
    op.create_index(op.f("ix_line_group_bindings_site_id"), "line_group_bindings", ["site_id"], unique=False)
    op.create_index(
        op.f("ix_line_group_bindings_site_slug"),
        "line_group_bindings",
        ["site_slug"],
        unique=False,
    )
    op.create_index(
        op.f("ix_line_group_bindings_is_active"),
        "line_group_bindings",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        op.f("ix_line_group_bindings_created_at"),
        "line_group_bindings",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_line_group_bindings_created_at"), table_name="line_group_bindings")
    op.drop_index(op.f("ix_line_group_bindings_is_active"), table_name="line_group_bindings")
    op.drop_index(op.f("ix_line_group_bindings_site_slug"), table_name="line_group_bindings")
    op.drop_index(op.f("ix_line_group_bindings_site_id"), table_name="line_group_bindings")
    op.drop_index(op.f("ix_line_group_bindings_organization_id"), table_name="line_group_bindings")
    op.drop_index(op.f("ix_line_group_bindings_source_type"), table_name="line_group_bindings")
    op.drop_index(op.f("ix_line_group_bindings_group_id"), table_name="line_group_bindings")
    op.drop_table("line_group_bindings")
