# backend/app/backtest/data.py
"""Daily history for the backtest basket, per ticket 03's methodology (10 years of *evaluable*
walk-forward span — see _fetch_history for why the raw fetch pulls more than that).

Disk-cached as JSON under backend/app/backtest/_cache/ (gitignored) — fetching full history for
30+ tickers from yfinance is slow and rate-limit-prone, and this module gets re-run many times
while developing/debugging the engine. Same "drop the still-forming latest bar, never fabricate a
data point" rule as history_service.py / chart_service.py.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.backtest.indicators import Bar

CACHE_DIR = Path(__file__).parent / "_cache"

# 30 liquid US equities/ETFs spanning multiple sectors + broad-market ETFs, per ticket 03's
# "fixed representative basket" decision (the app's own portfolio/watchlist were empty at
# decision time, so this basket stands in for "any ticker a future user might add").
BASKET: list[str] = [
    # Technology
    "AAPL", "MSFT", "NVDA", "GOOGL", "META",
    # Healthcare
    "JNJ", "UNH", "PFE",
    # Financials
    "JPM", "BAC", "V",
    # Consumer
    "AMZN", "WMT", "PG", "KO",
    # Industrials
    "CAT", "BA", "HON",
    # Energy
    "XOM", "CVX",
    # Utilities
    "NEE", "DUK",
    # Communication Services
    "DIS", "NFLX",
    # Materials
    "LIN",
    # Real Estate
    "AMT",
    # Broad-market ETFs (market-representative coverage, not single-stock idiosyncrasy)
    "SPY", "QQQ", "VTI", "DIA", "IWM",
]


def _cache_path(ticker: str) -> Path:
    return CACHE_DIR / f"{ticker}.json"


def _fetch_history(ticker: str) -> list[Bar] | None:
    import yfinance as yf

    try:
        # "max", not "10y": evaluate_ticker() (engine.py) trims ~252 lookback days off the front
        # and ~60 expiry days off the back before any day becomes evaluable, so a raw 10y fetch
        # would only yield an ~8.75y evaluable span -- short of the 10y needed to fit the 5 folds
        # ticket 03 specified (5y train + 1y test, rolled by 1y, needs >=10y of evaluable span for
        # a 5th fold). All 31 basket tickers are long-established large-caps/ETFs, so "max"
        # safely exceeds that without reaching into the kind of thin, old data quality issues
        # ticket 03 flagged as the reason to avoid "max" on principle for arbitrary tickers.
        history = yf.Ticker(ticker).history(period="max")
        history = history.dropna(subset=["Close", "High", "Low", "Volume"])
        if history.empty:
            return None
        return [
            {
                "date": row.Index.strftime("%Y-%m-%d"),
                "close": float(row.Close),
                "high": float(row.High),
                "low": float(row.Low),
                "volume": float(row.Volume),
            }
            for row in history.itertuples()
        ]
    except Exception as e:
        print(f"  ! fetch failed for {ticker}: {e}")
        return None


def get_history(ticker: str, *, force_refresh: bool = False) -> list[Bar] | None:
    """All available daily bars for `ticker` (see _fetch_history for why "max" not "10y"), oldest
    first. Cached to disk after first fetch."""
    cache_file = _cache_path(ticker)
    if not force_refresh and cache_file.exists():
        with cache_file.open("r", encoding="utf-8") as f:
            return json.load(f)

    bars = _fetch_history(ticker)
    if bars is not None:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        with cache_file.open("w", encoding="utf-8") as f:
            json.dump(bars, f)
    return bars


def load_basket(*, force_refresh: bool = False) -> dict[str, list[Bar]]:
    """Fetch (or load from cache) 10y history for every ticker in BASKET. Skips — with a printed
    warning, never a silent drop — any ticker that fails to fetch or comes back too short for a
    200-day SMA plus at least one full walk-forward fold."""
    result: dict[str, list[Bar]] = {}
    for ticker in BASKET:
        bars = get_history(ticker, force_refresh=force_refresh)
        if bars is None:
            print(f"  ! {ticker}: no data returned, dropping from basket")
            continue
        if len(bars) < 260 * 6:  # ~6 years of trading days: 200-day warmup + a full 5y/1y fold
            print(f"  ! {ticker}: only {len(bars)} bars ({len(bars) / 252:.1f}y), dropping — too short for the walk-forward design")
            continue
        result[ticker] = bars
        print(f"  ok {ticker}: {len(bars)} bars ({len(bars) / 252:.1f}y)")
    return result
