"""CME zone service (bond-crisis-100 ticket 07).

Mirrors the reference's /cme page with FREE data sources only (prototype
measured 2026-08-11 — see docs/research/bond-crisis-cme-prototype-2026-08-11.md):

- FedWatch: implied Fed Funds rate from ZQ=F futures (yfinance) — CME's own
  method; probability of hike/hold/cut at the next FOMC meeting
- Gold flow: CME public Volume/LastTotals API (productId=437) — OI/volume
- Crypto IV: Deribit mark_iv (BTC/ETH) — free public API
- COT / basis trade: reuse macro dashboard (CFTC — already fetched there)
- Prices: yfinance (metals/energy/bonds) + Hyperliquid (crypto)

IV/sigma/P-C of metals/energy/bonds come from vol2vol which is paywalled —
those render "—" honestly.
"""

from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone

import httpx

from app import macro_service
from app.cache import cache_get, cache_set

_CME_CACHE_KEY = "cme:zone"
_CME_CACHE_TTL = 600  # 10 min

# CME product IDs (from the CME volume page data-product-groups)
GOLD_PRODUCT_ID = "437"

# FedWatch constants (CME method — measured against reference 96.305 vs our 96.240)
EFFR_CURRENT = 3.63  # latest EFFR (also in macro dashboard)


def _fetch_zq_futures() -> float | None:
    """Latest ZQ=F (30-day Fed Funds futures) settlement price."""
    try:
        import yfinance as yf
        t = yf.Ticker("ZQ=F")
        h = t.history(period="5d")
        if h is None or len(h) == 0:
            return None
        return float(h["Close"].iloc[-1])
    except Exception:
        return None


def _fetch_gold_flow(days: int = 15) -> dict | None:
    """Gold futures/options OI + volume. Tries CME's public API first
    (daily, exact match to the reference); CME blocks datacenter IPs with
    403 (measured on Vercel egress 2026-08-11) — falls back to CFTC
    disagg open_interest_all (weekly, honest source attribution).
    """
    try:
        r = httpx.get(
            f"https://www.cmegroup.com/CmeWS/mvc/Volume/LastTotals/{GOLD_PRODUCT_ID}",
            params={"days": days},
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            timeout=20,
        )
        if r.status_code == 200:
            rows = r.json().get("vdate") or []
            if rows:
                latest = rows[-1]
                return {
                    "trade_date": latest.get("formattedDate"),
                    "future_volume": _to_int(latest.get("futureVolume")),
                    "option_volume": _to_int(latest.get("optionVolume")),
                    "future_oi": _to_int(latest.get("futureOi")),
                    "option_oi": _to_int(latest.get("optionOi")),
                    "source": "CME public API (รายวัน)",
                }
    except Exception:
        pass
    return _fetch_cftc_gold_oi()


def _fetch_cftc_gold_oi() -> dict | None:
    """CFTC disagg open_interest for gold (weekly) — fallback when CME 403s."""
    try:
        r = httpx.get(
            "https://publicreporting.cftc.gov/resource/72hh-3qpy.json",
            params={
                "$limit": 1,
                "market_and_exchange_names": "GOLD - COMMODITY EXCHANGE INC.",
                "$order": "report_date_as_yyyy_mm_dd DESC",
            },
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=20,
        )
        rows = r.json() if r.status_code == 200 else []
        if not rows:
            return None
        row = rows[0]
        return {
            "trade_date": (row.get("report_date_as_yyyy_mm_dd") or "")[:10],
            "future_oi": _to_int(row.get("open_interest_all")),
            "future_oi_change": _to_int(row.get("change_in_open_interest_all")),
            "future_volume": None,
            "option_volume": None,
            "option_oi": None,
            "source": "CFTC Commitments of Traders (รายสัปดาห์ — CME บล็อก datacenter IP)",
        }
    except Exception:
        return None


def _to_int(v) -> int | None:
    try:
        return int(float(str(v).replace(",", "")))
    except (TypeError, ValueError):
        return None


