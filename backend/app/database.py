import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Overridable so the test suite can point at a throwaway database. Several test
# modules talk to SessionLocal directly instead of going through the get_db
# override (they seed and clear rows the API has no endpoint for), so without
# this they would read and write the developer's real portfolio.db.
SQLALCHEMY_DATABASE_URL = os.environ.get("PORTFOLIO_DB_URL", "sqlite:///./portfolio.db")

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
