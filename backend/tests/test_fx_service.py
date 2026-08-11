import pytest

from app import fx_service


@pytest.fixture(autouse=True)
def _clear_cache():
    fx_service.clear_cache()
    yield
    fx_service.clear_cache()


def test_get_usd_to_thb_rate_returns_fetched_rate(monkeypatch):
    monkeypatch.setattr(fx_service, "_fetch_from_frankfurter", lambda: 36.5)

    rate = fx_service.get_usd_to_thb_rate()

    assert rate == 36.5


def test_get_usd_to_thb_rate_returns_none_when_fetch_fails(monkeypatch):
    monkeypatch.setattr(fx_service, "_fetch_from_frankfurter", lambda: None)

    rate = fx_service.get_usd_to_thb_rate()

    assert rate is None


def test_get_usd_to_thb_rate_caches_and_does_not_refetch_within_ttl(monkeypatch):
    call_count = {"n": 0}

    def fake_fetch():
        call_count["n"] += 1
        return 36.5

    monkeypatch.setattr(fx_service, "_fetch_from_frankfurter", fake_fetch)

    first = fx_service.get_usd_to_thb_rate()
    second = fx_service.get_usd_to_thb_rate()

    assert first == 36.5
    assert second == 36.5
    assert call_count["n"] == 1


def test_get_usd_to_thb_rate_refetches_after_ttl_expires(monkeypatch):
    import time

    monkeypatch.setattr(fx_service, "_fetch_from_frankfurter", lambda: 36.5)
    monkeypatch.setattr(fx_service, "CACHE_TTL_SECONDS", 0.2)

    fx_service.get_usd_to_thb_rate()

    time.sleep(0.35)

    call_count = {"n": 0}

    def fake_fetch_second():
        call_count["n"] += 1
        return 37.0

    monkeypatch.setattr(fx_service, "_fetch_from_frankfurter", fake_fetch_second)

    rate = fx_service.get_usd_to_thb_rate()

    assert rate == 37.0
    assert call_count["n"] == 1


def test_a_failed_fetch_is_not_cached(monkeypatch):
    monkeypatch.setattr(fx_service, "_fetch_from_frankfurter", lambda: None)

    fx_service.get_usd_to_thb_rate()

    call_count = {"n": 0}

    def fake_fetch():
        call_count["n"] += 1
        return 36.0

    monkeypatch.setattr(fx_service, "_fetch_from_frankfurter", fake_fetch)

    rate = fx_service.get_usd_to_thb_rate()

    assert rate == 36.0
    assert call_count["n"] == 1
