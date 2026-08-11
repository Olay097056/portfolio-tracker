"""Hyperliquid price feed service (multi-agent-trade-desk ticket 06).

Provides real-time market data for the trade desk's 122-market universe:
  - Crypto (40 markets)   — BTC, ETH, SOL, XRP, DOGE, ...
  - Stocks (65 markets)    — MSFT, NVDA, TSLA, PLTR, ...
  - Macro (15 markets)     — GOLD, CL, SP500, SILVER, ...
  - FX (2 markets)         — JPY, EUR

Data source: Hyperliquid public info API (free, no auth, validated 2026-08-07).
Cache: 60s TTL — Hyperliquid rate-limits are generous but we cache anyway.

Category mapping is opinionated — mirrors the reference site's groupings:
  - Symbols ending in -USD (no further match) → crypto
  - SP500, XYZ100, JP225, KR200 → macro (indices)
  - GOLD, SILVER, CL, BRENTOIL, NATGAS, COPPER, PLATINUM, XLE, EWY, EWJ, EWT → macro (commodities/ETFs)
  - JPY, EUR → FX
  - Everything else → stocks (single-name equity perps)
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

import httpx

# ── Hyperliquid API ──────────────────────────────────────────────────────────

HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info"
_TIMEOUT = 20  # seconds — generous for cold-function egress on Vercel


def _call(method: str, payload: dict) -> dict | list | None:
    """Single retry wrapper around the Hyperliquid info endpoint."""
    for attempt in range(2):
        try:
            r = httpx.post(HYPERLIQUID_INFO_URL, json=payload, timeout=_TIMEOUT)
            if r.status_code == 200:
                return r.json()
        except Exception:
            if attempt == 0:
                time.sleep(2)
    return None


# ── Category mapping ─────────────────────────────────────────────────────────

_CRYPTO_SYMBOLS = {  # known crypto — everything else -USD that isn't on another list
    "BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "LINK", "UNI", "NEAR",
    "TAO", "WLD", "LIT", "CRV", "PUMP", "ZEC", "XMR", "HYPE", "PAXG",
    "FARTCOIN", "CASHCAT",
}

_MACRO_SYMBOLS = set()   # Hyperliquid meta universe doesn't include GOLD/CL/SP500 —
_FX_SYMBOLS = set()      # those come from yfinance via the macro service.

_MACRO_TICKERS = {        # yfinance tickers for macro assets (used as fallback)
    "GOLD": "GC=F", "SILVER": "SI=F", "CL": "CL=F", "BRENTOIL": "BZ=F",
    "NATGAS": "NG=F", "COPPER": "HG=F", "PLATINUM": "PL=F",
    "SP500": "ES=F", "JP225": "NKD=F",
}
_FX_TICKERS = {           # yfinance tickers for FX (pairs inverted vs display)
    "JPY": "JPY=X", "EUR": "EUR=X",
}
# Stocks are everything that isn't in CRYPTO_SYMBOLS or -USD — determined
# by the _classify function dynamically.


def _classify(name: str) -> str:
    """Return the market category: 'crypto' | 'stocks' | 'macro' | 'fx'."""
    if name in _FX_SYMBOLS:
        return "fx"
    if name in _MACRO_SYMBOLS:
        return "macro"
    if name in _CRYPTO_SYMBOLS or name.endswith("-USD"):
        return "crypto"
    return "stocks"


# ── Market data ──────────────────────────────────────────────────────────────

# In-memory cache (module-level — cleared on cold start / function recycle)
_cache: dict | None = None
_cache_at: float = 0.0
_CACHE_TTL = 60  # seconds


def _fetch_raw() -> dict | None:
    """Fetch metadata + prices + funding from Hyperliquid. Returns merged dict."""
    meta = _call("meta", {"type": "meta"})
    ctx = _call("metaAndAssetCtxs", {"type": "metaAndAssetCtxs"})

    if not meta or not ctx:
        return None

    universe = meta.get("universe", [])
    # ctx = [universe_meta_dict, asset_ctxs_list] — asset_ctxs is the second element
    contexts = ctx[1] if isinstance(ctx, list) and len(ctx) >= 2 and isinstance(ctx[1], list) else []

    markets = []
    for i, u in enumerate(universe):
        name = u.get("name", "")
        if not name:
            continue
        category = _classify(name)
        asset_ctx = contexts[i] if i < len(contexts) else {}

        # 24h change
        prev_day = float(asset_ctx.get("prevDayPx", 0) or 0)
        mark = float(asset_ctx.get("markPx", 0) or 0)
        change_pct = round((mark - prev_day) / prev_day * 100, 2) if prev_day else None

        markets.append({
            "symbol": name,
            "category": category,
            "mark_price": mark or None,
            "mid_price": float(asset_ctx.get("midPx", 0) or 0) or None,
            "oracle_price": float(asset_ctx.get("oraclePx", 0) or 0) or None,
            "change_24h_pct": change_pct,
            "funding_rate": round(float(asset_ctx.get("funding", 0) or 0) * 100, 4) or None,
            "open_interest": float(asset_ctx.get("openInterest", 0) or 0) or None,
            "volume_24h": round(float(asset_ctx.get("dayNtlVlm", 0) or 0) / 1_000_000, 1) or None,  # $M
            "max_leverage": u.get("maxLeverage"),
        })

    return {
        "markets": markets,
        "total": len(markets),
        "by_category": {
            cat: len([m for m in markets if m["category"] == cat])
            for cat in ["crypto", "stocks", "macro", "fx"]
        },
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def get_markets(force: bool = False) -> dict | None:
    """Return the full market data, cached for 60s. None on failure."""
    global _cache, _cache_at
    now = time.monotonic()
    if not force and _cache is not None and (now - _cache_at) < _CACHE_TTL:
        return _cache
    data = _fetch_raw()
    if data is not None:
        _cache = data
        _cache_at = now
    return data


def get_market_by_symbol(symbol: str) -> dict | None:
    """Single-market lookup (uses cache)."""
    all_data = get_markets()
    if not all_data:
        return None
    for m in all_data["markets"]:
        if m["symbol"].upper() == symbol.upper():
            return m
    return None


def get_prices_for_symbols(symbols: list[str]) -> dict[str, dict | None]:
    """Bulk price lookup for trade desk context building."""
    all_data = get_markets()
    if not all_data:
        return {s: None for s in symbols}
    idx = {m["symbol"].upper(): m for m in all_data["markets"]}
    return {s.upper(): idx.get(s.upper()) for s in symbols}
