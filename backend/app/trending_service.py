# backend/app/trending_service.py
import os
from typing import TypedDict


class TrendingRow(TypedDict):
    ticker: str
    name: str
    price: float | None
    change_pct: float | None


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
        return [
            {
                "ticker": item.get("symbol", ""),
                "name": item.get("name", ""),
                "price": item.get("price"),
                "change_pct": item.get("changesPercentage"),
            }
            for item in data[:10]
        ]
    except Exception:
        return None


def get_gainers() -> list[TrendingRow] | None:
    return _fetch_list("gainers")


def get_losers() -> list[TrendingRow] | None:
    return _fetch_list("losers")


def get_most_active() -> list[TrendingRow] | None:
    return _fetch_list("actives")
