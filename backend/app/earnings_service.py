# backend/app/earnings_service.py
"""Next earnings date for a ticker (wayfinder ticket 03, ai-signal-investor-upgrades map).
yfinance already exposes this (verified live against NVDA while charting the map) -- no new
external API/key needed. Same TTL-cache shape as price_service.py, but with a much longer TTL
since an earnings date essentially never changes day-to-day (unlike a live price)."""

from __future__ import annotations

import time
from datetime import date
from typing import Literal

CACHE_TTL_SECONDS = 24 * 60 * 60.0  # 24h -- earnings dates don't move minute-to-minute like price

_cache: dict[str, tuple[date | None, float]] = {}
_MISS: Literal["MISS"] = "MISS"


def clear_cache() -> None:
    _cache.clear()


def _get_cached(ticker: str) -> date | None | Literal["MISS"]:
    entry = _cache.get(ticker)
    if entry is None:
        return _MISS
    value, fetched_at = entry
    if time.monotonic() - fetched_at > CACHE_TTL_SECONDS:
        return _MISS
    return value


def _set_cached(ticker: str, value: date | None) -> None:
    _cache[ticker] = (value, time.monotonic())


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
