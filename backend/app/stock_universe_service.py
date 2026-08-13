"""S&P 500 trading universe for the AI trade desk — cash equity, no leverage.

The desk used to trade Hyperliquid crypto perps. It now trades US individual
stocks (user decision 2026-08-13), so this module replaces the perp universe:

  - constituents come from the Wikipedia S&P 500 table (503 rows, no API key)
  - prices and history come from yfinance, already a project dependency
  - TA is computed from REAL daily bars

That last point is a change in kind, not degree. hyperliquid_service estimates
its indicators from the 24h change alone — `ma_short = mark * (1 - prev/200)`
is labelled a "rough MA20 estimate" but is a function of one number, so its
"golden cross" and "ATR" carry no analytical content. With daily bars we can
compute a real MA20/MA50, a real ATR14, and a real 52-week position.

Cash equity means no funding rate and no liquidation price; positions are
shares bought with cash. Anything the perp UI showed for those is dropped
rather than simulated, so nothing on screen is a number we made up.
"""
from __future__ import annotations

import io
import math
from datetime import datetime, timezone
from typing import Any

import httpx

from app.cache import cache_get, cache_set

SP500_WIKI_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
_HEADERS = {"User-Agent": "portfolio-tracker/1.0 (personal portfolio web app)"}
_TIMEOUT = 30

_CONSTITUENTS_KEY = "stock_universe:sp500_constituents"
_CONSTITUENTS_TTL = 24 * 3600          # the index changes a few times a year
_MARKETS_KEY = "stock_universe:markets"
_MARKETS_TTL = 10 * 60                 # prices; the desk ticks every 10 min

# Tier by 30-day average dollar volume — how easily a position can be exited.
_TIER1_DOLLAR_VOLUME = 1_000_000_000   # mega-cap, always liquid
_TIER2_DOLLAR_VOLUME = 200_000_000


def fetch_sp500_constituents() -> list[dict]:
    """[{symbol, name, sector}] for the current S&P 500, cached for a day."""
    cached = cache_get(_CONSTITUENTS_KEY)
    if cached:
        return cached

    import pandas as pd

    response = httpx.get(SP500_WIKI_URL, headers=_HEADERS, timeout=_TIMEOUT,
                         follow_redirects=True)
    if response.status_code != 200:
        return cache_get(_CONSTITUENTS_KEY) or []
    table = pd.read_html(io.StringIO(response.text))[0]

    rows = []
    for _, row in table.iterrows():
        symbol = str(row.get("Symbol", "")).strip().upper()
        if not symbol or symbol == "NAN":
            continue
        rows.append({
            # Wikipedia writes class shares as BRK.B; yfinance wants BRK-B
            "symbol": symbol.replace(".", "-"),
            "name": str(row.get("Security", "")).strip() or None,
            "sector": str(row.get("GICS Sector", "")).strip() or None,
        })
    if rows:
        cache_set(_CONSTITUENTS_KEY, rows, _CONSTITUENTS_TTL)
    return rows


def _sma(values: list[float], window: int) -> float | None:
    if len(values) < window:
        return None
    return sum(values[-window:]) / window


def _atr(highs: list[float], lows: list[float], closes: list[float],
         window: int = 14) -> float | None:
    """Average true range — real, from bars, not estimated from a daily move."""
    if len(closes) < window + 1:
        return None
    trs = []
    for i in range(len(closes) - window, len(closes)):
        true_range = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
        trs.append(true_range)
    return sum(trs) / len(trs) if trs else None


