"""Tests for the S&P 500 trading universe (user decision 2026-08-13: the desk
trades US cash equity, not crypto perps).

The point of these is that the indicators are real. hyperliquid_service derives
its "MA20" and "ATR" from the 24h change alone, so no test there could check
the arithmetic — there is none to check. Here the maths is verified against
hand-computed values on series with known shapes.
"""
from __future__ import annotations

import pytest

from app import stock_universe_service as su


def test_sma_matches_hand_calculation():
    values = [float(x) for x in range(1, 21)]  # 1..20, mean 10.5
    assert su._sma(values, 20) == pytest.approx(10.5)
    assert su._sma(values, 5) == pytest.approx(18.0)  # 16..20
    assert su._sma(values, 50) is None, "ข้อมูลไม่พอต้องคืน None ไม่ใช่เดา"


def test_atr_matches_hand_calculation():
    # 16 flat bars with a constant 2.0 high-low range → ATR14 = 2.0 exactly
    closes = [100.0] * 16
    highs = [101.0] * 16
    lows = [99.0] * 16
    assert su._atr(highs, lows, closes, 14) == pytest.approx(2.0)

    # a gap up makes one true range larger: |high - prev_close| dominates
    closes2 = [100.0] * 15 + [110.0]
    highs2 = [101.0] * 15 + [111.0]
    lows2 = [99.0] * 15 + [109.0]
    atr = su._atr(highs2, lows2, closes2, 14)
    assert atr > 2.0, "true range ต้องนับ gap จากราคาปิดก่อนหน้า"


def test_atr_refuses_without_enough_bars():
    assert su._atr([1.0] * 5, [1.0] * 5, [1.0] * 5, 14) is None


def test_steady_uptrend_reads_bullish():
    closes = [100.0 + i for i in range(60)]          # strictly rising
    highs = [c + 1 for c in closes]
    lows = [c - 1 for c in closes]
    volumes = [1_000_000.0] * 60

    ta = su.compute_ta(highs, lows, closes, volumes)
    names = " ".join(ta["signals"])
    assert "bull trend+" in names, ta["signals"]
    assert "ma golden cros+" in names, ta["signals"]
    assert "death cross" not in names
    assert ta["score"] > 0 and ta["arrow"] == "↑"


def test_steady_downtrend_reads_bearish():
    closes = [200.0 - i for i in range(60)]
    highs = [c + 1 for c in closes]
    lows = [c - 1 for c in closes]
    ta = su.compute_ta(highs, lows, closes, [1_000_000.0] * 60)
    names = " ".join(ta["signals"])
    assert "bear trend-" in names, ta["signals"]
    assert "ma death cross-" in names, ta["signals"]
    assert ta["score"] < 0 and ta["arrow"] == "↓"


def test_flat_series_produces_no_trend_signal():
    closes = [100.0] * 60
    ta = su.compute_ta([101.0] * 60, [99.0] * 60, closes, [1_000_000.0] * 60)
    names = " ".join(ta["signals"])
    assert "trend" not in names, f"ตลาดนิ่งไม่ควรมีสัญญาณเทรนด์: {ta['signals']}"
    assert "cross" not in names


def test_too_few_bars_returns_empty_rather_than_guessing():
    ta = su.compute_ta([1.0] * 10, [1.0] * 10, [1.0] * 10, [1.0] * 10)
    assert ta == {"signals": [], "score": 0, "arrow": "·"}


def test_score_is_bounded():
    closes = [100.0 * (1.15 ** i) for i in range(60)]  # violent exponential rise
    highs = [c * 1.01 for c in closes]
    lows = [c * 0.99 for c in closes]
    ta = su.compute_ta(highs, lows, closes, [1_000_000.0] * 60)
    assert -30 <= ta["score"] <= 30


def test_tier_follows_dollar_volume():
    assert su._tier(2_000_000_000) == 1
    assert su._tier(500_000_000) == 2
    assert su._tier(1_000_000) == 3
    assert su._tier(None) == 3, "ไม่รู้สภาพคล่อง ต้องเป็น tier ต่ำสุด ไม่ใช่เดาว่าดี"


def test_class_share_symbols_are_converted_for_yfinance(monkeypatch):
    """BRK.B on Wikipedia must become BRK-B or the price fetch silently misses."""
    import pandas as pd

    monkeypatch.setattr(su, "cache_get", lambda key: None)
    monkeypatch.setattr(su, "cache_set", lambda key, value, ttl: None)

    class _Response:
        status_code = 200
        text = "<table></table>"

    monkeypatch.setattr(su.httpx, "get", lambda *a, **k: _Response())
    monkeypatch.setattr(pd, "read_html", lambda *a, **k: [pd.DataFrame(
        {"Symbol": ["BRK.B", "AAPL"], "Security": ["Berkshire", "Apple"],
         "GICS Sector": ["Financials", "Information Technology"]})])

    rows = su.fetch_sp500_constituents()
    assert [r["symbol"] for r in rows] == ["BRK-B", "AAPL"]
