# backend/scripts/refresh_screener.py
"""Refresh the screener_stocks SQLite cache using real data from Finnhub.

Universe: NASDAQ + NYSE + AMEX listed common stocks (~4,960 tickers, confirmed
live on 2026-08-05 via Finnhub's /stock/symbol endpoint). FMP is not used here
-- its free tier no longer exposes the bulk/screener endpoints this pipeline
needs (both /v3/stock/list and /stable/company-screener returned 403/402 when
tested against the project's own key).

Every field is either a real value fetched from Finnhub or left as NULL. There
is no hash-based per-field guessing, no synthetic ticker padding, and no
forced-minimum overrides -- if Finnhub doesn't have a number for a stock, this
script doesn't invent one.

Finnhub's free tier does not include analyst price targets (/stock/price-target
returns 403), so `upside_pct` no longer means "% upside to analyst target
price". It now holds a real, computed "analyst consensus %" -- the share of
analysts rating the stock Buy or Strong Buy in the latest recommendation
period, from the free /stock/recommendation endpoint.
"""

import argparse
import json
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(dotenv_path=env_path)

FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY")
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "portfolio.db")
BASE_URL = "https://finnhub.io/api/v1"

# NASDAQ, NYSE, AMEX -- confirmed live on 2026-08-05: filtering Finnhub's
# /stock/symbol?exchange=US results to type="Common Stock" and these MICs
# yields ~4,960 tickers.
MAJOR_EXCHANGE_MICS = {"XNAS", "XNYS", "XASE"}

# 4 Finnhub calls per symbol; this delay keeps that comfortably under the
# free tier's 60 calls/minute limit (~54/min at this pace).
REQUEST_DELAY_SECONDS = 1.05

# Best-effort grouping of Finnhub's finnhubIndustry value into a broader
# sector bucket, for the screener's sector filter. This is a categorization
# convenience, not a data source -- every industry not listed here just uses
# its own name as the sector too, rather than being guessed at.
INDUSTRY_TO_SECTOR = {
    "Semiconductors": "Technology",
    "Software": "Technology",
    "Technology Hardware": "Technology",
    "Computer Hardware": "Technology",
    "IT Services": "Technology",
    "Communications": "Communication Services",
    "Media": "Communication Services",
    "Internet": "Communication Services",
    "Telecommunication": "Communication Services",
    "Banking": "Financial Services",
    "Insurance": "Financial Services",
    "Financial Services": "Financial Services",
    "Investment Banking/Brokerage": "Financial Services",
    "Asset Management": "Financial Services",
    "Pharmaceuticals": "Healthcare",
    "Biotechnology": "Healthcare",
    "Health Care": "Healthcare",
    "Health Care Equipment & Supplies": "Healthcare",
    "Health Care Providers & Services": "Healthcare",
    "Energy": "Energy",
    "Oil & Gas": "Energy",
    "Aerospace & Defense": "Industrials",
    "Airlines": "Industrials",
    "Industrials": "Industrials",
    "Machinery": "Industrials",
    "Transportation": "Industrials",
    "Retail": "Consumer Cyclical",
    "Auto": "Consumer Cyclical",
    "Hotels/Restaurants": "Consumer Cyclical",
    "Consumer products": "Consumer Defensive",
    "Beverages": "Consumer Defensive",
    "Food Products": "Consumer Defensive",
    "Utilities": "Utilities",
    "Real Estate": "Real Estate",
    "REIT": "Real Estate",
    "Chemicals": "Basic Materials",
    "Metals & Mining": "Basic Materials",
}


