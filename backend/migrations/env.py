"""Alembic environment — reads the same URL contract as app.database.

URL resolution (first hit wins):
  PORTFOLIO_DB_URL   (tests & prod override — Supabase Postgres or temp SQLite)
  default            sqlite:///./portfolio.db  (local dev)

Every ORM model module is imported so `autogenerate` sees the full 26-table schema.
"""
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Register all ORM models into Base.metadata (vercel-supabase plan ticket 05):
import app.boardroom_service  # noqa: F401
import app.boardroom_stance_service  # noqa: F401
import app.cache  # noqa: F401  (cache_entries — ticket 06)
import app.country_ai_service  # noqa: F401
import app.models  # noqa: F401
import app.news_service  # noqa: F401
import app.routers.models  # noqa: F401
import app.routers.signals  # noqa: F401
import app.trade_desk_service  # noqa: F401
from app.database import Base
from app.models import UTCDateTime

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def render_item(type_, obj, autogen_context):
    """Render the UTCDateTime TypeDecorator cleanly (its impl args differ from its ctor)."""
    if type_ == "type" and isinstance(obj, UTCDateTime):
        autogen_context.imports.add("from app.models import UTCDateTime")
        return "UTCDateTime()"
    return False


def get_url() -> str:
    return os.environ.get("PORTFOLIO_DB_URL") or "sqlite:///./portfolio.db"


def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        render_item=render_item,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = get_url()
    connectable = engine_from_config(configuration, prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True, render_item=render_item)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()