# backend/app/support_resistance.py
from typing import Literal, TypedDict

PIVOT_WINDOW = 5
CLUSTER_TOLERANCE_PCT = 1.5
MAX_ZONES_PER_SIDE = 3


class Zone(TypedDict):
    price: float
    kind: Literal["support", "resistance"]
    strength: int
    source: Literal["auto"]


def _find_pivots(highs: list[float], lows: list[float]) -> list[float]:
    """Return the price of every swing-high and swing-low pivot in the series.

    A bar at index i is a pivot high if its high is the maximum of the PIVOT_WINDOW bars on
    either side of it (an 11-bar window when PIVOT_WINDOW=5); symmetric for pivot lows. Highs
    and lows are returned together as a flat list of prices — support/resistance classification
    happens later, by position relative to current price, not by which kind of pivot a price
    came from (see support_resistance's module docstring / the spec's Implementation Decisions).
    """
    pivots: list[float] = []
    n = len(highs)
    for i in range(PIVOT_WINDOW, n - PIVOT_WINDOW):
        window_highs = highs[i - PIVOT_WINDOW : i + PIVOT_WINDOW + 1]
        if highs[i] == max(window_highs):
            pivots.append(highs[i])
        window_lows = lows[i - PIVOT_WINDOW : i + PIVOT_WINDOW + 1]
        if lows[i] == min(window_lows):
            pivots.append(lows[i])
    return pivots


def _cluster_pivots(pivots: list[float]) -> list[tuple[float, int]]:
    """Group pivots within CLUSTER_TOLERANCE_PCT of each other into zones.

    Returns one (average_price, touch_count) pair per cluster. Pivots are sorted by price first,
    then merged sequentially: a pivot joins the current cluster if it's within tolerance of that
    cluster's running average (not its first member), so a cluster's effective center can drift
    slightly as members are added — a simple, deterministic approach, sufficient for this ticket.
    """
    if not pivots:
        return []
    sorted_pivots = sorted(pivots)
    clusters: list[list[float]] = [[sorted_pivots[0]]]
    for price in sorted_pivots[1:]:
        cluster_avg = sum(clusters[-1]) / len(clusters[-1])
        if abs(price - cluster_avg) / cluster_avg * 100 <= CLUSTER_TOLERANCE_PCT:
            clusters[-1].append(price)
        else:
            clusters.append([price])
    return [(sum(cluster) / len(cluster), len(cluster)) for cluster in clusters]


def _select_zones(clustered: list[tuple[float, int]], current_price: float) -> list[Zone]:
    """Classify each cluster as support or resistance by position vs. current_price, then keep
    only the MAX_ZONES_PER_SIDE strongest on each side.
    """
    support_candidates = sorted(
        (item for item in clustered if item[0] < current_price), key=lambda item: item[1], reverse=True
    )[:MAX_ZONES_PER_SIDE]
    resistance_candidates = sorted(
        (item for item in clustered if item[0] >= current_price), key=lambda item: item[1], reverse=True
    )[:MAX_ZONES_PER_SIDE]

    zones: list[Zone] = []
    for price, strength in support_candidates:
        zones.append({"price": price, "kind": "support", "strength": strength, "source": "auto"})
    for price, strength in resistance_candidates:
        zones.append({"price": price, "kind": "resistance", "strength": strength, "source": "auto"})
    return zones


def find_support_resistance_zones(highs: list[float], lows: list[float], closes: list[float]) -> list[Zone]:
    if not highs or not closes:
        return []
    pivots = _find_pivots(highs, lows)
    if not pivots:
        return []
    clustered = _cluster_pivots(pivots)
    return _select_zones(clustered, current_price=closes[-1])