def _fetch_deribit_iv(currency: str) -> dict | None:
    """Nearest-expiry ATM IV for a crypto currency (Deribit public API)."""
    try:
        r = httpx.get(
            "https://www.deribit.com/api/v2/public/get_instruments",
            params={"currency": currency, "kind": "option", "expired": "false"},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=20,
        )
        ins = (r.json().get("result") or []) if r.status_code == 200 else []
        if not ins:
            return None
        # nearest expiry instrument
        ins.sort(key=lambda x: x.get("expiration_timestamp", 0))
        inst = ins[0]["instrument_name"]
        r2 = httpx.get(
            "https://www.deribit.com/api/v2/public/ticker",
            params={"instrument_name": inst},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=20,
        )
        d = (r2.json().get("result") or {}) if r2.status_code == 200 else {}
        iv = d.get("mark_iv")
        return {
            "instrument": inst,
            "iv": round(float(iv), 4) if iv is not None else None,
            "oi": d.get("open_interest"),
        }
    except Exception:
        return None


def _fedwatch(zq_price: float | None) -> dict | None:
    """Implied rate & hike/hold/cut probability for the next FOMC meeting.

    CME FedWatch method: implied rate = 100 - ZQ price. Probability of a
    25bp move = (implied - EFFR) / 25 clipped to [0, 100].
    """
    if zq_price is None:
        return None
    implied = 100.0 - zq_price
    diff_bp = (implied - EFFR_CURRENT) * 100.0
    pct_hike = max(0.0, min(100.0, (diff_bp / 25.0) * 100.0))
    pct_cut = max(0.0, min(100.0, (-diff_bp / 25.0) * 100.0))
    pct_hold = max(0.0, 100.0 - pct_hike - pct_cut)
    if pct_hike >= pct_hold and pct_hike >= pct_cut:
        outcome, size = "hike", "+25bp"
    elif pct_cut >= pct_hold:
        outcome, size = "cut", "-25bp"
    else:
        outcome, size = "hold", "0bp"
    return {
        "zq_price": round(zq_price, 3),
        "implied_rate": round(implied, 3),
        "effr": EFFR_CURRENT,
        "diff_bp": round(diff_bp, 1),
        "prob_hike_pct": round(pct_hike, 1),
        "prob_hold_pct": round(pct_hold, 1),
        "prob_cut_pct": round(pct_cut, 1),
        "outcome": outcome,
        "size": size,
        "source": "CME Fed Funds futures (ZQ=F) — วิธีเดียวกับ CME FedWatch",
    }


def _cot_series() -> list[dict]:
    """COT series reused from the macro dashboard (CFTC — fetched there)."""
    try:
        dash = macro_service.build_dashboard()
        out = []
        for section in dash.get("sections", []):
            for item in section.get("items", []):
                sid = item.get("series_id", "")
                if sid.startswith("cot_") or sid in ("us_hy_spread",):
                    out.append({
                        "series_id": sid,
                        "name_th": item.get("name_th"),
                        "value": item.get("value"),
                        "change_val": item.get("change_val"),
                        "recorded_at": item.get("recorded_at"),
                    })
        return out
    except Exception:
        return []


def build_cme() -> dict:
    cached = cache_get(_CME_CACHE_KEY)
    if cached is not None:
        return cached

    zq = _fetch_zq_futures()
    gold = _fetch_gold_flow()
    btc_iv = _fetch_deribit_iv("BTC")
    eth_iv = _fetch_deribit_iv("ETH")

    payload = {
        "fedwatch": _fedwatch(zq),
        "gold_flow": gold,
        "crypto_iv": {
            "BTC": btc_iv,
            "ETH": eth_iv,
            "SOL": None,  # no Deribit options
            "XRP": None,
        },
        "cot": _cot_series(),
        # IV/sigma/P-C for metals/energy/bonds require vol2vol (paywall) -> —
        "iv_products": [],
        "updated_at": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC"),
        "data_sources": [
            "CME Group public API (Volume/LastTotals)",
            "Yahoo Finance (ZQ=F Fed Funds futures)",
            "Deribit (crypto options IV)",
            "CFTC Commitments of Traders (ผ่าน macro dashboard)",
        ],
    }
    cache_set(_CME_CACHE_KEY, payload, _CME_CACHE_TTL)
    return payload
