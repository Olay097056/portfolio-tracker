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


def test_get_chart_data_caches_different_ranges_separately_for_the_same_ticker(monkeypatch):
    calls = []

    def fake_fetch(ticker, range_):
        calls.append(range_)
        return SAMPLE_POINTS

    monkeypatch.setattr(chart_service, "_fetch_from_provider", fake_fetch)

    chart_service.get_chart_data("VTI", "1Y")
    chart_service.get_chart_data("VTI", "5Y")
    chart_service.get_chart_data("VTI", "1Y")
    chart_service.get_chart_data("VTI", "5Y")

    assert calls == ["1Y", "5Y"]


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


@pytest.mark.parametrize(
    "range_,expected_period,expected_interval",
    [
        ("1D", "1d", "5m"),
        ("5D", "5d", "30m"),
        ("1M", "1mo", "1d"),
        ("6M", "6mo", "1d"),
        ("YTD", "ytd", "1d"),
        ("1Y", "1y", "1d"),
        ("5Y", "5y", "1wk"),
    ],
)
def test_fetch_from_provider_requests_the_correct_period_and_interval_for_each_range(
    monkeypatch, range_, expected_period, expected_interval
):
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

    chart_service._fetch_from_provider("VTI", range_)

    assert calls == [(expected_period, expected_interval)]


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


def test_fetch_from_provider_uses_unix_timestamps_for_intraday_ranges(monkeypatch):
    import pandas as pd

    index = pd.to_datetime(["2026-01-02 09:30:00", "2026-01-02 09:35:00"], utc=True)
    history = pd.DataFrame({"Close": [100.0, 100.5]}, index=index)

    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period, interval):
            return history

    import yfinance as yf

    monkeypatch.setattr(yf, "Ticker", FakeTicker)

    result = chart_service._fetch_from_provider("VTI", "1D")

    assert result == [
        {"time": int(index[0].timestamp()), "close": 100.0},
        {"time": int(index[1].timestamp()), "close": 100.5},
    ]
    assert all(isinstance(point["time"], int) for point in result)


def test_every_chart_range_has_a_mapping_row():
    from typing import get_args

    assert set(get_args(chart_service.ChartRange)) == set(chart_service.RANGE_TO_YFINANCE)


def test_fetch_from_provider_uses_date_strings_for_the_weekly_range(monkeypatch):
    import pandas as pd

    index = pd.to_datetime(["2026-01-02", "2026-01-09"])
    history = pd.DataFrame({"Close": [100.0, 105.0]}, index=index)

    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period, interval):
            return history

    import yfinance as yf

    monkeypatch.setattr(yf, "Ticker", FakeTicker)

    result = chart_service._fetch_from_provider("VTI", "5Y")

    assert result == [
        {"time": "2026-01-02", "close": 100.0},
        {"time": "2026-01-09", "close": 105.0},
    ]
