# backend/app/trending_service.py
import os
from typing import TypedDict

from app.cache import cache_clear, cache_get, cache_set

# Matches history_service.py's TTL. FMP's free tier caps at 250 requests/day and each
# refresh costs 3 requests (gainers, losers, actives), so an uncached tab could burn through
# it in well under 100 clicks.
CACHE_TTL_SECONDS = 900.0

_CACHE_PREFIX = "trend:"


class TrendingRow(TypedDict):
    ticker: str
    name: str
    price: float | None
    change_pct: float | None


def clear_cache() -> None:
    cache_clear(_CACHE_PREFIX)


def _get_cached(endpoint: str) -> list["TrendingRow"] | None:
    return cache_get(_CACHE_PREFIX + endpoint)


def _set_cached(endpoint: str, rows: list["TrendingRow"]) -> None:
    cache_set(_CACHE_PREFIX + endpoint, rows, CACHE_TTL_SECONDS)


def _as_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _fetch_from_provider(endpoint: str) -> list[TrendingRow] | None:
    import httpx

    api_key = os.environ.get("FMP_API_KEY")
    if not api_key:
        return None
    try:
        response = httpx.get(
            f"https://financialmodelingprep.com/api/v3/stock_market/{endpoint}",
            params={"apikey": api_key},
            timeout=5.0,
        )
        response.raise_for_status()
        data = response.json()
        rows: list[TrendingRow] = []
        for item in data:
            # A row with no real ticker has no usable identity — skip it rather than coercing
            # to "", which would otherwise reach the frontend as an addable, junk watchlist entry.
            ticker = item.get("symbol")
            if not ticker:
                continue
            rows.append(
                {
                    "ticker": ticker,
                    "name": item.get("name") or "",
                    "price": _as_float(item.get("price")),
                    "change_pct": _as_float(item.get("changesPercentage")),
                }
            )
            if len(rows) == 10:
                break
        return rows
    except Exception:
        return None


def _fetch_list(endpoint: str) -> list[TrendingRow] | None:
    cached = _get_cached(endpoint)
    if cached is not None:
        return cached

    rows = _fetch_from_provider(endpoint)
    if rows is not None:
        _set_cached(endpoint, rows)

    return rows


def get_gainers() -> list[TrendingRow] | None:
    return _fetch_list("gainers")


def get_losers() -> list[TrendingRow] | None:
    return _fetch_list("losers")


def get_most_active() -> list[TrendingRow] | None:
    return _fetch_list("actives")
