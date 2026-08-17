"""add cash-equity position fields

Revision ID: d5e6f7a8b9c0
Revises: c4d3e2f1a9b8
Create Date: 2026-08-13

Cash-equity trade desk (perp → หุ้นเงินสด S&P 500, user decision 2026-08-13):

- trade_positions.quantity: shares held (fractional allowed, paper trading).
  Previously size_pct was the only sizing field and no cash ever moved.
- trade_positions.reserved_cash: cash reserved for the position. For a long
  this is the cost (qty × entry). For a short it is the full notional
  reserved (qty × entry) — shorts must be fully cash-backed (user decision:
  "short ต้องสำรองเงินสดเต็มจำนวน").

prod has 0 open positions (checked 2026-08-13) so no backfill is needed —
nullable columns let the code handle legacy rows defensively anyway.
"""

import sqlalchemy as sa
from alembic import op

revision = "d5e6f7a8b9c0"
down_revision = "c4d3e2f1a9b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trade_positions", sa.Column("quantity", sa.Float(), nullable=True))
    op.add_column("trade_positions", sa.Column("reserved_cash", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("trade_positions", "reserved_cash")
    op.drop_column("trade_positions", "quantity")
