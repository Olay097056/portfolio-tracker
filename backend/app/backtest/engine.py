# backend/app/backtest/engine.py
"""Walk-forward backtest engine, implementing the methodology from
.scratch/ai-signal-upgrade/issues/03-backtest-methodology.md.

One adaptation from that ticket's literal "train informs, test confirms" framing, disclosed here
rather than silently applied: calc_confidence_score / calc_trading_setup have no *fitted*
parameters (the pillar point-buckets and 1.5x/3.0x ATR multipliers are fixed formulas, not
something this engine trains via gradient descent or similar) — there is nothing for a "train"
split to fit. So each fold's train and test windows are both used as independent out-of-sample
observations of the same fixed formula; the revision tally (ticket 03's "≥3-of-4/5 folds") counts
across each fold's TEST window specifically, since that is the period never used to even glance at
the finding first — the strictest independent read available given a fixed-formula system.

Lookback window: each day's indicator snapshot is computed from the trailing 252 trading days
(~1 calendar year) of bars ending on that day — not the full multi-year history — matching how the
live app actually feeds aiTechnicalSignal.ts (chart_service.py computes S/R zones and indicators
over whatever chart range is active; the dashboard's default range is 1 year). This also keeps
each day's computation bounded rather than re-scanning years of history per day.
"""

from __future__ import annotations

import statistics
from datetime import date, timedelta
from typing import TypedDict

from app.backtest.indicators import Bar, calc_signal_type, compute_indicator_snapshot, signal_from_snapshot

LOOKBACK_DAYS = 252
FORWARD_RETURN_WINDOWS = (5, 10, 20)
SETUP_EXPIRY_DAYS = 60
BASELINE_ATR = (1.5, 3.0)
ATR_CANDIDATES = [(1.0, 2.0), (1.5, 2.5), BASELINE_ATR, (2.0, 4.0)]
PILLAR_NAMES = ["trend_alignment", "rsi_condition", "macd_momentum", "volume_ratio", "sr_distance_squeeze"]

TRAIN_YEARS_DAYS = 365 * 5 + 1  # +1 covers leap years across a 5y span without exact-anniversary edge cases
TEST_YEARS_DAYS = 365


class DayRecord(TypedDict):
    ticker: str
    date: date
    confidence_score: int
    signal_type: str
    pillars: dict[str, int]
    features: dict[str, float]  # raw indicator readings, for model fitting (ticket 08)
    fwd_returns: dict[int, float | None]
    setup_outcomes: dict[tuple[float, float], dict]


FEATURE_NAMES = [
    "rsi14",
    "macd_histogram",
    "distance_from_sma50_pct",
    "volume_ratio",
    "bb_width_pct",
    "has_support",
    "support_distance_pct",
    "has_resistance",
    "resistance_distance_pct",
]


def _extract_features(snap) -> dict[str, float]:
    """Raw indicator readings as a flat numeric feature vector, for ticket 08's model fitting —
    distinct from the hand-bucketed `pillars` dict, which encodes the *current, unvalidated*
    scoring formula's thresholds rather than the raw numbers. Missing RSI/MACD/etc. essentially
    never happens with a 252-day lookback window, so those default mildly (50/0/0/1.0/20.0) only
    as a defensive fallback; missing S/R zones are common and real (see indicators.py's synthetic
    strong-uptrend test case), so they get an explicit has_support/has_resistance flag rather than
    silently defaulting to "zone is right here" (0) or "zone is infinitely far" (some big number)."""
    ns, nr = snap["nearest_support"], snap["nearest_resistance"]
    return {
        "rsi14": snap["rsi14"] if snap["rsi14"] is not None else 50.0,
        "macd_histogram": snap["macd"]["histogram"] if snap["macd"]["histogram"] is not None else 0.0,
        "distance_from_sma50_pct": snap["ma"]["distance_from_sma50_pct"] if snap["ma"]["distance_from_sma50_pct"] is not None else 0.0,
        "volume_ratio": snap["volume_ratio"] if snap["volume_ratio"] is not None else 1.0,
        "bb_width_pct": snap["bb_width_pct"] if snap["bb_width_pct"] is not None else 20.0,
        "has_support": 1.0 if ns is not None else 0.0,
        "support_distance_pct": ns["distance_pct"] if ns is not None else 0.0,
        "has_resistance": 1.0 if nr is not None else 0.0,
        "resistance_distance_pct": nr["distance_pct"] if nr is not None else 0.0,
    }


def _parse_date(s: str) -> date:
    y, m, d = s.split("-")
    return date(int(y), int(m), int(d))


MAX_FOLDS = 5


def build_folds(all_dates: list[date]) -> list[dict]:
    """Up to MAX_FOLDS walk-forward folds (5y train / 1y test), anchored to the *most recent*
    evaluable date and walking backward one year at a time. Anchoring at the end (rather than
    walking forward from the earliest available date) matters because `data.py` fetches
    yfinance's full "max" history for data-quality reasons documented there — for a ticker like
    AAPL that reaches back to 1980, walking forward from day one would produce dozens of folds
    spanning market eras this backtest was never meant to validate against (ticket 03 explicitly
    considered and rejected using unlimited history for this reason). Capping at MAX_FOLDS and
    anchoring to "now" keeps the walk-forward span to the ~10 recent years ticket 03 specified,
    however much older history happens to be sitting in the cache."""
    start, end = all_dates[0], all_dates[-1]
    folds = []
    test_end = end
    while len(folds) < MAX_FOLDS:
        train_end = test_end - timedelta(days=TEST_YEARS_DAYS)
        train_start = train_end - timedelta(days=TRAIN_YEARS_DAYS)
        if train_start < start:
            break
        folds.append({"train_start": train_start, "train_end": train_end, "test_start": train_end, "test_end": test_end})
        test_end = train_end
    folds.reverse()
    return folds


