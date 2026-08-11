import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Overridable so the test suite can point at a throwaway database. Several test
# modules talk to SessionLocal directly instead of going through the get_db
# override (they seed and clear rows the API has no endpoint for), so without
# this they would read and write the developer's real portfolio.db.
SQLALCHEMY_DATABASE_URL = os.environ.get("PORTFOLIO_DB_URL", "sqlite:///./portfolio.db")

# check_same_thread is SQLite-only; Supabase pooler (pgbouncer transaction
# mode) breaks psycopg3 prepared statements (DuplicatePreparedStatement on
# executemany) -> disable them via prepare_threshold=None. Local Postgres is
# unaffected (the option just disables client-side prepare).
_connect_args = {}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    _connect_args["check_same_thread"] = False
elif "postgresql" in SQLALCHEMY_DATABASE_URL:
    _connect_args["prepare_threshold"] = None

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
