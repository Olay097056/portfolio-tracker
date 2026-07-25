# backend/tests/test_watchlist_dividends_router.py
from datetime import date, timedelta
from unittest.mock import patch

import pytest

AS_OF = date.today()


def test_scan_dividends_returns_price_yield_frequency_and_growth(client):
    payments = [
        (AS_OF - timedelta(days=30), 1.1),
        (AS_OF - timedelta(days=120), 1.1),
        (AS_OF - timedelta(days=210), 1.1),
        (AS_OF - timedelta(days=300), 1.1),
        (AS_OF - timedelta(days=390), 1.0),
        (AS_OF - timedelta(days=480), 1.0),
        (AS_OF - timedelta(days=570), 1.0),
        (AS_OF - timedelta(days=660), 1.0),
    ]

    with (
        patch("app.routers.watchlist.get_price", return_value=100.0),
        patch("app.routers.watchlist.get_dividend_payments", return_value=payments),
    ):
        response = client.get("/watchlist/scan/dividends", params={"ticker": "JEPQ"})

    assert response.status_code == 200
    body = response.json()
    assert body["ticker"] == "JEPQ"
    assert body["price"] == 100.0
    assert body["gross_yield_pct"] == 4.4
    assert body["payment_frequency"] == 4
    assert body["dividend_growth_pct"] == pytest.approx(10.0)


def test_scan_dividends_returns_all_fields_null_when_payments_unavailable(client):
    with (
        patch("app.routers.watchlist.get_price", return_value=None),
        patch("app.routers.watchlist.get_dividend_payments", return_value=None),
    ):
        response = client.get("/watchlist/scan/dividends", params={"ticker": "BADTICKER"})

    assert response.json() == {
        "ticker": "BADTICKER",
        "price": None,
        "gross_yield_pct": None,
        "payment_frequency": None,
        "dividend_growth_pct": None,
    }


def test_scan_dividends_for_a_ticker_that_never_paid_shows_zero_not_missing(client):
    with (
        patch("app.routers.watchlist.get_price", return_value=50.0),
        patch("app.routers.watchlist.get_dividend_payments", return_value=[]),
    ):
        response = client.get("/watchlist/scan/dividends", params={"ticker": "NODIVTICKER"})

    body = response.json()
    assert body["price"] == 50.0
    assert body["gross_yield_pct"] == 0.0
    assert body["payment_frequency"] == 0
    assert body["dividend_growth_pct"] is None
