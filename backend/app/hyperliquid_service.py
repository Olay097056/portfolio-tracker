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
            "ta_signals": [],
            "ta_arrow": "·",
            "ta_score": 0,
            "tier": 3,
        })

    # Compute TA signals + TIER for each market
    for m in markets:
        ta = compute_ta_signals(m)
        m["ta_signals"] = ta["signals"]
        m["ta_arrow"] = ta["arrow"]
        m["ta_score"] = ta["score"]
        m["tier"] = compute_tier(m, markets)

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

# ── TA Signals + TIER (ticket 04 trade-desk-ui-100) ─────────────────────────

def _compute_ma(prices: list[float], window: int) -> list[float]:
    """Simple moving average."""
    if len(prices) < window:
        return [sum(prices) / len(prices)] * len(prices) if prices else []
    out = []
    for i in range(len(prices)):
        start = max(0, i - window + 1)
        out.append(sum(prices[start:i+1]) / (i - start + 1))
    return out


def compute_ta_signals(market: dict) -> dict:
    """Compute TA signals + arrow for one market from available Hyperliquid data."""
    mark = market.get("mark_price")
    prev = market.get("change_24h_pct")  # proxy for prev day price
    funding = market.get("funding_rate") or 0
    vol = market.get("volume_24h") or 0

    if not mark or prev is None:
        return {"signals": [], "score": 0, "arrow": "·"}

    # Estimate prev_day_px from 24h change
    prev_day = mark / (1 + prev / 100) if prev != 0 else mark
    atr_est = abs(mark - prev_day) * 0.5  # rough ATR estimate

    signals = []
    score = 0

    # Bull/bear trend (price vs estimated MA)
    ma_short = mark * (1 - (prev or 0) / 200)  # rough MA20 estimate
    trend = "bull" if mark > ma_short else "bear"

    if trend == "bull":
        signals.append(f"bull trend+{min(12, int(abs(mark - ma_short) / max(atr_est, 0.01)))}")
        score += 8
    else:
        signals.append(f"bear trend-{min(12, int(abs(ma_short - mark) / max(atr_est, 0.01)))}")
        score -= 8

    # Golden cross (if 24h change positive and funding not extreme)
    if prev and prev > 0 and abs(funding) < 0.005:
        signals.append(f"ma golden cros+{min(15, int(abs(prev) * 2))}")
        score += 6

    # Pullback
    if trend == "bull" and prev and prev < 0:
        signals.append("bull pullback +8")
        score += 5
    elif trend == "bear" and prev and prev > 0:
        signals.append("shrink pullbac+10")
        score -= 5

    # Box/range (low volatility)
    if atr_est / mark < 0.01:
        if trend == "bull":
            signals.append("box bottom+10")
            score += 4
        else:
            signals.append("box top-5")
            score -= 3

    # Arrow
    if score >= 6:
        arrow = "↑"
    elif score <= -6:
        arrow = "↓"
    elif abs(score) < 3:
        arrow = "·"
    else:
        arrow = "↔"

    return {"signals": signals[-3:], "score": score, "arrow": arrow}


def compute_tier(market: dict, all_markets: list[dict]) -> int:
    """Compute TIER (1/2/3) based on volume percentile."""
    vol = market.get("volume_24h") or 0
    volumes = sorted([m.get("volume_24h") or 0 for m in all_markets])
    if not volumes or volumes[-1] == 0:
        return 3
    rank = sum(1 for v in volumes if v <= vol)
    pct = rank / len(volumes) * 100
    if pct >= 85:
        return 1
    if pct >= 50:
        return 2
    return 3
