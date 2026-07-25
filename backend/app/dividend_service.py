# backend/app/dividend_service.py
import time
from datetime import date

CACHE_TTL_SECONDS = 86400.0

_cache: dict[str, tuple[list[tuple[date, float]], float]] = {}


def clear_cache() -> None:
    _cache.clear()


def _get_cached(ticker: str) -> list[tuple[date, float]] | None:
    entry = _cache.get(ticker)
    if entry is None:
        return None
    payments, fetched_at = entry
    if time.monotonic() - fetched_at > CACHE_TTL_SECONDS:
        return None
    return payments


def _set_cached(ticker: str, payments: list[tuple[date, float]]) -> None:
    _cache[ticker] = (payments, time.monotonic())


def _fetch_dividend_payments(ticker: str) -> list[tuple[date, float]] | None:
    import yfinance as yf

    try:
        dividends = yf.Ticker(ticker).dividends
        return [(index.date(), float(amount)) for index, amount in dividends.items()]
    except Exception:
        return None


def get_dividend_payments(ticker: str) -> list[tuple[date, float]] | None:
    cached = _get_cached(ticker)
    if cached is not None:
        return cached

    payments = _fetch_dividend_payments(ticker)
    if payments is not None:
        _set_cached(ticker, payments)

    return payments
