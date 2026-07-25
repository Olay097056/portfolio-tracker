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


from app.signals import distance_from_sma, rsi, volume_ratio


def test_rsi_all_gains_returns_100():
    closes = [100.0 + i for i in range(15)]

    result = rsi(closes, 14)

    assert result == pytest.approx(100.0)


def test_rsi_mixed_gains_and_losses():
    # 14 changes: +1 seven times, -1 seven times, alternating -> avg_gain = avg_loss -> RSI = 50
    closes = [100.0]
    for _ in range(7):
        closes.append(closes[-1] + 1)
        closes.append(closes[-1] - 1)

    result = rsi(closes, 14)

    assert result == pytest.approx(50.0)


def test_rsi_returns_none_when_not_enough_history():
    closes = [100.0, 101.0, 102.0]

    result = rsi(closes, 14)

    assert result is None


def test_rsi_returns_none_for_a_completely_flat_series():
    closes = [100.0] * 15

    result = rsi(closes, 14)

    assert result is None


def test_volume_ratio_above_average():
    volumes = [1000.0] * 20 + [2000.0]

    result = volume_ratio(volumes, 20)

    assert result == pytest.approx(2.0)


def test_volume_ratio_returns_none_when_not_enough_history():
    volumes = [1000.0] * 5

    result = volume_ratio(volumes, 20)

    assert result is None


def test_volume_ratio_returns_none_when_average_is_zero():
    volumes = [0.0] * 20 + [500.0]

    result = volume_ratio(volumes, 20)

    assert result is None


def test_distance_from_sma_above_average():
    closes = [100.0] * 49 + [110.0]

    result = distance_from_sma(closes, 50)

    # average = (49*100 + 110) / 50 = 100.2; distance = (110 - 100.2) / 100.2 * 100
    assert result == pytest.approx(9.780439, abs=1e-4)


def test_distance_from_sma_below_average():
    closes = [100.0] * 49 + [90.0]

    result = distance_from_sma(closes, 50)

    # average = (49*100 + 90) / 50 = 99.8; distance = (90 - 99.8) / 99.8 * 100
    assert result == pytest.approx(-9.819639, abs=1e-4)


def test_distance_from_sma_returns_none_when_not_enough_history():
    closes = [100.0] * 10

    result = distance_from_sma(closes, 50)

    assert result is None


from app.signals import atr_pct, bollinger_band_width_pct, bollinger_band_width_percentile


def test_bollinger_band_width_pct_computes_width_as_percent_of_mean():
    closes = [100.0] * 19 + [110.0]

    result = bollinger_band_width_pct(closes, period=20, num_std=2.0)

    assert result == pytest.approx(8.674426, abs=1e-4)


def test_bollinger_band_width_pct_is_zero_for_a_flat_series():
    closes = [100.0] * 20

    result = bollinger_band_width_pct(closes, period=20, num_std=2.0)

    assert result == pytest.approx(0.0)


def test_bollinger_band_width_pct_returns_none_when_not_enough_history():
    closes = [100.0] * 10

    result = bollinger_band_width_pct(closes, period=20, num_std=2.0)

    assert result is None


def test_bollinger_band_width_percentile_ranks_todays_width_against_own_trailing_history():
    # Each of the last 3 days' own trailing-2-close width: the first two days are flat/zero,
    # today's own trailing window ([100, 110]) is the widest of the three — so today ranks at
    # the top (100th percentile) of its own 3-day lookback.
    closes = [100.0, 100.0, 100.0, 100.0, 110.0]

    result = bollinger_band_width_percentile(closes, period=2, num_std=2.0, lookback=3)

    assert result == pytest.approx(100.0)


def test_bollinger_band_width_percentile_low_when_todays_width_is_the_narrowest_seen():
    closes = [100.0, 100.0, 110.0, 100.0, 100.0]

    result = bollinger_band_width_percentile(closes, period=2, num_std=2.0, lookback=3)

    assert result == pytest.approx(33.333333, abs=1e-4)


def test_bollinger_band_width_percentile_returns_none_when_not_enough_history():
    closes = [100.0] * 4

    result = bollinger_band_width_percentile(closes, period=2, num_std=2.0, lookback=3)

    assert result is None


def test_atr_pct_computes_average_true_range_as_percent_of_latest_close():
    closes = [100.0] * 15
    highs = [101.0] * 15
    lows = [99.0] * 15

    result = atr_pct(highs, lows, closes, period=14)

    assert result == pytest.approx(2.0)


def test_atr_pct_returns_none_when_not_enough_history():
    closes = [100.0] * 5
    highs = [101.0] * 5
    lows = [99.0] * 5

    result = atr_pct(highs, lows, closes, period=14)

    assert result is None