def evaluate_ticker(ticker: str, bars: list[Bar]) -> list[DayRecord]:
    """One DayRecord per evaluable trading day: needs LOOKBACK_DAYS of history behind it and
    SETUP_EXPIRY_DAYS of future bars ahead of it (so both the forward-return and trading-setup
    outcomes can be fully resolved, never partially)."""
    records: list[DayRecord] = []
    n = len(bars)
    for i in range(LOOKBACK_DAYS, n - SETUP_EXPIRY_DAYS):
        window = bars[i - LOOKBACK_DAYS + 1 : i + 1]
        snap = compute_indicator_snapshot(window)
        if snap is None:
            continue

        latest_close = snap["latest_close"]
        fwd_returns: dict[int, float | None] = {}
        for w in FORWARD_RETURN_WINDOWS:
            fwd_returns[w] = (bars[i + w]["close"] - latest_close) / latest_close * 100 if i + w < n else None

        baseline_sig = signal_from_snapshot(snap)
        signal_type = calc_signal_type(baseline_sig["confidence_score"], snap["ma"], snap["macd"], snap["rsi14"], snap["is_squeeze"])

        setup_outcomes: dict[tuple[float, float], dict] = {}
        for sl_m, tp_m in ATR_CANDIDATES:
            ts = signal_from_snapshot(snap, sl_atr_mult=sl_m, tp_atr_mult=tp_m)["trading_setup"]
            target, stop = ts["target_price"], ts["stop_loss"]
            outcome = "expired"
            for j in range(i + 1, min(i + 1 + SETUP_EXPIRY_DAYS, n)):
                hi, lo = bars[j]["high"], bars[j]["low"]
                hit_target, hit_stop = hi >= target, lo <= stop
                if hit_stop:  # if both trigger the same bar, we can't know intraday order — treat as the loss (conservative, never overstate a win)
                    outcome = "stop"
                    break
                if hit_target:
                    outcome = "target"
                    break
            setup_outcomes[(sl_m, tp_m)] = {"outcome": outcome, "upside_pct": ts["upside_pct"], "downside_pct": ts["downside_pct"]}

        records.append(
            {
                "ticker": ticker,
                "date": _parse_date(bars[i]["date"]),
                "confidence_score": baseline_sig["confidence_score"],
                "signal_type": signal_type,
                "pillars": baseline_sig["pillars"],
                "features": _extract_features(snap),
                "fwd_returns": fwd_returns,
                "setup_outcomes": setup_outcomes,
            }
        )
    return records


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 10:  # too few points for a correlation reading to mean anything
        return None
    try:
        return statistics.correlation(xs, ys)
    except statistics.StatisticsError:
        return None


def pillar_correlation(records: list[DayRecord], pillar: str, window: int) -> float | None:
    """Correlation between this pillar's point value and the window-day forward return, across
    every record supplied (caller filters to the period being measured)."""
    xs, ys = [], []
    for r in records:
        fr = r["fwd_returns"].get(window)
        if fr is None:
            continue
        xs.append(r["pillars"][pillar])
        ys.append(fr)
    return _pearson(xs, ys)


def signal_type_forward_returns(records: list[DayRecord], window: int) -> dict[str, dict]:
    """Mean/median/n forward return per signal_type label (BULLISH/BEARISH/SQUEEZE/NEUTRAL) — the
    classification-accuracy check ticket 07 asked for: does the badge the user actually sees carry
    predictive signal, even though the individual pillar point-values (ticket 06) did not?"""
    by_type: dict[str, list[float]] = {"BULLISH": [], "BEARISH": [], "SQUEEZE": [], "NEUTRAL": []}
    for r in records:
        fr = r["fwd_returns"].get(window)
        if fr is None:
            continue
        by_type[r["signal_type"]].append(fr)
    result = {}
    for t, vals in by_type.items():
        if vals:
            result[t] = {"n": len(vals), "mean": sum(vals) / len(vals), "median": statistics.median(vals)}
        else:
            result[t] = {"n": 0, "mean": None, "median": None}
    return result


def setup_expectancy(records: list[DayRecord], candidate: tuple[float, float]) -> float | None:
    """expectancy = win_rate * avg_win_pct - loss_rate * avg_loss_pct, over resolved (non-expired)
    trials only — an expired trial is neither a win nor a loss for this candidate, by ticket 03's
    definition."""
    wins, losses = [], []
    for r in records:
        o = r["setup_outcomes"].get(candidate)
        if o is None or o["outcome"] == "expired":
            continue
        if o["outcome"] == "target":
            wins.append(o["upside_pct"])
        else:
            losses.append(o["downside_pct"])
    total = len(wins) + len(losses)
    if total < 10:
        return None
    win_rate = len(wins) / total
    loss_rate = len(losses) / total
    avg_win = sum(wins) / len(wins) if wins else 0.0
    avg_loss = sum(losses) / len(losses) if losses else 0.0
    return win_rate * avg_win - loss_rate * avg_loss
