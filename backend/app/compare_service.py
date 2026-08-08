# backend/app/compare_service.py
"""Builds the Stock Comparison table's metrics from standard, documented data sources
instead of konbalongtun's undocumented api-server.

Source split, and why it is a split:
  * Finnhub /stock/metric?metric=all (133 fields) covers valuation, margins, returns,
    growth and dividend metrics in one authenticated call. It's the most "official"
    source available here -- real docs, real terms, key already configured.
  * Finnhub's free tier returns 403 for /stock/candle and /stock/price-target
    (verified 2026-08-08), so anything needing a price series or an analyst target
    cannot come from Finnhub at all.
  * yfinance fills exactly those gaps: analyst target/recommendation, ownership and
    short-interest figures, ETF-specific fields, and the OHLCV history that RSI / ATR /
    SMA distances are computed from (reusing app/signals.py, the same functions the rest
    of this app's technical signals already use -- not a second implementation).

Nothing here is fabricated: every metric is either read from one of those sources or
computed from a real price series. A field no source provides is left absent, so the UI
renders "-" rather than a number that looks measured but isn't.
"""
import os
from datetime import date, datetime, timezone
from typing import Any

import httpx

from app import signals

FINNHUB_BASE_URL = "https://finnhub.io/api/v1"
_TIMEOUT_SECONDS = 10

# Finnhub reports these in millions of the listing currency; everything downstream wants
# absolute units, so they are scaled once here rather than at each read site.
_FINNHUB_MILLIONS_FIELDS = {"marketCapitalization", "enterpriseValue"}


def _api_key() -> str | None:
    return os.environ.get("FINNHUB_API_KEY")


def _get_json(path: str, params: dict) -> Any:
    key = _api_key()
    if not key:
        return None
    try:
        response = httpx.get(f"{FINNHUB_BASE_URL}{path}", params={**params, "token": key}, timeout=_TIMEOUT_SECONDS)
        if response.status_code != 200:
            return None
        return response.json()
    except Exception:
        return None


def fetch_finnhub_metrics(symbol: str) -> dict[str, Any]:
    payload = _get_json("/stock/metric", {"symbol": symbol, "metric": "all"})
    metric = (payload or {}).get("metric")
    if not isinstance(metric, dict):
        return {}
    scaled = dict(metric)
    for field in _FINNHUB_MILLIONS_FIELDS:
        value = scaled.get(field)
        if isinstance(value, (int, float)):
            scaled[field] = value * 1_000_000
    return scaled


def fetch_finnhub_profile(symbol: str) -> dict[str, Any]:
    payload = _get_json("/stock/profile2", {"symbol": symbol})
    return payload if isinstance(payload, dict) else {}


def search_finnhub_symbols(query: str, limit: int) -> list[dict[str, str]]:
    payload = _get_json("/search", {"q": query})
    results = (payload or {}).get("result")
    if not isinstance(results, list):
        return []
    out: list[dict[str, str]] = []
    for item in results:
        symbol = str(item.get("displaySymbol") or item.get("symbol") or "").strip()
        # Finnhub's global search includes foreign-exchange listings whose symbols carry a
        # venue suffix ("AAPL.MX", "AAPL.SW"). Those aren't what a US-listing comparison
        # tool should offer, and their fundamentals endpoints return little, so drop them.
        if not symbol or "." in symbol:
            continue
        out.append({"symbol": symbol.upper(), "name": str(item.get("description") or symbol)})
        if len(out) >= limit:
            break
    return out


def fetch_yfinance_bundle(symbol: str) -> dict[str, Any]:
    """info + a price series in one place. Both are best-effort: a failure here degrades
    the table to whatever Finnhub supplied rather than failing the whole request."""
    bundle: dict[str, Any] = {"info": {}, "closes": [], "highs": [], "lows": [], "volumes": [], "dates": []}
    try:
        import yfinance as yf

        ticker = yf.Ticker(symbol)
        try:
            bundle["info"] = ticker.info or {}
        except Exception:
            bundle["info"] = {}

        try:
            # "max", not "10y": a 10y window yields ~2,515 trading rows, just under the
            # ~2,520 a 10-year lookback needs, which silently blanked the Perf 10Y row.
            # auto_adjust keeps long-horizon returns split/dividend-consistent.
            history = ticker.history(period="max", auto_adjust=True)
            if history is not None and not history.empty:
                bundle["closes"] = [float(v) for v in history["Close"].tolist()]
                bundle["highs"] = [float(v) for v in history["High"].tolist()]
                bundle["lows"] = [float(v) for v in history["Low"].tolist()]
                bundle["volumes"] = [float(v) for v in history["Volume"].tolist()]
                bundle["dates"] = [d.date() for d in history.index.to_pydatetime()]
        except Exception:
            pass
    except Exception:
        pass
    return bundle


