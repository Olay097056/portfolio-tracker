# backend/tests/test_support_resistance.py
import pytest
from app import support_resistance


def test_find_pivots_detects_a_single_pivot_high():
    highs = [10.0, 10.0, 10.0, 10.0, 10.0, 20.0, 10.0, 10.0, 10.0, 10.0, 10.0]
    lows = [5.0 + i for i in range(11)]  # strictly increasing: never a local min in a centered window

    result = support_resistance._find_pivots(highs, lows)

    assert result == [20.0]


def test_find_pivots_detects_a_single_pivot_low():
    lows = [10.0, 10.0, 10.0, 10.0, 10.0, 3.0, 10.0, 10.0, 10.0, 10.0, 10.0]
    highs = [50.0 + i for i in range(11)]  # strictly increasing: never a local max in a centered window

    result = support_resistance._find_pivots(highs, lows)

    assert result == [3.0]


def test_find_pivots_returns_empty_when_the_series_is_too_short_for_a_single_pivot_window():
    highs = [10.0] * 10  # fewer than 11 bars — the 5-bars-each-side window never has a valid center
    lows = [5.0] * 10

    result = support_resistance._find_pivots(highs, lows)

    assert result == []


def test_cluster_pivots_merges_prices_within_tolerance():
    result = support_resistance._cluster_pivots([100.0, 101.0])  # 1% apart, within 1.5%

    assert len(result) == 1
    price, strength = result[0]
    assert price == pytest.approx(100.5)
    assert strength == 2


def test_cluster_pivots_keeps_prices_beyond_tolerance_separate():
    result = support_resistance._cluster_pivots([100.0, 105.0])  # 5% apart, beyond 1.5%

    assert result == [(100.0, 1), (105.0, 1)]


def test_cluster_pivots_merges_three_close_prices_into_one_zone():
    result = support_resistance._cluster_pivots([100.0, 100.5, 101.0])

    assert len(result) == 1
    price, strength = result[0]
    assert price == pytest.approx(100.5)
    assert strength == 3


def test_cluster_pivots_returns_empty_for_no_pivots():
    result = support_resistance._cluster_pivots([])

    assert result == []


def test_select_zones_caps_support_at_three_keeping_the_strongest():
    clustered = [(90.0, 5), (91.0, 1), (92.0, 3), (93.0, 2)]  # all below current_price=100

    result = support_resistance._select_zones(clustered, current_price=100.0)

    assert len(result) == 3
    assert {zone["strength"] for zone in result} == {5, 3, 2}
    assert all(zone["kind"] == "support" for zone in result)
    assert all(zone["source"] == "auto" for zone in result)


def test_select_zones_classifies_by_position_not_by_the_number_of_candidates():
    clustered = [(90.0, 5), (110.0, 2)]  # one below, one above current_price=100

    result = support_resistance._select_zones(clustered, current_price=100.0)

    kinds_by_price = {zone["price"]: zone["kind"] for zone in result}
    assert kinds_by_price[90.0] == "support"
    assert kinds_by_price[110.0] == "resistance"


def test_find_support_resistance_zones_classifies_a_pivot_high_as_support_once_price_has_risen_past_it():
    # A pivot high forms at 100.0 (index 5), but the series ends with price at 150 — the level
    # that was once resistance is now below current price, so it must classify as support: this
    # is the "role reversal" the spec calls out, and it must NOT depend on the pivot's origin.
    highs = [10.0, 10.0, 10.0, 10.0, 10.0, 100.0, 10.0, 10.0, 10.0, 10.0, 10.0]
    lows = [5.0 + i for i in range(11)]
    closes = [10.0] * 10 + [150.0]

    result = support_resistance.find_support_resistance_zones(highs, lows, closes)

    assert result == [{"price": 100.0, "kind": "support", "strength": 1, "source": "auto"}]


def test_find_support_resistance_zones_classifies_a_pivot_low_as_resistance_once_price_has_fallen_past_it():
    # A pivot low forms at 200.0 (index 5), but the series ends with price at 50 — the level
    # that was once support is now above current price, so it must classify as resistance.
    lows = [250.0, 250.0, 250.0, 250.0, 250.0, 200.0, 250.0, 250.0, 250.0, 250.0, 250.0]
    highs = [300.0 + i for i in range(11)]
    closes = [250.0] * 10 + [50.0]

    result = support_resistance.find_support_resistance_zones(highs, lows, closes)

    assert result == [{"price": 200.0, "kind": "resistance", "strength": 1, "source": "auto"}]


def test_find_support_resistance_zones_returns_empty_for_a_series_too_short_for_a_pivot():
    highs = [10.0] * 10
    lows = [5.0] * 10
    closes = [10.0] * 10

    result = support_resistance.find_support_resistance_zones(highs, lows, closes)

    assert result == []


def test_find_support_resistance_zones_returns_empty_for_empty_input():
    assert support_resistance.find_support_resistance_zones([], [], []) == []
