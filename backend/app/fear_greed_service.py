# backend/app/fear_greed_service.py
"""Fear & Greed index for the Tools page.

Two sources, in precedence order:

  1. CNN's own Fear & Greed data (production.dataviz.cnn.io). This is the index people
     actually mean when they say "the Fear & Greed index" -- all seven of its component
     indicators, its exact score, and a year of history. It is an undocumented endpoint
     behind CNN's site rather than a published API, so it is used but never depended on.

  2. A smaller index computed here from yfinance market data, used only when CNN is
     unreachable. It is NOT a reproduction of CNN's number: three of CNN's seven inputs
     (stock price strength, breadth, put/call) need whole-market NYSE breadth data that
     has no free source, so this composite uses the four that are computable. The score
     will differ from CNN's, and every response says which source produced it so the UI
     can tell the user plainly rather than passing one off as the other.

The 0-100 -> label bands are CNN's own, confirmed against live API output on 2026-08-08
(32.2 -> fear, 50.0 -> neutral, 63.7 -> greed, 79.8 -> extreme greed).
"""
from datetime import datetime, timezone
from typing import Any

import httpx

CNN_GRAPHDATA_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
# CNN's edge rejects non-browser clients; this mirrors what their own page sends.
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://edition.cnn.com/",
}
_TIMEOUT_SECONDS = 12

RATING_EXTREME_FEAR = "extreme fear"
RATING_FEAR = "fear"
RATING_NEUTRAL = "neutral"
RATING_GREED = "greed"
RATING_EXTREME_GREED = "extreme greed"


def rating_for_score(score: float | None) -> str | None:
    if score is None:
        return None
    if score < 25:
        return RATING_EXTREME_FEAR
    if score < 45:
        return RATING_FEAR
    if score <= 55:
        return RATING_NEUTRAL
    if score <= 75:
        return RATING_GREED
    return RATING_EXTREME_GREED


# CNN's block key -> (our key, display label). Explicit rather than derived, so a rename
# upstream shows up as one missing card instead of silently reshaping the whole section.
CNN_INDICATORS: list[tuple[str, str, str]] = [
    ("market_momentum_sp500", "market_momentum", "Market Momentum (S&P 500 vs 125-day avg)"),
    ("stock_price_strength", "stock_price_strength", "Stock Price Strength (52-wk highs vs lows)"),
    ("stock_price_breadth", "stock_price_breadth", "Stock Price Breadth (advancing vs declining volume)"),
    ("put_call_options", "put_call_options", "Put and Call Options (5-day ratio)"),
    ("market_volatility_vix", "market_volatility", "Market Volatility (VIX vs 50-day avg)"),
    ("safe_haven_demand", "safe_haven_demand", "Safe Haven Demand (stocks vs bonds)"),
    ("junk_bond_demand", "junk_bond_demand", "Junk Bond Demand (yield spread)"),
]

# How many trailing points of each indicator's own series to keep. CNN ships ~250 (a
# year); the cards render sparklines, so a quarter is plenty and keeps the payload small.
_INDICATOR_SERIES_POINTS = 60


