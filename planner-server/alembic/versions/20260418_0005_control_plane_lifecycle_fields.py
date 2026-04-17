"""Persist schedule and dispatch lifecycle fields for control-plane Batch C."""

from alembic import op
import sqlalchemy as sa


revision = "20260418_0005"
down_revision = "20260418_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("inspectionschedule", sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("inspectionschedule", sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("inspectionschedule", sa.Column("last_dispatched_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("inspectionschedule", sa.Column("pause_reason", sa.String(), nullable=True))
    op.add_column("inspectionschedule", sa.Column("last_outcome", sa.String(), nullable=True))

    op.add_column("dispatchrecord", sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("dispatchrecord", sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True))

    connection = op.get_bind()
    connection.execute(
        sa.text(
            """
            UPDATE inspectionschedule
            SET next_run_at = CASE WHEN status = 'scheduled' THEN planned_at ELSE NULL END,
                last_run_at = CASE WHEN status IN ('completed', 'cancelled') THEN updated_at ELSE NULL END,
                pause_reason = CASE WHEN status = 'paused' THEN 'Paused from control-plane workspace' ELSE NULL END,
                last_outcome = CASE
                    WHEN status = 'completed' THEN 'completed'
                    WHEN status = 'cancelled' THEN 'cancelled'
                    WHEN status = 'paused' THEN 'paused'
                    ELSE 'scheduled_for_execution'
                END
            """
        )
    )
    connection.execute(
        sa.text(
            """
            UPDATE dispatchrecord
            SET accepted_at = CASE WHEN status = 'accepted' THEN updated_at ELSE NULL END,
                closed_at = CASE WHEN status = 'failed' THEN updated_at ELSE NULL END
            """
        )
    )


def downgrade() -> None:
    op.drop_column("dispatchrecord", "closed_at")
    op.drop_column("dispatchrecord", "accepted_at")

    op.drop_column("inspectionschedule", "last_outcome")
    op.drop_column("inspectionschedule", "pause_reason")
    op.drop_column("inspectionschedule", "last_dispatched_at")
    op.drop_column("inspectionschedule", "last_run_at")
    op.drop_column("inspectionschedule", "next_run_at")
