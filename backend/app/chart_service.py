# backend/app/chart_service.py
import time
from typing import Literal, TypedDict

from app.support_resistance import Zone, find_support_resistance_zones

# Matches history_service.py's TTL. This is a separate, independent cache from
# history_service.py's — this file exists specifically so a range-driven chart fetch never has
# to be taught into history_service.py's fixed 1-year-daily shape (see the spec's Implementation
# Decisions for why the two are kept apart).
CACHE_TTL_SECONDS = 900.0

ChartRange = Literal["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y"]

# range -> (yfinance period, yfinance interval, time encoding). "date" encoding produces a
# "YYYY-MM-DD" string (fine for daily/weekly bars, one point per day at most); "timestamp"
# encoding produces a UNIX-timestamp int, required for intraday bars (1D, 5D) since multiple
# points share the same calendar day and a date-string time would collide.
RANGE_TO_YFINANCE: dict[str, tuple[str, str, Literal["date", "timestamp"]]] = {
    "1D": ("1d", "5m", "timestamp"),
    "5D": ("5d", "30m", "timestamp"),
    "1M": ("1mo", "1d", "date"),
    "6M": ("6mo", "1d", "date"),
    "YTD": ("ytd", "1d", "date"),
    "1Y": ("1y", "1d", "date"),
    "5Y": ("5y", "1wk", "date"),
}


class ChartPoint(TypedDict):
    time: str | int
    close: float


class ChartFetchResult(TypedDict):
    points: list[ChartPoint]
    zones: list[Zone]


_cache: dict[tuple[str, str], tuple[ChartFetchResult, float]] = {}


def clear_cache() -> None:
    _cache.clear()


def _get_cached(ticker: str, range_: str) -> ChartFetchResult | None:
    entry = _cache.get((ticker, range_))
    if entry is None:
        return None
    result, fetched_at = entry
    if time.monotonic() - fetched_at > CACHE_TTL_SECONDS:
        return None
    return result


def _set_cached(ticker: str, range_: str, result: ChartFetchResult) -> None:
    _cache[(ticker, range_)] = (result, time.monotonic())


def _fetch_from_provider(ticker: str, range_: str) -> ChartFetchResult | None:
    import yfinance as yf

    period, interval, encoding = RANGE_TO_YFINANCE[range_]
    try:
        history = yf.Ticker(ticker).history(period=period, interval=interval)
        # The most recent bar (today, while the market is still open) can come back with NaN
        # OHLC from yfinance for a still-forming period — surfacing that NaN downstream (JSON
        # rejects NaN/Infinity) is a real bug, and fabricating a value for it would violate this
        # project's never-fabricate principle. Dropping the incomplete row is correct: it's not
        # a data point yet, not a value we chose to hide.
        history = history.dropna(subset=["High", "Low", "Close"])
        if history.empty:
            return None

        highs = [float(row.High) for row in history.itertuples()]
        lows = [float(row.Low) for row in history.itertuples()]
        closes = [float(row.Close) for row in history.itertuples()]

        if encoding == "timestamp":
            points: list[ChartPoint] = [
                {"time": int(row.Index.timestamp()), "close": float(row.Close)}
                for row in history.itertuples()
            ]
        else:
            points = [
                {"time": row.Index.strftime("%Y-%m-%d"), "close": float(row.Close)}
                for row in history.itertuples()
            ]

        zones = find_support_resistance_zones(highs, lows, closes)
        return {"points": points, "zones": zones}
    except Exception:
        return None


def get_chart_data(ticker: str, range_: ChartRange) -> ChartFetchResult | None:
    cached = _get_cached(ticker, range_)
    if cached is not None:
        return cached

    result = _fetch_from_provider(ticker, range_)
    if result is not None:
        _set_cached(ticker, range_, result)

    return result
