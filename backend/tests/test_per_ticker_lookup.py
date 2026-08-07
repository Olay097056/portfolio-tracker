# backend/tests/test_per_ticker_lookup.py
from unittest.mock import patch

from app.backtest import per_ticker_lookup
from app.backtest.engine import LOOKBACK_DAYS, SETUP_EXPIRY_DAYS


def _flat_bars(n: int, start_price: float = 100.0):
    """A long, gently-trending synthetic series -- long enough to exercise the walk-forward
    engine's lookback/expiry windows without needing real yfinance data in tests."""
    bars = []
    price = start_price
    for i in range(n):
        price *= 1.0002
        bars.append({"date": f"2015-01-{(i % 28) + 1:02d}", "close": round(price, 2), "high": round(price * 1.01, 2), "low": round(price * 0.99, 2), "volume": 1_000_000})
    return bars


def test_lookup_pattern_history_returns_none_when_too_little_history():
    with patch.object(per_ticker_lookup, "get_history", return_value=_flat_bars(50)):
        result = per_ticker_lookup.lookup_pattern_history("NEWCO", "BULLISH", False)
    assert result is None


def test_lookup_pattern_history_returns_none_when_ticker_unknown():
    with patch.object(per_ticker_lookup, "get_history", return_value=None):
        result = per_ticker_lookup.lookup_pattern_history("BADTICKER", "BULLISH", False)
    assert result is None


def test_lookup_pattern_history_returns_aggregated_stats_for_a_real_length_series():
    bars = _flat_bars(LOOKBACK_DAYS + SETUP_EXPIRY_DAYS + 500)
    with patch.object(per_ticker_lookup, "get_history", return_value=bars):
        result = per_ticker_lookup.lookup_pattern_history("SYN", "BULLISH", False)

    assert result is not None
    assert result["ticker"] == "SYN"
    assert result["signal_type"] == "BULLISH"
    assert result["total_matches"] >= 0
    assert result["conflict_matches"] is None  # has_conflict=False was passed


def test_lookup_pattern_history_win_rate_is_none_below_minimum_sample():
    # a tiny, sparse series -- crafted so the walk-forward engine finds very few (or zero)
    # matches, exercising the "not enough data for a %" path
    bars = _flat_bars(LOOKBACK_DAYS + SETUP_EXPIRY_DAYS + 5)
    with patch.object(per_ticker_lookup, "get_history", return_value=bars):
        result = per_ticker_lookup.lookup_pattern_history("SYN2", "BEARISH", False)

    assert result is not None
    if result["resolved_count"] < per_ticker_lookup.MIN_SAMPLE_FOR_WIN_RATE:
        assert result["win_rate"] is None


def test_lookup_pattern_history_bounds_the_lookback_window():
    huge = _flat_bars(per_ticker_lookup.LOOKBACK_TRADING_DAYS + 5000)
    captured = {}
    real_evaluate = per_ticker_lookup.evaluate_ticker

    def spy(ticker, bars):
        captured["n_bars"] = len(bars)
        return real_evaluate(ticker, bars)

    with patch.object(per_ticker_lookup, "get_history", return_value=huge), patch.object(per_ticker_lookup, "evaluate_ticker", side_effect=spy):
        per_ticker_lookup.lookup_pattern_history("HUGE", "BULLISH", False)

    assert captured["n_bars"] == per_ticker_lookup.LOOKBACK_TRADING_DAYS


def test_conflict_matches_only_computed_when_has_conflict_is_true():
    bars = _flat_bars(LOOKBACK_DAYS + SETUP_EXPIRY_DAYS + 500)
    with patch.object(per_ticker_lookup, "get_history", return_value=bars):
        without = per_ticker_lookup.lookup_pattern_history("SYN3", "BULLISH", False)
        with_conflict = per_ticker_lookup.lookup_pattern_history("SYN3", "BULLISH", True)

    assert without["conflict_matches"] is None
    assert with_conflict["conflict_matches"] is not None
    assert with_conflict["conflict_matches"] >= 0
