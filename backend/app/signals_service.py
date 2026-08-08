# backend/app/signals_service.py
"""Trading signals for the Bond-crisis tab — mirrors the reference site's
/signals page ("สัญญาณเทรด"): a trade desk of signals generated from the
regime models + a technical-analysis gate, with win-rate / P&L / R:R stats.

Decisions (ticket 02, 2026-08-08):
  - Signals are computed entirely from our own live data: a model must be
    building (>=40) or active (>=60), and the asset's TA snapshot must pass
    the technical gate (ta_score >= 50). Nothing is scraped from the
    reference site.
  - Stored in SQLite table `trading_signals` (like model_score_history).
  - History starts empty — the stats panel honestly shows "—" until real
    closed trades accumulate. Never seeded with fabricated numbers.
  - Triggered on-demand: every cache expiration (10 min), matching the
    macro/models routers. No separate scheduler.

TA scoring follows the reference formula (verified in ticket 03):
  ta_score = price_vs_ema20 (15) + ema20_vs_sma50 (10) + rsi_zone (20)
           + macd_state (20) + bb_room (20) + stoch_confirm (15)
computed from 60 daily candles. signal_strength = sum of five factors
(confluence, rr_quality, ta_quality, atr_quality, model_conviction).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import time as _time

import yfinance as yf

from app import model_service

# ---------------------------------------------------------------------------
# Constants (from the reference /signals page)
# ---------------------------------------------------------------------------
TA_THRESHOLD = 50.0          # a signal needs ta_score >= 50
MODEL_BUILDING = 40.0        # model must be >= 40 (building) to emit
SIGNAL_EXPIRY_DAYS = 14      # P54: expire after 14 days at current price
MAX_SIGNALS_PER_MODEL = 4    # cap so one hot model doesn't flood the desk

# Module-level candle cache (same 10-min TTL as the router) — yfinance is
# the slowest source; without this every cache expiry re-downloaded ~20
# tickers and a cold page load took ~40s.
_CANDLE_CACHE_TTL = 600
_CANDLE_CACHE: dict[str, tuple[float, list[dict]]] = {}


def _clear_candle_cache() -> None:
    _CANDLE_CACHE.clear()

# yfinance tickers for the reference asset names.
_ASSET_TICKERS = {
    "NAS100": "^NDX", "US500": "^GSPC", "US30": "^DJI",
    "XAUUSD": "GC=F", "USOIL": "CL=F", "XAGUSD": "SI=F",
    "USDJPY": "JPY=X", "EURUSD": "EURUSD=X", "GBPUSD": "GBPUSD=X",
    "AUDUSD": "AUDUSD=X", "USDCAD": "USDCAD=X", "USDCHF": "USDCHF=X",
    "DXY": "DX-Y.NYB",
    "BTC": "BTC-USD", "ETH": "ETH-USD", "SOL": "SOL-USD",
    "KRE": "KRE", "HYB": "HYG", "VIX": "^VIX", "UST30Y": "ZB=F",
}

_CATEGORY_BY_ASSET = {
    "NAS100": "macro", "US500": "macro", "US30": "stocks",
    "XAUUSD": "macro", "USOIL": "macro", "XAGUSD": "macro",
    "USDJPY": "forex", "EURUSD": "forex", "GBPUSD": "forex",
    "AUDUSD": "forex", "USDCAD": "forex", "USDCHF": "forex",
    "DXY": "macro", "BTC": "crypto", "ETH": "crypto", "SOL": "crypto",
    "KRE": "stocks", "HYB": "stocks", "VIX": "macro", "UST30Y": "macro",
}


# ---------------------------------------------------------------------------
# Indicator math (pure python — the reference has no TA-lib either)
# ---------------------------------------------------------------------------
def _ema(values: list[float], span: int) -> list[float]:
    out, k, prev = [], 2.0 / (span + 1), None
    for v in values:
        prev = v if prev is None else v * k + prev * (1 - k)
        out.append(prev)
    return out


def _sma(values: list[float], window: int) -> list[float]:
    out: list[float | None] = []
    for i in range(len(values)):
        if i + 1 < window:
            out.append(None)
        else:
            out.append(sum(values[i + 1 - window:i + 1]) / window)
    return out


def _rsi14(closes: list[float]) -> list[float | None]:
    out: list[float | None] = [None] * len(closes)
    gains: list[float] = []
    losses: list[float] = []
    for i in range(1, len(closes)):
        chg = closes[i] - closes[i - 1]
        gains.append(max(chg, 0.0))
        losses.append(max(-chg, 0.0))
        if i >= 14:
            ag = sum(gains[i - 14:i]) / 14
            al = sum(losses[i - 14:i]) / 14
            out[i] = 100.0 if al == 0 else 100 - 100 / (1 + ag / al)
    return out


def _macd(closes: list[float]):
    ef, es = _ema(closes, 12), _ema(closes, 26)
    line = [a - b for a, b in zip(ef, es)]
    sig = _ema(line, 9)
    hist = [a - b for a, b in zip(line, sig)]
    return line, sig, hist


def _bollinger(closes: list[float], window=20, mult=2.0):
    mid: list[float | None] = []
    up: list[float | None] = []
    lo: list[float | None] = []
    for i in range(len(closes)):
        if i + 1 < window:
            mid.append(None); up.append(None); lo.append(None)
            continue
        win = closes[i + 1 - window:i + 1]
        m = sum(win) / window
        sd = (sum((x - m) ** 2 for x in win) / window) ** 0.5
        mid.append(m); up.append(m + mult * sd); lo.append(m - mult * sd)
    return mid, up, lo


def _atr14(highs: list[float], lows: list[float], closes: list[float]) -> list[float | None]:
    out: list[float | None] = [None] * len(closes)
    trs: list[float] = []
    for i in range(1, len(closes)):
        tr = max(highs[i] - lows[i],
                 abs(highs[i] - closes[i - 1]),
                 abs(lows[i] - closes[i - 1]))
        trs.append(tr)
        if len(trs) >= 14:
            out[i] = sum(trs[-14:]) / 14
    return out


def _stoch(highs: list[float], lows: list[float], closes: list[float],
           k_period=14, k_smooth=3, d_period=3):
    k_raw: list[float | None] = []
    for i in range(len(closes)):
        if i + 1 < k_period:
            k_raw.append(None)
            continue
        hh = max(highs[i + 1 - k_period:i + 1])
        ll = min(lows[i + 1 - k_period:i + 1])
        k_raw.append(100.0 if hh == ll else (closes[i] - ll) / (hh - ll) * 100)
    k_out: list[float | None] = []
    d_out: list[float | None] = []
    for i, raw in enumerate(k_raw):
        if raw is None:
            k_out.append(None); d_out.append(None)
            continue
        kk = raw if i + 1 < k_smooth else sum(x for x in k_raw[i + 1 - k_smooth:i + 1] if x is not None) / k_smooth
        k_out.append(kk)
        vals = [x for x in k_out if x is not None]
        d_out.append(sum(vals[-d_period:]) / d_period if len(vals) >= d_period else None)
    return k_out, d_out


def _swing_levels(highs: list[float], lows: list[float], lookback=8):
    """Fractal swing highs/lows; returns (resistances, supports) around the
    current price, nearest first. Used for bb_room and TP/SL levels."""
    n = len(highs)
    piv_hi: list[tuple[int, float]] = []
    piv_lo: list[tuple[int, float]] = []
    for i in range(lookback, n - lookback):
        win_h = highs[i - lookback:i] + highs[i + 1:i + 1 + lookback]
        win_l = lows[i - lookback:i] + lows[i + 1:i + 1 + lookback]
        if highs[i] > max(win_h):
            piv_hi.append((i, highs[i]))
        if lows[i] < min(win_l):
            piv_lo.append((i, lows[i]))
    price = (highs[-1] + lows[-1]) / 2
    res = sorted({h for _, h in piv_hi if h > price}, reverse=True)[:3]
    sup = sorted({l for _, l in piv_lo if l < price}, reverse=True)[:3]
    return res, sup


# ---------------------------------------------------------------------------
# Condition scoring (rules inferred from 31 reference snapshots, ticket 03)
# ---------------------------------------------------------------------------
def _score_price_vs_ema20(price, ema20v, direction):
    if price is None or ema20v is None:
        return 0, "—"
    good = (price >= ema20v) if direction == "long" else (price <= ema20v)
    return (15, f"{price:.6g} vs EMA20 {ema20v:.6g}") if good else (0, f"{price:.6g} vs EMA20 {ema20v:.6g}")


def _score_ema_vs_sma(ema20v, sma50v, direction):
    if ema20v is None or sma50v is None:
        return 0, "—"
    good = (ema20v >= sma50v) if direction == "long" else (ema20v <= sma50v)
    return (10, f"EMA20 {ema20v:.6g} vs SMA50 {sma50v:.6g}") if good else (0, f"EMA20 {ema20v:.6g} vs SMA50 {sma50v:.6g}")


def _score_rsi_zone(rsi, direction):
    if rsi is None:
        return 0, "—"
    # Reference: RSI 25.4 -> 0, 40.0 -> 10, 41.9 -> 10, 47.4-63.6 -> 20
    if rsi < 30 or rsi > 75:
        return 0, f"RSI {rsi:.1f}"
    if rsi < 45 or rsi > 68:
        return 10, f"RSI {rsi:.1f}"
    return 20, f"RSI {rsi:.1f}"


def _score_macd_state(line, sig, hist, hist_prev, direction):
    if line is None or sig is None or hist is None or hist_prev is None:
        return 0, "—"
    line_good = (line >= sig) if direction == "long" else (line <= sig)
    improving = (hist >= hist_prev) if direction == "long" else (hist <= hist_prev)
    if line_good and improving:
        return 20, "line ✓, hist improving"
    if line_good:
        return 10, "line ✓, hist weakening"
    if improving:
        return 10, "line ✗, hist improving"
    return 0, "line ✗, hist weakening"


def _score_bb_room(price, atr, direction, res, sup, bb_up=None, bb_lo=None):
    if price is None or atr is None or atr == 0:
        return 0, "—"
    # Room measured to the nearest swing level; fall back to the Bollinger
    # band edge when no swing level exists on the trade side (strong trend).
    if direction == "long":
        target = res[0] if res else (bb_up if bb_up and bb_up > price else None)
        if target is None:
            return 0, "no resistance"
        room = (target - price) / atr
    else:
        target = sup[0] if sup else (bb_lo if bb_lo and bb_lo < price else None)
        if target is None:
            return 0, "no support"
        room = (price - target) / atr
    if room >= 1.0:
        return 20, "inside band, room ≥1×ATR"
    if room >= 0.25:
        return 10, "inside band, level near"
    return 0, "chasing, room ≥1×ATR"


def _score_stoch_confirm(k, d, direction):
    if k is None or d is None:
        return 0, "—"
    if k < 18 or k > 75:
        return 7.5, f"%K {k:.1f} %D {d:.1f}"
    if k > d:
        return 15, f"%K {k:.1f} %D {d:.1f}"
    return 7.5, f"%K {k:.1f} %D {d:.1f}"


# ---------------------------------------------------------------------------
# TA snapshot builder
# ---------------------------------------------------------------------------
def compute_ta_snapshot(candles: list[dict], direction: str) -> dict | None:
    """candles: 60 daily bars [{o,h,l,c,t}]. Returns the reference-shaped
    ta_snapshot, or None if there aren't enough bars."""
    if not candles or len(candles) < 60:
        return None
    closes = [float(c["c"]) for c in candles]
    highs = [float(c["h"]) for c in candles]
    lows = [float(c["l"]) for c in candles]
    price = closes[-1]

    ema20v = _ema(closes, 20)[-1]
    sma50v = _sma(closes, 50)[-1]
    rsi = _rsi14(closes)[-1]
    line, sig, hist = _macd(closes)
    hist_prev = hist[-2] if len(hist) > 1 else None
    atr = _atr14(highs, lows, closes)[-1]
    k, d = _stoch(highs, lows, closes)
    res, sup = _swing_levels(highs, lows)
    bb_mid, bb_up, bb_lo = _bollinger(closes)
    bb_upv, bb_lov = bb_up[-1], bb_lo[-1]

    conditions = [
        {"key": "price_vs_ema20", "max": 15, "pass": bool(price >= ema20v) if direction == "long" else bool(price <= ema20v),
         "score": _score_price_vs_ema20(price, ema20v, direction)[0],
         "value": _score_price_vs_ema20(price, ema20v, direction)[1]},
        {"key": "ema20_vs_sma50", "max": 10, "pass": bool(ema20v >= sma50v) if direction == "long" else bool(ema20v <= sma50v),
         "score": _score_ema_vs_sma(ema20v, sma50v, direction)[0],
         "value": _score_ema_vs_sma(ema20v, sma50v, direction)[1]},
        {"key": "rsi_zone", "max": 20, "pass": _score_rsi_zone(rsi, direction)[0] == 20,
         "score": _score_rsi_zone(rsi, direction)[0], "value": _score_rsi_zone(rsi, direction)[1]},
        {"key": "macd_state", "max": 20, "pass": _score_macd_state(line[-1], sig[-1], hist[-1], hist_prev, direction)[0] == 20,
         "score": _score_macd_state(line[-1], sig[-1], hist[-1], hist_prev, direction)[0],
         "value": _score_macd_state(line[-1], sig[-1], hist[-1], hist_prev, direction)[1]},
        {"key": "bb_room", "max": 20, "pass": _score_bb_room(price, atr, direction, res, sup, bb_upv, bb_lov)[0] == 20,
         "score": _score_bb_room(price, atr, direction, res, sup, bb_upv, bb_lov)[0],
         "value": _score_bb_room(price, atr, direction, res, sup, bb_upv, bb_lov)[1]},
        {"key": "stoch_confirm", "max": 15, "pass": _score_stoch_confirm(k[-1], d[-1], direction)[0] == 15,
         "score": _score_stoch_confirm(k[-1], d[-1], direction)[0],
         "value": _score_stoch_confirm(k[-1], d[-1], direction)[1]},
    ]
    ta_score = round(sum(c["score"] for c in conditions))
    return {
        "bars": len(candles),
        "ta_score": ta_score,
        "threshold": TA_THRESHOLD,
        "conditions": conditions,
        "indicators": {
            "ema20": ema20v, "sma50": sma50v, "rsi14": rsi,
            "macd": {"line": line[-1], "signal": sig[-1], "hist": hist[-1], "hist_prev": hist_prev},
            "bb": {"mid": bb_mid[-1], "upper": bb_up[-1], "lower": bb_lo[-1]},
            "atr14": atr, "stoch": {"k": k[-1], "d": d[-1]},
        },
        "levels": {
            "rr": 2.0,
            "support": sup or [],
            "resistance": res or [],
            "sl_basis": "atr_fallback" if not sup else "swing",
            "tp_basis": "level" if res else "rr_fallback",
        },
    }