def compute_ta(highs: list[float], lows: list[float], closes: list[float],
               volumes: list[float]) -> dict:
    """Signals, score and arrow from real daily bars.

    Signal names mirror the reference dashboard so the two read alike, but each
    one here is backed by an actual calculation. Score is bounded to [-30, 30];
    the arrow summarises it for the table.
    """
    empty = {"signals": [], "score": 0, "arrow": "·"}
    if len(closes) < 25:
        return empty

    last = closes[-1]
    ma20 = _sma(closes, 20)
    ma50 = _sma(closes, 50)
    atr14 = _atr(highs, lows, closes, 14)
    if not last or ma20 is None or not atr14:
        return empty

    signals: list[str] = []
    score = 0

    # Trend: distance from MA20 measured in ATRs, so it is comparable across
    # a $9 stock and a $900 one.
    atrs_from_ma = (last - ma20) / atr14
    strength = min(12, int(abs(atrs_from_ma) * 4))
    if atrs_from_ma > 0.25:
        signals.append(f"bull trend+{strength}")
        score += strength
    elif atrs_from_ma < -0.25:
        signals.append(f"bear trend-{strength}")
        score -= strength

    # Moving-average cross, on the two averages themselves
    if ma50 is not None:
        gap_pct = (ma20 - ma50) / ma50 * 100
        if gap_pct > 0.5:
            points = min(10, int(gap_pct * 2))
            signals.append(f"ma golden cros+{points}")
            score += points
        elif gap_pct < -0.5:
            points = min(10, int(abs(gap_pct) * 2))
            signals.append(f"ma death cross-{points}")
            score -= points

    # Pullback inside a trend: price dipped under MA20 while MA20 > MA50
    if ma50 is not None and ma20 > ma50 and last < ma20:
        signals.append("bull pullback +8")
        score += 8

    # Range: 20-day span narrow relative to ATR
    window_high, window_low = max(closes[-20:]), min(closes[-20:])
    span = window_high - window_low
    if span and span / atr14 < 4:
        position = (last - window_low) / span if span else 0.5
        if position > 0.8:
            signals.append("box top-5")
            score -= 5
        elif position < 0.2:
            signals.append("box bottom+10")
            score += 10

    # Volume expansion on an up day
    if len(volumes) >= 21 and volumes[-1]:
        avg_volume = sum(volumes[-21:-1]) / 20
        if avg_volume and volumes[-1] > avg_volume * 1.5 and last > closes[-2]:
            signals.append("vol expansion+8")
            score += 8

    score = max(-30, min(30, score))
    arrow = "↑" if score >= 8 else "↓" if score <= -8 else "↔" if signals else "·"
    return {"signals": signals, "score": score, "arrow": arrow}


def _tier(dollar_volume: float | None) -> int:
    if dollar_volume is None:
        return 3
    if dollar_volume >= _TIER1_DOLLAR_VOLUME:
        return 1
    if dollar_volume >= _TIER2_DOLLAR_VOLUME:
        return 2
    return 3


def _series(frame: Any, ticker: str, column: str) -> list[float]:
    try:
        values = frame[ticker][column].dropna().tolist()
    except Exception:
        return []
    return [float(v) for v in values if v == v and v is not None]


def build_markets(force: bool = False) -> dict:
    """The tradable universe with prices and TA. Cached; safe to call per tick."""
    if not force:
        cached = cache_get(_MARKETS_KEY)
        if cached:
            return cached

    constituents = fetch_sp500_constituents()
    if not constituents:
        return {"markets": [], "total": 0, "by_sector": {}, "updated_at": None}

    import yfinance as yf

    symbols = [c["symbol"] for c in constituents]
    frame = yf.download(" ".join(symbols), period="6mo", interval="1d",
                        group_by="ticker", progress=False, threads=True,
                        auto_adjust=True)

    markets: list[dict] = []
    for entry in constituents:
        symbol = entry["symbol"]
        closes = _series(frame, symbol, "Close")
        if len(closes) < 2:
            continue
        highs = _series(frame, symbol, "High")
        lows = _series(frame, symbol, "Low")
        volumes = _series(frame, symbol, "Volume")

        price = closes[-1]
        prev = closes[-2]
        change_pct = round((price - prev) / prev * 100, 2) if prev else None
        dollar_volume = (
            sum(c * v for c, v in zip(closes[-30:], volumes[-30:])) / min(30, len(volumes))
            if volumes else None)

        ta = compute_ta(highs, lows, closes, volumes)
        markets.append({
            "symbol": symbol,
            "name": entry["name"],
            "sector": entry["sector"],
            "price": round(price, 2),
            "change_24h_pct": change_pct,
            "dollar_volume": round(dollar_volume) if dollar_volume else None,
            "ta_signals": ta["signals"],
            "ta_score": ta["score"],
            "ta_arrow": ta["arrow"],
            "tier": _tier(dollar_volume),
        })

    markets.sort(key=lambda m: m["dollar_volume"] or 0, reverse=True)
    by_sector: dict[str, int] = {}
    for market in markets:
        sector = market["sector"] or "อื่นๆ"
        by_sector[sector] = by_sector.get(sector, 0) + 1

    payload = {
        "markets": markets,
        "total": len(markets),
        "by_sector": by_sector,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if markets:
        cache_set(_MARKETS_KEY, payload, _MARKETS_TTL)
    return payload
