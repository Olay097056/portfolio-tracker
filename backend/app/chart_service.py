# backend/app/chart_service.py
import time
from typing import Literal, TypedDict

# Matches history_service.py's TTL. This is a separate, independent cache from
# history_service.py's — this file exists specifically so a range-driven chart fetch never has
# to be taught into history_service.py's fixed 1-year-daily shape (see the spec's Implementation
# Decisions for why the two are kept apart).
CACHE_TTL_SECONDS = 900.0

ChartRange = Literal["1Y"]

# range -> (yfinance period, yfinance interval). Only "1Y" exists in this ticket; the range
# selector ticket widens ChartRange and this table together, with no other code change needed.
RANGE_TO_YFINANCE: dict[str, tuple[str, str]] = {
    "1Y": ("1y", "1d"),
}


class ChartPoint(TypedDict):
    time: str
    close: float


_cache: dict[tuple[str, str], tuple[list[ChartPoint], float]] = {}


def clear_cache() -> None:
    _cache.clear()


def _get_cached(ticker: str, range_: str) -> list[ChartPoint] | None:
    entry = _cache.get((ticker, range_))
    if entry is None:
        return None
    points, fetched_at = entry
    if time.monotonic() - fetched_at > CACHE_TTL_SECONDS:
        return None
    return points


def _set_cached(ticker: str, range_: str, points: list[ChartPoint]) -> None:
    _cache[(ticker, range_)] = (points, time.monotonic())


def _fetch_from_provider(ticker: str, range_: str) -> list[ChartPoint] | None:
    import yfinance as yf

    period, interval = RANGE_TO_YFINANCE[range_]
    try:
        history = yf.Ticker(ticker).history(period=period, interval=interval)
        if history.empty:
            return None
        return [
            {"time": row.Index.strftime("%Y-%m-%d"), "close": float(row.Close)}
            for row in history.itertuples()
        ]
    except Exception:
        return None


def get_chart_data(ticker: str, range_: ChartRange) -> list[ChartPoint] | None:
    cached = _get_cached(ticker, range_)
    if cached is not None:
        return cached

    points = _fetch_from_provider(ticker, range_)
    if points is not None:
        _set_cached(ticker, range_, points)

    return points