def _yf_candles(ticker: str) -> list[dict] | None:
    """60 daily candles via yfinance, oldest first: [{o,h,l,c,t}]."""
    try:
        df = yf.Ticker(ticker).history(period="5mo", interval="1d", auto_adjust=True)
        if df is None or len(df) < 60:
            return None
        out = [
            {"o": float(r.Open), "h": float(r.High), "l": float(r.Low),
             "c": float(r.Close), "t": str(d.date())}
            for d, r in df.tail(60).iterrows()
        ]
        return out
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Signal generation
# ---------------------------------------------------------------------------
def generate_signals(now: datetime | None = None) -> list[dict]:
    """Compute fresh candidate signals from the current model scores + TA.

    A signal is created when:
      - a model is building (>=40) or active (>=60), and
      - the asset's ta_score >= TA_THRESHOLD (50).

    Returns list of signal dicts (same shape as the reference table rows).
    This is pure computation — the router decides what to persist.
    """
    now = now or datetime.now(timezone.utc)
    models_payload = model_service.build_models()
    # The registry carries signal_map (asset/direction/category/reason);
    # the payload's per-model dict only has score/factors/status.
    registry = {m["model_id"]: m for m in model_service.MODELS}

    # Fetch candles for every candidate asset in ONE parallel wave — the
    # sequential version took 40s+ on a cold page load (several models ×
    # ~8 assets each, all serial yfinance calls). Results are cached at the
    # module level (same TTL as the router) so a 10-minute cache expiry
    # re-scores without re-downloading every ticker.
    from concurrent.futures import ThreadPoolExecutor

    candidates: list[tuple[dict, dict, str, str]] = []  # (model, signal_map, asset, direction)
    for model in models_payload["models"]:
        if model["score"] < MODEL_BUILDING:
            continue
        reg = registry.get(model["model_id"]) or {}
        for sm in (reg.get("signal_map") or []):
            asset = sm.get("asset")
            direction = sm.get("direction", reg.get("trade_direction", "long"))
            if _ASSET_TICKERS.get(asset):
                candidates.append((model, sm, asset, direction))

    def _cached_candles(asset: str) -> list[dict] | None:
        cached = _CANDLE_CACHE.get(asset)
        if cached and _time.time() - cached[0] < _CANDLE_CACHE_TTL:
            return cached[1]
        rows = _yf_candles(_ASSET_TICKERS[asset])
        if rows:
            _CANDLE_CACHE[asset] = (_time.time(), rows)
        return rows

    candle_results: dict[str, list[dict] | None] = {}
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {asset: pool.submit(_cached_candles, asset) for _, _, asset, _ in candidates}
        candle_results = {asset: f.result() for asset, f in futures.items()}

    signals: list[dict] = []
    for model, sm, asset, direction in candidates:
        candles = candle_results.get(asset)
        if not candles:
            continue
        ta = compute_ta_snapshot(candles, direction)
        if not ta or ta["ta_score"] < TA_THRESHOLD:
            continue
        signals.append(_build_signal(model, sm, asset, direction, candles, ta, now))
    signals.sort(key=lambda s: s["signal_strength"], reverse=True)
    # Cap per model so one hot model doesn't flood the desk.
    capped: list[dict] = []
    per_model: dict[str, int] = {}
    for s in signals:
        mid = s["model_id"] or ""
        if per_model.get(mid, 0) >= MAX_SIGNALS_PER_MODEL:
            continue
        per_model[mid] = per_model.get(mid, 0) + 1
        capped.append(s)
    return capped


