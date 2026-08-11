import os
from typing import TypedDict

from app.cache import cache_clear, cache_get, cache_set

CACHE_TTL_SECONDS = 60.0

_PRICE_PREFIX = "price:"
_MD_PREFIX = "price:md:"


def clear_cache() -> None:
    cache_clear(_PRICE_PREFIX)


def _get_cached(ticker: str) -> float | None:
    return cache_get(_PRICE_PREFIX + ticker)


def _set_cached(ticker: str, price: float) -> None:
    cache_set(_PRICE_PREFIX + ticker, price, CACHE_TTL_SECONDS)


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
    # How many years of real price history growth_rate_pct was actually computed over. The
    # function asks for 5 years but a recently-listed ticker may have much less -- annualizing
    # a short window into a "yearly rate" can produce a misleadingly extreme figure (confirmed
    # on a real ticker: QQQI, listed Jan 2024, shows a genuine but short-window ~20%/yr CAGR
    # driven by an unusually strong 2.5-year market period). Callers use this to warn, not to
    # hide the number -- it's real, just less reliable as a long-term rate the shorter it is.
    growth_rate_years_used: float | None


def clear_market_data_cache() -> None:
    cache_clear(_MD_PREFIX)


def _get_cached_market_data(ticker: str) -> MarketData | None:
    return cache_get(_MD_PREFIX + ticker)


def _set_cached_market_data(ticker: str, data: MarketData) -> None:
    cache_set(_MD_PREFIX + ticker, data, CACHE_TTL_SECONDS)


def _fetch_dividend_yield_pct(ticker: str) -> float | None:
    """Real trailing-12-month yield: actual dividend payments in the last 365 days, summed
    and divided by the current price. Computed directly from payment history rather than
    trusted from yfinance's own precomputed `info['dividendYield']` field.

    That field was confirmed wrong for at least one real ticker (2026-08-05, yfinance==1.5.2):
    QQQI reported `dividendYield=0.09` while its actual trailing-12-month payment history
    (13 monthly distributions summed, divided by price) works out to ~15% — matching an
    independent reference. This looks like a yfinance data-quality gap specific to some
    actively-managed/newer funds, not something we can detect from the field's shape alone
    (it returns a plausible-looking small positive number, not an obvious sentinel). Computing
    from real payment history sidesteps trusting a field that can silently be wrong.

    Cross-checked against several previously-verified tickers before switching to this
    method — AAPL, JEPQ, SCHD, KO, VOO, O all land within a small delta of yfinance's own
    figure (the remaining gap is trailing-actual vs. forward-indicated yield, a real and
    expected methodology difference, not an error).
    """
    from datetime import datetime, timedelta, timezone

    import yfinance as yf

    try:
        t = yf.Ticker(ticker)
        info = t.info
        price = info.get("regularMarketPrice") or info.get("currentPrice")
        if price is None or float(price) <= 0:
            return None
        price = float(price)

        dividends = t.dividends
        if dividends is not None and len(dividends) > 0:
            # The cutoff must be relative to *now*, not to this ticker's own last payment date --
            # using the latter would treat a dividend that stopped years ago as if it were still
            # "trailing 12 months" relative to itself, always showing some yield for a payment
            # history that's actually gone stale/suspended.
            cutoff = datetime.now(timezone.utc) - timedelta(days=365)
            trailing = dividends[dividends.index > cutoff]
            # Real dividend history exists for this ticker -- trust it completely, including
            # a genuine 0.0 if nothing was paid in the trailing window (e.g. a suspended
            # dividend), rather than falling through to a precomputed field that might guess.
            return round(float(trailing.sum()) / price * 100, 2)

        # No dividend history at all (or an unusually formatted/empty history from yfinance) --
        # fall back to yfinance's own summary field, if it has one, rather than reporting
        # "unavailable" for a ticker that may genuinely pay a dividend.
        raw_yield = info.get("dividendYield")
        if raw_yield is None:
            return None
        raw_yield = float(raw_yield)
        return raw_yield if raw_yield >= 0 else None
    except Exception:
        return None


def _fetch_growth_rate_pct(ticker: str) -> tuple[float | None, float | None]:
    """Returns (growth_rate_pct, years_of_history_actually_used). Requests 5 years of history,
    but a recently-listed ticker may have much less -- the caller needs to know how short the
    window actually was to warn that the annualized rate is less reliable the shorter it is."""
    import yfinance as yf

    try:
        history = yf.Ticker(ticker).history(period="5y")
        # Same reasoning as chart_service.py/history_service.py: drop a still-forming bar (NaN
        # Close) rather than let it become a NaN growth rate downstream.
        history = history.dropna(subset=["Close"])
        if history.empty or len(history) < 2:
            return None, None
        start_price = float(history["Close"].iloc[0])
        end_price = float(history["Close"].iloc[-1])
        years = (history.index[-1] - history.index[0]).days / 365.25
        if start_price <= 0 or years <= 0:
            return None, None
        rate = ((end_price / start_price) ** (1 / years) - 1) * 100
        return rate, round(years, 2)
    except Exception:
        return None, None


def get_market_data(tickers: list[str]) -> dict[str, MarketData]:
    result: dict[str, MarketData] = {}
    for ticker in tickers:
        cached = _get_cached_market_data(ticker)
        if cached is not None:
            result[ticker] = cached
            continue
        growth_rate_pct, growth_rate_years_used = _fetch_growth_rate_pct(ticker)
        data: MarketData = {
            "price": get_price(ticker),
            "dividend_yield_pct": _fetch_dividend_yield_pct(ticker),
            "growth_rate_pct": growth_rate_pct,
            "growth_rate_years_used": growth_rate_years_used,
        }
        if data["price"] is not None:
            _set_cached_market_data(ticker, data)
        result[ticker] = data
    return result
