# backend/app/countries_service.py
"""Country risk payload for the Bond-crisis "รายประเทศ" tab — mirrors the
reference site's /countries page: 27 country cards with 10Y yields (FRED +
worldgovernmentbonds via Playwright), a computed country-risk score
(user-confirmed formula from docs/research/country-risk-score-engine-2026-08-09.md),
bps-vs-US spread, and 60-day yield trend for the sparkline.

Never fabricates: a country with no free yield source (LA/SA/AE) renders
score None -> "—" with its data-tier note; RU's stale 2018 FRED value is
flagged, not presented as current.
"""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import httpx
import yfinance as yf

from app import macro_service

# --- Country registry (mirrors the reference `countries` table) ------------
# (code, name_en, name_th, currency, flag, data_tier, display_order, wgb_slug, fred_series)
COUNTRIES: list[dict] = [
    {"code": "US", "name_en": "United States", "name_th": "สหรัฐอเมริกา", "currency": "USD", "flag": "🇺🇸", "data_tier": "realtime", "display_order": 1, "slug": "united-states", "fred": "IRLTLT01USM156N"},
    {"code": "TH", "name_en": "Thailand", "name_th": "ไทย", "currency": "THB", "flag": "🇹🇭", "data_tier": "daily", "display_order": 2, "slug": "thailand", "fred": None},
    {"code": "JP", "name_en": "Japan", "name_th": "ญี่ปุ่น", "currency": "JPY", "flag": "🇯🇵", "data_tier": "daily", "display_order": 3, "slug": "japan", "fred": "IRLTLT01JPM156N"},
    {"code": "FR", "name_en": "France", "name_th": "ฝรั่งเศส", "currency": "EUR", "flag": "🇫🇷", "data_tier": "daily", "display_order": 4, "slug": "france", "fred": "IRLTLT01FRM156N"},
    {"code": "VN", "name_en": "Vietnam", "name_th": "เวียดนาม", "currency": "VND", "flag": "🇻🇳", "data_tier": "sparse", "display_order": 5, "slug": "vietnam", "fred": None},
    {"code": "LA", "name_en": "Laos", "name_th": "ลาว", "currency": "LAK", "flag": "🇱🇦", "data_tier": "manual", "display_order": 6, "slug": "laos", "fred": None},
    {"code": "GB", "name_en": "United Kingdom", "name_th": "สหราชอาณาจักร", "currency": "GBP", "flag": "🇬🇧", "data_tier": "daily", "display_order": 7, "slug": "united-kingdom", "fred": "IRLTLT01GBM156N"},
    {"code": "CA", "name_en": "Canada", "name_th": "แคนาดา", "currency": "CAD", "flag": "🇨🇦", "data_tier": "daily", "display_order": 8, "slug": "canada", "fred": "IRLTLT01CAM156N"},
    {"code": "AU", "name_en": "Australia", "name_th": "ออสเตรเลีย", "currency": "AUD", "flag": "🇦🇺", "data_tier": "daily", "display_order": 9, "slug": "australia", "fred": "IRLTLT01AUM156N"},
    {"code": "CH", "name_en": "Switzerland", "name_th": "สวิตเซอร์แลนด์", "currency": "CHF", "flag": "🇨🇭", "data_tier": "daily", "display_order": 10, "slug": "switzerland", "fred": "IRLTLT01CHM156N"},
    {"code": "SG", "name_en": "Singapore", "name_th": "สิงคโปร์", "currency": "SGD", "flag": "🇸🇬", "data_tier": "sparse", "display_order": 11, "slug": "singapore", "fred": None},
    {"code": "KR", "name_en": "South Korea", "name_th": "เกาหลีใต้", "currency": "KRW", "flag": "🇰🇷", "data_tier": "daily", "display_order": 12, "slug": "south-korea", "fred": "IRLTLT01KRM156N"},
    {"code": "HK", "name_en": "Hong Kong", "name_th": "ฮ่องกง", "currency": "HKD", "flag": "🇭🇰", "data_tier": "sparse", "display_order": 13, "slug": "hong-kong", "fred": None},
    {"code": "NO", "name_en": "Norway", "name_th": "นอร์เวย์", "currency": "NOK", "flag": "🇳🇴", "data_tier": "daily", "display_order": 14, "slug": "norway", "fred": "IRLTLT01NOM156N"},
    {"code": "MX", "name_en": "Mexico", "name_th": "เม็กซิโก", "currency": "MXN", "flag": "🇲🇽", "data_tier": "daily", "display_order": 15, "slug": "mexico", "fred": "IRLTLT01MXM156N"},
    {"code": "CN", "name_en": "China", "name_th": "จีน", "currency": "CNY", "flag": "🇨🇳", "data_tier": "sparse", "display_order": 16, "slug": "china", "fred": None},
    {"code": "SA", "name_en": "Saudi Arabia", "name_th": "ซาอุดีอาระเบีย", "currency": "SAR", "flag": "🇸🇦", "data_tier": "sparse", "display_order": 17, "slug": "saudi-arabia", "fred": None},
    {"code": "AE", "name_en": "United Arab Emirates", "name_th": "สหรัฐอาหรับเอมิเรตส์", "currency": "AED", "flag": "🇦🇪", "data_tier": "sparse", "display_order": 18, "slug": "uae", "fred": None},
    {"code": "RU", "name_en": "Russia", "name_th": "รัสเซีย", "currency": "RUB", "flag": "🇷🇺", "data_tier": "sparse", "display_order": 19, "slug": "russia", "fred": "IRLTLT01RUM156N"},
    {"code": "IN", "name_en": "India", "name_th": "อินเดีย", "currency": "INR", "flag": "🇮🇳", "data_tier": "sparse", "display_order": 20, "slug": "india", "fred": None},
    {"code": "ID", "name_en": "Indonesia", "name_th": "อินโดนีเซีย", "currency": "IDR", "flag": "🇮🇩", "data_tier": "sparse", "display_order": 21, "slug": "indonesia", "fred": None},
    {"code": "BR", "name_en": "Brazil", "name_th": "บราซิล", "currency": "BRL", "flag": "🇧🇷", "data_tier": "sparse", "display_order": 22, "slug": "brazil", "fred": None},
    {"code": "TR", "name_en": "Turkey", "name_th": "ตุรกี", "currency": "TRY", "flag": "🇹🇷", "data_tier": "sparse", "display_order": 23, "slug": "turkey", "fred": None},
    {"code": "ZA", "name_en": "South Africa", "name_th": "แอฟริกาใต้", "currency": "ZAR", "flag": "🇿🇦", "data_tier": "daily", "display_order": 24, "slug": "south-africa", "fred": "IRLTLT01ZAM156N"},
    {"code": "PH", "name_en": "Philippines", "name_th": "ฟิลิปปินส์", "currency": "PHP", "flag": "🇵🇭", "data_tier": "sparse", "display_order": 25, "slug": "philippines", "fred": None},
    {"code": "MY", "name_en": "Malaysia", "name_th": "มาเลเซีย", "currency": "MYR", "flag": "🇲🇾", "data_tier": "sparse", "display_order": 26, "slug": "malaysia", "fred": None},
    {"code": "PL", "name_en": "Poland", "name_th": "โปแลนด์", "currency": "PLN", "flag": "🇵🇱", "data_tier": "daily", "display_order": 27, "slug": "poland", "fred": "IRLTLT01PLM156N"},
]

