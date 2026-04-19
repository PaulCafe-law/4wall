"""Add route-owned launch point geometry for patrol v1."""

from alembic import op
import sqlalchemy as sa


revision = "20260419_0006"
down_revision = "20260418_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "inspectionroute",
        sa.Column(
            "launch_point_json",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("inspectionroute", "launch_point_json")
