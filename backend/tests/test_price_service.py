import pytest

from app import price_service


@pytest.fixture(autouse=True)
def _clear_cache():
    price_service.clear_cache()
    yield
    price_service.clear_cache()


def test_get_price_returns_yfinance_price_and_does_not_call_twelvedata(monkeypatch):
    monkeypatch.setattr(price_service, "_fetch_from_yfinance", lambda ticker: 333.74)

    called_twelvedata = []
    monkeypatch.setattr(price_service, "_fetch_from_twelvedata", lambda ticker: called_twelvedata.append(ticker) or 999.0)

    price = price_service.get_price("AAPL")

    assert price == 333.74
    assert called_twelvedata == []


def test_get_price_falls_back_to_twelvedata_when_yfinance_fails(monkeypatch):
    monkeypatch.setattr(price_service, "_fetch_from_yfinance", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_from_twelvedata", lambda ticker: 556.53)

    price = price_service.get_price("SMH")

    assert price == 556.53


def test_get_price_returns_none_when_both_sources_fail(monkeypatch):
    monkeypatch.setattr(price_service, "_fetch_from_yfinance", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_from_twelvedata", lambda ticker: None)

    price = price_service.get_price("NOTATICKER")

    assert price is None


def test_get_price_caches_and_does_not_refetch_within_ttl(monkeypatch):
    call_count = {"n": 0}

    def fake_yfinance(ticker):
        call_count["n"] += 1
        return 100.0

    monkeypatch.setattr(price_service, "_fetch_from_yfinance", fake_yfinance)

    first = price_service.get_price("AAPL")
    second = price_service.get_price("AAPL")

    assert first == 100.0
    assert second == 100.0
    assert call_count["n"] == 1


def test_get_price_refetches_after_ttl_expires(monkeypatch):
    monkeypatch.setattr(price_service, "_fetch_from_yfinance", lambda ticker: 100.0)

    fake_time = {"t": 1000.0}
    monkeypatch.setattr(price_service.time, "monotonic", lambda: fake_time["t"])

    price_service.get_price("AAPL")

    fake_time["t"] += price_service.CACHE_TTL_SECONDS + 1

    call_count = {"n": 0}

    def fake_yfinance_second(ticker):
        call_count["n"] += 1
        return 105.0

    monkeypatch.setattr(price_service, "_fetch_from_yfinance", fake_yfinance_second)

    price = price_service.get_price("AAPL")

    assert price == 105.0
    assert call_count["n"] == 1


def test_a_failed_fetch_is_not_cached(monkeypatch):
    monkeypatch.setattr(price_service, "_fetch_from_yfinance", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_from_twelvedata", lambda ticker: None)

    price_service.get_price("BADTICKER")

    call_count = {"n": 0}

    def fake_yfinance(ticker):
        call_count["n"] += 1
        return 50.0

    monkeypatch.setattr(price_service, "_fetch_from_yfinance", fake_yfinance)

    price = price_service.get_price("BADTICKER")

    assert price == 50.0
    assert call_count["n"] == 1
