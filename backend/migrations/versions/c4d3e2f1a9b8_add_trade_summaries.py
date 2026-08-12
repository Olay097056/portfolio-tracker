"""add trade_summaries

Revision ID: c4d3e2f1a9b8
Revises: b7e5f2a1c9d3
Create Date: 2026-08-12

Trade desk (reference-parity ticket 09):
- trade_summaries: AI-written daily/monthly summaries + weekly target records.
  UNIQUE (team_id, kind, period) IS the idempotence guard — the tick runs
  144x/day server-side; without it a summary would cost 144 LLM calls/day.
"""
import sqlalchemy as sa
from alembic import op

revision = "c4d3e2f1a9b8"
down_revision = "b7e5f2a1c9d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trade_summaries",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("team_id", sa.String(36), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),      # daily | monthly | weekly_target
        sa.Column("period", sa.String(16), nullable=False),    # "2026-08-12" | "2026-08" | "2026-W33"
        sa.Column("summary_th", sa.Text(), nullable=False),
        sa.Column("tokens_in", sa.Integer(), nullable=True),
        sa.Column("tokens_out", sa.Integer(), nullable=True),
        sa.Column("cost_usd", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("team_id", "kind", "period", name="uq_trade_summaries_period"),
    )
    op.create_index("ix_trade_summaries_team_id", "trade_summaries", ["team_id"])


def downgrade() -> None:
    op.drop_index("ix_trade_summaries_team_id", table_name="trade_summaries")
    op.drop_table("trade_summaries")