# FX ticker per country (for the fx_depreciation component)
_FX = {"US": "USD", "TH": "THB", "JP": "JPY", "FR": "EUR", "VN": "VND", "LA": "LAK",
       "GB": "GBP", "CA": "CAD", "AU": "AUD", "CH": "CHF", "SG": "SGD", "KR": "KRW",
       "HK": "HKD", "NO": "NOK", "MX": "MXN", "CN": "CNY", "SA": "SAR", "AE": "AED",
       "RU": "RUB", "IN": "INR", "ID": "IDR", "BR": "BRL", "TR": "TRY", "ZA": "ZAR",
       "PH": "PHP", "MY": "MYR", "PL": "PLN"}

# Level thresholds (reference progress-bar colors)
LEVEL_HIGH = 55
LEVEL_MEDIUM = 30
LEVEL_CRISIS = 75

DATA_TIER_NOTE_TH = {
    "realtime": "ข้อมูลเรียลไทม์",
    "daily": "ข้อมูลรายวัน",
    "sparse": "ข้อมูลจำกัด อาจล่าช้าบางวัน",
    "manual": "ไม่มีตลาดรอง — ติดตามผ่านอันดับเครดิตและข่าว",
}

_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"}


def _chromium_path() -> str | None:
    """Legacy Playwright chromium locator — kept only for the docstring; the
    wgb scraper moved to the JSON API (ticket 07) and no longer needs a browser.
    Returns None so any stale caller degrades to the API path."""
    return None


