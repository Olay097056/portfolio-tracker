# backend/app/schemas.py
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PortfolioCreate(BaseModel):
    name: str
    cash_usd: float = 0.0
    target_allocation_pct: float | None = None


class PortfolioUpdate(BaseModel):
    name: str | None = None
    cash_usd: float | None = None
    target_allocation_pct: float | None = None


class PortfolioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    cash_usd: float
    target_allocation_pct: float | None
    created_at: datetime


class HoldingCreate(BaseModel):
    ticker: str
    shares: float
    avg_cost_usd: float
    target_allocation_pct: float | None = None


class HoldingUpdate(BaseModel):
    ticker: str | None = None
    shares: float | None = None
    avg_cost_usd: float | None = None
    target_allocation_pct: float | None = None
    realized_pnl_usd: float | None = None


class HoldingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    portfolio_id: int
    ticker: str
    shares: float
    avg_cost_usd: float
    target_allocation_pct: float | None
    realized_pnl_usd: float
    created_at: datetime
    updated_at: datetime


class WatchlistItemCreate(BaseModel):
    ticker: str
    category: str | None = None


class WatchlistItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ticker: str
    category: str | None
    created_at: datetime


class PriceMap(BaseModel):
    prices: dict[str, float]
