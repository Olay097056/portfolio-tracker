# backend/tests/test_signals.py
import pytest

from app.signals import percent_change


def test_percent_change_computes_gain():
    closes = [100.0, 101.0, 102.0, 103.0, 104.0, 110.0]

    result = percent_change(closes, 5)

    assert result == pytest.approx(10.0)


def test_percent_change_computes_loss():
    closes = [100.0, 95.0]

    result = percent_change(closes, 1)

    assert result == pytest.approx(-5.0)


def test_percent_change_returns_none_when_not_enough_history():
    closes = [100.0, 101.0, 102.0]

    result = percent_change(closes, 5)

    assert result is None


def test_percent_change_returns_none_when_start_price_is_zero_or_negative():
    closes = [0.0, 100.0]

    result = percent_change(closes, 1)

    assert result is None


def test_percent_change_with_exactly_enough_history():
    closes = [100.0, 110.0]

    result = percent_change(closes, 1)

    assert result == pytest.approx(10.0)