# wgb country SYMBOL ids (from each country page's jsGlobalVars.COUNTRY1.SYMBOL,
# collected 2026-08-11 — stable identifiers, do not expire). Countries that
# only have a wgb "home" page (LA/SA/AE) or no page have no symbol and fall
# back to FRED or None exactly as before (they are manual/sparse tier).
_WGB_SYMBOLS: dict[str, str] = {
    "US": "6", "TH": "53", "JP": "11", "FR": "3", "VN": "58", "GB": "5",
    "CA": "21", "CH": "24", "AU": "22", "KR": "29", "NO": "18", "MX": "14",
    "CN": "9", "IN": "8", "ID": "39", "BR": "7", "TR": "13", "PH": "38",
    "MY": "46", "SG": "52", "HK": "12", "PL": "20", "RU": "10", "ZA": "28",
}
_WGB_ENDPOINT = "https://www.worldgovernmentbonds.com/wp-json/country/v1/main"
_WGB_PAGE = "https://www.worldgovernmentbonds.com/country/{slug}/"


def _wgb_yields(slug: str) -> dict[str, dict]:
    """Full yield table from worldgovernmentbonds via their JSON API:
    {tenor: {yield, chg_1m_bp, chg_6m_bp}} for every maturity row
    (1Y, 2Y, 3Y, 4Y, 5Y, 7Y, 10Y, 12Y, 14Y, 15Y, 16Y, 20Y... + T-BILLs).

    Replaces the old Playwright+Chromium scrape (impossible on Vercel — no
    browser): the site loads the table via POST /wp-json/country/v1/main,
    which returns ready HTML (mainTable). Origin/Referer headers are required
    (403 "invalid origin" otherwise) — verified working from Vercel-style
    egress with an empty UA, 2026-08-11.
    """
    code = next((c["code"] for c in COUNTRIES if c["slug"] == slug), None)
    symbol = _WGB_SYMBOLS.get(code) if code else None
    if not symbol:
        return {}
    try:
        gv = {
            "JS_VARIABLE": "jsGlobalVars", "FUNCTION": "Country", "DOMESTIC": True,
            "ENDPOINT": "https://www.worldgovernmentbonds.com/wp-json/country/v1/historical",
            "DATE_RIF": "2099-12-31", "OBJ": None,
            "COUNTRY1": {"SYMBOL": symbol, "URL_PAGE": slug}, "COUNTRY2": None,
            "OBJ1": None, "OBJ2": None,
        }
        r = httpx.post(_WGB_ENDPOINT, json={"GLOBALVAR": gv}, timeout=20,
                       headers={"Origin": "https://www.worldgovernmentbonds.com",
                                "Referer": _WGB_PAGE.format(slug=slug)})
        if r.status_code != 200:
            return {}
        payload = r.json()
    except Exception:
        return {}

    out: dict[str, dict] = {}
    table_html = payload.get("mainTable", "")
    if not table_html:
        return out
    for row_html in re.findall(r"<tr[^>]*>(.*?)</tr>", table_html, re.S):
        cells = [re.sub(r"<[^>]+>", "", c).strip()
                 for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row_html, re.S)]
        if not cells:
            continue
        # first td is empty (link/icon column) — the maturity label is the
        # first non-empty cell; scan all cells for the label pattern.
        label = ""
        value_idx = 1
        for i, c in enumerate(cells):
            if re.match(r"^\d+\s*years?$", c.lower()) or "t-bill" in c.lower():
                label = c.lower()
                value_idx = i + 1
                break
        if not label:
            continue
        m = re.match(r"^(\d+)\s*years?$", label)
        tenor = None
        if m:
            tenor = f"{m.group(1)}Y"
        elif "t-bill" in label:
            m2 = re.match(r"t-bill\s*(\d+)m", label)
            tenor = f"{m2.group(1)}M" if m2 else None
        if not tenor:
            continue
        try:
            value = float(cells[value_idx].rstrip("%"))
        except (ValueError, IndexError):
            continue
        chg1 = chg6 = None
        if len(cells) > value_idx + 1:
            m3 = re.match(r"([+-]?[\d.]+)", cells[value_idx + 1])
            if m3:
                chg1 = float(m3.group(1))
        if len(cells) > value_idx + 2:
            m4 = re.match(r"([+-]?[\d.]+)", cells[value_idx + 2])
            if m4:
                chg6 = float(m4.group(1))
        out[tenor] = {"yield": value, "chg_1m_bp": chg1, "chg_6m_bp": chg6}
    return out


