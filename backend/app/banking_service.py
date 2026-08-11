# backend/app/banking_service.py
"""Banking Stress payload for the Bond-crisis "วิกฤตแบงก์รัน" tab — mirrors
the reference site's /banking page.

Everything here reuses data the app already fetches:
- funding cards (SOFR/EFFR/OBFR/SOFR-EFFR spread), deposits, discount window
  come from macro_service.build_dashboard() (shared 10-min cache — never a
  second fetch of the same series)
- the stress gauge IS the bank-run regime-model score (0-100) from
  model_service.build_models() — user decision 2026-08-09
- KRE / ^BKX prices come from yfinance (surveyed in
  docs/research/kre-bkx-price-source-2026-08-09.md)
- the two history charts are computed from FRED raw rows: deposit-flow WoW %
  (DPSACBW027SBOG is weekly) and SOFR-EFFR bps (SOFR/DFF are daily)

Never fabricates: a missing series is None and renders "—".
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any

import yfinance as yf

from app import macro_service, model_service

# Reference gauge zones (banking/page-6940680eefeb1371.js).
GAUGE_ZONES: list[dict] = [
    {"max": 40, "color": "#10b981"},
    {"max": 70, "color": "#f59e0b"},
    {"max": 100, "color": "#ef4444"},
]

# Chart windows, matching the reference (60 points each).
DEPOSIT_WEEKS = 60
SPREAD_DAYS = 60

_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _card_by_sid(dash: dict, sid: str) -> dict | None:
    for section in dash["sections"]:
        for item in section["items"]:
            if item.get("series_id") == sid:
                return item
    return None


def _fred_rows(sid: str) -> list[tuple[str, float]] | None:
    """Raw FRED rows (date, value) for a series, from the shared fetch."""
    meta = macro_service._SERIES.get(sid)
    if not meta or not meta.get("fred"):
        return None
    return macro_service._fetch_fred_series(meta["fred"])


def _weekly_wow_pct(rows: list[tuple[str, float]] | None, scale: float | None = None) -> list[dict]:
    """WoW % change per week from a weekly series, oldest -> newest.

    Each point: {date, value} where value is (this_week - last_week)/last_week*100.
    """
    if not rows:
        return []
    scaled = macro_service._scale_rows(rows, scale)
    out: list[dict] = []
    for i in range(1, len(scaled)):
        prev = scaled[i - 1][1]
        if prev not in (None, 0):
            out.append({
                "date": scaled[i][0],
                "value": round((scaled[i][1] - prev) / prev * 100, 2),
            })
    return out[-DEPOSIT_WEEKS:]


def _daily_spread_bps(sofr: list[tuple[str, float]] | None, effr: list[tuple[str, float]] | None) -> list[dict]:
    """SOFR - EFFR in bps per day, oldest -> newest, last 60 points."""
    if not sofr or not effr:
        return []
    effr_map = {d: v for d, v in effr}
    out: list[dict] = []
    for d, v in sofr:
        e = effr_map.get(d)
        if e is not None:
            out.append({"date": d, "value": round((v - e) * 100, 2)})
    return out[-SPREAD_DAYS:]


def _bank_prices() -> dict[str, dict | None]:
    """Bank stocks + ETFs: price + 1D change via yfinance.

    Surveyed 2026-08-09. The reference /banking page shows a 10-name table:
    ^BKX/KBE/KRE ETFs + FITB/HBAN/KEY/RF/TFC/USB/WAL/ZION individual banks.
    One retry: on a cold dashboard build the macro fetcher pulls ~8 yfinance
    tickers at once, and Yahoo rate-limits the first attempt — a single retry
    after a short pause gets the price without slowing the page.
    """
    out: dict[str, dict | None] = {}
    for sym in ("^BKX", "KBE", "KRE", "FITB", "HBAN", "KEY", "RF", "TFC", "USB", "WAL", "ZION"):
        price = None
        for attempt in range(3):
            try:
                h = yf.Ticker(sym).history(period="5d")
                if len(h) < 2:
                    time.sleep(2.0)
                    continue
                last = float(h["Close"].iloc[-1])
                prev = float(h["Close"].iloc[-2])
                price = {
                    "price": round(last, 2),
                    "change_pct": round((last - prev) / prev * 100, 2),
                }
                break
            except Exception as exc:
                print(f"[banking] {sym} attempt {attempt}: {type(exc).__name__}: {str(exc)[:160]}", flush=True)
                time.sleep(2.0)
        out[sym] = price
    return out


# ---------------------------------------------------------------------------
# Payload assembly
# ---------------------------------------------------------------------------
_BANK_STOCKS_CACHE_KEY = "banking:bank_stocks"
_BANK_STOCKS_CACHE_TTL = 600  # 10 min — yfinance rate-limits Vercel egress hard


def _bank_stocks_cached() -> dict[str, dict | None]:
    """_bank_prices with a 10-min cache so the 11 yfinance tickers are not
    re-fetched on every /api/banking call (Vercel egress rate-limits Yahoo —
    measured: 11/11 locally in 3.2s, 0/11 from Vercel when racing the macro
    dashboard's own yfinance wave). Empty results are NOT cached so a
    rate-limited first attempt retries on the next call."""
    from app.cache import cache_get, cache_set
    cached = cache_get(_BANK_STOCKS_CACHE_KEY)
    if cached is not None:
        return cached
    prices = _bank_prices()
    if any(v is not None for v in prices.values()):
        cache_set(_BANK_STOCKS_CACHE_KEY, prices, _BANK_STOCKS_CACHE_TTL)
    return prices


def build_banking() -> dict:
    """Assemble the /api/banking payload. Uses the shared macro dashboard
    cache + model scores; only bank stocks and the two history fetches are new."""
    dash = macro_service.build_dashboard()
    models = model_service.build_models()

    bank_run = next((m for m in models["models"] if m["model_id"] == "bank-run"), None)
    bank_run_meta = next((m for m in models["meta"] if m["model_id"] == "bank-run"), None)

    funding_sids = ["us_sofr", "us_effr", "us_obfr", "us_sofr_effr_spread"]
    funding = []
    for sid in funding_sids:
        card = _card_by_sid(dash, sid)
        funding.append({
            "series_id": sid,
            "name_th": card["name_th"] if card else None,
            "name_en": card["name_en"] if card else None,
            "unit": card["unit"] if card else None,
            "value": card["value"] if card else None,
            "change_bps": round(card["change_val"] * 100, 1) if card and card.get("change_val") is not None else None,
            "recorded_at": card["recorded_at"] if card else None,
            "available": bool(card and card.get("available")),
        })

    def _stat(sid: str) -> dict:
        card = _card_by_sid(dash, sid)
        return {
            "series_id": sid,
            "value": card["value"] if card else None,
            "change_pct": card.get("change_pct") if card else None,
            "recorded_at": card["recorded_at"] if card else None,
            "available": bool(card and card.get("available")),
        }

    # History fetches run in parallel with the cached price fetch.
    with ThreadPoolExecutor(max_workers=3) as pool:
        dep_fut = pool.submit(_fred_rows, "us_bank_deposits")
        sofr_fut = pool.submit(_fred_rows, "us_sofr")
        effr_fut = pool.submit(_fred_rows, "us_effr")
        prices_fut = pool.submit(_bank_stocks_cached)
        dep_rows = dep_fut.result()
        sofr_rows = sofr_fut.result()
        effr_rows = effr_fut.result()
        prices = prices_fut.result()

    deposit_scale = macro_service._SERIES["us_bank_deposits"].get("scale")

    gauge = {
        "value": bank_run["score"] if bank_run else None,
        "status": bank_run["status"] if bank_run else None,
        "zones": GAUGE_ZONES,
        "partial_inputs": False,  # the bank-run model scores from live inputs
        "recorded_at": models.get("updated_at"),
    }

    sources = list(dict.fromkeys(dash.get("data_sources", []) + ["Yahoo Finance (yfinance)"]))
    if bank_run:
        sources.append("Bank-run regime model (computed)")

    return {
        "funding": funding,
        "stat_cards": {
            "us_bank_deposits": _stat("us_bank_deposits"),
            "us_discount_window": _stat("us_discount_window"),
            "kre": prices.get("KRE"),
            "bkx": prices.get("^BKX"),
        },
        "bank_stocks": [
            {"symbol": sym, **p} for sym, p in prices.items() if p is not None
        ],
        "gauge": gauge,
        "deposit_flow": _weekly_wow_pct(dep_rows, deposit_scale),
        "sofr_effr_spread": _daily_spread_bps(sofr_rows, effr_rows),
        "model": {
            "model_id": "bank-run",
            "score": bank_run["score"] if bank_run else None,
            "status": bank_run["status"] if bank_run else None,
            "name_th": bank_run_meta["name_th"] if bank_run_meta else None,
            "name_en": bank_run_meta["name_en"] if bank_run_meta else None,
            "concept_th": bank_run_meta["concept_th"] if bank_run_meta else None,
            "trade_direction": bank_run_meta["trade_direction"] if bank_run_meta else None,
            "regime_th": bank_run_meta["regime_th"] if bank_run_meta else None,
            "color": bank_run_meta["color"] if bank_run_meta else None,
        },
        "updated_at": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC"),
        "data_sources": sources,
    }
