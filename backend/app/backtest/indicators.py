# backend/app/backtest/indicators.py
"""Python port of frontend/src/utils/aiTechnicalSignal.ts, for the backtest engine.

The backtest needs to run these calculations over ~2500 trading days x 30+ tickers x 5
walk-forward folds, entirely server-side — there is no browser here to run the original
TypeScript. This module mirrors that file's math function-for-function (same formulas, same
rounding, same bucket thresholds) so a backtested "confidence score" or "trading setup" means
exactly what the live UI's does. Where a function already exists in app.signals with matching
math (rsi, volume_ratio, distance_from_sma, bollinger_band_width_pct), it's reused rather than
re-implemented — see the docstring on each re-exported name for the TS function it corresponds
to.

Any future change to aiTechnicalSignal.ts's math must be mirrored here, or a subsequent backtest
run silently validates a formula the live app no longer uses.
"""

from __future__ import annotations

import math
from typing import Literal, TypedDict

from app.signals import bollinger_band_width_pct as calc_bb_width_pct  # calcBbWidthPct
from app.signals import distance_from_sma as _distance_from_sma  # calcSma50DistancePct (period=50)
from app.signals import rsi as calc_rsi14  # calcRsi14
from app.signals import volume_ratio as calc_volume_ratio  # calcVolumeRatio


def calc_sma50_distance_pct(closes: list[float]) -> float | None:
    """calcSma50DistancePct — distance_from_sma already matches when len(closes) >= period; the
    TS version additionally adapts to a shorter period when fewer than 50 points exist, which
    never happens in this backtest (every date has 10 years of lookback)."""
    return _distance_from_sma(closes, period=50)


class Bar(TypedDict):
    date: str  # ISO date, e.g. "2020-03-16" — needed by engine.py to assign walk-forward folds
    close: float
    high: float
    low: float
    volume: float


class MacdMetrics(TypedDict):
    macd_line: float | None
    signal_line: float | None
    histogram: float | None
    crossover: Literal["BULLISH", "BEARISH", "NEUTRAL"]
    is_bullish_crossover: bool
    is_bearish_crossover: bool


class MovingAverageMetrics(TypedDict):
    sma20: float | None
    sma50: float | None
    sma200: float | None
    ma_cross_state: Literal["GOLDEN_CROSS", "DEATH_CROSS", "NEUTRAL"]
    is_bullish_alignment: bool
    distance_from_sma50_pct: float | None


class ZoneRef(TypedDict):
    price: float
    distance_pct: float


class TradingSetup(TypedDict):
    entry_min: float
    entry_max: float
    target_price: float
    upside_pct: float
    stop_loss: float
    downside_pct: float
    risk_reward_ratio: float


class ConfidenceScore(TypedDict):
    score: int
    pillars: dict[str, int]


def calc_sma(closes: list[float], period: int) -> float | None:
    """calcSma"""
    if not closes or len(closes) < period or period <= 0:
        return None
    window = closes[-period:]
    return round(sum(window) / period, 2)


def calc_moving_averages(closes: list[float]) -> MovingAverageMetrics:
    """calcMovingAverages"""
    sma20 = calc_sma(closes, 20)
    sma50 = calc_sma(closes, 50)
    sma200 = calc_sma(closes, 200)
    distance_from_sma50_pct = calc_sma50_distance_pct(closes)
    latest_close = closes[-1] if closes else None

    ma_cross_state: Literal["GOLDEN_CROSS", "DEATH_CROSS", "NEUTRAL"] = "NEUTRAL"
    is_bullish_alignment = False

    if sma20 is not None and sma50 is not None:
        if sma200 is not None:
            if sma20 > sma200 or sma50 > sma200:
                ma_cross_state = "GOLDEN_CROSS"
            elif sma20 < sma200 and sma50 < sma200:
                ma_cross_state = "DEATH_CROSS"
            if latest_close is not None and latest_close > sma20 > sma50 > sma200:
                is_bullish_alignment = True
        else:
            if sma20 > sma50:
                ma_cross_state = "GOLDEN_CROSS"
            elif sma20 < sma50:
                ma_cross_state = "DEATH_CROSS"
            if latest_close is not None and latest_close > sma20 > sma50:
                is_bullish_alignment = True

    return {
        "sma20": sma20,
        "sma50": sma50,
        "sma200": sma200,
        "ma_cross_state": ma_cross_state,
        "is_bullish_alignment": is_bullish_alignment,
        "distance_from_sma50_pct": distance_from_sma50_pct,
    }


