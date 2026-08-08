# backend/app/macro_service.py
"""Macro dashboard data for the Tools page — mirrors the layout and taxonomy of
the reference "Bond Crisis Dashboard" /macro page: a yield-curve panel, a gold
CME card, and five metric-card sections (treasury yields, money-market rates,
macro indicators, credit spreads, banking indicators).

Sources, both real public data (never fabricated):

  1. FRED's public CSV endpoint (https://fred.stlouisfed.org/graph/fredgraph.csv)
     -- no API key required. Covers the DGS* constant-maturity yields, money
     market rates (SOFR/EFFR/OBFR/ON RRP), credit spreads (HY/IG OAS), banking
     indicators (discount window, bank reserves, StL financial stress), inflation
     indexes (CPI/PCE/core CPI), debt and fiscal ratios, unemployment.

  2. Yahoo Finance via yfinance (already a project dependency) for DXY, VIX,
     MOVE, gold, silver and WTI.

  3. US Treasury Fiscal Data API (https://api.fiscaldata.treasury.gov) -- free,
     no API key. Supplies the Treasury General Account (TGA) opening balance.

  4. TreasuryDirect TA_WS (https://www.treasurydirect.gov/TA_WS/securities/
     auctioned) -- public JSON, no key. Supplies the 10Y auction bid-to-cover.

Series the reference site covers but that have no free source (COT
positioning, CME options IV, CME open interest/volume, the proprietary
banking-stress composite) are reported with available=false and null values --
honestly unavailable, never guessed.

Note on FRED's CDN: fred.stlouisfed.org sits behind Akamai which silently
blackholes browser-like User-Agents (observed 2026-08-08: a Mozilla/5.0 Chrome
UA timed out at 12s while the default python-httpx UA returned 200 in 0.6s).
A plain, descriptive UA is used deliberately.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

import httpx

FRED_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv"
# TGA opening balance, US Treasury Fiscal Data API (free, no key):
# https://fiscaldata.treasury.gov/datasets/daily-treasury-statement/operating-cash-balance
FISCALDATA_TGA_URL = (
    "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/"
    "accounting/dts/operating_cash_balance"
)
# TreasuryDirect auction results (public JSON, no key):
# https://www.treasurydirect.gov/auctions/auction-results/ (TA_WS web service)
TREASURYDIRECT_AUCTION_URL = "https://www.treasurydirect.gov/TA_WS/securities/auctioned"
_TIMEOUT_SECONDS = 12
_HEADERS = {"User-Agent": "portfolio-tracker/1.0 (personal portfolio web app)"}

# ---------------------------------------------------------------------------
# Series registry — the exact series the reference /macro page shows, with the
# reference site's Thai/English names, units, categories and card order
# (captured from its public Supabase `macro_series` table on 2026-08-08).
#
# `fred`  = FRED series id (None = not available on FRED)
# `yf`    = yfinance ticker (None = not available via yfinance)
# `unit`  = display unit: "%" | "bps" | "USD" | "index" | "$B" | "contracts" | "x"
# `kind`  = how the raw reading maps to the displayed value:
#             "plain"    value as-is (yields, rates, index levels)
#             "bps"      FRED stores % -> multiply by 100 (spreads)
#             "yoy"      index series -> YoY % change
#             "ratio"    series A / series B * 100 (debt-to-GDP, deficit)
# ---------------------------------------------------------------------------
_SERIES: dict[str, dict] = {
    # --- treasury yields (category: yield) ---
    "us13w": {"fred": "DGS3MO", "yf": "^IRX", "unit": "%", "kind": "plain",
              "name_th": "ผลตอบแทนพันธบัตรสหรัฐ 13 สัปดาห์", "name_en": "US 13-Week Yield"},
    "us1y": {"fred": "DGS1", "yf": None, "unit": "%", "kind": "plain",
             "name_th": "ผลตอบแทนพันธบัตรสหรัฐ 1 ปี", "name_en": "US 1-Year Yield"},
    "us2y": {"fred": "DGS2", "yf": None, "unit": "%", "kind": "plain",
             "name_th": "ผลตอบแทนพันธบัตรสหรัฐ 2 ปี", "name_en": "US 2-Year Yield"},
    "us5y": {"fred": "DGS5", "yf": "^FVX", "unit": "%", "kind": "plain",
             "name_th": "ผลตอบแทนพันธบัตรสหรัฐ 5 ปี", "name_en": "US 5-Year Yield"},
    "us10y": {"fred": "DGS10", "yf": "^TNX", "unit": "%", "kind": "plain",
              "name_th": "ผลตอบแทนพันธบัตรสหรัฐ 10 ปี", "name_en": "US 10-Year Yield"},
    "us20y": {"fred": "DGS20", "yf": None, "unit": "%", "kind": "plain",
              "name_th": "ผลตอบแทนพันธบัตรสหรัฐ 20 ปี", "name_en": "US 20-Year Yield"},
    "us30y": {"fred": "DGS30", "yf": "^TYX", "unit": "%", "kind": "plain",
              "name_th": "ผลตอบแทนพันธบัตรสหรัฐ 30 ปี", "name_en": "US 30-Year Yield"},
    # --- money market rates (category: policy + the SOFR-EFFR spread) ---
    "us_sofr": {"fred": "SOFR", "yf": None, "unit": "%", "kind": "plain",
                "name_th": "อัตรา SOFR (Secured Overnight Financing Rate)", "name_en": "SOFR"},
    "us_effr": {"fred": "DFF", "yf": None, "unit": "%", "kind": "plain",
                "name_th": "อัตรา EFFR (Effective Fed Funds Rate)", "name_en": "EFFR"},
    "us_obfr": {"fred": "OBFR", "yf": None, "unit": "%", "kind": "plain",
                "name_th": "อัตรา OBFR (Overnight Bank Funding Rate)", "name_en": "OBFR"},
    "us_on_rrp": {"fred": "RRPONTSYD", "yf": None, "unit": "$B", "kind": "plain",
                  "name_th": "ยอดคงค้าง Reverse Repo (ON RRP) ของเฟด", "name_en": "Fed ON RRP Outstanding"},
    "us_tga": {"fd": "tga", "yf": None, "unit": "$B", "kind": "plain",
               "name_th": "เงินคงคลังกระทรวงการคลังสหรัฐฯ (TGA)", "name_en": "Treasury General Account Balance"},
    "us_sofr_effr_spread": {"fred": None, "yf": None, "unit": "bps", "kind": "computed",
                            "name_th": "ส่วนต่าง SOFR-EFFR (ความตึงตลาด repo)", "name_en": "SOFR-EFFR Spread"},
    # --- macro indicators (category: fx / volatility / commodity / inflation) ---
    "dxy": {"fred": None, "yf": "DX-Y.NYB", "unit": "index", "kind": "plain",
            "name_th": "ดัชนีดอลลาร์", "name_en": "Dollar Index (DXY)"},
    "vix": {"fred": None, "yf": "^VIX", "unit": "index", "kind": "plain",
            "name_th": "ดัชนีความผันผวน VIX", "name_en": "VIX"},
    "move": {"fred": None, "yf": "^MOVE", "unit": "pts", "kind": "plain",
             "name_th": "ดัชนี MOVE (ความผันผวนตลาดพันธบัตร)", "name_en": "MOVE Index (Bond Volatility)"},
    "xauusd": {"fred": None, "yf": "GC=F", "unit": "USD", "kind": "plain",
               "name_th": "ทองคำ", "name_en": "Gold"},
    "xagusd": {"fred": None, "yf": "SI=F", "unit": "USD", "kind": "plain",
               "name_th": "แร่เงิน (Silver)", "name_en": "Silver"},
    "usoil": {"fred": None, "yf": "CL=F", "unit": "USD", "kind": "plain",
              "name_th": "น้ำมันดิบ WTI", "name_en": "WTI Crude Oil"},
    "us_cpi_yoy": {"fred": "CPIAUCSL", "yf": None, "unit": "%", "kind": "yoy",
                   "name_th": "เงินเฟ้อ CPI (YoY)", "name_en": "CPI YoY"},
    "us_pce_yoy": {"fred": "PCEPI", "yf": None, "unit": "%", "kind": "yoy",
                   "name_th": "เงินเฟ้อ PCE (YoY)", "name_en": "Core PCE YoY"},
    "us_core_cpi": {"fred": "CPILFESL", "yf": None, "unit": "%", "kind": "yoy",
                    "name_th": "เงินเฟ้อพื้นฐาน (YoY)", "name_en": "Core CPI YoY"},
    # --- credit spreads (category: credit) ---
    "us_hy_spread": {"fred": "BAMLH0A0HYM2", "yf": None, "unit": "bps", "kind": "bps",
                     "name_th": "ส่วนต่างพันธบัตร High Yield", "name_en": "HY Spread (OAS)"},
    "us_ig_spread": {"fred": "BAMLC0A0CM", "yf": None, "unit": "bps", "kind": "bps",
                     "name_th": "ส่วนต่างพันธบัตร Investment Grade", "name_en": "IG Spread (OAS)"},
    "us_debt_gdp": {"fred": None, "yf": None, "unit": "%", "kind": "ratio",
                    "name_th": "หนี้สาธารณะสหรัฐต่อ GDP", "name_en": "US Debt-to-GDP",
                    "ratio": ["GFDEBTN", "GDP"]},
    "us_fiscal_deficit": {"fred": None, "yf": None, "unit": "%", "kind": "ratio",
                          "name_th": "ดุลการคลัง (% GDP)", "name_en": "Fiscal Balance % GDP",
                          "ratio": ["FYFSD", "GDP"]},
    "us_auction_btc": {"td": "10-Year", "yf": None, "unit": "x", "kind": "plain",
                       "name_th": "ผลประมูลพันธบัตร 10 ปี (Bid-to-Cover)", "name_en": "10Y Auction Bid-to-Cover"},
    "us_household_debt": {"fred": None, "yf": None, "unit": "%", "kind": "plain",
                          "name_th": "หนี้ครัวเรือน (% GDP)", "name_en": "Household Debt % GDP"},
    # --- banking indicators (category: banking, excluding the SOFR-EFFR spread) ---
    "us_banking_stress_index": {"fred": None, "yf": None, "unit": "index", "kind": "plain",
                                "name_th": "ดัชนีความเสี่ยงแบงก์รัน (Composite)", "name_en": "Banking Stress Index"},
    "us_bank_deposits": {"fred": "DPSACBW027SBOG", "yf": None, "unit": "$B", "kind": "plain", "scale": 0.001,
                         "name_th": "เงินฝากธนาคารพาณิชย์รวม", "name_en": "Bank Deposits (All Comm. Banks)"},
    "us_discount_window": {"fred": "H41RESPPALDKNWW", "yf": None, "unit": "$B", "kind": "plain", "scale": 0.001,
                           "name_th": "ยอดกู้ Discount Window ของ Fed", "name_en": "Fed Discount Window (Primary Credit)"},
    "us_stlfsi": {"fred": "STLFSI4", "yf": None, "unit": "index", "kind": "plain",
                  "name_th": "ดัชนีความตึงเครียดการเงิน (StL Fed)", "name_en": "St. Louis Fed Financial Stress Index"},
    "us_bank_reserves": {"fred": "WRESBAL", "yf": None, "unit": "$B", "kind": "plain", "scale": 0.001,
                         "name_th": "เงินสำรองธนาคารที่เฟด (WRESBAL)", "name_en": "Bank Reserves at Fed (WRESBAL)"},
}

# Section order + membership, mirroring the reference page's filter logic.
_YIELD_TENORS = ["us13w", "us1y", "us2y", "us5y", "us10y", "us20y", "us30y"]
SECTIONS: list[dict] = [
    {"key": "treasuryYields", "title_th": "ผลตอบแทนพันธบัตรสหรัฐ", "title_en": "US Treasury Yields",
     "series": _YIELD_TENORS},
    {"key": "moneyMarketRates", "title_th": "อัตราดอกเบี้ยตลาดเงิน", "title_en": "Money Market Rates",
     "series": ["us_sofr", "us_effr", "us_obfr", "us_on_rrp", "us_tga", "us_sofr_effr_spread"]},
    {"key": "macroIndicators", "title_th": "ตัวชี้วัดมหภาค", "title_en": "Macro Indicators",
     "series": ["dxy", "vix", "move", "xauusd", "xagusd", "usoil",
                "us_cpi_yoy", "us_pce_yoy", "us_core_cpi"]},
    {"key": "creditSpreads", "title_th": "เครดิตและการคลัง", "title_en": "Credit & Fiscal",
     "series": ["us_hy_spread", "us_ig_spread", "us_debt_gdp", "us_fiscal_deficit",
                "us_auction_btc", "us_household_debt"]},
    {"key": "bankingIndicators", "title_th": "ตัวชี้วัดภาคการธนาคาร", "title_en": "Banking Indicators",
     "series": ["us_banking_stress_index", "us_bank_deposits", "us_discount_window",
                "us_stlfsi", "us_bank_reserves"]},
]

GOLD_CME_SERIES = ["gold_cme_oi", "gold_cme_oi_chg", "gold_cme_vol", "gold_cme_opt_oi"]


def _num(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if out == out else None


def _round(value: float | None, digits: int = 2) -> float | None:
    return round(value, digits) if value is not None else None


# Display precision per unit, matching how the reference page formats numbers.
_UNIT_DIGITS: dict[str, int] = {
    "%": 2, "USD": 2, "index": 2, "$B": 1, "bps": 0, "pts": 2,
    "contracts": 0, "x": 2, "notch": 0,
}


def _value_digits(unit: str) -> int:
    return _UNIT_DIGITS.get(unit, 2)


# ---------------------------------------------------------------------------
# FRED fetching
# ---------------------------------------------------------------------------
def _fetch_fred_series(series_id: str) -> list[tuple[str, float]] | None:
    """Fetch one FRED series via the public CSV endpoint.

    Returns [(date, value), ...] oldest-to-newest with missing days ('.' rows,
    which DGS series use for holidays) dropped, or None if the fetch fails.
    """
    try:
        response = httpx.get(
            FRED_CSV_URL,
            params={"id": series_id},
            headers=_HEADERS,
            timeout=_TIMEOUT_SECONDS,
            follow_redirects=True,
        )
        if response.status_code != 200:
            return None
    except Exception:
        return None

    rows: list[tuple[str, float]] = []
    for line in response.text.splitlines()[1:]:  # skip the header row
        parts = line.strip().rsplit(",", 1)
        if len(parts) != 2:
            continue
        raw_date, raw_value = parts
        value = _num(raw_value)
        if value is None:
            continue  # '.' missing-day rows are skipped, not treated as zero
        rows.append((raw_date.strip(), value))
    return rows or None


def _fetch_fred_series_map(series_ids: list[str]) -> dict[str, list[tuple[str, float]] | None]:
    """Fetch several FRED series in parallel so a slow CDN day can't stack
    ten sequential 12s timeouts into a 120s page load."""
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(_fetch_fred_series, series_ids))
    return dict(zip(series_ids, results))


def _fetch_tga() -> list[tuple[str, float]] | None:
    """TGA opening balance from the Treasury Fiscal Data API.

    The DTS 'operating_cash_balance' dataset reports several rows per day
    (opening balance, deposits, withdrawals, closing balance); only the
    'Treasury General Account (TGA) Opening Balance' row is the balance we
    display. Values are millions of dollars. Returns [(date, value)] oldest
    first (matching the FRED row shape), or None on any failure.
    """
    try:
        response = httpx.get(
            FISCALDATA_TGA_URL,
            params={"sort": "-record_date", "page[size]": "10"},
            headers=_HEADERS,
            timeout=_TIMEOUT_SECONDS,
            follow_redirects=True,
        )
        if response.status_code != 200:
            return None
        payload = response.json()
    except Exception:
        return None

    rows: list[tuple[str, float]] = []
    for item in payload.get("data", []):
        if item.get("account_type") != "Treasury General Account (TGA) Opening Balance":
            continue
        value = _num(item.get("open_today_bal"))
        if value is None:
            continue
        rows.append((item.get("record_date", ""), value))
    rows.sort()  # API returns newest first; normalise to oldest first
    return rows or None


def _fetch_auction_bid_to_cover(term: str = "10-Year") -> list[tuple[str, float]] | None:
    """Bid-to-cover ratios of recent Treasury auctions of the given term.

    TreasuryDirect's TA_WS returns one row per auction; the same note is
    reopened several times, so filter on the original `term` (e.g. 10-Year,
    which appears as both '10-Year' new issues and '9-Year 10-Month'
    reopenings of the same line). Returns [(auction_date, bid_to_cover)]
    oldest first, or None on failure.
    """
    try:
        response = httpx.get(
            TREASURYDIRECT_AUCTION_URL,
            params={"pagesize": "50", "type": "Note", "format": "json"},
            headers=_HEADERS,
            timeout=_TIMEOUT_SECONDS,
            follow_redirects=True,
        )
        if response.status_code != 200:
            return None
        payload = response.json()
    except Exception:
        return None

    rows: list[tuple[str, float]] = []
    for item in payload:
        if item.get("term") != term:
            continue
        value = _num(item.get("bidToCoverRatio"))
        if value is None:
            continue
        rows.append((str(item.get("auctionDate", ""))[:10], value))
    rows.sort()
    return rows or None


def _last_two(rows: list[tuple[str, float]]) -> tuple[str | None, float | None, float | None]:
    if not rows:
        return None, None, None
    date, last = rows[-1]
    prev = rows[-2][1] if len(rows) >= 2 else None
    return date, last, prev


def _value_at(rows: list[tuple[str, float]], days_before: int) -> float | None:
    """Value of the row closest to (last date - days_before) — used for the
    '1 เดือนก่อน' yield-curve line and YoY inflation math."""
    if not rows:
        return None
    last_date = datetime.fromisoformat(rows[-1][0])
    target = last_date - timedelta(days=days_before)
    best, best_gap = None, None
    for d, v in rows:
        try:
            gap = abs((datetime.fromisoformat(d) - target).days)
        except ValueError:
            continue
        if best_gap is None or gap < best_gap:
            best, best_gap = v, gap
    return best


# ---------------------------------------------------------------------------
# Raw series -> card payload
# ---------------------------------------------------------------------------
def _scale_rows(rows: list[tuple[str, float]] | None, scale: float | None) -> list[tuple[str, float]] | None:
    """Scale raw FRED readings into display units (e.g. millions -> $B)."""
    if rows is None or scale is None or scale == 1.0:
        return rows
    return [(d, v * scale) for d, v in rows]


def _plain_card(meta: dict, rows: list[tuple[str, float]] | None) -> dict:
    rows = _scale_rows(rows, meta.get("scale"))
    digits = _value_digits(meta["unit"])
    date, last, prev = _last_two(rows) if rows else (None, None, None)
    if meta["unit"] == "%":
        change_val = _round(last - prev) if (last is not None and prev is not None) else None
    else:
        change_val = None
    change_pct = _round((last / prev - 1) * 100) if (last and prev) else None
    return {
        "value": _round(last, digits),
        "change_val": change_val,
        "change_pct": change_pct,
        "trend": "up" if (change_pct or 0) > 0 else "down" if (change_pct or 0) < 0 else "flat",
        "recorded_at": date,
        "available": last is not None,
    }


def _bps_card(meta: dict, rows: list[tuple[str, float]] | None) -> dict:
    rows = _scale_rows(rows, meta.get("scale"))
    date, last_pct, prev_pct = _last_two(rows) if rows else (None, None, None)
    last = _round(last_pct * 100) if last_pct is not None else None
    change_val = _round((last_pct - prev_pct) * 100) if (last_pct is not None and prev_pct is not None) else None
    return {
        "value": last,
        "change_val": change_val,
        "change_pct": None,
        "trend": "up" if (change_val or 0) > 0 else "down" if (change_val or 0) < 0 else "flat",
        "recorded_at": date,
        "available": last is not None,
    }


def _yoy_card(meta: dict, rows: list[tuple[str, float]] | None) -> dict:
    date, last, prev = _last_two(rows) if rows else (None, None, None)
    year_ago = _value_at(rows, 365) if rows else None
    value = _round((last / year_ago - 1) * 100, 2) if (last is not None and year_ago) else None
    prev_value = _round((prev / year_ago - 1) * 100, 2) if (prev is not None and year_ago) else None
    change_val = _round(value - prev_value) if (value is not None and prev_value is not None) else None
    return {
        "value": value,
        "change_val": change_val,
        "change_pct": None,
        "trend": "up" if (change_val or 0) > 0 else "down" if (change_val or 0) < 0 else "flat",
        "recorded_at": date,
        "available": value is not None,
    }


def _ratio_card(meta: dict, rows_a: list[tuple[str, float]] | None, rows_b: list[tuple[str, float]] | None) -> dict:
    # FRED reports GFDEBTN/FYFSD in millions while GDP is in billions: scale the
    # numerator down to billions so the ratio lands in real percentage terms.
    rows_a = _scale_rows(rows_a, 0.001)
    _, a, _ = _last_two(rows_a) if rows_a else (None, None, None)
    _, b, _ = _last_two(rows_b) if rows_b else (None, None, None)
    value = _round(a / b * 100, 1) if (a is not None and b) else None
    date = rows_a[-1][0] if rows_a else (rows_b[-1][0] if rows_b else None)
    return {"value": value, "change_val": None, "change_pct": None, "trend": "flat",
            "recorded_at": date, "available": value is not None}


_CARD_BUILDERS: dict[str, Callable] = {
    "plain": _plain_card,
    "bps": _bps_card,
    "yoy": _yoy_card,
}


def _build_card(
    series_id: str,
    meta: dict,
    fred_rows: dict[str, list[tuple[str, float]] | None],
    tga_rows: list[tuple[str, float]] | None = None,
    auction_rows: list[tuple[str, float]] | None = None,
) -> dict:
    """Produce one metric card for a series. Never fabricates: anything without
    a working source comes back available=False with nulls."""
    if meta["kind"] == "computed":
        if series_id == "us_sofr_effr_spread":
            _, sofr, _ = _last_two(fred_rows.get("SOFR") or [])
            _, effr, _ = _last_two(fred_rows.get("DFF") or [])
            spread = _round((sofr - effr) * 100) if (sofr is not None and effr is not None) else None
            date = (fred_rows.get("SOFR") or [None])[-1][0] if fred_rows.get("SOFR") else None
            return {"value": spread, "change_val": None, "change_pct": None,
                    "trend": "up" if (spread or 0) > 0 else "down" if (spread or 0) < 0 else "flat",
                    "recorded_at": date, "available": spread is not None}
        return {"value": None, "change_val": None, "change_pct": None, "trend": "flat",
                "recorded_at": None, "available": False}

    if meta["kind"] == "ratio":
        a, b = meta.get("ratio") or [None, None]
        return _ratio_card(meta, fred_rows.get(a) if a else None, fred_rows.get(b) if b else None)

    builder = _CARD_BUILDERS.get(meta["kind"], _plain_card)
    if meta.get("fred") and fred_rows.get(meta["fred"]):
        return builder(meta, fred_rows.get(meta["fred"]))
    # TGA: fiscaldata reports millions; the card displays $B, so scale like FRED.
    if meta.get("fd") == "tga" and tga_rows:
        return builder({**meta, "scale": 0.001}, tga_rows)
    if meta.get("td") and auction_rows:
        return builder(meta, auction_rows)
    if meta["yf"]:
        return builder(meta, None)  # filled below from yfinance (yield fallback too)
    return {"value": None, "change_val": None, "change_pct": None, "trend": "flat",
            "recorded_at": None, "available": False}


# ---------------------------------------------------------------------------
# yfinance
# ---------------------------------------------------------------------------
def _yf_history(ticker: str) -> list[tuple[str, float]]:
    """(date, close) pairs from yfinance, oldest first. Empty on failure."""
    import yfinance as yf

    try:
        history = yf.Ticker(ticker).history(period="5d")
        if history.empty:
            return []
        return [(str(idx.date()), float(row["Close"])) for idx, row in history.iterrows()]
    except Exception:
        return []


def _fill_from_yfinance(cards: dict[str, dict]) -> dict[str, list[tuple[str, float]]]:
    """Fill the cards whose source is a yfinance ticker, in parallel.

    Cards already populated from FRED (e.g. the yields on a normal day) are
    left alone; a card whose FRED source failed falls back to its yfinance
    ticker where one exists. Returns {series_id: rows} for the series that
    ended up backed by yfinance, so the caller can build the curve's
    '1 เดือนก่อน' line from real rows either way."""
    tickers = {sid: meta["yf"] for sid, meta in _SERIES.items() if meta["yf"]}
    used_rows: dict[str, list[tuple[str, float]]] = {}
    if not tickers:
        return used_rows
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda t: (t, _yf_history(t)), set(tickers.values())))
    by_ticker = dict(results)
    for sid, ticker in tickers.items():
        if cards[sid]["available"]:
            continue  # FRED already gave us this card
        rows = by_ticker.get(ticker) or []
        card = _plain_card(_SERIES[sid], rows if rows else None)
        cards[sid] = card
        if card["available"]:
            used_rows[sid] = rows
    return used_rows


# ---------------------------------------------------------------------------
# Dashboard assembly
# ---------------------------------------------------------------------------
def build_dashboard() -> dict:
    """Assemble the full dashboard payload (no caching here -- the router caches)."""
    fred_ids: list[str] = []
    for meta in _SERIES.values():
        if meta.get("fred"):
            fred_ids.append(meta["fred"])
        for r in (meta.get("ratio") or []):
            if r not in fred_ids:
                fred_ids.append(r)
    fred_rows = _fetch_fred_series_map(sorted(set(fred_ids)))

    # TGA + auction results fetch in parallel with each other (both are single
    # quick GETs; no point stacking them behind the FRED pool).
    with ThreadPoolExecutor(max_workers=2) as pool:
        tga_future = pool.submit(_fetch_tga)
        auction_future = pool.submit(_fetch_auction_bid_to_cover)
        tga_rows = tga_future.result()
        auction_rows = auction_future.result()

    cards: dict[str, dict] = {}
    for sid, meta in _SERIES.items():
        cards[sid] = _build_card(sid, meta, fred_rows, tga_rows, auction_rows)
    yf_rows = _fill_from_yfinance(cards)

    # Yield curve points: current + 1-month-ago + change, for the chart panel.
    curve_points: list[dict] = []
    for sid in _YIELD_TENORS:
        card = cards[sid]
        rows = fred_rows.get(_SERIES[sid]["fred"]) or yf_rows.get(sid) or []
        curve_points.append({
            "tenor": {"us13w": "13W", "us1y": "1Y", "us2y": "2Y", "us5y": "5Y",
                      "us10y": "10Y", "us20y": "20Y", "us30y": "30Y"}[sid],
            "series_id": sid,
            "yield": card["value"],
            "prev": _value_at(rows, 30) if rows else None,
            "change_bps": _round(card["change_val"] * 100, 1) if card["change_val"] is not None else None,
            "date": card["recorded_at"],
            "available": card["available"],
        })

    us10y = cards["us10y"]["value"]
    us2y = cards["us2y"]["value"]
    spread_10y2y_bps = _round((us10y - us2y) * 100) if (us10y is not None and us2y is not None) else None

    sections = [
        {"key": s["key"], "title_th": s["title_th"], "title_en": s["title_en"],
         "items": [
             {"series_id": sid, "name_th": _SERIES[sid]["name_th"], "name_en": _SERIES[sid]["name_en"],
              "unit": _SERIES[sid]["unit"], **cards[sid]}
             for sid in s["series"]
         ]}
        for s in SECTIONS
    ]

    sources: list[str] = []
    # A series counts as FRED-backed only if its FRED rows actually arrived --
    # a yield that fell back to a CBOE ticker must not be attributed to FRED.
    fred_backed = {
        sid
        for sid, meta in _SERIES.items()
        if (meta.get("fred") and fred_rows.get(meta["fred"]))
        or (meta["kind"] == "ratio" and all(fred_rows.get(r) for r in (meta.get("ratio") or [])))
        or (sid == "us_sofr_effr_spread" and fred_rows.get("SOFR") and fred_rows.get("DFF"))
    }
    if any(cards[sid]["available"] for sid in fred_backed):
        sources.append("FRED (fredgraph.csv)")
    yf_used = any(cards[sid]["available"] for sid in _SERIES if _SERIES[sid]["yf"])
    if yf_used:
        sources.append("Yahoo Finance (yfinance)")
    if cards["us_tga"]["available"]:
        sources.append("US Treasury Fiscal Data (fiscaldata.treasury.gov)")
    if cards["us_auction_btc"]["available"]:
        sources.append("TreasuryDirect (TA_WS)")

    return {
        "yield_curve": {
            "points": curve_points,
            "spread_10y2y_bps": spread_10y2y_bps,
            "inverted": spread_10y2y_bps is not None and spread_10y2y_bps < 0,
        },
        "gold_cme": {
            "oi": None, "oi_chg": None, "vol": None, "opt_oi": None,
            "spark": [], "available": False, "note": "CME data has no free public source",
        },
        "sections": sections,
        "updated_at": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC"),
        "data_sources": sources,
    }
