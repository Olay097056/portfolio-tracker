# backend/tests/test_dividend_metrics.py
from datetime import date, timedelta

import pytest

from app.dividend_metrics import dividend_growth_pct, gross_yield_pct, payment_frequency

AS_OF = date(2026, 7, 25)


def test_payment_frequency_counts_quarterly_payments():
    dates = [AS_OF - timedelta(days=30), AS_OF - timedelta(days=120), AS_OF - timedelta(days=210), AS_OF - timedelta(days=300)]

    result = payment_frequency(dates, AS_OF)

    assert result == 4


def test_payment_frequency_counts_monthly_payments():
    dates = [AS_OF - timedelta(days=30 * i) for i in range(1, 13)]

    result = payment_frequency(dates, AS_OF)

    assert result == 12


def test_payment_frequency_excludes_payments_older_than_a_year():
    dates = [AS_OF - timedelta(days=30), AS_OF - timedelta(days=400)]

    result = payment_frequency(dates, AS_OF)

    assert result == 1


def test_payment_frequency_is_zero_for_no_payments():
    result = payment_frequency([], AS_OF)

    assert result == 0


def test_payment_frequency_excludes_future_dated_payments():
    dates = [AS_OF - timedelta(days=30), AS_OF + timedelta(days=10)]

    result = payment_frequency(dates, AS_OF)

    assert result == 1


def test_dividend_growth_pct_computes_growth_between_two_trailing_years():
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

    result = dividend_growth_pct(payments, AS_OF)

    assert result == pytest.approx(10.0)


def test_dividend_growth_pct_returns_none_when_prior_year_had_no_payments():
    payments = [(AS_OF - timedelta(days=30), 1.0)]

    result = dividend_growth_pct(payments, AS_OF)

    assert result is None


def test_gross_yield_pct_computes_trailing_year_sum_over_price():
    payments = [
        (AS_OF - timedelta(days=30), 1.1),
        (AS_OF - timedelta(days=120), 1.1),
        (AS_OF - timedelta(days=210), 1.1),
        (AS_OF - timedelta(days=300), 1.1),
    ]

    result = gross_yield_pct(payments, 100.0, AS_OF)

    assert result == pytest.approx(4.4)


def test_gross_yield_pct_returns_none_when_price_is_none():
    result = gross_yield_pct([(AS_OF, 1.0)], None, AS_OF)

    assert result is None


def test_gross_yield_pct_returns_none_when_price_is_not_positive():
    result = gross_yield_pct([(AS_OF, 1.0)], 0.0, AS_OF)

    assert result is None


def test_gross_yield_pct_is_zero_for_a_ticker_with_no_payments():
    result = gross_yield_pct([], 100.0, AS_OF)

    assert result == pytest.approx(0.0)


def test_gross_yield_pct_excludes_future_dated_payments():
    payments = [(AS_OF - timedelta(days=30), 1.0), (AS_OF + timedelta(days=10), 5.0)]

    result = gross_yield_pct(payments, 100.0, AS_OF)

    assert result == pytest.approx(1.0)