def _empty_macd() -> MacdMetrics:
    return {
        "macd_line": None,
        "signal_line": None,
        "histogram": None,
        "crossover": "NEUTRAL",
        "is_bullish_crossover": False,
        "is_bearish_crossover": False,
    }


def calc_macd(closes: list[float]) -> MacdMetrics:
    """calcMacd — MACD(12, 26, 9). EMA12/EMA26 seeded by an SMA of their first window (matching
    the TS implementation's seeding, not the "seed with the first value" convention some MACD
    implementations use)."""
    if not closes or len(closes) < 26:
        return _empty_macd()

    n = len(closes)
    k12 = 2 / 13
    ema12: list[float | None] = [None] * n
    ema12[11] = sum(closes[0:12]) / 12
    for i in range(12, n):
        ema12[i] = closes[i] * k12 + ema12[i - 1] * (1 - k12)

    k26 = 2 / 27
    ema26: list[float | None] = [None] * n
    ema26[25] = sum(closes[0:26]) / 26
    for i in range(26, n):
        ema26[i] = closes[i] * k26 + ema26[i - 1] * (1 - k26)

    macd_series: list[float] = [ema12[i] - ema26[i] for i in range(25, n)]
    if not macd_series:
        return _empty_macd()

    latest_macd = macd_series[-1]
    prev_macd = macd_series[-2] if len(macd_series) > 1 else None
    latest_signal: float | None = None
    prev_signal: float | None = None

    if len(macd_series) >= 9:
        k9 = 2 / 10
        m = len(macd_series)
        signal_arr: list[float | None] = [None] * m
        signal_arr[8] = sum(macd_series[0:9]) / 9
        for i in range(9, m):
            signal_arr[i] = macd_series[i] * k9 + signal_arr[i - 1] * (1 - k9)
        latest_signal = signal_arr[-1]
        if m > 1:
            prev_signal = signal_arr[-2]

    rounded_macd = round(latest_macd, 2)
    rounded_signal = round(latest_signal, 2) if latest_signal is not None else None
    rounded_hist = round(latest_macd - latest_signal, 2) if latest_signal is not None else None

    is_bullish_crossover = False
    is_bearish_crossover = False
    crossover: Literal["BULLISH", "BEARISH", "NEUTRAL"] = "NEUTRAL"

    if latest_signal is not None and prev_macd is not None and prev_signal is not None:
        if latest_macd > latest_signal and prev_macd <= prev_signal:
            is_bullish_crossover = True
        elif latest_macd < latest_signal and prev_macd >= prev_signal:
            is_bearish_crossover = True

    if is_bullish_crossover or (rounded_hist is not None and rounded_hist > 0):
        crossover = "BULLISH"
    elif is_bearish_crossover or (rounded_hist is not None and rounded_hist < 0):
        crossover = "BEARISH"

    return {
        "macd_line": rounded_macd,
        "signal_line": rounded_signal,
        "histogram": rounded_hist,
        "crossover": crossover,
        "is_bullish_crossover": is_bullish_crossover,
        "is_bearish_crossover": is_bearish_crossover,
    }


def calc_atr14_raw(bars: list[Bar]) -> float | None:
    """calcAtr14 — raw ATR in price units (not the app.signals.atr_pct percentage form), because
    calc_trading_setup needs it as a dollar amount to add/subtract from latestClose, exactly as
    the TS version does."""
    if not bars or len(bars) < 2:
        return None

    trs = [bars[0]["high"] - bars[0]["low"]]
    for i in range(1, len(bars)):
        high, low, prev_close = bars[i]["high"], bars[i]["low"], bars[i - 1]["close"]
        trs.append(max(high - low, abs(high - prev_close), abs(low - prev_close)))

    period = min(14, len(trs))
    recent = trs[-period:]
    return round(sum(recent) / period, 2)


