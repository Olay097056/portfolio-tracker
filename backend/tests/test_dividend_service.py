# backend/tests/test_dividend_service.py
from datetime import date

import pytest

from app import dividend_service


@pytest.fixture(autouse=True)
def _clear_cache():
    dividend_service.clear_cache()
    yield
    dividend_service.clear_cache()


SAMPLE_PAYMENTS = [(date(2026, 1, 15), 0.5), (date(2026, 4, 15), 0.5)]


def test_get_dividend_payments_returns_fetched_payments(monkeypatch):
    monkeypatch.setattr(dividend_service, "_fetch_dividend_payments", lambda ticker: SAMPLE_PAYMENTS)

    result = dividend_service.get_dividend_payments("JEPQ")

    assert result == SAMPLE_PAYMENTS


def test_get_dividend_payments_returns_none_when_fetch_fails(monkeypatch):
    monkeypatch.setattr(dividend_service, "_fetch_dividend_payments", lambda ticker: None)

    result = dividend_service.get_dividend_payments("BADTICKER")

    assert result is None


def test_get_dividend_payments_returns_empty_list_for_a_ticker_that_never_paid(monkeypatch):
    monkeypatch.setattr(dividend_service, "_fetch_dividend_payments", lambda ticker: [])

    result = dividend_service.get_dividend_payments("NODIVTICKER")

    assert result == []


def test_get_dividend_payments_caches_and_does_not_refetch_within_ttl(monkeypatch):
    call_count = {"n": 0}

    def fake_fetch(ticker):
        call_count["n"] += 1
        return SAMPLE_PAYMENTS

    monkeypatch.setattr(dividend_service, "_fetch_dividend_payments", fake_fetch)

    dividend_service.get_dividend_payments("JEPQ")
    dividend_service.get_dividend_payments("JEPQ")

    assert call_count["n"] == 1


def test_get_dividend_payments_refetches_after_ttl_expires(monkeypatch):
    import time

    monkeypatch.setattr(dividend_service, "_fetch_dividend_payments", lambda ticker: SAMPLE_PAYMENTS)
    monkeypatch.setattr(dividend_service, "CACHE_TTL_SECONDS", 0.2)

    dividend_service.get_dividend_payments("JEPQ")

    time.sleep(0.35)

    call_count = {"n": 0}

    def fake_fetch_second(ticker):
        call_count["n"] += 1
        return SAMPLE_PAYMENTS

    monkeypatch.setattr(dividend_service, "_fetch_dividend_payments", fake_fetch_second)

    dividend_service.get_dividend_payments("JEPQ")

    assert call_count["n"] == 1


def test_a_failed_fetch_is_not_cached(monkeypatch):
    monkeypatch.setattr(dividend_service, "_fetch_dividend_payments", lambda ticker: None)

    dividend_service.get_dividend_payments("BADTICKER")

    call_count = {"n": 0}

    def fake_fetch(ticker):
        call_count["n"] += 1
        return SAMPLE_PAYMENTS

    monkeypatch.setattr(dividend_service, "_fetch_dividend_payments", fake_fetch)

    result = dividend_service.get_dividend_payments("BADTICKER")

    assert result == SAMPLE_PAYMENTS
    assert call_count["n"] == 1
