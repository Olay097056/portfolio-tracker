# backend/app/routers/compare.py
import json
import time
import urllib.request
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import compare_service
from app.database import get_db
from app.routers.screener import search_stock_universe

router = APIRouter(prefix="/api/compare", tags=["compare"])

# Data sources, in precedence order:
#   1. Finnhub + yfinance (app/compare_service.py) -- documented, officially-published
#      APIs. This is the primary source.
#   2. konbalongtun's api-server -- kept only as a fallback for when the standard sources
#      return nothing usable (no FINNHUB_API_KEY configured, an outage, or a symbol
#      neither of them recognises). It's an undocumented endpoint on someone else's site
#      that could change or close without notice, which is exactly why it is no longer
#      what the tool depends on day to day.
#
# konbalongtun's two endpoints, for reference (no auth; confirmed 2026-08-08 by inspecting
# their own /compare page's network calls):
#   POST /stock-summaries/stock-autocomplete  {query}   -> [{company, name, sector, logoFile}]
#   POST /stock-summaries/findStockByCompany  {company} -> {success, data: {...97 fields}}
_KONBALONGTUN_API = "https://www.konbalongtun.com/api-server/stock-summaries"
_CDN_BASE = "https://konbalongtun.sgp1.cdn.digitaloceanspaces.com/prod"
_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"

MAX_COMPARE_SYMBOLS = 4
_CACHE_TTL_SECONDS = 600


class CompareSuggestion(BaseModel):
    symbol: str
    name: str
    sector: str | None = None
    logo_url: str | None = None


# The upstream feed is a flat bag of ~97 loosely-typed fields: some numeric, many
# pre-formatted strings ("4,559.02B", "-7.24%", "344.57 -10.35%"), and plenty absent
# entirely for ETFs (an ETF has no P/E, no margins, no EPS). Rather than coerce those
# into numbers -- which would mean inventing a parse for every one of their formats and
# silently mangling the ones that don't fit -- every metric is carried through as an
# optional string exactly as upstream sent it, and the frontend renders "-" for null.
# The few fields this app actually computes with (price, target, upside) are kept numeric.
class ComparableStock(BaseModel):
    symbol: str
    name: str
    sector: str | None = None
    industry: str | None = None
    logo_url: str | None = None
    price: float | None = None
    target_price: float | None = None
    analyst_target_upside_pct: float | None = None
    # Everything else, upstream-formatted, keyed by our own stable field names.
    metrics: dict[str, str | None]


class CompareStockOut(BaseModel):
    stock: ComparableStock


# Maps our stable metric keys -> upstream's field names. Explicit so an upstream rename
# breaks visibly here (one null column) instead of silently reshaping the whole table.
_METRIC_FIELD_MAP: dict[str, str] = {
    # Valuation
    "market_cap": "marketCap",
    "enterprise_value": "enterpriseValue",
    "pe_ratio": "peRatio",
    "forward_pe": "forwardPe",
    "peg_ratio": "pegRatio",
    "ps": "ps",
    "pb": "pb",
    "pc": "pc",
    "pfcf": "pfcf",
    "ev_sales": "evsales",
    "ev_ebitda": "evebitda",
    # Performance
    "perf_week": "perfWeek",
    "perf_month": "perfMonth",
    "perf_quarter": "perfQuarter",
    "perf_half_y": "perfHalfY",
    "perf_year": "perfYear",
    "perf_ytd": "perfYtd",
    "perf_3y": "perf3y",
    "perf_5y": "perf5y",
    "perf_10y": "perf10y",
    "volatility_w": "volatilityW",
    "volatility_m": "volatilityM",
    # Growth
    "sales": "sales",
    "sales_qq": "salesQq",
    "sales_yy_ttm": "salesYyTtm",
    "sales_past_35y": "salesPast35y",
    "income": "income",
    "eps_ttm": "epsTtm",
    "eps_qq": "epsQq",
    "eps_yy_ttm": "epsYyTtm",
    "eps_past_35y": "epsPast35y",
    "eps_next_y": "epsNextY",
    "eps_next_q": "epsNextQ",
    "eps_next_5y": "epsNext5y",
    "eps_this_y": "epsThisY",
    # Financial health
    "gross_margin": "grossMargin",
    "oper_margin": "operMargin",
    "profit_margin": "profitMargin",
    "roa": "roa",
    "roe": "roe",
    "roic": "roic",
    "current_ratio": "currentRatio",
    "quick_ratio": "quickRatio",
    "debt_eq": "debteq",
    "lt_debt_eq": "ltDebteq",
    "book_sh": "booksh",
    "cash_sh": "cashsh",
    # Ownership
    "insider_own": "insiderOwn",
    "insider_trans": "insiderTrans",
    "inst_own": "instOwn",
    "inst_trans": "instTrans",
    "short_float": "shortFloat",
    "short_ratio": "shortRatio",
    "short_interest": "shortInterest",
    "shs_outstand": "shsOutstand",
    "shs_float": "shsFloat",
    # Technical
    "rsi14": "rsi14",
    "beta": "beta",
    "atr14": "atr14",
    "sma20": "sma20",
    "sma50": "sma50",
    "sma200": "sma200",
    "week52_high": "field52wHigh",
    "week52_low": "field52wLow",
    "rel_volume": "relVolume",
    "avg_volume": "avgVolume",
    # Dividend
    "dividend_ttm": "dividendTtm",
    "dividend_est": "dividendEst",
    "dividend_gr_35y": "dividendGr35y",
    "dividend_exdate": "dividendExdate",
    "payout": "payout",
    # General / analyst
    "eps_sales_surprise": "epssalesSurpr",
    "earnings_date": "earnings",
    "target_price": "targetPrice",
    "recom": "recom",
    "employees": "employees",
    "option_short": "optionShort",
    "ipo": "ipo",
}