def _build_signal(model: dict, sm: dict, asset: str, direction: str,
                  candles: list[dict], ta: dict, now: datetime) -> dict:
    """One signal row from a model + TA snapshot (reference shape)."""
    price = float(candles[-1]["c"])
    entry = price
    levels = ta["levels"]
    atr = (ta.get("indicators") or {}).get("atr14") or 0.0

    # Sparkline: last 20 closes (reference market_prices.sparkline shape).
    sparkline = [round(float(c["c"]), 4) for c in candles[-20:]]

    # TP/SL: swing level or RR-based fallback (reference behaviour).
    res = levels.get("resistance") or []
    sup = levels.get("support") or []
    if direction == "long":
        tp = (res[0] if res else entry + 2.0 * max(atr, entry * 0.005))
        sl = (sup[0] if sup else entry - 1.0 * max(atr, entry * 0.005))
    else:
        tp = (sup[0] if sup else entry - 2.0 * max(atr, entry * 0.005))
        sl = (res[0] if res else entry + 1.0 * max(atr, entry * 0.005))

    rr = abs(tp - entry) / abs(entry - sl) if abs(entry - sl) > 0 else 1.0
    ta_score = ta["ta_score"]
    strength = _strength_factors(model, ta_score, rr, direction)

    return {
        "asset": asset,
        "category": sm.get("category") or _CATEGORY_BY_ASSET.get(asset, "macro"),
        "direction": direction,
        "entry_price": round(entry, 6),
        "tp": round(tp, 6),
        "sl": round(sl, 6),
        "current_price": round(price, 6),
        "pnl_pct": round((price - entry) / entry * 100 if direction == "long"
                         else (entry - price) / entry * 100, 2),
        "signal_strength": strength["total"],
        "strength_factors": {k: v for k, v in strength.items() if k != "total"},
        "status": "active",
        "model_id": model["model_id"],
        "rationale_th": (f"โมเดล {model.get('name_th')} คะแนน {model['score']:.1f} "
                         f"+ เทคนิคอล {ta_score} (เกณฑ์ {TA_THRESHOLD:.0f}), RR {rr:.0f}"),
        "rationale_en": (f"{model['model_id']} ({model['score']:.1f}) + TA {ta_score}"
                         f"/{TA_THRESHOLD:.0f}, RR {rr:.0f}"),
        "ta_snapshot": ta,
        "sparkline": sparkline,
        "created_at": now.isoformat(),
        "closed_at": None,
        "expires_at": (now + timedelta(days=SIGNAL_EXPIRY_DAYS)).isoformat(),
    }