def calc_trading_setup(
    latest_close: float,
    atr14: float | None,
    nearest_support: ZoneRef | None,
    nearest_resistance: ZoneRef | None,
    *,
    sl_atr_mult: float = 1.5,
    tp_atr_mult: float = 3.0,
) -> TradingSetup:
    """calcTradingSetup. sl_atr_mult/tp_atr_mult default to the live app's hardcoded 1.5x/3.0x —
    exposed as parameters (not present in the TS original) purely so the backtest can score
    alternative multiplier candidates against the same S/R-override and clamp logic, per ticket
    03's methodology. The live app never calls this with anything but the defaults."""
    if not latest_close or latest_close <= 0 or math.isnan(latest_close):
        return {
            "entry_min": 0.0,
            "entry_max": 0.0,
            "target_price": 0.0,
            "upside_pct": 0.0,
            "stop_loss": 0.0,
            "downside_pct": 0.0,
            "risk_reward_ratio": 1.0,
        }

    effective_atr = atr14 if (atr14 is not None and atr14 > 0 and not math.isnan(atr14)) else latest_close * 0.02

    raw_sl = latest_close - sl_atr_mult * effective_atr
    if nearest_support is not None and nearest_support["price"] < latest_close:
        raw_sl = min(raw_sl, nearest_support["price"] * 0.99)
    sl_price = max(0.01, min(raw_sl, round(latest_close * 0.99, 2)))
    downside_pct = round((latest_close - sl_price) / latest_close * 100, 2)

    tp_price = latest_close + tp_atr_mult * effective_atr
    if nearest_resistance is not None and nearest_resistance["price"] > latest_close:
        tp_price = max(tp_price, nearest_resistance["price"])
    tp_price = max(tp_price, round(latest_close * 1.02, 2))
    upside_pct = round((tp_price - latest_close) / latest_close * 100, 2)

    min_entry = round(latest_close * 0.985, 2)
    if (
        nearest_support is not None
        and nearest_support["price"] < latest_close
        and nearest_support["price"] >= latest_close * 0.9
    ):
        min_entry = round(nearest_support["price"], 2)
    max_entry = round(latest_close, 2)
    if min_entry > max_entry:
        min_entry = max_entry

    risk = latest_close - sl_price
    reward = tp_price - latest_close
    ratio = round(reward / risk, 2) if risk > 0 else 1.0

    return {
        "entry_min": min_entry,
        "entry_max": max_entry,
        "target_price": round(tp_price, 2),
        "upside_pct": upside_pct,
        "stop_loss": round(sl_price, 2),
        "downside_pct": downside_pct,
        "risk_reward_ratio": ratio,
    }


