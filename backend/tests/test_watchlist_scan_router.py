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
    assert response.json() == {"ticker": "VTI", "percent_change_pct" : 10.0}
    mock_get_history.assert_called_once_with("VTI")


def test_scan_price_signal_returns_null_when_history_unavailable(client):
    with patch("app.routers.watchlist.get_history", return_value=None):
        response = client.get("/watchlist/scan/price-signals", params={"ticker": "BADTICKER", "period": "1d"})

    assert response.status_code == 200
    assert response.json() == {"ticker": "BADTICKER", "percent_change_pct": None}


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
