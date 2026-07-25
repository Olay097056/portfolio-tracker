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


class HoldingStatsOut(BaseModel):
    ticker: str
    shares: float
    avg_cost_usd: float
    current_price: float
    value: float
    current_pct: float
    target_pct: float | None
    deviation_pp: float | None
    severity: str | None
    unrealized_pnl: float
    realized_pnl: float


class PortfolioSummaryOut(BaseModel):
    id: int
    name: str
    cash_usd: float
    target_allocation_pct: float | None
    holdings_value: float
    total_value: float
    unrealized_pnl: float
    realized_pnl: float
    holdings: list[HoldingStatsOut]


class PriceSignalOut(BaseModel):
    ticker: str
    percent_change_pct: float | None
    rsi_14: float | None
    volume_ratio: float | None
    distance_from_sma50_pct: float | None
    bb_width_pct: float | None
    bb_width_percentile: float | None
    atr_pct: float | None
