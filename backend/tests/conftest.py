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
import atexit
import os
import shutil
import tempfile

_TEST_DATA_DIR = tempfile.mkdtemp(prefix="portfolio-tracker-tests-")
atexit.register(shutil.rmtree, _TEST_DATA_DIR, True)
os.environ["PORTFOLIO_DB_URL"] = "sqlite:///" + os.path.join(
    _TEST_DATA_DIR, "portfolio.db"
).replace("\\", "/")
os.environ["PORTFOLIO_DATA_DIR"] = _TEST_DATA_DIR

import pytest
from sqlalchemy import create_engine, StaticPool
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

import app.models  # noqa: F401,E402  (registers ORM classes with Base.metadata)
import app.news_service  # noqa: F401,E402  (registers the news_items table)
import app.boardroom_service  # noqa: F401,E402  (registers the boardroom_* tables)
from app.database import Base, engine, get_db  # noqa: E402
from app.main import app  # noqa: E402  (imports every router, registering their tables)

# The throwaway database starts empty, and the modules that use SessionLocal
# directly do so before any TestClient context manager has run the app's
# lifespan create_all — so build the schema here, once, at collection time.
Base.metadata.create_all(bind=engine)


@pytest.fixture()
def db_session():
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


@pytest.fixture()
def client(db_session):
    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