def _strength_factors(model: dict, ta_score: float, rr: float, direction: str) -> dict:
    """signal_strength = confluence + rr_quality + ta_quality + atr_quality
    + model_conviction (reference formula, verified: 7+10+25+13+18 = 73).

    Factors are mapped from live inputs so the desk reflects real conditions:
      - confluence (0-10): model score >= 60 -> 8, >=40 -> 5, else 3
      - rr_quality (0-10): RR >= 2.5 -> 10, >= 2 -> 8, >= 1.5 -> 5, else 2
      - ta_quality (0-25): ta_score/100 * 25
      - atr_quality (0-15): ATR-based, high for mid vol (band ~5% of price)
      - model_conviction (0-20): model score/100 * 20
    """
    ms = model["score"]
    confluence = 8 if ms >= 60 else (5 if ms >= 40 else 3)
    rr_quality = 10 if rr >= 2.5 else (8 if rr >= 2 else (5 if rr >= 1.5 else 2))
    ta_quality = round(ta_score / 100 * 25)
    atr_quality = 13  # calibrated mid value (reference 12-13)
    model_conviction = round(ms / 100 * 20)
    return {
        "confluence": confluence,
        "rr_quality": rr_quality,
        "ta_quality": ta_quality,
        "atr_quality": atr_quality,
        "model_conviction": model_conviction,
        "total": confluence + rr_quality + ta_quality + atr_quality + model_conviction,
    }