# --- Yield fetch -----------------------------------------------------------
_FRED_WINDOW = 400  # days, same as macro_service


def _fred_series(series_id: str) -> list[tuple[str, float]] | None:
    """FRED CSV rows (date, value) — no custom UA (TLS-fingerprint lesson)."""
    try:
        start = (datetime.now(timezone.utc) - __import__("datetime").timedelta(days=_FRED_WINDOW)).strftime("%Y-%m-%d")
        r = httpx.get("https://fred.stlouisfed.org/graph/fredgraph.csv",
                      params={"id": series_id, "cosd": start, "coed": "9999-12-31"},
                      timeout=20, follow_redirects=True)
        if r.status_code != 200:
            return None
        out = []
        for line in r.text.strip().splitlines()[1:]:
            if not line or line.startswith("observation"):
                continue
            date, val = line.split(",")
            try:
                out.append((date, float(val)))
            except ValueError:
                continue
        return out or None
    except Exception:
        return None


def _wgb_10y(slug: str) -> tuple[float | None, float | None, str | None]:
    """(10Y yield, 1M change bp, asof) — single-tenor convenience wrapper."""
    table = _wgb_yields(slug)
    entry = table.get("10Y")
    if not entry:
        return (None, None, None)
    return (entry["yield"], entry["chg_1m_bp"], datetime.now(timezone.utc).strftime("%Y-%m-%d"))


def _yield_rows(code: str, meta: dict) -> tuple[list[tuple[str, float]] | None, str | None, float | None]:
    """(rows, asof, 1M change bp) — FRED rows when available, else Playwright
    single point + its table's 1M change column."""
    if meta.get("fred"):
        rows = _fred_series(meta["fred"])
        if rows:
            chg = None
            if len(rows) >= 2 and rows[-1][0] != rows[-2][0]:
                chg = round((rows[-1][1] - rows[-2][1]) * 100, 1)
            return rows, rows[-1][0], chg
    y, chg, asof = _wgb_10y(meta["slug"])
    if y is None:
        return None, None, None
    return [(asof, y)], asof, chg


# --- Score components (user-confirmed formula) -----------------------------
def _yield_level_score(y: float, us_y: float) -> float:
    if y is None:
        return 0.0
    spread = y - us_y
    if spread >= 5.0:
        return 25.0
    if spread >= 2.0:
        return 12.0 + (spread - 2.0) * 4.33
    if spread >= 0.5:
        return 4.0 + (spread - 0.5) * 3.56
    if spread >= -1.0:
        return max(0.0, 1.5 + spread * 5.0)
    return 0.0


def _momentum_score(chg_bp: float | None) -> float:
    if chg_bp is None:
        return 0.0
    return max(0.0, min(10.0, chg_bp / 10.0))


def _fx_score(ccy: str) -> float:
    try:
        h = yf.Ticker(f"{ccy}=X").history(period="3mo")
        if len(h) < 10:
            return 0.0
        last = float(h["Close"].iloc[-1])
        prev = float(h["Close"].iloc[0])
        dep = (prev - last) / prev * 100
        return max(0.0, min(24.0, dep * 4.0))
    except Exception:
        return 0.0


def _freshness_score(rows: list[tuple[str, float]] | None, code: str) -> float:
    if rows is None:
        return 5.0
    if code == "RU":
        return 5.0  # FRED data ends 2018
    return 0.0


