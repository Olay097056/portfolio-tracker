# backend/tests/test_trending_service.py
import pytest

from app import trending_service

SAMPLE_ROWS = [
    {"ticker": "AAPL", "name": "Apple Inc.", "price": 195.5, "change_pct": 4.2},
    {"ticker": "MSFT", "name": "Microsoft Corp.", "price": 410.0, "change_pct": 3.1},
]


def test_get_gainers_returns_fetched_rows(monkeypatch):
    monkeypatch.setattr(trending_service, "_fetch_list", lambda endpoint: SAMPLE_ROWS)

    result = trending_service.get_gainers()

    assert result == SAMPLE_ROWS


def test_get_losers_calls_the_losers_endpoint(monkeypatch):
    calls = []
    monkeypatch.setattr(trending_service, "_fetch_list", lambda endpoint: calls.append(endpoint) or SAMPLE_ROWS)

    trending_service.get_losers()

    assert calls == ["losers"]


def test_get_most_active_calls_the_actives_endpoint(monkeypatch):
    calls = []
    monkeypatch.setattr(trending_service, "_fetch_list", lambda endpoint: calls.append(endpoint) or SAMPLE_ROWS)

    trending_service.get_most_active()

    assert calls == ["actives"]


def test_get_gainers_calls_the_gainers_endpoint(monkeypatch):
    calls = []
    monkeypatch.setattr(trending_service, "_fetch_list", lambda endpoint: calls.append(endpoint) or SAMPLE_ROWS)

    trending_service.get_gainers()

    assert calls == ["gainers"]


def test_get_gainers_returns_none_when_fetch_fails(monkeypatch):
    monkeypatch.setattr(trending_service, "_fetch_list", lambda endpoint: None)

    result = trending_service.get_gainers()

    assert result is None


def test_fetch_list_returns_none_without_an_api_key(monkeypatch):
    monkeypatch.delenv("FMP_API_KEY", raising=False)

    result = trending_service._fetch_list("gainers")

    assert result is None


def test_fetch_list_caps_at_ten_rows(monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "test-key")

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [{"symbol": f"T{i}", "name": f"Ticker {i}", "price": 1.0, "changesPercentage": 1.0} for i in range(15)]

    import httpx

    monkeypatch.setattr(httpx, "get", lambda *args, **kwargs: FakeResponse())

    result = trending_service._fetch_list("gainers")

    assert len(result) == 10


def test_fetch_list_maps_fmp_field_names(monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "test-key")

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [{"symbol": "AAPL", "name": "Apple Inc.", "price": 195.5, "changesPercentage": 4.2}]

    import httpx

    monkeypatch.setattr(httpx, "get", lambda *args, **kwargs: FakeResponse())

    result = trending_service._fetch_list("gainers")

    assert result == [{"ticker": "AAPL", "name": "Apple Inc.", "price": 195.5, "change_pct": 4.2}]


def test_fetch_list_returns_none_when_the_request_fails(monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "test-key")

    class FailingResponse:
        def raise_for_status(self):
            raise Exception("upstream error")

    import httpx

    monkeypatch.setattr(httpx, "get", lambda *args, **kwargs: FailingResponse())

    result = trending_service._fetch_list("gainers")

    assert result is None
