# backend/app/backtest/per_ticker_lookup.py
"""Per-ticker pattern lookup — wayfinder ticket 06 (ai-signal-investor-upgrades map), methodology
from ticket 01: "has this ticker been in a situation like this before, and how did it turn out?"

Reuses the existing walk-forward engine (evaluate_ticker, setup_expectancy's underlying data)
rather than re-deriving indicator math. Bounded to ~11 years of history (not data.py's full "max"
fetch) so a single-ticker on-demand call stays in the few-seconds range, per ticket 01's decision.
"""

from __future__ import annotations

from app.backtest.data import get_history
from app.backtest.engine import BASELINE_ATR, LOOKBACK_DAYS, SETUP_EXPIRY_DAYS, DayRecord, evaluate_ticker

LOOKBACK_TRADING_DAYS = 252 * 11  # ~11 years -- matches ticket 01's "10-12 years, not max" decision
MIN_SAMPLE_FOR_WIN_RATE = 5  # ticket 01's threshold -- below this, show a raw count only


def _bounded_bars(ticker: str) -> list | None:
    bars = get_history(ticker)
    if bars is None:
        return None
    return bars[-LOOKBACK_TRADING_DAYS:] if len(bars) > LOOKBACK_TRADING_DAYS else bars


def _record_has_conflict(r: DayRecord) -> bool:
    """Approximates ai_narrative_service._detect_conflicts's core rules using what a DayRecord
    already carries (raw features + confidence_score) -- DayRecord doesn't persist the MA
    cross-state / MACD crossover booleans _detect_conflicts uses directly, so this uses the
    sign of distance-from-SMA50 and MACD histogram as a trend-direction proxy instead. Good
    enough for "how many of these historical matches also looked conflicted", not meant to be
    byte-for-byte identical to the live per-call conflict list."""
    f = r["features"]
    rsi = f["rsi14"]
    trend_bullish_ish = f["distance_from_sma50_pct"] > 0 or f["macd_histogram"] > 0
    trend_bearish_ish = f["distance_from_sma50_pct"] < 0 or f["macd_histogram"] < 0
    if rsi > 70 and trend_bullish_ish:
        return True
    if rsi < 30 and trend_bearish_ish:
        return True
    if r["confidence_score"] < 40 and trend_bullish_ish:
        return True
    if r["confidence_score"] >= 60 and trend_bearish_ish:
        return True
    return False


def lookup_pattern_history(ticker: str, current_signal_type: str, current_has_conflict: bool) -> dict | None:
    """Returns None if there isn't enough history to evaluate at all (e.g. a very recent IPO) --
    the caller renders that as "not enough history", distinct from "enough history but < 5
    matches" (which this function returns with win_rate=None instead)."""
    bars = _bounded_bars(ticker)
    if bars is None or len(bars) < LOOKBACK_DAYS + SETUP_EXPIRY_DAYS + 1:
        return None

    records = evaluate_ticker(ticker, bars)
    matches = [r for r in records if r["signal_type"] == current_signal_type]

    wins = [r for r in matches if r["setup_outcomes"].get(BASELINE_ATR, {}).get("outcome") == "target"]
    losses = [r for r in matches if r["setup_outcomes"].get(BASELINE_ATR, {}).get("outcome") == "stop"]
    resolved_count = len(wins) + len(losses)  # "expired" trials excluded, matching the main backtest's convention

    avg_win_pct = sum(r["setup_outcomes"][BASELINE_ATR]["upside_pct"] for r in wins) / len(wins) if wins else None
    avg_loss_pct = sum(r["setup_outcomes"][BASELINE_ATR]["downside_pct"] for r in losses) / len(losses) if losses else None

    conflict_matches = sum(1 for r in matches if _record_has_conflict(r)) if current_has_conflict else None

    return {
        "ticker": ticker,
        "signal_type": current_signal_type,
        "total_matches": len(matches),
        "resolved_count": resolved_count,
        "win_count": len(wins),
        "loss_count": len(losses),
        "win_rate": (len(wins) / resolved_count) if resolved_count >= MIN_SAMPLE_FOR_WIN_RATE else None,
        "avg_win_pct": avg_win_pct,
        "avg_loss_pct": avg_loss_pct,
        "conflict_matches": conflict_matches,
    }
