# backend/app/history_service.py
from typing import TypedDict

from app.cache import cache_clear, cache_get, cache_set

CACHE_TTL_SECONDS = 900.0

_CACHE_PREFIX = "hist:"


class Bar(TypedDict):
    close: float
    high: float
    low: float
    volume: float


def clear_cache() -> None:
    cache_clear(_CACHE_PREFIX)


def _get_cached(ticker: str) -> list["Bar"] | None:
    return cache_get(_CACHE_PREFIX + ticker)


def _set_cached(ticker: str, bars: list["Bar"]) -> None:
    cache_set(_CACHE_PREFIX + ticker, bars, CACHE_TTL_SECONDS)


def _fetch_history(ticker: str) -> list[Bar] | None:
    import yfinance as yf

    try:
        history = yf.Ticker(ticker).history(period="1y")
        # Same reasoning as chart_service.py: the most recent bar can be NaN while the market is
        # still forming it. Drop it rather than let NaN reach a signal calculation or the JSON
        # response — an incomplete bar isn't a real data point, and fabricating one would violate
        # this project's never-fabricate principle.
        history = history.dropna(subset=["Close", "High", "Low", "Volume"])
        if history.empty:
            return None
        return [
            {
                "close": float(row.Close),
                "high": float(row.High),
                "low": float(row.Low),
                "volume": float(row.Volume),
            }
            for row in history.itertuples()
        ]
    except Exception:
        return None


def get_history(ticker: str) -> list[Bar] | None:
    cached = _get_cached(ticker)
    if cached is not None:
        return cached

    bars = _fetch_history(ticker)
    if bars is not None:
        _set_cached(ticker, bars)

    return bars
