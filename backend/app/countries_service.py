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

import asyncio
import re
import time
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
    """Locate the headless Chromium for Playwright, cross-platform:
    the ms-playwright dir on the host (chromium-1208), or the image-installed
    browser in the container (/root/.cache/ms-playwright, version may differ)."""
    import glob
    import os
    from pathlib import Path

    candidates: list[str] = []

    def add(base: Path) -> None:
        for ver_dir in sorted(glob.glob(str(base / "chromium-*"))):
            candidates.append(str(Path(ver_dir) / "chrome-win64" / "chrome.exe"))
            candidates.append(str(Path(ver_dir) / "chrome-linux" / "chrome"))
            candidates.append(str(Path(ver_dir) / "chrome-linux64" / "chrome"))  # newer playwright
            candidates.append(str(Path(ver_dir) / "chrome-mac" / "Chromium.app" / "Contents" / "MacOS" / "Chromium"))
        for ver_dir in sorted(glob.glob(str(base / "chromium_headless_shell-*"))):
            candidates.append(str(Path(ver_dir) / "chrome-win64" / "headless_shell.exe"))
            candidates.append(str(Path(ver_dir) / "chrome-linux" / "headless_shell"))
            candidates.append(str(Path(ver_dir) / "chrome-linux64" / "headless_shell"))
            candidates.append(str(Path(ver_dir) / "chrome-mac" / "headless_shell"))

    env_path = os.environ.get("PLAYWRIGHT_BROWSERS_PATH")
    if env_path:
        add(Path(env_path))
    add(Path("/root/.cache/ms-playwright"))   # container (playwright install default)
    add(Path.home() / "AppData" / "Local" / "ms-playwright")  # Windows host
    for c in candidates:
        if os.path.exists(c):
            return c
    return None


_CHROME = _chromium_path()
_FRED_WINDOW = 400  # days, same as macro_service


# --- Yield fetch -----------------------------------------------------------
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
    """(10Y yield, 1M change bp, asof) from worldgovernmentbonds via Playwright."""
    chrome = _CHROME
    if not chrome:
        return (None, None, None)
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, executable_path=chrome)
            page = browser.new_page()
            try:
                page.goto(f"https://www.worldgovernmentbonds.com/country/{slug}/",
                          timeout=45000, wait_until="domcontentloaded")
                page.wait_for_timeout(2500)
                rows = page.eval_on_selector_all(
                    "table tr",
                    "els => els.map(e => e.innerText).filter(t => /^\\s*10 years/.test(t))")
                if not rows:
                    return (None, None, None)
                cells = [c.strip() for c in rows[0].split("\t") if c.strip()]
                y = float(cells[1].rstrip("%")) if len(cells) > 1 else None
                chg = None
                if len(cells) > 2:
                    m = re.match(r"([+-]?[\d.]+)", cells[2])
                    if m:
                        chg = float(m.group(1))
                return (y, chg, datetime.now(timezone.utc).strftime("%Y-%m-%d"))
            finally:
                browser.close()
    except Exception:
        return (None, None, None)


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