def _level(score: float) -> str:
    if score >= LEVEL_CRISIS:
        return "crisis-watch"
    if score >= LEVEL_HIGH:
        return "high"
    if score >= LEVEL_MEDIUM:
        return "medium"
    return "low"


def _trend_points(rows: list[tuple[str, float]] | None, code: str, us_rows: list[tuple[str, float]] | None) -> list[dict]:
    """60-day score trend for the sparkline: recompute the score per point
    from yield history (FRED countries — the user decision: recompute from
    stored yield history, no backfill wait). Playwright countries have only a
    single point, so their trend stays empty until SQLite snapshots accumulate
    (the backend ticket's country_score_history, like model_score_history)."""
    if not rows or len(rows) < 3 or not us_rows:
        return []
    # Build US yield map (monthly FRED — align by date string)
    us_map = {d: v for d, v in us_rows}
    step = max(1, len(rows) // 60)
    sample = rows[::step][-60:]
    out = []
    for d, y in sample:
        us_v = us_map.get(d)
        if us_v is None:
            continue
        try:
            ylv = _yield_level_score(y, us_v)
        except Exception:
            continue
        # Momentum: compare with the previous sample point
        mom = 0.0
        if out:
            prev_y = None
            for pd, pv in sample:
                if pd < d:
                    prev_y = pv
                else:
                    break
            if prev_y is not None:
                mom = _momentum_score((y - prev_y) * 100)
        score = round(ylv + mom, 1)
        out.append({"date": d, "value": score})
    return out[-60:]


# --- Payload assembly ------------------------------------------------------
def build_countries() -> dict:
    """Assemble the /api/countries payload."""
    us_meta = next(c for c in COUNTRIES if c["code"] == "US")
    us_rows, us_asof, _ = _yield_rows("US", us_meta)
    us_y = us_rows[-1][1] if us_rows else None

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {c["code"]: pool.submit(_yield_rows, c["code"], c) for c in COUNTRIES}
        results = {code: f.result() for code, f in futures.items()}

    countries_out = []
    for c in sorted(COUNTRIES, key=lambda x: x["display_order"]):
        rows, asof, chg_bp = results[c["code"]]
        y = rows[-1][1] if rows else None
        stale = c["code"] == "RU" and rows is not None and (rows[-1][0] or "").startswith("201")

        score = None
        components = None
        if y is not None and us_y is not None:
            ylv = _yield_level_score(y, us_y)
            mom = _momentum_score(chg_bp)
            fx = _fx_score(_FX[c["code"]])
            fr = _freshness_score(rows, c["code"])
            score = round(ylv + mom + fx + fr, 1)
            components = {
                "yield_level": round(ylv, 1),
                "yield_momentum": round(mom, 1),
                "fx_depreciation": round(fx, 1),
                "data_freshness": round(fr, 1),
            }

        bps_vs_us = None
        if c["code"] != "US" and y is not None and us_y is not None:
            bps_vs_us = round((y - us_y) * 100, 0)

        countries_out.append({
            "code": c["code"],
            "name_en": c["name_en"],
            "name_th": c["name_th"],
            "currency": c["currency"],
            "flag": c["flag"],
            "data_tier": c["data_tier"],
            "data_tier_note_th": DATA_TIER_NOTE_TH.get(c["data_tier"], ""),
            "yield_value": round(y, 3) if y is not None else None,
            "yield_asof": asof,
            "yield_stale": stale,
            "chg_bp": chg_bp,
            "score": score,
            "level": _level(score) if score is not None else None,
            "components": components,
            "bps_vs_us": bps_vs_us,
            "trend": _trend_points(rows, c["code"], us_rows),
        })

    sources = ["FRED (fredgraph.csv)", "worldgovernmentbonds.com (Playwright)", "Yahoo Finance (yfinance)"]
    return {
        "countries": countries_out,
        "us_10y": us_y,
        "updated_at": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC"),
        "data_sources": sources,
    }


# --- Country detail -------------------------------------------------------
# Reference tenors in display order (page-detail bundle: 1M-30Y)
_TENOR_ORDER = ["1M", "3M", "6M", "1Y", "2Y", "3Y", "4Y", "5Y", "7Y", "10Y", "12Y", "14Y", "15Y", "16Y", "20Y", "30Y"]


def build_country_detail(code: str) -> dict | None:
    """Per-country detail payload for /api/countries/{code}: country meta,
    full yield curve (all tenors we can fetch), risk scorecard + components,
    60-day trend, us10 benchmark and mini stat cards (fx + policy + cpi)."""
    meta = next((c for c in COUNTRIES if c["code"] == code.upper()), None)
    if not meta:
        return None

    # Full yield table: FRED tenors (IRLTLT01 is 10Y only — use wgb table for
    # the curve; FRED fills 10Y when wgb lacks it)
    table = _wgb_yields(meta["slug"])
    asof = datetime.now(timezone.utc).strftime("%Y-%m-%d") if table else None
    if meta.get("fred"):
        rows = _fred_series(meta["fred"])
        if rows and "10Y" not in table:
            table["10Y"] = {"yield": rows[-1][1], "chg_1m_bp": None}
            asof = rows[-1][0]

    # us10 benchmark (reuse the shared macro dashboard cache when warm)
    us_meta = next(c for c in COUNTRIES if c["code"] == "US")
    us_rows, us_asof, _ = _yield_rows("US", us_meta)
    us10 = us_rows[-1][1] if us_rows else None

    # Risk score from the same formula as the overview
    y10 = table.get("10Y", {}).get("yield")
    chg_bp = table.get("10Y", {}).get("chg_1m_bp")
    stale = code.upper() == "RU" and asof is not None and asof.startswith("201")
    score = None
    components = None
    if y10 is not None and us10 is not None:
        ylv = _yield_level_score(y10, us10)
        mom = _momentum_score(chg_bp)
        fx = _fx_score(_FX[code.upper()])
        fr = 5.0 if stale else 0.0
        score = round(ylv + mom + fx + fr, 1)
        components = {
            "yield_level": round(ylv, 1),
            "yield_momentum": round(mom, 1),
            "fx_depreciation": round(fx, 1),
            "data_freshness": round(fr, 1),
        }

    # 60-day trend: FRED countries recompute from yield history; wgb countries
    # have a single point (score snapshots accumulate over time)
    trend: list[dict] = []
    if meta.get("fred"):
        fred_rows = _fred_series(meta["fred"])
        if fred_rows and us_rows:
            trend = _trend_points(fred_rows, code.upper(), us_rows)

    # Mini stat cards: fx (3M change), policy rate + cpi from macro_service
    # shared cache when available (never fabricated — None renders "—")
    mini: list[dict] = []

    # FX mini card via yfinance (same as the fx component)
    fx_value = None
    fx_chg_pct = None
    try:
        h = yf.Ticker(f"{_FX[code.upper()]}=X").history(period="3mo")
        if len(h) >= 10:
            fx_value = round(float(h["Close"].iloc[-1]), 4)
            fx_chg_pct = round((float(h["Close"].iloc[-1]) / float(h["Close"].iloc[0]) - 1) * 100, 2)
    except Exception:
        pass
    mini.append({
        "series_id": "fx_" + _FX[code.upper()].lower(),
        "name_th": f"ค่าเงิน ({_FX[code.upper()]}/USD)",
        "unit": _FX[code.upper()],
        "value": fx_value,
        "change_pct": fx_chg_pct,
    })

    # Yield curve points in reference tenor order
    curve = [
        {"tenor": t, "value": table[t]["yield"]}
        for t in _TENOR_ORDER if t in table
    ]
    bps_vs_us = None
    if code.upper() != "US" and y10 is not None and us10 is not None:
        bps_vs_us = round((y10 - us10) * 100, 0)

    return {
        "country": {
            "code": meta["code"],
            "name_en": meta["name_en"],
            "name_th": meta["name_th"],
            "currency": meta["currency"],
            "flag": meta["flag"],
            "data_tier": meta["data_tier"],
            "data_tier_note_th": DATA_TIER_NOTE_TH.get(meta["data_tier"], ""),
        },
        "yield_curve": curve,
        "yield_asof": asof,
        "yield_stale": stale,
        "risk": {
            "score": score,
            "level": _level(score) if score is not None else None,
            "components": components,
            "updated_at": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC"),
        },
        "trend": trend,
        "us10": us10,
        "bps_vs_us": bps_vs_us,
        "mini_cards": mini,
    }
