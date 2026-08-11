"""add cache_entries

Revision ID: a1b2c3d4e5f6
Revises: fdb64c353441
Create Date: 2026-08-11

Central DB-backed cache table (vercel-supabase plan ticket 06).
"""
import sqlalchemy as sa
from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "fdb64c353441"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cache_entries",
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("value_json", sa.Text(), nullable=False),
        sa.Column("computed_at", sa.DateTime(), nullable=False),
        sa.Column("ttl_sec", sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )


def downgrade() -> None:
    op.drop_table("cache_entries")
