# backend/app/dividend_service.py
from datetime import date

from app.cache import cache_clear, cache_get, cache_set

CACHE_TTL_SECONDS = 86400.0

_CACHE_PREFIX = "div:"


def clear_cache() -> None:
    cache_clear(_CACHE_PREFIX)


def _get_cached(ticker: str) -> list[tuple[date, float]] | None:
    raw = cache_get(_CACHE_PREFIX + ticker)
    if raw is None:
        return None
    # dates round-trip through JSON as ISO strings — restore the date objects.
    return [(date.fromisoformat(d), float(a)) for d, a in raw]


def _set_cached(ticker: str, payments: list[tuple[date, float]]) -> None:
    cache_set(_CACHE_PREFIX + ticker, payments, CACHE_TTL_SECONDS)


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