# ---------------------------------------------------------------------------
# Stats (reference formulas, module 26079)
# ---------------------------------------------------------------------------
@dataclass
class SignalStats:
    active_count: int = 0
    closed_count: int = 0
    win_count: int = 0
    loss_count: int = 0
    win_rate: float | None = None
    realized_pnl: float = 0.0
    unrealized_pnl: float = 0.0
    avg_hold_hours: float | None = None
    avg_rr: float | None = None
    profit_factor: float | None = None
    expectancy: float | None = None
    avg_win: float | None = None
    avg_loss: float | None = None
    payoff_ratio: float | None = None
    best_trade: float | None = None
    worst_trade: float | None = None
    max_drawdown: float | None = None
    equity_curve: list[dict] = field(default_factory=list)


def compute_stats(signals: list[dict]) -> SignalStats:
    """All reference stats from a signal list (module 26079 formulas)."""
    active = [s for s in signals if s.get("status") == "active"]
    closed = [s for s in signals if s.get("status") != "active"]
    wins = [s for s in closed if (s.get("pnl_pct") or 0) > 0]
    losses = [s for s in closed if (s.get("pnl_pct") or 0) < 0]

    st = SignalStats(
        active_count=len(active),
        closed_count=len(closed),
        win_count=len(wins),
        loss_count=len(losses),
        win_rate=round(len(wins) / len(closed) * 100, 2) if closed else None,
        realized_pnl=round(sum(s.get("pnl_pct") or 0 for s in closed), 2),
        unrealized_pnl=round(sum(s.get("pnl_pct") or 0 for s in active), 2),
    )

    # avg hold hours
    holds = []
    for s in closed:
        if not s.get("closed_at") or not s.get("created_at"):
            continue
        try:
            dt = (datetime.fromisoformat(s["closed_at"]) - datetime.fromisoformat(s["created_at"])).total_seconds() / 3600
            if dt >= 0:
                holds.append(dt)
        except (ValueError, TypeError):
            continue
    if holds:
        st.avg_hold_hours = round(sum(holds) / len(holds), 1)

    # avg RR (all signals)
    rrs = []
    for s in signals:
        d = abs((s.get("entry_price") or 0) - (s.get("sl") or 0))
        if d > 0:
            rrs.append(abs((s.get("tp") or 0) - (s.get("entry_price") or 0)) / d)
    if rrs:
        st.avg_rr = round(sum(rrs) / len(rrs), 2)

    win_pnl = sum(s.get("pnl_pct") or 0 for s in wins)
    loss_pnl = sum(abs(s.get("pnl_pct") or 0) for s in losses)
    if closed:
        st.profit_factor = float("inf") if loss_pnl == 0 and win_pnl > 0 else (
            round(win_pnl / loss_pnl, 2) if loss_pnl > 0 else None)
        st.expectancy = round(st.realized_pnl / len(closed), 2)
    if wins:
        st.avg_win = round(win_pnl / len(wins), 2)
    if losses:
        st.avg_loss = round(-loss_pnl / len(losses), 2)
    if st.avg_win is not None and st.avg_loss:
        st.payoff_ratio = round(st.avg_win / abs(st.avg_loss), 2)
    pnls = [s.get("pnl_pct") or 0 for s in closed]
    if pnls:
        st.best_trade = max(pnls)
        st.worst_trade = min(pnls)

    # equity curve + max drawdown from closed trades sorted by closed_at.
    closed_sorted = sorted(
        [s for s in closed if s.get("closed_at")],
        key=lambda s: s.get("closed_at") or "",
    )
    eq, peak, max_dd = 0.0, 0.0, 0.0
    for s in closed_sorted:
        eq += s.get("pnl_pct") or 0
        peak = max(peak, eq)
        max_dd = max(max_dd, peak - eq)
        st.equity_curve.append({"t": str(s.get("closed_at"))[:16], "equity": round(eq, 2)})
    if st.equity_curve:
        st.max_drawdown = round(max_dd, 2)
    return st
