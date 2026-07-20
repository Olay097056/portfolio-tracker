import pytest
from sqlalchemy import create_engine, StaticPool
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401  (registers ORM classes with Base.metadata)
from app.database import Base


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
