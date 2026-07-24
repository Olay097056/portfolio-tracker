import os
import time
from typing import TypedDict

CACHE_TTL_SECONDS = 60.0

_cache: dict[str, tuple[float, float]] = {}


def clear_cache() -> None:
    _cache.clear()


def _get_cached(ticker: str) -> float | None:
    entry = _cache.get(ticker)
    if entry is None:
        return None
    price, fetched_at = entry
    if time.monotonic() - fetched_at > CACHE_TTL_SECONDS:
        return None
    return price


def _set_cached(ticker: str, price: float) -> None:
    _cache[ticker] = (price, time.monotonic())


def _fetch_from_yfinance(ticker: str) -> float | None:
    import yfinance as yf

    try:
        fast_info = yf.Ticker(ticker).fast_info
        price = fast_info["lastPrice"]
        return float(price) if price is not None else None
    except Exception:
        return None


def _fetch_from_twelvedata(ticker: str) -> float | None:
    import httpx

    api_key = os.environ.get("TWELVE_DATA_API_KEY")
    if not api_key:
        return None
    try:
        response = httpx.get(
            "https://api.twelvedata.com/price",
            params={"symbol": ticker, "apikey": api_key},
            timeout=5.0,
        )
        response.raise_for_status()
        price = response.json().get("price")
        return float(price) if price is not None else None
    except Exception:
        return None


def get_price(ticker: str) -> float | None:
    cached = _get_cached(ticker)
    if cached is not None:
        return cached

    price = _fetch_from_yfinance(ticker)
    if price is None:
        price = _fetch_from_twelvedata(ticker)

    if price is not None:
        _set_cached(ticker, price)

    return price


def get_prices(tickers: list[str]) -> dict[str, float]:
    result: dict[str, float] = {}
    for ticker in tickers:
        price = get_price(ticker)
        if price is not None:
            result[ticker] = price
    return result


class MarketData(TypedDict):
    price: float | None
    dividend_yield_pct: float | None
    growth_rate_pct: float | None


_market_data_cache: dict[str, tuple[MarketData, float]] = {}


def clear_market_data_cache() -> None:
    _market_data_cache.clear()


def _get_cached_market_data(ticker: str) -> MarketData | None:
    entry = _market_data_cache.get(ticker)
    if entry is None:
        return None
    data, fetched_at = entry
    if time.monotonic() - fetched_at > CACHE_TTL_SECONDS:
        return None
    return data


def _set_cached_market_data(ticker: str, data: MarketData) -> None:
    _market_data_cache[ticker] = (data, time.monotonic())


def _fetch_dividend_yield_pct(ticker: str) -> float | None:
    import yfinance as yf

    try:
        info = yf.Ticker(ticker).info
        raw_yield = info.get("dividendYield")
        # yfinance returns dividendYield as a fraction (e.g. 0.111 for 11.1%)
        return float(raw_yield) * 100 if raw_yield is not None else None
    except Exception:
        return None


def _fetch_growth_rate_pct(ticker: str) -> float | None:
    import yfinance as yf

    try:
        history = yf.Ticker(ticker).history(period="5y")
        if history.empty or len(history) < 2:
            return None
        start_price = float(history["Close"].iloc[0])
        end_price = float(history["Close"].iloc[-1])
        years = (history.index[-1] - history.index[0]).days / 365.25
        if start_price <= 0 or years <= 0:
            return None
        return ((end_price / start_price) ** (1 / years) - 1) * 100
    except Exception:
        return None


def get_market_data(tickers: list[str]) -> dict[str, MarketData]:
    result: dict[str, MarketData] = {}
    for ticker in tickers:
        cached = _get_cached_market_data(ticker)
        if cached is not None:
            result[ticker] = cached
            continue
        data: MarketData = {
            "price": get_price(ticker),
            "dividend_yield_pct": _fetch_dividend_yield_pct(ticker),
            "growth_rate_pct": _fetch_growth_rate_pct(ticker),
        }
        if data["price"] is not None:
            _set_cached_market_data(ticker, data)
        result[ticker] = data
    return result