def _cdn_url(path: str | None) -> str | None:
    path = str(path or "")
    if not path:
        return None
    return f"{_CDN_BASE}/stock-logo/{path}" if not path.startswith("/") else f"{_CDN_BASE}{path}"


# Fields where an upstream 0 means "not applicable to this instrument", not a measured
# zero. Kept deliberately narrow and explicit rather than a blanket "0 -> null" rule:
# plenty of fields are legitimately zero (inst_trans 0.00% = genuinely no change, payout 0
# = genuinely pays nothing), and blanking those would hide real facts. A listed security,
# by contrast, cannot have a market cap of $0 -- upstream returns 0 there for ETFs
# (verified for VOO, 2026-08-08), which would otherwise render as a flatly false "0".
_ZERO_MEANS_NOT_APPLICABLE = {"marketCap"}


def _as_display_string(value: Any, upstream_key: str | None = None) -> str | None:
    """Upstream mixes numbers and pre-formatted strings in the same bag. Numbers get
    thousands separators and no scientific notation (a market cap must read as
    4,537,070,000,000, never 4.53707e+12); anything already a string passes through
    untouched; null/absent stays null so the UI shows '-' rather than a 0 that would read
    as a real measurement (an ETF genuinely has no P/E -- that is not 0)."""
    if value is None:
        return None
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, (int, float)):
        if value == 0 and upstream_key in _ZERO_MEANS_NOT_APPLICABLE:
            return None
        if float(value).is_integer():
            return f"{int(value):,}"
        # Two decimals is enough for every ratio/percentage in this feed; trailing zeros
        # are trimmed so 40.80 shows as 40.8, matching how upstream prints its own strings.
        return f"{value:,.2f}".rstrip("0").rstrip(".")
    text = str(value).strip()
    return text or None


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def _post_konbalongtun(path: str, payload: dict) -> Any:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{_KONBALONGTUN_API}/{path}",
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": _USER_AGENT},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=8) as response:
        if response.status != 200:
            return None
        return json.loads(response.read().decode("utf-8"))


_autocomplete_cache: dict[str, tuple[float, list[CompareSuggestion]]] = {}
_stock_cache: dict[str, tuple[float, ComparableStock]] = {}


def _cached(store: dict, key: str):
    entry = store.get(key)
    if entry and (time.time() - entry[0] < _CACHE_TTL_SECONDS):
        return entry[1]
    return None


