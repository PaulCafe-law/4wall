"""Add verified LINE user account linking."""

from alembic import op
import sqlalchemy as sa


revision = "20260712_0016"
down_revision = "20260710_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "line_webhook_events",
        sa.Column("encrypted_reply_messages", sa.String(), nullable=True),
    )

    op.create_table(
        "line_user_bindings",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("destination_id", sa.String(), nullable=False),
        sa.Column("line_user_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("site_id", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["site_id"], ["site.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["useraccount.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "destination_id",
            "line_user_id",
            name="uq_line_user_bindings_destination_line_user",
        ),
        sa.UniqueConstraint(
            "destination_id",
            "user_id",
            name="uq_line_user_bindings_destination_user",
        ),
    )
    for column in (
        "destination_id",
        "line_user_id",
        "user_id",
        "site_id",
        "is_active",
        "verified_at",
        "created_at",
        "updated_at",
    ):
        op.create_index(op.f(f"ix_line_user_bindings_{column}"), "line_user_bindings", [column], unique=False)

    op.create_table(
        "line_account_link_attempts",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("flow_token_hash", sa.String(), nullable=False),
        sa.Column("expected_line_user_id", sa.String(), nullable=False),
        sa.Column("destination_id", sa.String(), nullable=False),
        sa.Column("is_current", sa.Boolean(), nullable=True),
        sa.Column("encrypted_link_token", sa.String(), nullable=True),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("site_id", sa.String(), nullable=True),
        sa.Column("nonce_hash", sa.String(), nullable=True),
        sa.Column("redirect_token_hash", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("redirected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["site_id"], ["site.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["useraccount.id"]),
        sa.CheckConstraint(
            "(status IN ('pending_web_confirmation', 'pending_line_confirmation') AND is_current IS TRUE) "
            "OR (status NOT IN ('pending_web_confirmation', 'pending_line_confirmation') AND is_current IS NULL)",
            name="ck_line_link_attempts_current_status",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "destination_id",
            "expected_line_user_id",
            "is_current",
            name="uq_line_link_attempts_destination_user_current",
        ),
    )
    op.create_index(
        op.f("ix_line_account_link_attempts_flow_token_hash"),
        "line_account_link_attempts",
        ["flow_token_hash"],
        unique=True,
    )
    op.create_index(
        op.f("ix_line_account_link_attempts_nonce_hash"),
        "line_account_link_attempts",
        ["nonce_hash"],
        unique=True,
    )
    op.create_index(
        op.f("ix_line_account_link_attempts_redirect_token_hash"),
        "line_account_link_attempts",
        ["redirect_token_hash"],
        unique=True,
    )
    for column in (
        "expected_line_user_id",
        "destination_id",
        "is_current",
        "user_id",
        "site_id",
        "status",
        "expires_at",
        "consumed_at",
        "redirected_at",
        "created_at",
        "updated_at",
    ):
        op.create_index(
            op.f(f"ix_line_account_link_attempts_{column}"),
            "line_account_link_attempts",
            [column],
            unique=False,
        )


def downgrade() -> None:
    op.drop_table("line_account_link_attempts")
    op.drop_table("line_user_bindings")
    op.drop_column("line_webhook_events", "encrypted_reply_messages")
