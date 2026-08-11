# backend/tests/test_trending_service.py
import pytest

from app import trending_service


@pytest.fixture(autouse=True)
def _clear_cache():
    trending_service.clear_cache()
    yield
    trending_service.clear_cache()


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


def test_fetch_list_caches_and_does_not_refetch_within_ttl(monkeypatch):
    call_count = {"n": 0}

    def fake_fetch(endpoint):
        call_count["n"] += 1
        return SAMPLE_ROWS

    monkeypatch.setattr(trending_service, "_fetch_from_provider", fake_fetch)

    first = trending_service._fetch_list("gainers")
    second = trending_service._fetch_list("gainers")

    assert first == SAMPLE_ROWS
    assert second == SAMPLE_ROWS
    assert call_count["n"] == 1


def test_fetch_list_refetches_after_ttl_expires(monkeypatch):
    import time

    monkeypatch.setattr(trending_service, "_fetch_from_provider", lambda endpoint: SAMPLE_ROWS)
    monkeypatch.setattr(trending_service, "CACHE_TTL_SECONDS", 0.2)

    trending_service._fetch_list("gainers")

    time.sleep(0.35)

    call_count = {"n": 0}

    def fake_fetch_second(endpoint):
        call_count["n"] += 1
        return SAMPLE_ROWS

    monkeypatch.setattr(trending_service, "_fetch_from_provider", fake_fetch_second)

    trending_service._fetch_list("gainers")

    assert call_count["n"] == 1


def test_fetch_list_caches_gainers_and_losers_separately(monkeypatch):
    calls = []

    def fake_fetch(endpoint):
        calls.append(endpoint)
        return SAMPLE_ROWS

    monkeypatch.setattr(trending_service, "_fetch_from_provider", fake_fetch)

    trending_service._fetch_list("gainers")
    trending_service._fetch_list("losers")
    trending_service._fetch_list("gainers")
    trending_service._fetch_list("losers")

    assert calls == ["gainers", "losers"]


def test_a_failed_fetch_is_not_cached(monkeypatch):
    monkeypatch.setattr(trending_service, "_fetch_from_provider", lambda endpoint: None)

    trending_service._fetch_list("gainers")

    call_count = {"n": 0}

    def fake_fetch(endpoint):
        call_count["n"] += 1
        return SAMPLE_ROWS

    monkeypatch.setattr(trending_service, "_fetch_from_provider", fake_fetch)

    result = trending_service._fetch_list("gainers")

    assert result == SAMPLE_ROWS
    assert call_count["n"] == 1


def test_fetch_from_provider_returns_none_without_an_api_key(monkeypatch):
    monkeypatch.delenv("FMP_API_KEY", raising=False)

    result = trending_service._fetch_from_provider("gainers")

    assert result is None


def test_fetch_from_provider_caps_at_ten_rows(monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "test-key")

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [{"symbol": f"T{i}", "name": f"Ticker {i}", "price": 1.0, "changesPercentage": 1.0} for i in range(15)]

    import httpx

    monkeypatch.setattr(httpx, "get", lambda *args, **kwargs: FakeResponse())

    result = trending_service._fetch_from_provider("gainers")

    assert len(result) == 10


def test_fetch_from_provider_maps_fmp_field_names(monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "test-key")

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [{"symbol": "AAPL", "name": "Apple Inc.", "price": 195.5, "changesPercentage": 4.2}]

    import httpx

    monkeypatch.setattr(httpx, "get", lambda *args, **kwargs: FakeResponse())

    result = trending_service._fetch_from_provider("gainers")

    assert result == [{"ticker": "AAPL", "name": "Apple Inc.", "price": 195.5, "change_pct": 4.2}]


def test_fetch_from_provider_returns_none_when_the_request_fails(monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "test-key")

    class FailingResponse:
        def raise_for_status(self):
            raise Exception("upstream error")

    import httpx

    monkeypatch.setattr(httpx, "get", lambda *args, **kwargs: FailingResponse())

    result = trending_service._fetch_from_provider("gainers")

    assert result is None


def test_fetch_from_provider_skips_a_row_with_no_symbol_rather_than_coercing_to_an_addable_empty_ticker(monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "test-key")

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [
                {"symbol": None, "name": "Nameless", "price": 195.5, "changesPercentage": 4.2},
                {"symbol": "", "name": "Also Nameless", "price": 10.0, "changesPercentage": 1.0},
                {"symbol": "AAPL", "name": "Apple Inc.", "price": 195.5, "changesPercentage": 4.2},
            ]

    import httpx

    monkeypatch.setattr(httpx, "get", lambda *args, **kwargs: FakeResponse())

    result = trending_service._fetch_from_provider("gainers")

    assert result == [{"ticker": "AAPL", "name": "Apple Inc.", "price": 195.5, "change_pct": 4.2}]


def test_fetch_from_provider_coerces_a_present_but_null_name_to_empty_string(monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "test-key")

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [{"symbol": "AAPL", "name": None, "price": 195.5, "changesPercentage": 4.2}]

    import httpx

    monkeypatch.setattr(httpx, "get", lambda *args, **kwargs: FakeResponse())

    result = trending_service._fetch_from_provider("gainers")

    assert result == [{"ticker": "AAPL", "name": "", "price": 195.5, "change_pct": 4.2}]


def test_fetch_from_provider_falls_back_to_none_for_a_price_that_cannot_be_parsed_as_a_number(monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "test-key")

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [{"symbol": "AAPL", "name": "Apple Inc.", "price": "n/a", "changesPercentage": "4.2%"}]

    import httpx

    monkeypatch.setattr(httpx, "get", lambda *args, **kwargs: FakeResponse())

    result = trending_service._fetch_from_provider("gainers")

    assert result == [{"ticker": "AAPL", "name": "Apple Inc.", "price": None, "change_pct": None}]
