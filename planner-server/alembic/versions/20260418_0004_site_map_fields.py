"""Add site-map metadata fields for control-plane Batch B."""

from alembic import op
import sqlalchemy as sa


revision = "20260418_0004"
down_revision = "20260417_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "site",
        sa.Column("map_config_json", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )
    op.add_column(
        "site",
        sa.Column("zones_json", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    op.add_column(
        "site",
        sa.Column("launch_points_json", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    op.add_column(
        "site",
        sa.Column("viewpoints_json", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )


def downgrade() -> None:
    op.drop_column("site", "viewpoints_json")
    op.drop_column("site", "launch_points_json")
    op.drop_column("site", "zones_json")
    op.drop_column("site", "map_config_json")
