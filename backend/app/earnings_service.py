# backend/app/earnings_service.py
"""Next earnings date for a ticker (wayfinder ticket 03, ai-signal-investor-upgrades map).
yfinance already exposes this (verified live against NVDA while charting the map) -- no new
external API/key needed. Same TTL-cache shape as price_service.py, but with a much longer TTL
since an earnings date essentially never changes day-to-day (unlike a live price)."""

from __future__ import annotations

from datetime import date
from typing import Literal

from app.cache import cache_clear, cache_get, cache_set

CACHE_TTL_SECONDS = 24 * 60 * 60.0  # 24h -- earnings dates don't move minute-to-minute like price

_CACHE_PREFIX = "earn:"
_MISS: Literal["MISS"] = "MISS"


def clear_cache() -> None:
    cache_clear(_CACHE_PREFIX)


def _get_cached(ticker: str) -> date | None | Literal["MISS"]:
    raw = cache_get(_CACHE_PREFIX + ticker, default=_MISS)
    if raw is _MISS:
        return _MISS
    if raw is None:
        return None
    return date.fromisoformat(raw)


def _set_cached(ticker: str, value: date | None) -> None:
    cache_set(_CACHE_PREFIX + ticker, value, CACHE_TTL_SECONDS)


def _fetch_next_earnings_date(ticker: str) -> date | None:
    import yfinance as yf

    try:
        calendar = yf.Ticker(ticker).calendar
        if not calendar:
            return None
        dates = calendar.get("Earnings Date")
        if not dates:
            return None
        # yfinance can return a single date or a list (a range/estimate window) -- the nearest
        # upcoming one is what matters for a "watch out" warning, so take the earliest.
        if isinstance(dates, (list, tuple)):
            if not dates:
                return None
            return min(dates)
        return dates
    except Exception:
        return None


def get_next_earnings_date(ticker: str) -> date | None:
    cached = _get_cached(ticker)
    if cached != _MISS:
        return cached

    value = _fetch_next_earnings_date(ticker)
    _set_cached(ticker, value)
    return value


def days_until(target: date, *, today: date) -> int:
    return (target - today).days
