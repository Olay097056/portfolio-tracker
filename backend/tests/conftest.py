# Both environment variables below are set before any `app` module is imported,
# because app.database builds its engine at import time. Without them the suite
# runs against the developer's real files:
#
#   - backend/portfolio.db — test_signals_router's autouse cleanup deletes every
#     row in trading_signals, and test_models_router seeds score-history rows
#     that /api/models then prunes. Both talk to SessionLocal directly rather
#     than through the get_db override below, so the override never sees them.
#   - backend/data/bondcrisis.db — country_ai_service opens its own engine there.
#     A real cached DeepSeek brief satisfies the countries router's 24h cache, so
#     the AI stubs never run and the assertions check live content instead.
#
# Tests must never read or write real data.
#
# Hybrid database target (vercel-supabase plan ticket 05 / grilling 04 §6):
#   - default  = a throwaway SQLite file in a temp dir  (unchanged local/dev behavior)
#   - override = when PORTFOLIO_DB_URL points at a Postgres URL the caller supplies
#                (e.g. `PORTFOLIO_DB_URL="postgresql+psycopg://..." pytest`), we honor
#                it and build the schema from Alembic `upgrade head` — identical to
#                how prod Postgres is created — instead of `create_all`.
import atexit
import os
import shutil
import tempfile

_TEST_DATA_DIR = tempfile.mkdtemp(prefix="portfolio-tracker-tests-")
atexit.register(shutil.rmtree, _TEST_DATA_DIR, True)
os.environ.setdefault(
    "PORTFOLIO_DB_URL",
    "sqlite:///" + os.path.join(_TEST_DATA_DIR, "portfolio.db").replace("\\", "/"),
)
os.environ.setdefault("PORTFOLIO_DATA_DIR", _TEST_DATA_DIR)

import pytest
from sqlalchemy import create_engine, StaticPool
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

import alembic  # noqa: F401  (installed alongside the app)
from alembic import command
from alembic.config import Config

import app.models  # noqa: F401,E402  (registers ORM classes with Base.metadata)
import app.news_service  # noqa: F401,E402  (registers the news_items table)
import app.boardroom_service  # noqa: F401,E402  (registers the boardroom_* tables)
import app.boardroom_stance_service  # noqa: F401,E402  (registers boardroom_stances/unresolved)
import app.trade_desk_service  # noqa: F401,E402  (registers trade_* tables)
from app.database import Base, engine, get_db, SessionLocal  # noqa: E402
from app.main import app  # noqa: E402  (imports every router, registering their tables)

_DB_URL = os.environ["PORTFOLIO_DB_URL"]
_IS_POSTGRES = _DB_URL.startswith("postgres")


def _run_alembic_upgrade() -> None:
    """Build the schema from the migration chain (production-parity for Postgres)."""
    here = os.path.dirname(os.path.abspath(__file__))
    cfg = Config(os.path.join(here, "..", "alembic.ini"))
    # absolute path so it works regardless of the CWD pytest is launched from
    cfg.set_main_option("script_location", os.path.join(here, "..", "migrations"))
    # env.py's get_url() reads PORTFOLIO_DB_URL from the environment — already set.
    command.upgrade(cfg, "head")


if _IS_POSTGRES:
    # Schema straight from Alembic (matches prod) — NOT create_all.
    _run_alembic_upgrade()
else:
    # The throwaway database starts empty, and the modules that use SessionLocal
    # directly do so before any TestClient context manager has run the app's
    # lifespan create_all — so build the schema here, once, at collection time.
    Base.metadata.create_all(bind=engine)


@pytest.fixture()
def db_session():
    if _IS_POSTGRES:
        # No in-memory/StaticPool on Postgres: reuse the shared engine (same DB
        # that direct SessionLocal users and the app see), so state is consistent.
        session = SessionLocal()
        try:
            yield session
        finally:
            session.close()
        return
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="session", autouse=True)
def _clean_postgres_after():
    """Drop the dedicated Postgres test schema once the run finishes, so the next
    run starts from scratch (alembic upgrade re-creates it). No-op for SQLite."""
    yield
    if _IS_POSTGRES:
        from sqlalchemy import text as _text

        with engine.begin() as conn:
            conn.execute(_text("DROP SCHEMA public CASCADE"))
            conn.execute(_text("CREATE SCHEMA public"))


@pytest.fixture(autouse=True)
def _fresh_postgres_db_per_test():
    """Give each Postgres test the same fresh-DB isolation SQLite's in-memory
    engine provides for free: truncate every user table (with identity reset)
    before the test runs. No-op for SQLite."""
    if _IS_POSTGRES:
        from sqlalchemy import text as _text

        with engine.begin() as conn:
            rows = conn.execute(_text(
                "SELECT tablename FROM pg_tables WHERE schemaname='public' "
                "AND tablename <> 'alembic_version'"
            )).fetchall()
            names = ", ".join('"%s"' % r[0] for r in rows)
            if names:
                conn.execute(_text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))
    yield


@pytest.fixture()
def client(db_session):
    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