def init_db(db_path: str = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS screener_stocks (
            symbol TEXT PRIMARY KEY,
            company_name TEXT,
            market_cap REAL,
            sector TEXT,
            industry TEXT,
            price REAL,
            pe REAL,
            peg REAL,
            ps REAL,
            pb REAL,
            div_yield REAL,
            eps REAL,
            roe REAL,
            roic REAL,
            gross_margin REAL,
            profit_margin REAL,
            de_ratio REAL,
            p_fcf REAL,
            ev_sales REAL,
            upside_pct REAL,
            beta REAL,
            volume REAL,
            tags TEXT,
            refreshed_at TEXT
        )
    """)
    conn.commit()
    return conn


def fetch_universe() -> list[dict]:
    """Return [{symbol, company_name}, ...] for NASDAQ+NYSE+AMEX common stock."""
    resp = requests.get(
        f"{BASE_URL}/stock/symbol", params={"exchange": "US", "token": FINNHUB_API_KEY}, timeout=30
    )
    resp.raise_for_status()
    data = resp.json()
    return [
        {"symbol": row["symbol"], "company_name": row.get("description")}
        for row in data
        if row.get("type") == "Common Stock" and row.get("mic") in MAJOR_EXCHANGE_MICS
    ]


def _get_json(path: str, symbol: str, extra_params: dict | None = None):
    params = {"symbol": symbol, "token": FINNHUB_API_KEY}
    if extra_params:
        params.update(extra_params)
    try:
        resp = requests.get(f"{BASE_URL}{path}", params=params, timeout=10)
        if resp.status_code != 200:
            return None
        return resp.json()
    except requests.RequestException:
        return None


def _sector_for_industry(industry: str | None) -> str | None:
    if not industry:
        return None
    return INDUSTRY_TO_SECTOR.get(industry, industry)


def _analyst_consensus_pct(recommendations) -> float | None:
    """Real % of analysts rating the stock Buy or Strong Buy in the latest
    period. NOT a price-target upside -- Finnhub's price-target endpoint is
    paid-tier only, so we don't have that number and don't invent it."""
    if not recommendations:
        return None
    latest = recommendations[0]
    total = sum(latest.get(k, 0) or 0 for k in ("strongBuy", "buy", "hold", "sell", "strongSell"))
    if total == 0:
        return None
    buys = (latest.get("strongBuy", 0) or 0) + (latest.get("buy", 0) or 0)
    return round(buys / total * 100, 1)


def infer_tags(sector, industry, pe, roe, div_yield) -> list[str]:
    """Descriptive tags derived only from real fetched fields -- no per-symbol
    hardcoded overrides."""
    tags = set()
    industry_l = (industry or "").lower()
    sector_l = (sector or "").lower()

    if "semiconductor" in industry_l:
        tags.add("semiconductor")
    if "software" in industry_l or "internet" in industry_l:
        tags.add("cloud")
    if "bank" in industry_l or "insurance" in industry_l or "financial" in sector_l:
        tags.add("finance")
    if "aerospace" in industry_l or "defense" in industry_l:
        tags.add("defense")
    if pe is not None and pe > 25:
        tags.add("growth")
    if pe is not None and 0 < pe < 15:
        tags.add("value")
    if div_yield is not None and div_yield > 0.02:
        tags.add("dividend")

    return sorted(tags)


def fetch_stock_record(symbol: str, company_name_hint, now_iso: str) -> dict | None:
    """Fetch one symbol's real data from Finnhub. Returns None only when every
    endpoint failed outright for this symbol -- never returns a row of guesses."""
    profile = _get_json("/stock/profile2", symbol) or {}
    time.sleep(REQUEST_DELAY_SECONDS)

    metric_resp = _get_json("/stock/metric", symbol, {"metric": "all"}) or {}
    metric = metric_resp.get("metric", {}) if isinstance(metric_resp, dict) else {}
    time.sleep(REQUEST_DELAY_SECONDS)

    quote = _get_json("/quote", symbol) or {}
    time.sleep(REQUEST_DELAY_SECONDS)

    recommendations = _get_json("/stock/recommendation", symbol)
    if not isinstance(recommendations, list):
        recommendations = None
    time.sleep(REQUEST_DELAY_SECONDS)

    if not profile and not metric and not quote:
        return None

    industry = profile.get("finnhubIndustry")
    sector = _sector_for_industry(industry)

    market_cap = None
    raw_cap = profile.get("marketCapitalization")
    if raw_cap is None:
        raw_cap = metric.get("marketCapitalization")
    if raw_cap is not None:
        market_cap = float(raw_cap) * 1_000_000  # Finnhub reports this in millions USD

    div_yield = None
    raw_div = metric.get("dividendYieldIndicatedAnnual")
    if raw_div is not None:
        div_yield = float(raw_div) / 100.0  # Finnhub returns this as a plain percent (e.g. 0.36 = 0.36%)

    volume = None
    raw_vol = metric.get("10DayAverageTradingVolume")
    if raw_vol is not None:
        volume = float(raw_vol) * 1_000_000  # reported in millions of shares

    pe = metric.get("peTTM")
    roe = metric.get("roeTTM")

    return {
        "symbol": symbol,
        "company_name": profile.get("name") or company_name_hint,
        "market_cap": market_cap,
        "sector": sector,
        "industry": industry,
        "price": quote.get("c"),
        "pe": pe,
        "peg": metric.get("pegTTM"),
        "ps": metric.get("psTTM"),
        "pb": metric.get("pbAnnual"),
        "div_yield": div_yield,
        "eps": metric.get("epsTTM"),
        "roe": roe,
        "roic": metric.get("roiTTM"),
        "gross_margin": metric.get("grossMarginTTM"),
        "profit_margin": metric.get("netProfitMarginTTM"),
        "de_ratio": metric.get("totalDebt/totalEquityAnnual"),
        "p_fcf": metric.get("currentEv/freeCashFlowTTM"),
        "ev_sales": metric.get("evRevenueTTM"),
        "upside_pct": _analyst_consensus_pct(recommendations),
        "beta": metric.get("beta"),
        "volume": volume,
        "tags": json.dumps(infer_tags(sector, industry, pe, roe, div_yield)),
        "refreshed_at": now_iso,
    }


def save_to_db(records: list[dict], conn: sqlite3.Connection):
    if not records:
        return
    conn.executemany("""
        INSERT OR REPLACE INTO screener_stocks (
            symbol, company_name, market_cap, sector, industry, price,
            pe, peg, ps, pb, div_yield, eps, roe, roic, gross_margin,
            profit_margin, de_ratio, p_fcf, ev_sales, upside_pct, beta,
            volume, tags, refreshed_at
        ) VALUES (
            :symbol, :company_name, :market_cap, :sector, :industry, :price,
            :pe, :peg, :ps, :pb, :div_yield, :eps, :roe, :roic, :gross_margin,
            :profit_margin, :de_ratio, :p_fcf, :ev_sales, :upside_pct, :beta,
            :volume, :tags, :refreshed_at
        )
    """, records)
    conn.commit()


def run_refresh(universe: list[dict], conn: sqlite3.Connection, on_progress=None) -> tuple[int, int]:
    """Run the fetch loop over `universe`, writing each fetched symbol to
    `conn` immediately (not batched) so the screener_stocks table reflects
    real progress as it happens.

    This matters for the UI: /api/screener/stocks only serves the static
    51-stock fallback when screener_stocks is completely empty, and switches
    to real DB data the moment even one row exists. Writing per-symbol (the
    Finnhub rate limit already caps us at ~1 symbol/second, so this adds no
    meaningful overhead) means the Screener starts showing real, if partial,
    data almost immediately after a refresh starts -- instead of still
    showing the hardcoded fallback rows for however long a larger batch
    would have taken to fill.

    `on_progress`, if given, is called after every symbol as
    `on_progress(index, total, symbol, fetched, skipped)` so a caller (CLI
    print, or a background-thread progress tracker for the UI) can report
    status without this function knowing who's listening.

    Returns (fetched, skipped).
    """
    total = len(universe)
    fetched = 0
    skipped = 0

    for i, entry in enumerate(universe, start=1):
        now_iso = datetime.now(timezone.utc).isoformat()
        record = fetch_stock_record(entry["symbol"], entry.get("company_name"), now_iso)
        if record is None:
            skipped += 1
        else:
            save_to_db([record], conn)
            fetched += 1

        if on_progress:
            on_progress(i, total, entry["symbol"], fetched, skipped)

    return fetched, skipped


def main():
    parser = argparse.ArgumentParser(description="Refresh Stock Screener database from Finnhub")
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Only refresh the first N tickers of the universe (for testing)",
    )
    parser.add_argument("--symbols", nargs="*", default=None, help="Refresh only these specific symbols")
    args = parser.parse_args()

    if not FINNHUB_API_KEY:
        print("ERROR: FINNHUB_API_KEY is not set in backend/.env", file=sys.stderr)
        sys.exit(1)

    if args.symbols:
        universe = [{"symbol": s.upper(), "company_name": None} for s in args.symbols]
    else:
        print("Fetching ticker universe (NASDAQ+NYSE+AMEX common stock)...")
        universe = fetch_universe()
        if args.limit:
            universe = universe[: args.limit]

    est_minutes = len(universe) * 4 * REQUEST_DELAY_SECONDS / 60
    print(f"Refreshing {len(universe)} symbols from Finnhub (~{est_minutes:.0f} min estimated)...")

    def print_progress(i, total, symbol, fetched, skipped):
        if i % 50 == 0 or i == total:
            print(f"  [{i}/{total}] fetched={fetched} skipped={skipped} (last: {symbol})")

    conn = init_db()
    fetched, skipped = run_refresh(universe, conn, on_progress=print_progress)

    total_in_db = conn.execute("SELECT COUNT(*) FROM screener_stocks").fetchone()[0]
    conn.close()

    print(f"Done. Fetched {fetched}, skipped {skipped}. Total rows in screener_stocks: {total_in_db}")


if __name__ == "__main__":
    main()
