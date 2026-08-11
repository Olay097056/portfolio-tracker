# backend/tests/test_history_service.py
import pytest

from app import history_service


@pytest.fixture(autouse=True)
def _clear_cache():
    history_service.clear_cache()
    yield
    history_service.clear_cache()


SAMPLE_BARS = [
    {"close": 100.0, "high": 101.0, "low": 99.0, "volume": 1000.0},
    {"close": 102.0, "high": 103.0, "low": 100.0, "volume": 1200.0},
]


def test_get_history_returns_fetched_bars(monkeypatch):
    monkeypatch.setattr(history_service, "_fetch_history", lambda ticker: SAMPLE_BARS)

    result = history_service.get_history("VTI")

    assert result == SAMPLE_BARS


def test_get_history_returns_none_when_fetch_fails(monkeypatch):
    monkeypatch.setattr(history_service, "_fetch_history", lambda ticker: None)

    result = history_service.get_history("BADTICKER")

    assert result is None


def test_get_history_caches_and_does_not_refetch_within_ttl(monkeypatch):
    call_count = {"n": 0}

    def fake_fetch(ticker):
        call_count["n"] += 1
        return SAMPLE_BARS

    monkeypatch.setattr(history_service, "_fetch_history", fake_fetch)

    first = history_service.get_history("VTI")
    second = history_service.get_history("VTI")

    assert first == SAMPLE_BARS
    assert second == SAMPLE_BARS
    assert call_count["n"] == 1


def test_get_history_refetches_after_ttl_expires(monkeypatch):
    import time

    monkeypatch.setattr(history_service, "_fetch_history", lambda ticker: SAMPLE_BARS)
    monkeypatch.setattr(history_service, "CACHE_TTL_SECONDS", 0.2)

    history_service.get_history("VTI")

    time.sleep(0.35)

    call_count = {"n": 0}

    def fake_fetch_second(ticker):
        call_count["n"] += 1
        return SAMPLE_BARS

    monkeypatch.setattr(history_service, "_fetch_history", fake_fetch_second)

    history_service.get_history("VTI")

    assert call_count["n"] == 1


def test_a_failed_fetch_is_not_cached(monkeypatch):
    monkeypatch.setattr(history_service, "_fetch_history", lambda ticker: None)

    history_service.get_history("BADTICKER")

    call_count = {"n": 0}

    def fake_fetch(ticker):
        call_count["n"] += 1
        return SAMPLE_BARS

    monkeypatch.setattr(history_service, "_fetch_history", fake_fetch)

    result = history_service.get_history("BADTICKER")

    assert result == SAMPLE_BARS
    assert call_count["n"] == 1
