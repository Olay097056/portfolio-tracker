# backend/app/schemas.py
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.chart_service import ChartRange


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


class PortfolioTargetUpdate(BaseModel):
    id: int
    target_allocation_pct: float


class PortfolioRebalanceIn(BaseModel):
    updates: list[PortfolioTargetUpdate]


class CashAdjustmentCreate(BaseModel):
    type: Literal["CASH_DEPOSIT", "CASH_WITHDRAW"]
    amount: float
    note: str | None = None


class HoldingMoveCreate(BaseModel):
    target_portfolio_id: int


class DividendRecordCreate(BaseModel):
    amount_usd: float
    note: str | None = None


class TransactionCreate(BaseModel):
    ticker: str | None = None
    type: Literal["BUY", "SELL", "CASH_DEPOSIT", "CASH_WITHDRAW", "DIVIDEND"]
    shares: float | None = None
    price: float | None = None
    amount_usd: float
    note: str | None = None


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    portfolio_id: int
    ticker: str | None
    type: str
    shares: float | None
    price: float | None
    amount_usd: float
    note: str | None
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


class DividendSignalOut(BaseModel):
    ticker: str
    price: float | None
    gross_yield_pct: float | None
    payment_frequency: int | None
    dividend_growth_pct: float | None


class TrendingRowOut(BaseModel):
    ticker: str
    name: str
    price: float | None
    change_pct: float | None


class TrendingOut(BaseModel):
    gainers: list[TrendingRowOut] | None
    losers: list[TrendingRowOut] | None
    most_active: list[TrendingRowOut] | None
    api_key_configured: bool


class ChartPointOut(BaseModel):
    time: str | int
    open: float
    high: float
    low: float
    close: float
    volume: float


class ZoneOut(BaseModel):
    id: int | None
    price: float
    kind: Literal["support", "resistance", "freestyle"]
    strength: int | None
    source: Literal["auto", "manual"]


class ChartOut(BaseModel):
    points: list[ChartPointOut] | None
    zones: list[ZoneOut]


class ZoneInput(BaseModel):
    kind: Literal["support", "resistance", "freestyle"]
    price: float


class FreezeZonesRequest(BaseModel):
    ticker: str
    range: ChartRange
    zones: list[ZoneInput]


class ManualZoneCreate(BaseModel):
    ticker: str
    range: ChartRange
    kind: Literal["support", "resistance", "freestyle"]
    price: float


class ManualZoneUpdate(BaseModel):
    price: float


class TickerPositionOut(BaseModel):
    ticker: str
    portfolio_id: int
    portfolio_name: str
    shares: float
    avg_cost_usd: float
    current_price: float | None
    market_value_usd: float | None
    unrealized_pnl_usd: float | None
    unrealized_pnl_pct: float | None


class DcaTickerItem(BaseModel):
    symbol: str
    name: str
    # Real yfinance-fetched values, null when the fetch failed for this ticker -- never a
    # guessed/hardcoded fallback number (see routers/dca.py).
    default_yield: float | None
    default_growth: float | None


class DcaStockInfoOut(BaseModel):
    symbol: str
    company_name: str
    current_price: float
    dividend_yield_pct: float
    capital_growth_pct: float


class DcaCalculateRequest(BaseModel):
    ticker: str | None = None
    initial_amount: float = 0.0
    monthly_dca: float = 0.0
    duration_years: int = 10
    div_yield_pct: float = 0.0
    growth_pct: float = 0.0
    tax_rate_pct: float = 15.0
    reinvest_dividends: bool = True
    currency: str = "THB"


class DcaChartPoint(BaseModel):
    year: int
    portfolio_value: float
    total_invested: float


class DcaYearlyMilestone(BaseModel):
    year: int
    portfolio_value: float
    total_invested: float
    monthly_dividend: float
    monthly_growth: float
    monthly_total: float


class DcaCalculateResponse(BaseModel):
    final_portfolio_value: float
    multiplier: float
    total_invested: float
    accumulated_dividend: float
    capital_gain: float
    total_return: float
    tax_amount: float
    final_monthly_dividend: float
    final_monthly_growth: float
    final_monthly_total: float
    chart_data: list[DcaChartPoint]
    yearly_milestones: list[DcaYearlyMilestone]


