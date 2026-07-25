# backend/tests/test_watchlist_scan_router.py
from unittest.mock import patch

import pytest


def test_scan_price_signal_returns_percent_change(client):
    bars = [{"close": 100.0, "high": 101.0, "low": 99.0, "volume": 1000.0}] * 4 + [
        {"close": 110.0, "high": 111.0, "low": 109.0, "volume": 1000.0}
    ]

    with patch("app.routers.watchlist.get_history", return_value=bars) as mock_get_history:
        response = client.get("/watchlist/scan/price-signals", params={"ticker": "VTI", "period": "1d"})

    assert response.status_code == 200
    assert response.json()["ticker"] == "VTI"
    assert response.json()["percent_change_pct"] == pytest.approx(10.0)
    mock_get_history.assert_called_once_with("VTI")


def test_scan_price_signal_returns_null_when_history_unavailable(client):
    with patch("app.routers.watchlist.get_history", return_value=None):
        response = client.get("/watchlist/scan/price-signals", params={"ticker": "BADTICKER", "period": "1d"})

    assert response.status_code == 200
    assert response.json()["percent_change_pct"] is None


def test_scan_price_signal_defaults_to_one_week_period(client):
    bars = [{"close": 100.0, "high": 101.0, "low": 99.0, "volume": 1000.0}] * 6

    with patch("app.routers.watchlist.get_history", return_value=bars):
        response = client.get("/watchlist/scan/price-signals", params={"ticker": "VTI"})

    assert response.status_code == 200
    assert response.json()["percent_change_pct"] == 0.0


def test_scan_price_signal_rejects_invalid_period(client):
    response = client.get("/watchlist/scan/price-signals", params={"ticker": "VTI", "period": "1y"})

    assert response.status_code == 422


def test_scan_price_signal_one_month_period_uses_21_trading_days(client):
    bars = [{"close": 100.0, "high": 101.0, "low": 99.0, "volume": 1000.0}] * 21 + [
        {"close": 121.0, "high": 122.0, "low": 120.0, "volume": 1000.0}
    ]

    with patch("app.routers.watchlist.get_history", return_value=bars):
        response = client.get("/watchlist/scan/price-signals", params={"ticker": "VTI", "period": "1m"})

    assert response.json()["percent_change_pct"] == pytest.approx(21.0)


def test_scan_price_signal_includes_rsi_volume_ratio_and_sma_distance(client):
    bars = [{"close": 100.0, "high": 101.0, "low": 99.0, "volume": 1000.0} for _ in range(50)]
    bars.append({"close": 110.0, "high": 111.0, "low": 109.0, "volume": 2000.0})

    with patch("app.routers.watchlist.get_history", return_value=bars):
        response = client.get("/watchlist/scan/price-signals", params={"ticker": "VTI", "period": "1d"})

    body = response.json()
    assert body["rsi_14"] == pytest.approx(100.0)
    assert body["volume_ratio"] == pytest.approx(2.0)
    assert body["distance_from_sma50_pct"] is not None


def test_scan_price_signal_computes_available_signals_when_history_is_partial(client):
    # 10 bars: enough for percent_change(1d) but not enough for rsi(14), volume_ratio(20), or sma(50)
    bars = [{"close": 100.0 + i, "high": 101.0, "low": 99.0, "volume": 1000.0} for i in range(10)]

    with patch("app.routers.watchlist.get_history", return_value=bars):
        response = client.get("/watchlist/scan/price-signals", params={"ticker": "VTI", "period": "1d"})

    body = response.json()
    assert body["percent_change_pct"] is not None
    assert body["rsi_14"] is None
    assert body["volume_ratio"] is None
    assert body["distance_from_sma50_pct"] is None


def test_scan_price_signal_includes_bollinger_and_atr_fields(client):
    bars = [{"close": 100.0, "high": 101.0, "low": 99.0, "volume": 1000.0} for _ in range(146)]
    bars.append({"close": 110.0, "high": 111.0, "low": 109.0, "volume": 1000.0})

    with patch("app.routers.watchlist.get_history", return_value=bars):
        response = client.get("/watchlist/scan/price-signals", params={"ticker": "VTI", "period": "1d"})

    body = response.json()
    assert body["bb_width_pct"] is not None
    assert body["bb_width_percentile"] is not None
    assert body["atr_pct"] is not None


def test_scan_price_signal_returns_null_bollinger_and_atr_when_history_too_short_for_them(client):
    # 30 bars: enough for percent_change/rsi/volume_ratio/distance_from_sma-ish signals'
    # shorter windows, but short of the 126-day lookback bb_width_percentile needs.
    bars = [{"close": 100.0 + i, "high": 101.0, "low": 99.0, "volume": 1000.0} for i in range(30)]

    with patch("app.routers.watchlist.get_history", return_value=bars):
        response = client.get("/watchlist/scan/price-signals", params={"ticker": "VTI", "period": "1d"})

    body = response.json()
    assert body["percent_change_pct"] is not None
    assert body["bb_width_pct"] is not None
    assert body["bb_width_percentile"] is None
    assert body["atr_pct"] is not None


def test_scan_price_signal_returns_all_seven_fields_null_when_history_unavailable(client):
    with patch("app.routers.watchlist.get_history", return_value=None):
        response = client.get("/watchlist/scan/price-signals", params={"ticker": "BADTICKER", "period": "1d"})

    assert response.json() == {
        "ticker": "BADTICKER",
        "percent_change_pct": None,
        "rsi_14": None,
        "volume_ratio": None,
        "distance_from_sma50_pct": None,
        "bb_width_pct": None,
        "bb_width_percentile": None,
        "atr_pct": None,
    }
