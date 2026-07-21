import os
import time

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