def _num(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if out == out else None


def _series(raw: Any, keep: int | None = None) -> list[dict]:
    """CNN points are {x: epoch_ms, y: value, rating: ...}. The per-point `rating` is not
    carried through: it disagrees with the block-level rating in live data (a VIX of 14.9
    -- a calm reading -- was tagged "extreme fear"), so surfacing it would show the user a
    label the data does not support."""
    if not isinstance(raw, list):
        return []
    points = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        t, y = _num(item.get("x")), _num(item.get("y"))
        if t is None or y is None:
            continue
        points.append({"t": int(t), "value": y})
    return points[-keep:] if keep else points


def fetch_cnn() -> dict | None:
    """Returns the parsed CNN index, or None if it is unreachable or unrecognisable."""
    try:
        response = httpx.get(CNN_GRAPHDATA_URL, headers=_HEADERS, timeout=_TIMEOUT_SECONDS, follow_redirects=True)
        if response.status_code != 200:
            return None
        payload = response.json()
    except Exception:
        return None

    if not isinstance(payload, dict):
        return None
    current = payload.get("fear_and_greed")
    if not isinstance(current, dict):
        return None
    score = _num(current.get("score"))
    if score is None:
        return None

    indicators = []
    for cnn_key, our_key, label in CNN_INDICATORS:
        block = payload.get(cnn_key)
        if not isinstance(block, dict):
            continue
        block_score = _num(block.get("score"))
        series = _series(block.get("data"), _INDICATOR_SERIES_POINTS)
        indicators.append(
            {
                "key": our_key,
                "label": label,
                "score": block_score,
                "rating": block.get("rating") or rating_for_score(block_score),
                "latest_value": series[-1]["value"] if series else None,
                "series": series,
            }
        )

    historical = payload.get("fear_and_greed_historical")
    history = _series(historical.get("data")) if isinstance(historical, dict) else []

    return {
        "score": score,
        "rating": current.get("rating") or rating_for_score(score),
        "updated_at": str(current.get("timestamp") or ""),
        "previous_close": _num(current.get("previous_close")),
        "previous_1_week": _num(current.get("previous_1_week")),
        "previous_1_month": _num(current.get("previous_1_month")),
        "previous_1_year": _num(current.get("previous_1_year")),
        "history": history,
        "indicators": indicators,
        "crypto_fear_greed": _fetch_crypto_fg(),
        "source": "cnn",
    }


# --- Crypto Fear & Greed (alternative.me — free, no key) ------------------------------
# The reference /sentiment page shows both the CNN index and the crypto index.

CRYPTO_FG_URL = "https://api.alternative.me/fng/"


def _fetch_crypto_fg() -> dict | None:
    """Crypto Fear & Greed index from alternative.me (free public API)."""
    try:
        response = httpx.get(CRYPTO_FG_URL, params={"limit": 2}, timeout=15)
        if response.status_code != 200:
            return None
        rows = (response.json().get("data") or []) if isinstance(response.json(), dict) else []
        if not rows:
            return None
        latest = rows[0]
        score = _num(latest.get("value"))
        return {
            "score": score,
            "rating": latest.get("value_classification") or rating_for_score(score),
            "updated_at": str(latest.get("timestamp") or ""),
            "previous": _num(rows[1].get("value")) if len(rows) > 1 else None,
        }
    except Exception:
        return None


# --- Fallback: a smaller index computed from real market data ------------------------
#
# Scoring thresholds below are this codebase's own choices, not CNN's (whose formulas are
# not published). Each maps a real market reading onto 0-100 where 50 is neutral, and each
# is clamped rather than left unbounded so one extreme input cannot dominate the mean.

_MOMENTUM_SMA_DAYS = 125
_VOLATILITY_SMA_DAYS = 50
_RETURN_WINDOW_DAYS = 20

# A 10% deviation of the S&P from its 125-day average is treated as a full swing to one
# end. 5% was tried first and pegged at 100 against live data (the S&P sat 8.1% above its
# average, an ordinary bull-market reading) -- a scale that saturates in normal conditions
# stops carrying information.
_MOMENTUM_PCT_FOR_FULL_SWING = 10.0
# VIX 20% above/below its 50-day average is treated as a full swing (inverted: high = fear).
_VOLATILITY_RATIO_FOR_FULL_SWING = 0.20
# A 20pp gap in 20-day returns between stocks and bonds is a full swing.
_SAFE_HAVEN_SPREAD_FOR_FULL_SWING = 20.0
# A 5pp gap between junk and investment-grade bond returns is a full swing.
_JUNK_BOND_SPREAD_FOR_FULL_SWING = 5.0


def _clamp_score(value: float) -> float:
    return round(max(0.0, min(100.0, value)), 1)


def _sma(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    return sum(values[-period:]) / period


def _return_pct(values: list[float], window: int) -> float | None:
    if len(values) < window + 1:
        return None
    start = values[-(window + 1)]
    if start <= 0:
        return None
    return (values[-1] - start) / start * 100


def _closes(symbol: str, period: str = "1y") -> list[float]:
    try:
        import yfinance as yf

        history = yf.Ticker(symbol).history(period=period)
        if history is None or history.empty:
            return []
        return [float(v) for v in history["Close"].tolist()]
    except Exception:
        return []


def compute_fallback() -> dict | None:
    """A four-input composite from yfinance. Returns None if not even one input resolves,
    so the caller surfaces an error rather than an index built on nothing."""
    sp500 = _closes("^GSPC")
    vix = _closes("^VIX")
    spy = _closes("SPY")
    tlt = _closes("TLT")
    hyg = _closes("HYG")
    lqd = _closes("LQD")

    indicators: list[dict] = []

    def add(key: str, label: str, score: float | None, latest_value: float | None) -> None:
        if score is None:
            return
        indicators.append(
            {
                "key": key,
                "label": label,
                "score": score,
                "rating": rating_for_score(score),
                "latest_value": latest_value,
                "series": [],
            }
        )

    # 1. Market momentum -- S&P 500 above its long average reads as greed.
    momentum_sma = _sma(sp500, _MOMENTUM_SMA_DAYS)
    if momentum_sma and sp500:
        deviation_pct = (sp500[-1] - momentum_sma) / momentum_sma * 100
        add(
            "market_momentum",
            f"Market Momentum (S&P 500 vs {_MOMENTUM_SMA_DAYS}-day avg)",
            _clamp_score(50 + deviation_pct / _MOMENTUM_PCT_FOR_FULL_SWING * 50),
            round(deviation_pct, 2),
        )

    # 2. Volatility -- VIX above its own average reads as fear, so this one inverts.
    vix_sma = _sma(vix, _VOLATILITY_SMA_DAYS)
    if vix_sma and vix and vix_sma > 0:
        ratio_gap = (vix[-1] - vix_sma) / vix_sma
        add(
            "market_volatility",
            f"Market Volatility (VIX vs {_VOLATILITY_SMA_DAYS}-day avg)",
            _clamp_score(50 - ratio_gap / _VOLATILITY_RATIO_FOR_FULL_SWING * 50),
            round(vix[-1], 2),
        )

    # 3. Safe haven demand -- stocks outrunning treasuries reads as greed.
    spy_return = _return_pct(spy, _RETURN_WINDOW_DAYS)
    tlt_return = _return_pct(tlt, _RETURN_WINDOW_DAYS)
    if spy_return is not None and tlt_return is not None:
        spread = spy_return - tlt_return
        add(
            "safe_haven_demand",
            f"Safe Haven Demand (stocks vs bonds, {_RETURN_WINDOW_DAYS}d)",
            _clamp_score(50 + spread / _SAFE_HAVEN_SPREAD_FOR_FULL_SWING * 50),
            round(spread, 2),
        )

    # 4. Junk bond demand -- junk outrunning investment grade reads as risk appetite.
    hyg_return = _return_pct(hyg, _RETURN_WINDOW_DAYS)
    lqd_return = _return_pct(lqd, _RETURN_WINDOW_DAYS)
    if hyg_return is not None and lqd_return is not None:
        spread = hyg_return - lqd_return
        add(
            "junk_bond_demand",
            f"Junk Bond Demand (HYG vs LQD, {_RETURN_WINDOW_DAYS}d)",
            _clamp_score(50 + spread / _JUNK_BOND_SPREAD_FOR_FULL_SWING * 50),
            round(spread, 2),
        )

    if not indicators:
        return None

    composite = round(sum(i["score"] for i in indicators) / len(indicators), 2)

    return {
        "score": composite,
        "rating": rating_for_score(composite),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        # CNN supplies these comparison points; this composite has no stored history to
        # derive them from, so they stay absent rather than being back-filled with guesses.
        "previous_close": None,
        "previous_1_week": None,
        "previous_1_month": None,
        "previous_1_year": None,
        "history": [],
        "indicators": indicators,
        "source": "computed",
    }
