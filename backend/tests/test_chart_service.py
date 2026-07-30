# backend/tests/test_chart_service.py
import pytest

from app import chart_service


@pytest.fixture(autouse=True)
def _clear_cache():
    chart_service.clear_cache()
    yield
    chart_service.clear_cache()


SAMPLE_POINTS = [
    {"time": "2026-01-02", "close": 100.0},
    {"time": "2026-01-05", "close": 101.5},
]


def test_get_chart_data_returns_fetched_points(monkeypatch):
    monkeypatch.setattr(chart_service, "_fetch_from_provider", lambda ticker, range_: SAMPLE_POINTS)

    result = chart_service.get_chart_data("VTI", "1Y")

    assert result == SAMPLE_POINTS


def test_get_chart_data_returns_none_when_fetch_fails(monkeypatch):
    monkeypatch.setattr(chart_service, "_fetch_from_provider", lambda ticker, range_: None)

    result = chart_service.get_chart_data("BADTICKER", "1Y")

    assert result is None


def test_get_chart_data_caches_and_does_not_refetch_within_ttl(monkeypatch):
    call_count = {"n": 0}

    def fake_fetch(ticker, range_):
        call_count["n"] += 1
        return SAMPLE_POINTS

    monkeypatch.setattr(chart_service, "_fetch_from_provider", fake_fetch)

    first = chart_service.get_chart_data("VTI", "1Y")
    second = chart_service.get_chart_data("VTI", "1Y")

    assert first == SAMPLE_POINTS
    assert second == SAMPLE_POINTS
    assert call_count["n"] == 1


def test_get_chart_data_refetches_after_ttl_expires(monkeypatch):
    monkeypatch.setattr(chart_service, "_fetch_from_provider", lambda ticker, range_: SAMPLE_POINTS)

    fake_time = {"t": 1000.0}
    monkeypatch.setattr(chart_service.time, "monotonic", lambda: fake_time["t"])

    chart_service.get_chart_data("VTI", "1Y")

    fake_time["t"] += chart_service.CACHE_TTL_SECONDS + 1

    call_count = {"n": 0}

    def fake_fetch_second(ticker, range_):
        call_count["n"] += 1
        return SAMPLE_POINTS

    monkeypatch.setattr(chart_service, "_fetch_from_provider", fake_fetch_second)

    chart_service.get_chart_data("VTI", "1Y")

    assert call_count["n"] == 1


def test_get_chart_data_caches_different_tickers_separately(monkeypatch):
    calls = []

    def fake_fetch(ticker, range_):
        calls.append(ticker)
        return SAMPLE_POINTS

    monkeypatch.setattr(chart_service, "_fetch_from_provider", fake_fetch)

    chart_service.get_chart_data("VTI", "1Y")
    chart_service.get_chart_data("SPY", "1Y")
    chart_service.get_chart_data("VTI", "1Y")
    chart_service.get_chart_data("SPY", "1Y")

    assert calls == ["VTI", "SPY"]


def test_a_failed_fetch_is_not_cached(monkeypatch):
    monkeypatch.setattr(chart_service, "_fetch_from_provider", lambda ticker, range_: None)

    chart_service.get_chart_data("BADTICKER", "1Y")

    call_count = {"n": 0}

    def fake_fetch(ticker, range_):
        call_count["n"] += 1
        return SAMPLE_POINTS

    monkeypatch.setattr(chart_service, "_fetch_from_provider", fake_fetch)

    result = chart_service.get_chart_data("BADTICKER", "1Y")

    assert result == SAMPLE_POINTS
    assert call_count["n"] == 1


def test_fetch_from_provider_maps_yfinance_rows_to_time_and_close(monkeypatch):
    import pandas as pd

    index = pd.to_datetime(["2026-01-02", "2026-01-05"])
    history = pd.DataFrame({"Close": [100.0, 101.5]}, index=index)

    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period, interval):
            return history

    import yfinance as yf

    monkeypatch.setattr(yf, "Ticker", FakeTicker)

    result = chart_service._fetch_from_provider("VTI", "1Y")

    assert result == [
        {"time": "2026-01-02", "close": 100.0},
        {"time": "2026-01-05", "close": 101.5},
    ]


def test_fetch_from_provider_requests_one_year_of_daily_bars(monkeypatch):
    import pandas as pd

    history = pd.DataFrame({"Close": [100.0]}, index=pd.to_datetime(["2026-01-02"]))
    calls = []

    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period, interval):
            calls.append((period, interval))
            return history

    import yfinance as yf

    monkeypatch.setattr(yf, "Ticker", FakeTicker)

    chart_service._fetch_from_provider("VTI", "1Y")

    assert calls == [("1y", "1d")]


def test_fetch_from_provider_returns_none_for_an_empty_history(monkeypatch):
    import pandas as pd

    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period, interval):
            return pd.DataFrame()

    import yfinance as yf

    monkeypatch.setattr(yf, "Ticker", FakeTicker)

    result = chart_service._fetch_from_provider("BADTICKER", "1Y")

    assert result is None


def test_fetch_from_provider_returns_none_when_yfinance_raises(monkeypatch):
    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period, interval):
            raise Exception("network error")

    import yfinance as yf

    monkeypatch.setattr(yf, "Ticker", FakeTicker)

    result = chart_service._fetch_from_provider("VTI", "1Y")

    assert result is None