@router.get("/autocomplete", response_model=list[CompareSuggestion])
def compare_autocomplete(
    q: str = Query(..., min_length=1, description="Ticker or company-name fragment"),
    limit: int = Query(8, ge=1, le=20),
    db: Session = Depends(get_db),
):
    """This app's own stock universe first, then Finnhub, then konbalongtun.

    The tool originally had to use konbalongtun's autocomplete, because only symbols in
    its collection could be compared. That constraint is gone: the data now comes from
    Finnhub + yfinance, which resolve any US listing, so the picker is free to use the
    best-ranked source instead of the one that dictated coverage.

    Local-first is a quality decision, not just a dependency one. Finnhub's /search is a
    symbol lookup rather than a typeahead -- measured 2026-08-08, "AAP" does not return
    AAPL, "MSF" does not return MSFT, and most hits are foreign venue listings. It is
    kept underneath purely to extend reach past the local universe.
    """
    query = q.strip()
    if not query:
        return []

    cache_key = f"{query.lower()}|{limit}"
    hit = _cached(_autocomplete_cache, cache_key)
    if hit is not None:
        return hit

    results: list[CompareSuggestion] = []
    seen: set[str] = set()

    def add(symbol: str, name: str, sector: str | None = None, logo_url: str | None = None) -> None:
        key = symbol.strip().upper()
        if not key or key in seen or len(results) >= limit:
            return
        seen.add(key)
        results.append(CompareSuggestion(symbol=key, name=name or key, sector=sector, logo_url=logo_url))

    try:
        for local in search_stock_universe(query, limit, db):
            add(local.symbol, local.company_name)
    except Exception:
        pass

    # Only when the local universe draws a blank. Topping up every partially-filled
    # response would put an outbound call on each keystroke to pad a list that already
    # has the right answer at the top.
    if not results:
        for item in compare_service.search_finnhub_symbols(query, limit):
            add(item["symbol"], item["name"])

    if not results:
        try:
            raw = _post_konbalongtun("stock-autocomplete", {"query": query})
        except Exception:
            raw = None
        if isinstance(raw, list):
            for item in raw:
                if item.get("company"):
                    add(
                        str(item["company"]),
                        str(item.get("name") or item["company"]),
                        item.get("sector") or None,
                        _cdn_url(item.get("logoFile")),
                    )

    if results:
        _autocomplete_cache[cache_key] = (time.time(), results)
    return results


def _build_from_standard_sources(symbol: str) -> ComparableStock | None:
    """Finnhub + yfinance. Returns None (rather than an empty row) when neither source
    knows the symbol, so the caller can fall through to the legacy source."""
    try:
        finnhub_metric = compare_service.fetch_finnhub_metrics(symbol)
        finnhub_profile = compare_service.fetch_finnhub_profile(symbol)
        yf_bundle = compare_service.fetch_yfinance_bundle(symbol)
    except Exception:
        return None

    metrics = compare_service.build_metrics(finnhub_metric, finnhub_profile, yf_bundle)
    if not compare_service.has_usable_data(metrics):
        return None

    identity = compare_service.build_identity(symbol, finnhub_profile, yf_bundle)
    return ComparableStock(symbol=symbol, metrics=metrics, **identity)


@router.get("/stock/{symbol}", response_model=CompareStockOut)
def get_compare_stock(symbol: str):
    key = symbol.strip().upper()
    if not key:
        raise HTTPException(status_code=400, detail="symbol is required")

    hit = _cached(_stock_cache, key)
    if hit is not None:
        return CompareStockOut(stock=hit)

    standard = _build_from_standard_sources(key)
    if standard is not None:
        _stock_cache[key] = (time.time(), standard)
        return CompareStockOut(stock=standard)

    try:
        raw = _post_konbalongtun("findStockByCompany", {"company": key})
    except Exception:
        raise HTTPException(status_code=503, detail="Upstream stock data is unavailable right now")

    if not isinstance(raw, dict) or not raw.get("success") or not isinstance(raw.get("data"), dict):
        raise HTTPException(status_code=404, detail=f"No comparable data found for {key}")

    data = raw["data"]
    # Upstream carries both a delayed `price` string and a live `regularMarketPrice`
    # number; konbalongtun's own page computes upside off regularMarketPrice (verified
    # against their rendered output for AAPL, 2026-08-08), so prefer it and fall back.
    price = _as_float(data.get("regularMarketPrice")) or _as_float(data.get("price"))
    target_price = _as_float(data.get("targetPrice"))
    upside = None
    if price and target_price and price > 0:
        upside = round((target_price - price) / price * 100, 2)

    stock = ComparableStock(
        symbol=str(data.get("company") or key).upper(),
        name=str(data.get("name") or key),
        sector=data.get("sector") or None,
        industry=data.get("industry") or None,
        logo_url=_cdn_url(data.get("logoFile")),
        price=price,
        target_price=target_price,
        analyst_target_upside_pct=upside,
        metrics={
            our_key: _as_display_string(data.get(their_key), their_key)
            for our_key, their_key in _METRIC_FIELD_MAP.items()
        },
    )

    _stock_cache[key] = (time.time(), stock)
    return CompareStockOut(stock=stock)
