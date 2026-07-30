# backend/app/trending_service.py
import os
from typing import TypedDict


class TrendingRow(TypedDict):
    ticker: str
    name: str
    price: float | None
    change_pct: float | None


def _as_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _fetch_list(endpoint: str) -> list[TrendingRow] | None:
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


def get_gainers() -> list[TrendingRow] | None:
    return _fetch_list("gainers")


def get_losers() -> list[TrendingRow] | None:
    return _fetch_list("losers")


def get_most_active() -> list[TrendingRow] | None:
    return _fetch_list("actives")
