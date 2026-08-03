from datetime import datetime, timezone

from sqlalchemy import Float, ForeignKey, String, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from app.database import Base


class UTCDateTime(TypeDecorator):
    """A DateTime type that always returns timezone-aware UTC datetimes.

    For SQLite, which doesn't natively support timezone-aware datetimes,
    this type stores UTC times and ensures they come back with tzinfo=UTC.
    """
    impl = DateTime
    cache_ok = True

    def __init__(self):
        super().__init__(timezone=True)

    def process_bind_param(self, value, dialect):
        """Process datetime before storing in DB."""
        if value is not None:
            if value.tzinfo is None:
                # If naive, assume UTC
                value = value.replace(tzinfo=timezone.utc)
            # Convert to UTC if needed
            value = value.astimezone(timezone.utc)
        return value

    def process_result_value(self, value, dialect):
        """Process datetime after reading from DB."""
        if value is not None and value.tzinfo is None:
            # SQLite returns naive datetimes, add UTC timezone
            value = value.replace(tzinfo=timezone.utc)
        return value


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Portfolio(Base):
    __tablename__ = "portfolios"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    cash_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    target_allocation_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_utcnow)

    holdings: Mapped[list["Holding"]] = relationship(
        back_populates="portfolio", cascade="all, delete-orphan"
    )


class Holding(Base):
    __tablename__ = "holdings"

    id: Mapped[int] = mapped_column(primary_key=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id"), nullable=False)
    ticker: Mapped[str] = mapped_column(String, nullable=False)
    shares: Mapped[float] = mapped_column(Float, nullable=False)
    avg_cost_usd: Mapped[float] = mapped_column(Float, nullable=False)
    target_allocation_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    realized_pnl_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_utcnow, onupdate=_utcnow)

    portfolio: Mapped["Portfolio"] = relationship(back_populates="holdings")


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticker: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    category: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_utcnow)


class ManualZone(Base):
    __tablename__ = "manual_zones"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticker: Mapped[str] = mapped_column(String, nullable=False)
    range: Mapped[str] = mapped_column(String, nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_utcnow, onupdate=_utcnow)