# --- AI Narrative (wayfinder ticket 09) ---
# Mirrors frontend/src/utils/aiTechnicalSignal.ts's AiSignalMetrics shape, request-side only —
# the frontend already computes all of this; the backend never recomputes an indicator, it only
# reads these values to build the LLM prompt (see app/ai_narrative_service.py).


class ZoneRefIn(BaseModel):
    label: str
    price: float
    distance_pct: float


class MacdMetricsIn(BaseModel):
    macd_line: float | None = None
    signal_line: float | None = None
    histogram: float | None = None
    crossover: Literal["BULLISH", "BEARISH", "NEUTRAL"]
    is_bullish_crossover: bool
    is_bearish_crossover: bool


class MovingAverageMetricsIn(BaseModel):
    sma20: float | None = None
    sma50: float | None = None
    sma200: float | None = None
    ma_cross_state: Literal["GOLDEN_CROSS", "DEATH_CROSS", "NEUTRAL"]
    is_bullish_alignment: bool
    distance_from_sma50_pct: float | None = None


class ConfidenceScoreIn(BaseModel):
    score: int
    rating_badge: str
    pillars: dict[str, float]


class AiSignalMetricsIn(BaseModel):
    rsi14: float | None = None
    volume_ratio: float | None = None
    distance_from_sma50_pct: float | None = None
    bb_width_pct: float | None = None
    is_squeeze: bool
    nearest_support: ZoneRefIn | None = None
    nearest_resistance: ZoneRefIn | None = None
    macd: MacdMetricsIn
    moving_averages: MovingAverageMetricsIn
    atr14: float | None = None
    trading_setup: dict
    confidence_score: ConfidenceScoreIn
    # RSI/price ~1 week (5 trading days) earlier, for a trend line in the prompt. Optional
    # because the frontend derives these from the same already-fetched price history it
    # already has (aiTechnicalSignal.ts) -- absent only when there isn't enough history yet.
    # current_price isn't renamed from an existing field -- no raw "current price" was in this
    # schema at all before (trading_setup only carries derived entry/target/stop levels), and
    # showing a price trend line needs a current value to compare price_prev against.
    current_price: float | None = None
    rsi14_prev: float | None = None
    price_prev: float | None = None
    # Real "market context" that needs no sector mapping (chosen over sector/market_trend below,
    # per user roadmap discussion 2026-08-07): 52-week high/low computed from the frontend's own
    # already-fetched price history, and how far the current price sits from each.
    week52_high: float | None = None
    week52_low: float | None = None
    distance_from_52w_high_pct: float | None = None
    distance_from_52w_low_pct: float | None = None
    # NOT currently sent by any frontend caller -- no sector or market-trend computation exists
    # anywhere in this codebase yet (see ai_narrative_service.py's prompt comment). Accepted here
    # so the backend prompt logic is ready the day a real source exists, but until then this is
    # always None and the prompt always shows its "no data" fallback -- never fabricated.
    sector: str | None = None
    market_trend: str | None = None


class AiNarrativeRequest(BaseModel):
    ticker: str
    metrics: AiSignalMetricsIn


class AiNarrativeOut(BaseModel):
    sentiment: Literal["bullish", "bearish", "neutral"]
    narrative: str
    conflicting_signals: list[str] | None = None
    caveats: list[str] = []


# --- Per-ticker pattern lookup (wayfinder ticket 06, ai-signal-investor-upgrades map) ---


class PatternHistoryOut(BaseModel):
    ticker: str
    signal_type: str
    total_matches: int
    resolved_count: int
    win_count: int
    loss_count: int
    win_rate: float | None  # null if resolved_count < MIN_SAMPLE_FOR_WIN_RATE (5) -- not enough data for a %
    avg_win_pct: float | None
    avg_loss_pct: float | None
    conflict_matches: int | None  # null unless the current call has an active conflict to compare against

