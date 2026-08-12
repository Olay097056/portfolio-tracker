"""add trade_pending_orders + master_on

Revision ID: b7e5f2a1c9d3
Revises: 9f8e7d6c5b4a
Create Date: 2026-08-12

Trade desk (reference-parity ticket 08):
1. create trade_pending_orders table (ORM class existed, table never migrated)
2. add trade_teams.master_on (master switch — stops NEW turns, SL/TP+settle keep working)

Idempotent: prod already has trade_pending_orders (created by an earlier
create_all during deploy while alembic_version lagged at 9f8e7d6c5b4a), so we
check the inspector before creating/adding — safe on both migrated and
fresh environments.
"""
import sqlalchemy as sa
from alembic import op

revision = "b7e5f2a1c9d3"
down_revision = "9f8e7d6c5b4a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # 1. trade_pending_orders (matches TradePendingOrder ORM)
    if not inspector.has_table("trade_pending_orders"):
        op.create_table(
            "trade_pending_orders",
            sa.Column("id", sa.String(36), nullable=False),
            sa.Column("team_id", sa.String(36), nullable=False),
            sa.Column("symbol", sa.String(32), nullable=False),
            sa.Column("side", sa.String(8), nullable=False),
            sa.Column("order_type", sa.String(8), nullable=False),
            sa.Column("target_price", sa.Float(), nullable=False),
            sa.Column("size_notional", sa.Float(), nullable=False),
            sa.Column("margin_reserved", sa.Float(), nullable=True),
            sa.Column("sl_price", sa.Float(), nullable=True),
            sa.Column("tp_price", sa.Float(), nullable=True),
            sa.Column("status", sa.String(16), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_trade_pending_orders_team_id", "trade_pending_orders", ["team_id"])
    else:
        # table exists (created via create_all during a deploy) — ensure index
        idxs = {i["name"] for i in inspector.get_indexes("trade_pending_orders")}
        if "ix_trade_pending_orders_team_id" not in idxs:
            op.create_index("ix_trade_pending_orders_team_id", "trade_pending_orders", ["team_id"])

    # 2. master_on on existing trade_teams (ALTER — table has real data)
    #    Note: nullable + server_default (not NOT NULL) — works on both
    #    Postgres (prod) and SQLite (dev tests); ORM always writes the value.
    cols = {c["name"] for c in inspector.get_columns("trade_teams")}
    if "master_on" not in cols:
        op.add_column("trade_teams", sa.Column("master_on", sa.Integer(), nullable=True, server_default=sa.text("1")))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("trade_teams")}
    if "master_on" in cols:
        op.drop_column("trade_teams", "master_on")
    if inspector.has_table("trade_pending_orders"):
        op.drop_index("ix_trade_pending_orders_team_id", table_name="trade_pending_orders")
        op.drop_table("trade_pending_orders")