# --- formatting helpers -------------------------------------------------------------
# Values land in the table as display strings so a metric that genuinely doesn't exist can
# stay None and render "-". None in, None out, everywhere -- never a 0 stand-in.


def _num(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if out == out and out not in (float("inf"), float("-inf")) else None


def _plain(value: Any, decimals: int = 2) -> str | None:
    number = _num(value)
    if number is None:
        return None
    if float(number).is_integer():
        return f"{int(number):,}"
    return f"{number:,.{decimals}f}".rstrip("0").rstrip(".")


def _pct(value: Any, decimals: int = 2) -> str | None:
    number = _num(value)
    if number is None:
        return None
    return f"{number:,.{decimals}f}%"


def _pair(first: Any, second: Any, as_pct: bool = True) -> str | None:
    """Finviz-style two-value cells ("5Y 3Y" side by side). Renders whichever halves exist
    rather than dropping the row when only one is available."""
    render = _pct if as_pct else _plain
    left, right = render(first), render(second)
    if left and right:
        return f"{left} {right}"
    return left or right


def _shares(value: Any) -> str | None:
    """Share counts read better in B/M, matching how the reference page prints them."""
    number = _num(value)
    if number is None:
        return None
    if abs(number) >= 1_000_000_000:
        return f"{number / 1_000_000_000:,.2f}B"
    if abs(number) >= 1_000_000:
        return f"{number / 1_000_000:,.2f}M"
    return f"{number:,.0f}"


def _epoch_to_date(value: Any) -> str | None:
    number = _num(value)
    if number is None or number <= 0:
        return None
    try:
        return datetime.fromtimestamp(number, tz=timezone.utc).strftime("%b %d, %Y")
    except (OverflowError, OSError, ValueError):
        return None


def _percent_change_over(closes: list[float], trading_days: int) -> float | None:
    return signals.percent_change(closes, trading_days) if len(closes) > trading_days else None


def _change_since_years_ago(closes: list[float], dates: list[date], years: int) -> float | None:
    """Multi-year performance measured against the first bar on/after the actual calendar
    anniversary, rather than counting back a nominal 252 trading days per year. The
    nominal count drifts with holidays and returns nothing at all when a ticker's history
    is a handful of rows short of the assumed length."""
    if not closes or len(closes) != len(dates):
        return None
    last_day = dates[-1]
    try:
        cutoff = last_day.replace(year=last_day.year - years)
    except ValueError:  # 29 Feb -> non-leap year
        cutoff = last_day.replace(year=last_day.year - years, day=28)
    # The series must actually reach back past the cutoff. Without this, a ticker listed
    # one month ago would return its one-month change under the "Perf 10Y" label -- a real
    # number answering a different question, which is worse than showing nothing.
    if dates[0] > cutoff:
        return None
    for idx, day in enumerate(dates):
        if day >= cutoff:
            start = closes[idx]
            if start <= 0 or idx == len(closes) - 1:
                return None
            return (closes[-1] - start) / start * 100
    return None


def _ytd_change(closes: list[float], dates: list[date]) -> float | None:
    if not closes or not dates or len(closes) != len(dates):
        return None
    this_year = dates[-1].year
    for idx, day in enumerate(dates):
        if day.year == this_year:
            start = closes[idx]
            if start <= 0:
                return None
            return (closes[-1] - start) / start * 100
    return None


def _volatility_pct(closes: list[float], window: int) -> float | None:
    """Mean absolute daily % move over the window -- the same plain-language reading
    Finviz's "Volatility (W/M)" column gives, computed from the real series."""
    if len(closes) < window + 1:
        return None
    moves = []
    for i in range(len(closes) - window, len(closes)):
        prev = closes[i - 1]
        if prev <= 0:
            continue
        moves.append(abs(closes[i] - prev) / prev * 100)
    return sum(moves) / len(moves) if moves else None


def _earnings_date_cell(info: dict[str, Any]) -> str | None:
    """Marked "(est.)" when yfinance flags the date as projected rather than confirmed --
    the distinction matters to anyone planning around it, and hiding it would present a
    guess with the same confidence as a company-announced date."""
    formatted = _epoch_to_date(info.get("earningsTimestamp"))
    if not formatted:
        return None
    return f"{formatted} (est.)" if info.get("isEarningsDateEstimate") else formatted


def _week52_cell(level: Any, current: Any) -> str | None:
    """"<level> <distance from it>" -- matches the reference page's 52W High/Low cells."""
    level_num, current_num = _num(level), _num(current)
    if level_num is None:
        return None
    if current_num is None or level_num <= 0:
        return _plain(level_num)
    return f"{level_num:,.2f} {(current_num - level_num) / level_num * 100:+.2f}%"


def build_metrics(
    finnhub_metric: dict[str, Any],
    finnhub_profile: dict[str, Any],
    yf_bundle: dict[str, Any],
) -> dict[str, str | None]:
    """Assembles the display metrics. Each key picks its source deliberately -- Finnhub
    where it has the field, yfinance where Finnhub's free tier does not."""
    m = finnhub_metric
    info = yf_bundle.get("info") or {}
    closes: list[float] = yf_bundle.get("closes") or []
    highs: list[float] = yf_bundle.get("highs") or []
    lows: list[float] = yf_bundle.get("lows") or []
    volumes: list[float] = yf_bundle.get("volumes") or []
    dates: list[date] = yf_bundle.get("dates") or []

    current_price = _num(info.get("regularMarketPrice")) or (closes[-1] if closes else None)

    # yfinance reports ownership/margin/growth ratios as fractions (0.6594), Finnhub as
    # already-percent values (65.94). Scaled here so both end up on one scale.
    def yf_pct(key: str) -> str | None:
        number = _num(info.get(key))
        return _pct(number * 100) if number is not None else None

    # ETFs have no market cap in either source but do report net assets -- a real, different
    # measure, so it is labelled as itself in the UI rather than passed off as market cap.
    market_cap = m.get("marketCapitalization") or info.get("marketCap") or info.get("totalAssets")

    avg_volume_shares = _num(m.get("3MonthAverageTradingVolume"))
    avg_volume_shares = avg_volume_shares * 1_000_000 if avg_volume_shares is not None else _num(info.get("averageVolume"))
    latest_volume = _num(info.get("volume")) or (volumes[-1] if volumes else None)

    return {
        # --- Valuation ---
        "market_cap": _plain(market_cap),
        "enterprise_value": _plain(m.get("enterpriseValue") or info.get("enterpriseValue")),
        "pe_ratio": _plain(m.get("peTTM") or info.get("trailingPE")),
        "forward_pe": _plain(m.get("forwardPE") or info.get("forwardPE")),
        "peg_ratio": _plain(m.get("pegTTM") or info.get("trailingPegRatio")),
        "ps": _plain(m.get("psTTM") or info.get("priceToSalesTrailing12Months")),
        "pb": _plain(m.get("pbQuarterly") or m.get("pb") or info.get("priceToBook")),
        "pc": _plain(m.get("pcfShareTTM")),
        "pfcf": _plain(m.get("pfcfShareTTM")),
        "ev_sales": _plain(m.get("evRevenueTTM") or info.get("enterpriseToRevenue")),
        "ev_ebitda": _plain(m.get("evEbitdaTTM") or info.get("enterpriseToEbitda")),
        # --- Performance (Finnhub ships the standard horizons; longer ones and the
        # week/month readings come from the real 10y series) ---
        "perf_week": _pct(m.get("5DayPriceReturnDaily")) or _pct(_percent_change_over(closes, 5)),
        "perf_month": _pct(_percent_change_over(closes, 21)),
        "perf_quarter": _pct(m.get("13WeekPriceReturnDaily")) or _pct(_percent_change_over(closes, 63)),
        "perf_half_y": _pct(m.get("26WeekPriceReturnDaily")) or _pct(_percent_change_over(closes, 126)),
        "perf_year": _pct(m.get("52WeekPriceReturnDaily")) or _pct(_percent_change_over(closes, 252)),
        "perf_ytd": _pct(m.get("yearToDatePriceReturnDaily")) or _pct(_ytd_change(closes, dates)),
        "perf_3y": _pct(_change_since_years_ago(closes, dates, 3)),
        "perf_5y": _pct(_change_since_years_ago(closes, dates, 5)),
        "perf_10y": _pct(_change_since_years_ago(closes, dates, 10)),
        "volatility_w": _pct(_volatility_pct(closes, 5)),
        "volatility_m": _pct(_volatility_pct(closes, 21)),
        # --- Growth ---
        "sales": _shares(info.get("totalRevenue")),
        "sales_qq": _pct(m.get("revenueGrowthQuarterlyYoy")),
        "sales_yy_ttm": _pct(m.get("revenueGrowthTTMYoy")) or yf_pct("revenueGrowth"),
        "sales_past_35y": _pair(m.get("revenueGrowth5Y"), m.get("revenueGrowth3Y")),
        "income": _shares(info.get("netIncomeToCommon")),
        "eps_ttm": _plain(m.get("epsTTM") or info.get("trailingEps")),
        "eps_qq": _pct(m.get("epsGrowthQuarterlyYoy")),
        "eps_yy_ttm": _pct(m.get("epsGrowthTTMYoy")) or yf_pct("earningsGrowth"),
        "eps_past_35y": _pair(m.get("epsGrowth5Y"), m.get("epsGrowth3Y")),
        "eps_next_y": _plain(info.get("forwardEps")),
        # --- Financial health ---
        "gross_margin": _pct(m.get("grossMarginTTM")) or yf_pct("grossMargins"),
        "oper_margin": _pct(m.get("operatingMarginTTM")) or yf_pct("operatingMargins"),
        "profit_margin": _pct(m.get("netProfitMarginTTM")) or yf_pct("profitMargins"),
        "roa": _pct(m.get("roaTTM")) or yf_pct("returnOnAssets"),
        "roe": _pct(m.get("roeTTM")) or yf_pct("returnOnEquity"),
        "roic": _pct(m.get("roiTTM")),
        "current_ratio": _plain(m.get("currentRatioQuarterly") or info.get("currentRatio")),
        "quick_ratio": _plain(m.get("quickRatioQuarterly") or info.get("quickRatio")),
        "debt_eq": _plain(m.get("totalDebt/totalEquityQuarterly")),
        "lt_debt_eq": _plain(m.get("longTermDebt/equityQuarterly")),
        "book_sh": _plain(m.get("bookValuePerShareQuarterly") or info.get("bookValue")),
        "cash_sh": _plain(m.get("cashPerSharePerShareQuarterly") or info.get("totalCashPerShare")),
        # --- Ownership (yfinance only; Finnhub's free tier has none of these) ---
        "insider_own": yf_pct("heldPercentInsiders"),
        "inst_own": yf_pct("heldPercentInstitutions"),
        "short_float": yf_pct("shortPercentOfFloat"),
        "short_ratio": _plain(info.get("shortRatio")),
        "short_interest": _shares(info.get("sharesShort")),
        "shs_outstand": _shares(info.get("sharesOutstanding") or finnhub_profile.get("shareOutstanding")),
        "shs_float": _shares(info.get("floatShares")),
        # --- Technical (computed from the real series via app/signals.py) ---
        "rsi14": _plain(signals.rsi(closes)),
        "beta": _plain(m.get("beta") or info.get("beta")),
        "atr14": _pct(signals.atr_pct(highs, lows, closes)),
        "sma20": _pct(signals.distance_from_sma(closes, 20)),
        "sma50": _pct(signals.distance_from_sma(closes, 50)),
        "sma200": _pct(signals.distance_from_sma(closes, 200)),
        "week52_high": _week52_cell(m.get("52WeekHigh") or info.get("fiftyTwoWeekHigh"), current_price),
        "week52_low": _week52_cell(m.get("52WeekLow") or info.get("fiftyTwoWeekLow"), current_price),
        "rel_volume": _plain(latest_volume / avg_volume_shares) if latest_volume and avg_volume_shares else None,
        "avg_volume": _shares(avg_volume_shares),
        # --- Dividend ---
        "dividend_ttm": _plain(m.get("dividendPerShareTTM") or info.get("dividendRate")),
        "dividend_est": _plain(m.get("dividendIndicatedAnnual")),
        "dividend_gr_35y": _pct(m.get("dividendGrowthRate5Y")),
        "dividend_exdate": _epoch_to_date(info.get("exDividendDate")),
        "payout": _pct(m.get("payoutRatioTTM")) or yf_pct("payoutRatio"),
        # --- General / analyst ---
        "earnings_date": _earnings_date_cell(info),
        "target_price": _plain(info.get("targetMeanPrice")),
        "recom": _plain(info.get("recommendationMean")),
        "employees": _plain(info.get("fullTimeEmployees")),
        "ipo": str(finnhub_profile.get("ipo")) if finnhub_profile.get("ipo") else None,
    }


def build_identity(
    symbol: str,
    finnhub_profile: dict[str, Any],
    yf_bundle: dict[str, Any],
) -> dict[str, Any]:
    info = yf_bundle.get("info") or {}
    closes: list[float] = yf_bundle.get("closes") or []
    price = _num(info.get("regularMarketPrice")) or (closes[-1] if closes else None)
    target = _num(info.get("targetMeanPrice"))
    upside = round((target - price) / price * 100, 2) if price and target and price > 0 else None

    return {
        "name": str(finnhub_profile.get("name") or info.get("longName") or info.get("shortName") or symbol),
        # yfinance's `sector` is empty for ETFs, where `category` ("Large Blend") is the
        # meaningful classification -- so an ETF shows what it actually is instead of blank.
        "sector": info.get("sector") or info.get("category") or finnhub_profile.get("finnhubIndustry") or None,
        "industry": info.get("industry") or finnhub_profile.get("finnhubIndustry") or None,
        "logo_url": finnhub_profile.get("logo") or None,
        "price": price,
        "target_price": target,
        "analyst_target_upside_pct": upside,
    }


def has_usable_data(metrics: dict[str, str | None]) -> bool:
    """A symbol Finnhub and yfinance both know nothing about yields an all-null row. That
    should fall through to the legacy source rather than render an empty table."""
    return any(value is not None for value in metrics.values())
