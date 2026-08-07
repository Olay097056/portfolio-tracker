# backend/tests/test_earnings_service.py
from datetime import date

import pytest

from app import earnings_service


@pytest.fixture(autouse=True)
def _clear_cache():
    earnings_service.clear_cache()
    yield
    earnings_service.clear_cache()


def test_get_next_earnings_date_returns_fetched_date(monkeypatch):
    monkeypatch.setattr(earnings_service, "_fetch_next_earnings_date", lambda ticker: date(2026, 8, 27))

    result = earnings_service.get_next_earnings_date("NVDA")

    assert result == date(2026, 8, 27)


def test_get_next_earnings_date_returns_none_when_unavailable(monkeypatch):
    monkeypatch.setattr(earnings_service, "_fetch_next_earnings_date", lambda ticker: None)

    result = earnings_service.get_next_earnings_date("SPY")

    assert result is None


def test_get_next_earnings_date_caches_and_does_not_refetch(monkeypatch):
    call_count = {"n": 0}

    def fake_fetch(ticker):
        call_count["n"] += 1
        return date(2026, 8, 27)

    monkeypatch.setattr(earnings_service, "_fetch_next_earnings_date", fake_fetch)

    earnings_service.get_next_earnings_date("NVDA")
    earnings_service.get_next_earnings_date("NVDA")

    assert call_count["n"] == 1


def test_fetch_next_earnings_date_handles_a_single_date_value():
    import sys
    import types

    class FakeTicker:
        calendar = {"Earnings Date": date(2026, 8, 27)}

    fake_yf = types.SimpleNamespace(Ticker=lambda t: FakeTicker())
    sys.modules["yfinance"] = fake_yf
    try:
        result = earnings_service._fetch_next_earnings_date("NVDA")
    finally:
        del sys.modules["yfinance"]

    assert result == date(2026, 8, 27)


def test_fetch_next_earnings_date_takes_the_earliest_of_a_date_range(monkeypatch):
    import sys
    import types

    class FakeTicker:
        calendar = {"Earnings Date": [date(2026, 8, 27), date(2026, 8, 31)]}

    fake_yf = types.SimpleNamespace(Ticker=lambda t: FakeTicker())
    sys.modules["yfinance"] = fake_yf
    try:
        result = earnings_service._fetch_next_earnings_date("NVDA")
    finally:
        del sys.modules["yfinance"]

    assert result == date(2026, 8, 27)


def test_fetch_next_earnings_date_returns_none_when_calendar_has_no_earnings_key(monkeypatch):
    import sys
    import types

    class FakeTicker:
        calendar = {"Dividend Date": date(2026, 6, 26)}

    fake_yf = types.SimpleNamespace(Ticker=lambda t: FakeTicker())
    sys.modules["yfinance"] = fake_yf
    try:
        result = earnings_service._fetch_next_earnings_date("SPY")
    finally:
        del sys.modules["yfinance"]

    assert result is None


def test_fetch_next_earnings_date_returns_none_on_exception(monkeypatch):
    import sys
    import types

    class ExplodingTicker:
        @property
        def calendar(self):
            raise Exception("no fundamentals data")

    fake_yf = types.SimpleNamespace(Ticker=lambda t: ExplodingTicker())
    sys.modules["yfinance"] = fake_yf
    try:
        result = earnings_service._fetch_next_earnings_date("DELISTED")
    finally:
        del sys.modules["yfinance"]

    assert result is None


def test_days_until_computes_calendar_day_difference():
    assert earnings_service.days_until(date(2026, 8, 27), today=date(2026, 8, 6)) == 21
    assert earnings_service.days_until(date(2026, 8, 6), today=date(2026, 8, 6)) == 0
    assert earnings_service.days_until(date(2026, 8, 1), today=date(2026, 8, 6)) == -5