def calc_confidence_score(
    ma: MovingAverageMetrics,
    rsi14: float | None,
    macd: MacdMetrics,
    volume_ratio: float | None,
    is_squeeze: bool,
    nearest_support: ZoneRef | None,
    nearest_resistance: ZoneRef | None,
) -> ConfidenceScore:
    """calcConfidenceScore — the 5-pillar point-bucket scorer, unmodified. This is the exact
    formula ticket 06 is validating; do not "improve" it here — the whole point is to measure
    what it does today, then decide (per ticket 03's evidence rule) whether to change it."""
    trend_alignment = 10
    if ma["is_bullish_alignment"]:
        trend_alignment = 30
    elif ma["ma_cross_state"] == "GOLDEN_CROSS":
        trend_alignment = 25
    elif ma["sma20"] is not None and ma["distance_from_sma50_pct"] is not None and ma["distance_from_sma50_pct"] > 0:
        trend_alignment = 22
    elif ma["distance_from_sma50_pct"] is not None and ma["distance_from_sma50_pct"] > 0:
        trend_alignment = 15
    elif ma["ma_cross_state"] == "DEATH_CROSS":
        trend_alignment = 5

    rsi_condition = 12
    if rsi14 is not None:
        if 50 <= rsi14 <= 65:
            rsi_condition = 25
        elif 65 < rsi14 <= 80:
            rsi_condition = 22
        elif rsi14 > 80:
            rsi_condition = 20 if (ma["distance_from_sma50_pct"] is not None and ma["distance_from_sma50_pct"] > 0) else 10
        elif rsi14 < 35:
            rsi_condition = 20
        elif 40 <= rsi14 < 50:
            rsi_condition = 16

    macd_momentum = 10
    if macd["is_bullish_crossover"] or (
        macd["macd_line"] is not None
        and macd["signal_line"] is not None
        and macd["macd_line"] > macd["signal_line"]
        and macd["histogram"] is not None
        and macd["histogram"] > 0
    ):
        macd_momentum = 20
    elif macd["macd_line"] is not None and macd["signal_line"] is not None and macd["macd_line"] > macd["signal_line"]:
        macd_momentum = 15
    elif macd["histogram"] is not None and macd["histogram"] > 0:
        macd_momentum = 12
    elif macd["histogram"] is not None and macd["histogram"] > -0.5:
        macd_momentum = 8
    elif macd["histogram"] is not None:
        macd_momentum = 3

    volume_ratio_pts = 8
    if volume_ratio is not None:
        if volume_ratio >= 1.8:
            volume_ratio_pts = 15
        elif volume_ratio >= 1.4:
            volume_ratio_pts = 12
        elif volume_ratio >= 1.0:
            volume_ratio_pts = 8
        else:
            volume_ratio_pts = 4

    sr_distance_squeeze = 6
    if is_squeeze or (nearest_support is not None and nearest_support["distance_pct"] > -3.0):
        sr_distance_squeeze = 10
    elif nearest_resistance is not None and nearest_resistance["distance_pct"] > 5.0:
        sr_distance_squeeze = 9
    elif nearest_resistance is not None and nearest_resistance["distance_pct"] <= 2.0:
        sr_distance_squeeze = 4

    raw_score = trend_alignment + rsi_condition + macd_momentum + volume_ratio_pts + sr_distance_squeeze
    score = min(100, max(0, round(raw_score)))

    return {
        "score": score,
        "pillars": {
            "trend_alignment": trend_alignment,
            "rsi_condition": rsi_condition,
            "macd_momentum": macd_momentum,
            "volume_ratio": volume_ratio_pts,
            "sr_distance_squeeze": sr_distance_squeeze,
        },
    }


def nearest_zones(bars: list[Bar], latest_close: float) -> tuple[ZoneRef | None, ZoneRef | None]:
    """Find the nearest support/resistance zone as of `latest_close`, using the same auto S/R
    algorithm the live app uses (app.support_resistance.find_support_resistance_zones) over the
    price history available up to this point — no lookahead."""
    from app.support_resistance import find_support_resistance_zones

    highs = [b["high"] for b in bars]
    lows = [b["low"] for b in bars]
    closes = [b["close"] for b in bars]
    zones = find_support_resistance_zones(highs, lows, closes)

    supports = sorted((z for z in zones if z["kind"] == "support" and z["price"] < latest_close), key=lambda z: -z["price"])
    resistances = sorted((z for z in zones if z["kind"] == "resistance" and z["price"] > latest_close), key=lambda z: z["price"])

    nearest_support: ZoneRef | None = None
    if supports:
        price = supports[0]["price"]
        nearest_support = {"price": price, "distance_pct": round((price - latest_close) / latest_close * 100, 2)}

    nearest_resistance: ZoneRef | None = None
    if resistances:
        price = resistances[0]["price"]
        nearest_resistance = {"price": price, "distance_pct": round((price - latest_close) / latest_close * 100, 2)}

    return nearest_support, nearest_resistance


class SignalSnapshot(TypedDict):
    confidence_score: int
    pillars: dict[str, int]
    trading_setup: TradingSetup


class IndicatorSnapshot(TypedDict):
    """The expensive, multiplier-independent half of a signal computation — RSI/MACD/MA/ATR/S-R
    zones. Computed once per (ticker, date); calc_trading_setup can then be re-run cheaply against
    it for each ATR-multiplier candidate the backtest wants to compare, without re-scanning the
    whole price window for pivots each time."""

    latest_close: float
    rsi14: float | None
    macd: MacdMetrics
    ma: MovingAverageMetrics
    atr14: float | None
    is_squeeze: bool
    bb_width_pct: float | None
    volume_ratio: float | None
    nearest_support: ZoneRef | None
    nearest_resistance: ZoneRef | None


def compute_indicator_snapshot(bars: list[Bar]) -> IndicatorSnapshot | None:
    if not bars:
        return None

    closes = [b["close"] for b in bars]
    volumes = [b["volume"] for b in bars]
    latest_close = closes[-1]

    rsi14 = calc_rsi14(closes)
    vol_ratio = calc_volume_ratio(volumes)
    bb_width_pct = calc_bb_width_pct(closes)
    is_squeeze = bb_width_pct is not None and bb_width_pct < 12.0

    macd = calc_macd(closes)
    ma = calc_moving_averages(closes)
    atr14 = calc_atr14_raw(bars)

    nearest_support, nearest_resistance = nearest_zones(bars, latest_close)

    return {
        "latest_close": latest_close,
        "rsi14": rsi14,
        "macd": macd,
        "ma": ma,
        "atr14": atr14,
        "is_squeeze": is_squeeze,
        "bb_width_pct": bb_width_pct,
        "volume_ratio": vol_ratio,
        "nearest_support": nearest_support,
        "nearest_resistance": nearest_resistance,
    }


def signal_from_snapshot(snap: IndicatorSnapshot, *, sl_atr_mult: float = 1.5, tp_atr_mult: float = 3.0) -> SignalSnapshot:
    trading_setup = calc_trading_setup(
        snap["latest_close"],
        snap["atr14"],
        snap["nearest_support"],
        snap["nearest_resistance"],
        sl_atr_mult=sl_atr_mult,
        tp_atr_mult=tp_atr_mult,
    )
    confidence = calc_confidence_score(
        snap["ma"], snap["rsi14"], snap["macd"], snap["volume_ratio"], snap["is_squeeze"], snap["nearest_support"], snap["nearest_resistance"]
    )
    return {
        "confidence_score": confidence["score"],
        "pillars": confidence["pillars"],
        "trading_setup": trading_setup,
    }


def calc_signal_type(
    confidence_score: int,
    ma: MovingAverageMetrics,
    macd: MacdMetrics,
    rsi14: float | None,
    is_squeeze: bool,
) -> Literal["BULLISH", "BEARISH", "SQUEEZE", "NEUTRAL"]:
    """The `type` badge (BULLISH/BEARISH/SQUEEZE/NEUTRAL) generateAiTechnicalSignal shows the
    user — this is what's actually displayed, not the raw 0-100 score, so ticket 07's
    classification-accuracy check needs this, not just the score."""
    distance = ma["distance_from_sma50_pct"]
    if (
        confidence_score >= 70
        or ma["is_bullish_alignment"]
        or macd["is_bullish_crossover"]
        or (distance is not None and distance > 2 and rsi14 is not None and rsi14 > 50)
    ):
        return "BULLISH"
    if confidence_score < 30 or (rsi14 is not None and rsi14 > 70):
        return "BEARISH"
    if is_squeeze:
        return "SQUEEZE"
    return "NEUTRAL"


def compute_signal(bars: list[Bar]) -> SignalSnapshot | None:
    """generateAiTechnicalSignal, trimmed to the two things the backtest scores: the confidence
    score (with its pillar breakdown) and the trading setup, at the live app's default 1.5x/3.0x
    ATR multipliers. `bars` must be ordered oldest-first and end on the "as of" date being
    evaluated — the caller is responsible for not leaking future bars into this call (see
    engine.py). Thin convenience wrapper over compute_indicator_snapshot + signal_from_snapshot,
    kept for the single-call use case (e.g. the indicators.py smoke test)."""
    snap = compute_indicator_snapshot(bars)
    if snap is None:
        return None
    return signal_from_snapshot(snap)
