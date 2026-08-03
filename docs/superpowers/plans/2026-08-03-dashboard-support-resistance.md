# Dashboard Support/Resistance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Dashboard's price chart draw up to 3 support and 3 resistance zones automatically, computed from the same bar series already fetched for the selected ticker and range, ranked by pivot-touch strength and classified by position relative to current price (role-reversal aware).

**Architecture:** A new, independent pure-function module (`support_resistance.py`) detects swing pivots, clusters them, and classifies/caps them into zones — no I/O, mirroring `signals.py`. `chart_service.py`'s existing single fetch is widened to also extract `High`/`Low` (already present in the yfinance response, currently discarded) and call this module, bundling `zones` alongside the existing `points` in one cached result per `(ticker, range)` — no second fetch, no new cache dimension. The `GET /market/chart` response grows a `zones` field. The frontend renders each zone as a horizontal price line via `lightweight-charts`' `createPriceLine()`, tracked in a ref so stale lines are removed before new ones are drawn — the same "clear before redraw" discipline `PriceChart` already applies to `setData()`.

**Tech Stack:** FastAPI, pytest (backend); React 19, TypeScript, Vitest, `lightweight-charts` (frontend). No new dependencies.

## Global Constraints

- Pivot window: 5 bars on each side (a bar is a pivot if its high/low is the extreme of the 11-bar window centered on it).
- Cluster tolerance: 1.5% — two pivots within 1.5% of each other's price merge into one zone.
- Cap: at most 3 support zones and 3 resistance zones, independently, keeping the highest-strength (most-touched) ones when there are more candidates.
- Classification is by position relative to the ticker's current price (the last bar's close) at classification time — never by which kind of pivot (high or low) a zone originally formed from. A zone below current price is support; at or above is resistance.
- A bar series too short to produce a single pivot (fewer than 11 bars) returns an empty zone list — a valid result, never an error, never a fabricated zone.
- Every zone carries `source: "auto"` in this ticket (phase 3 will introduce `"manual"` later — this field exists now specifically so that doesn't require a response-shape change).
- No new network call and no new cache dimension: zones are computed from the exact same `yf.Ticker(...).history(...)` call and the same `(ticker, range)` cache entry `chart_service.py` already has.
- Support and resistance render in colors distinct from each other AND from this app's existing rebalance-severity green/yellow/red palette.
- Zones are exactly as susceptible to the stale-data-across-remount bug fixed in the prior two tickets as `points` and `error` are — they must be reset in the same render-phase block, not left to an effect.

---

### Task 1: Backend — the pure support/resistance algorithm module

**Files:**
- Create: `backend/app/support_resistance.py`
- Create: `backend/tests/test_support_resistance.py`

**Interfaces:**
- Consumes: nothing — pure, self-contained, no dependency on any other task.
- Produces: `find_support_resistance_zones(highs: list[float], lows: list[float], closes: list[float]) -> list[Zone]`, where `Zone = TypedDict("Zone", {"price": float, "kind": Literal["support", "resistance"], "strength": int, "source": Literal["auto"]})`. Task 2 imports `Zone` and `find_support_resistance_zones` from this module — no other names from this file are consumed elsewhere.

- [ ] **Step 1: Write the failing tests for pivot detection**

Create `backend/tests/test_support_resistance.py`:

```python
# backend/tests/test_support_resistance.py
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_support_resistance.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.support_resistance'`.

- [ ] **Step 3: Implement pivot detection**

Create `backend/app/support_resistance.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_support_resistance.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing tests for clustering**

Append to `backend/tests/test_support_resistance.py`:

```python
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
```

Add `import pytest` to the top of `backend/tests/test_support_resistance.py`, alongside the existing `from app import support_resistance`.

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_support_resistance.py -v -k cluster`
Expected: FAIL — `AttributeError: module 'app.support_resistance' has no attribute '_cluster_pivots'`.

- [ ] **Step 7: Implement clustering**

Append to `backend/app/support_resistance.py`:

```python
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
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_support_resistance.py -v`
Expected: PASS (7 tests)

- [ ] **Step 9: Write the failing tests for classification and capping**

Append to `backend/tests/test_support_resistance.py`:

```python
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
```

- [ ] **Step 10: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_support_resistance.py -v -k select_zones`
Expected: FAIL — `AttributeError: module 'app.support_resistance' has no attribute '_select_zones'`.

- [ ] **Step 11: Implement classification and capping**

Append to `backend/app/support_resistance.py`:

```python
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
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_support_resistance.py -v`
Expected: PASS (9 tests)

- [ ] **Step 13: Write the failing integration tests for the public function**

Append to `backend/tests/test_support_resistance.py`:

```python
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
```

- [ ] **Step 14: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_support_resistance.py -v -k find_support_resistance_zones`
Expected: FAIL — `AttributeError: module 'app.support_resistance' has no attribute 'find_support_resistance_zones'`.

- [ ] **Step 15: Implement the public function**

Append to `backend/app/support_resistance.py`:

```python
def find_support_resistance_zones(highs: list[float], lows: list[float], closes: list[float]) -> list[Zone]:
    if not highs or not closes:
        return []
    pivots = _find_pivots(highs, lows)
    if not pivots:
        return []
    clustered = _cluster_pivots(pivots)
    return _select_zones(clustered, current_price=closes[-1])
```

- [ ] **Step 16: Run the full test file**

Run: `cd backend && python -m pytest tests/test_support_resistance.py -v`
Expected: PASS (13 tests)

- [ ] **Step 17: Run the full backend suite**

Run: `cd backend && python -m pytest -q`
Expected: all PASS (173 pre-existing + 13 new = 186). This task adds a new, self-contained module — nothing in the existing 173 should be affected.

- [ ] **Step 18: Commit**

```bash
git add backend/app/support_resistance.py backend/tests/test_support_resistance.py
git commit -m "feat: add the support/resistance pivot detection algorithm"
```

---

### Task 2: Backend — integrate zones into `chart_service.py` and the `/market/chart` response

**Files:**
- Modify: `backend/app/chart_service.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/market.py`
- Modify: `backend/tests/test_chart_service.py`
- Modify: `backend/tests/test_market_router.py`

**Interfaces:**
- Consumes: `Zone` and `find_support_resistance_zones(highs, lows, closes)` from Task 1's `backend/app/support_resistance.py`.
- Produces: `chart_service.get_chart_data(ticker, range_) -> ChartFetchResult | None`, where `ChartFetchResult = TypedDict("ChartFetchResult", {"points": list[ChartPoint], "zones": list[Zone]})` — this is a **breaking change** to `get_chart_data`'s return shape (previously `list[ChartPoint] | None`); every existing caller and test in this codebase is updated within this task. `GET /market/chart` now returns `{"points": [...] | null, "zones": [{"price": float, "kind": "support"|"resistance", "strength": int, "source": "auto"}, ...]}`. Task 3 (frontend) consumes only this HTTP contract, not the Python types directly.

Read `backend/app/chart_service.py`, `backend/app/schemas.py`, `backend/app/routers/market.py`, `backend/tests/test_chart_service.py`, and `backend/tests/test_market_router.py` in full first — this task widens all five, and several existing tests in the last two files need their fixtures updated in place (not left as-is), because `_fetch_from_provider` will start needing `High`/`Low` on every fake `history()` DataFrame, and `get_chart_data`/`get_chart` will start returning a dict shape instead of a bare list.

- [ ] **Step 1: Update the existing `chart_service.py` tests to the new `ChartFetchResult` shape and add `High`/`Low` to every FakeTicker fixture**

In `backend/tests/test_chart_service.py`, make these exact replacements:

Replace:
```python
SAMPLE_POINTS = [
    {"time": "2026-01-02", "close": 100.0},
    {"time": "2026-01-05", "close": 101.5},
]
```
with:
```python
SAMPLE_POINTS = [
    {"time": "2026-01-02", "close": 100.0},
    {"time": "2026-01-05", "close": 101.5},
]
SAMPLE_RESULT = {"points": SAMPLE_POINTS, "zones": []}
```

Replace:
```python
def test_get_chart_data_returns_fetched_points(monkeypatch):
    monkeypatch.setattr(chart_service, "_fetch_from_provider", lambda ticker, range_: SAMPLE_POINTS)

    result = chart_service.get_chart_data("VTI", "1Y")

    assert result == SAMPLE_POINTS
```
with:
```python
def test_get_chart_data_returns_fetched_result(monkeypatch):
    monkeypatch.setattr(chart_service, "_fetch_from_provider", lambda ticker, range_: SAMPLE_RESULT)

    result = chart_service.get_chart_data("VTI", "1Y")

    assert result == SAMPLE_RESULT
```

Replace:
```python
def test_get_chart_data_caches_and_does_not_refetch_within_ttl(monkeypatch):
    call_count = {"n": 0}

    def fake_fetch(ticker, range_):
        call_count["n"] += 1
        return SAMPLE_POINTS

    monkeypatch.setattr(chart_service, "_fetch_from_provider", fake_fetch)

    first = chart_service.get_chart_data("VTI", "1Y")
    second = chart_service.get_chart_data("VTI", "1Y")

    assert first == SAMPLE_POINTS
    assert second == SAMPLE_POINTS
    assert call_count["n"] == 1
```
with:
```python
def test_get_chart_data_caches_and_does_not_refetch_within_ttl(monkeypatch):
    call_count = {"n": 0}

    def fake_fetch(ticker, range_):
        call_count["n"] += 1
        return SAMPLE_RESULT

    monkeypatch.setattr(chart_service, "_fetch_from_provider", fake_fetch)

    first = chart_service.get_chart_data("VTI", "1Y")
    second = chart_service.get_chart_data("VTI", "1Y")

    assert first == SAMPLE_RESULT
    assert second == SAMPLE_RESULT
    assert call_count["n"] == 1
```

Replace (inside `test_get_chart_data_refetches_after_ttl_expires`):
```python
    monkeypatch.setattr(chart_service, "_fetch_from_provider", lambda ticker, range_: SAMPLE_POINTS)
```
with:
```python
    monkeypatch.setattr(chart_service, "_fetch_from_provider", lambda ticker, range_: SAMPLE_RESULT)
```
and, later in the same test:
```python
    def fake_fetch_second(ticker, range_):
        call_count["n"] += 1
        return SAMPLE_POINTS
```
with:
```python
    def fake_fetch_second(ticker, range_):
        call_count["n"] += 1
        return SAMPLE_RESULT
```

Replace (inside `test_get_chart_data_caches_different_tickers_separately`):
```python
    def fake_fetch(ticker, range_):
        calls.append(ticker)
        return SAMPLE_POINTS
```
with:
```python
    def fake_fetch(ticker, range_):
        calls.append(ticker)
        return SAMPLE_RESULT
```

Replace (inside `test_get_chart_data_caches_different_ranges_separately_for_the_same_ticker`):
```python
    def fake_fetch(ticker, range_):
        calls.append(range_)
        return SAMPLE_POINTS
```
with:
```python
    def fake_fetch(ticker, range_):
        calls.append(range_)
        return SAMPLE_RESULT
```

Replace `test_a_failed_fetch_is_not_cached`'s body:
```python
def test_a_failed_fetch_is_not_cached(monkeypatch):
    monkeypatch.setattr(chart_service, "_fetch_from_provider", lambda ticker, range_: None)

    chart_service.get_chart_data("BADTICKER", "1Y")

    call_count = {"n": 0}

    def fake_fetch(ticker, range_):
        call_count["n"] += 1
        return SAMPLE_POINTS

    monkeypatch.setattr(chart_service, "_fetch_from_provider", fake_fetch)

    result = chart_service.get_chart_data("BADTICKER", "1Y")

    assert result == SAMPLE_POINTS
    assert call_count["n"] == 1
```
with:
```python
def test_a_failed_fetch_is_not_cached(monkeypatch):
    monkeypatch.setattr(chart_service, "_fetch_from_provider", lambda ticker, range_: None)

    chart_service.get_chart_data("BADTICKER", "1Y")

    call_count = {"n": 0}

    def fake_fetch(ticker, range_):
        call_count["n"] += 1
        return SAMPLE_RESULT

    monkeypatch.setattr(chart_service, "_fetch_from_provider", fake_fetch)

    result = chart_service.get_chart_data("BADTICKER", "1Y")

    assert result == SAMPLE_RESULT
    assert call_count["n"] == 1
```

Now the `_fetch_from_provider`-level tests, which construct their own `FakeTicker`/DataFrame — every one needs `"High"` and `"Low"` columns added (matching `"Close"`'s values is fine; none of these tests assert on zones, they only prove `points` extraction and caching still work). Replace:

```python
def test_fetch_from_provider_maps_yfinance_rows_to_time_and_close(monkeypatch):
    import pandas as pd

    index = pd.to_datetime(["2026-01-02", "2026-01-05"])
    history = pd.DataFrame({"Close": [100.0, 101.5]}, index=index)

    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period, interval):
            return history

    import yfinance as yf

    monkeypatch.setattr(yf, "Ticker", FakeTicker)

    result = chart_service._fetch_from_provider("VTI", "1Y")

    assert result == [
        {"time": "2026-01-02", "close": 100.0},
        {"time": "2026-01-05", "close": 101.5},
    ]
```
with:
```python
def test_fetch_from_provider_maps_yfinance_rows_to_time_and_close(monkeypatch):
    import pandas as pd

    index = pd.to_datetime(["2026-01-02", "2026-01-05"])
    history = pd.DataFrame(
        {"Close": [100.0, 101.5], "High": [100.0, 101.5], "Low": [100.0, 101.5]}, index=index
    )

    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period, interval):
            return history

    import yfinance as yf

    monkeypatch.setattr(yf, "Ticker", FakeTicker)

    result = chart_service._fetch_from_provider("VTI", "1Y")

    assert result["points"] == [
        {"time": "2026-01-02", "close": 100.0},
        {"time": "2026-01-05", "close": 101.5},
    ]
```

Replace `test_fetch_from_provider_requests_the_correct_period_and_interval_for_each_range`'s `history` line:
```python
    history = pd.DataFrame({"Close": [100.0]}, index=pd.to_datetime(["2026-01-02"]))
```
with:
```python
    history = pd.DataFrame(
        {"Close": [100.0], "High": [100.0], "Low": [100.0]}, index=pd.to_datetime(["2026-01-02"])
    )
```
(This test doesn't assert on `_fetch_from_provider`'s return value at all — only on the `calls` list of `(period, interval)` tuples — so no assertion changes are needed here, only the fixture.)

Replace `test_fetch_from_provider_uses_unix_timestamps_for_intraday_ranges`'s body:
```python
def test_fetch_from_provider_uses_unix_timestamps_for_intraday_ranges(monkeypatch):
    import pandas as pd

    index = pd.to_datetime(["2026-01-02 09:30:00", "2026-01-02 09:35:00"], utc=True)
    history = pd.DataFrame({"Close": [100.0, 100.5]}, index=index)

    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period, interval):
            return history

    import yfinance as yf

    monkeypatch.setattr(yf, "Ticker", FakeTicker)

    result = chart_service._fetch_from_provider("VTI", "1D")

    assert result == [
        {"time": int(index[0].timestamp()), "close": 100.0},
        {"time": int(index[1].timestamp()), "close": 100.5},
    ]
    assert all(isinstance(point["time"], int) for point in result)
```
with:
```python
def test_fetch_from_provider_uses_unix_timestamps_for_intraday_ranges(monkeypatch):
    import pandas as pd

    index = pd.to_datetime(["2026-01-02 09:30:00", "2026-01-02 09:35:00"], utc=True)
    history = pd.DataFrame(
        {"Close": [100.0, 100.5], "High": [100.0, 100.5], "Low": [100.0, 100.5]}, index=index
    )

    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period, interval):
            return history

    import yfinance as yf

    monkeypatch.setattr(yf, "Ticker", FakeTicker)

    result = chart_service._fetch_from_provider("VTI", "1D")

    assert result["points"] == [
        {"time": int(index[0].timestamp()), "close": 100.0},
        {"time": int(index[1].timestamp()), "close": 100.5},
    ]
    assert all(isinstance(point["time"], int) for point in result["points"])
```

Replace `test_fetch_from_provider_uses_date_strings_for_the_weekly_range`'s body:
```python
def test_fetch_from_provider_uses_date_strings_for_the_weekly_range(monkeypatch):
    import pandas as pd

    index = pd.to_datetime(["2026-01-02", "2026-01-09"])
    history = pd.DataFrame({"Close": [100.0, 105.0]}, index=index)

    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period, interval):
            return history

    import yfinance as yf

    monkeypatch.setattr(yf, "Ticker", FakeTicker)

    result = chart_service._fetch_from_provider("VTI", "5Y")

    assert result == [
        {"time": "2026-01-02", "close": 100.0},
        {"time": "2026-01-09", "close": 105.0},
    ]
```
with:
```python
def test_fetch_from_provider_uses_date_strings_for_the_weekly_range(monkeypatch):
    import pandas as pd

    index = pd.to_datetime(["2026-01-02", "2026-01-09"])
    history = pd.DataFrame(
        {"Close": [100.0, 105.0], "High": [100.0, 105.0], "Low": [100.0, 105.0]}, index=index
    )

    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period, interval):
            return history

    import yfinance as yf

    monkeypatch.setattr(yf, "Ticker", FakeTicker)

    result = chart_service._fetch_from_provider("VTI", "5Y")

    assert result["points"] == [
        {"time": "2026-01-02", "close": 100.0},
        {"time": "2026-01-09", "close": 105.0},
    ]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_chart_service.py -v`
Expected: FAIL — `KeyError`/`TypeError` on `result["points"]` (since `get_chart_data`/`_fetch_from_provider` still return bare lists at this point) and `AttributeError: 'DataFrame' object has no attribute 'High'`-style failures from the itertuples rows in the not-yet-updated `_fetch_from_provider`.

- [ ] **Step 3: Widen `chart_service.py`**

Replace the full contents of `backend/app/chart_service.py` with:

```python
# backend/app/chart_service.py
import time
from typing import Literal, TypedDict

from app.support_resistance import Zone, find_support_resistance_zones

# Matches history_service.py's TTL. This is a separate, independent cache from
# history_service.py's — this file exists specifically so a range-driven chart fetch never has
# to be taught into history_service.py's fixed 1-year-daily shape (see the spec's Implementation
# Decisions for why the two are kept apart).
CACHE_TTL_SECONDS = 900.0

ChartRange = Literal["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y"]

# range -> (yfinance period, yfinance interval, time encoding). "date" encoding produces a
# "YYYY-MM-DD" string (fine for daily/weekly bars, one point per day at most); "timestamp"
# encoding produces a UNIX-timestamp int, required for intraday bars (1D, 5D) since multiple
# points share the same calendar day and a date-string time would collide.
RANGE_TO_YFINANCE: dict[str, tuple[str, str, Literal["date", "timestamp"]]] = {
    "1D": ("1d", "5m", "timestamp"),
    "5D": ("5d", "30m", "timestamp"),
    "1M": ("1mo", "1d", "date"),
    "6M": ("6mo", "1d", "date"),
    "YTD": ("ytd", "1d", "date"),
    "1Y": ("1y", "1d", "date"),
    "5Y": ("5y", "1wk", "date"),
}


class ChartPoint(TypedDict):
    time: str | int
    close: float


class ChartFetchResult(TypedDict):
    points: list[ChartPoint]
    zones: list[Zone]


_cache: dict[tuple[str, str], tuple[ChartFetchResult, float]] = {}


def clear_cache() -> None:
    _cache.clear()


def _get_cached(ticker: str, range_: str) -> ChartFetchResult | None:
    entry = _cache.get((ticker, range_))
    if entry is None:
        return None
    result, fetched_at = entry
    if time.monotonic() - fetched_at > CACHE_TTL_SECONDS:
        return None
    return result


def _set_cached(ticker: str, range_: str, result: ChartFetchResult) -> None:
    _cache[(ticker, range_)] = (result, time.monotonic())


def _fetch_from_provider(ticker: str, range_: str) -> ChartFetchResult | None:
    import yfinance as yf

    period, interval, encoding = RANGE_TO_YFINANCE[range_]
    try:
        history = yf.Ticker(ticker).history(period=period, interval=interval)
        if history.empty:
            return None

        highs = [float(row.High) for row in history.itertuples()]
        lows = [float(row.Low) for row in history.itertuples()]
        closes = [float(row.Close) for row in history.itertuples()]

        if encoding == "timestamp":
            points: list[ChartPoint] = [
                {"time": int(row.Index.timestamp()), "close": float(row.Close)}
                for row in history.itertuples()
            ]
        else:
            points = [
                {"time": row.Index.strftime("%Y-%m-%d"), "close": float(row.Close)}
                for row in history.itertuples()
            ]

        zones = find_support_resistance_zones(highs, lows, closes)
        return {"points": points, "zones": zones}
    except Exception:
        return None


def get_chart_data(ticker: str, range_: ChartRange) -> ChartFetchResult | None:
    cached = _get_cached(ticker, range_)
    if cached is not None:
        return cached

    result = _fetch_from_provider(ticker, range_)
    if result is not None:
        _set_cached(ticker, range_, result)

    return result
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_chart_service.py -v`
Expected: PASS (all tests in this file — 20 pre-existing, unchanged in count, all updated in place).

- [ ] **Step 5: Widen `schemas.py`**

Read `backend/app/schemas.py` in full first — check whether `Literal` is already imported at the top of the file (`chart_service.py` imports it, but `schemas.py` may not); add `from typing import Literal` near the top if it's missing.

Find the existing `ChartOut` class and replace:

```python
class ChartOut(BaseModel):
    points: list[ChartPointOut] | None
```

with:

```python
class ZoneOut(BaseModel):
    price: float
    kind: Literal["support", "resistance"]
    strength: int
    source: Literal["auto"]


class ChartOut(BaseModel):
    points: list[ChartPointOut] | None
    zones: list[ZoneOut]
```

- [ ] **Step 6: Widen the router**

Read `backend/app/routers/market.py` in full first.

Replace the `get_chart` function:

```python
@router.get("/chart", response_model=ChartOut)
def get_chart(ticker: str, range: ChartRange = "1Y"):
    points = get_chart_data(ticker, range)
    return ChartOut(points=points)
```

with:

```python
@router.get("/chart", response_model=ChartOut)
def get_chart(ticker: str, range: ChartRange = "1Y"):
    result = get_chart_data(ticker, range)
    if result is None:
        return ChartOut(points=None, zones=[])
    return ChartOut(points=result["points"], zones=result["zones"])
```

Add `ZoneOut` to the existing `from app.schemas import ChartOut, TrendingOut` import line, making it `from app.schemas import ChartOut, TrendingOut, ZoneOut` — only if `ZoneOut` is actually referenced directly in this file (it is not, in the code above — `ChartOut(zones=...)` accepts a list of dicts, Pydantic coerces them; do NOT add an unused import). Skip this addition; `ChartOut, TrendingOut` stays as-is.

- [ ] **Step 7: Update the existing router tests**

Read `backend/tests/test_market_router.py` in full first.

Replace:
```python
def test_get_chart_returns_points_for_a_ticker(client):
    points = [{"time": "2026-01-02", "close": 100.0}, {"time": "2026-01-05", "close": 101.5}]

    with patch("app.routers.market.get_chart_data", return_value=points):
        response = client.get("/market/chart?ticker=VTI&range=1Y")

    assert response.status_code == 200
    assert response.json() == {"points": points}
```
with:
```python
def test_get_chart_returns_points_and_zones_for_a_ticker(client):
    points = [{"time": "2026-01-02", "close": 100.0}, {"time": "2026-01-05", "close": 101.5}]
    zones = [{"price": 95.0, "kind": "support", "strength": 3, "source": "auto"}]

    with patch("app.routers.market.get_chart_data", return_value={"points": points, "zones": zones}):
        response = client.get("/market/chart?ticker=VTI&range=1Y")

    assert response.status_code == 200
    assert response.json() == {"points": points, "zones": zones}
```

Replace:
```python
def test_get_chart_reports_unavailable_when_fetch_fails(client):
    with patch("app.routers.market.get_chart_data", return_value=None):
        response = client.get("/market/chart?ticker=BADTICKER&range=1Y")

    assert response.status_code == 200
    assert response.json() == {"points": None}
```
with:
```python
def test_get_chart_reports_unavailable_when_fetch_fails(client):
    with patch("app.routers.market.get_chart_data", return_value=None):
        response = client.get("/market/chart?ticker=BADTICKER&range=1Y")

    assert response.status_code == 200
    assert response.json() == {"points": None, "zones": []}
```

Replace:
```python
def test_get_chart_passes_ticker_and_range_through(client):
    with patch("app.routers.market.get_chart_data", return_value=[]) as mock_get_chart_data:
        client.get("/market/chart?ticker=VTI&range=1Y")

    mock_get_chart_data.assert_called_once_with("VTI", "1Y")
```
with:
```python
def test_get_chart_passes_ticker_and_range_through(client):
    with patch(
        "app.routers.market.get_chart_data", return_value={"points": [], "zones": []}
    ) as mock_get_chart_data:
        client.get("/market/chart?ticker=VTI&range=1Y")

    mock_get_chart_data.assert_called_once_with("VTI", "1Y")
```

Replace `test_get_chart_accepts_all_seven_ranges`'s body:
```python
def test_get_chart_accepts_all_seven_ranges(client):
    for range_ in ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y"]:
        with patch("app.routers.market.get_chart_data", return_value=[]) as mock_get_chart_data:
            response = client.get(f"/market/chart?ticker=VTI&range={range_}")
        assert response.status_code == 200, f"range={range_} failed: {response.json()}"
        mock_get_chart_data.assert_called_once_with("VTI", range_)
```
with:
```python
def test_get_chart_accepts_all_seven_ranges(client):
    for range_ in ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y"]:
        with patch(
            "app.routers.market.get_chart_data", return_value={"points": [], "zones": []}
        ) as mock_get_chart_data:
            response = client.get(f"/market/chart?ticker=VTI&range={range_}")
        assert response.status_code == 200, f"range={range_} failed: {response.json()}"
        mock_get_chart_data.assert_called_once_with("VTI", range_)
```

Replace `test_get_chart_preserves_integer_time_for_intraday_points`'s body:
```python
def test_get_chart_preserves_integer_time_for_intraday_points(client):
    points = [{"time": 1735808400, "close": 100.0}]

    with patch("app.routers.market.get_chart_data", return_value=points):
        response = client.get("/market/chart?ticker=VTI&range=1D")

    assert response.status_code == 200
    body = response.json()
    assert body["points"][0]["time"] == 1735808400
    assert isinstance(body["points"][0]["time"], int)
```
with:
```python
def test_get_chart_preserves_integer_time_for_intraday_points(client):
    points = [{"time": 1735808400, "close": 100.0}]

    with patch("app.routers.market.get_chart_data", return_value={"points": points, "zones": []}):
        response = client.get("/market/chart?ticker=VTI&range=1D")

    assert response.status_code == 200
    body = response.json()
    assert body["points"][0]["time"] == 1735808400
    assert isinstance(body["points"][0]["time"], int)
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_market_router.py -v`
Expected: PASS (all tests in this file).

- [ ] **Step 9: Run the full backend suite**

Run: `cd backend && python -m pytest -q`
Expected: all PASS (186 pre-existing, all still present and unmodified in count — this task only edits fixtures/mocks in place, adds no new test cases).

- [ ] **Step 10: Commit**

```bash
git add backend/app/chart_service.py backend/app/schemas.py backend/app/routers/market.py backend/tests/test_chart_service.py backend/tests/test_market_router.py
git commit -m "feat: bundle support/resistance zones into the chart data pipeline"
```

---

### Task 3: Frontend — render zones on the chart

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.test.ts`
- Modify: `frontend/src/hooks/useChartData.ts`
- Modify: `frontend/src/hooks/useChartData.test.tsx`
- Modify: `frontend/src/components/PriceChart.tsx`
- Modify: `frontend/src/components/PriceChart.test.tsx`
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/pages/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `GET /market/chart` from Task 2, now returning `{"points": [...] | null, "zones": [{"price": number, "kind": "support"|"resistance", "strength": number, "source": "auto"}, ...]}`.
- Produces: nothing consumed by a later task — this is the final task of this ticket.

Read `frontend/src/hooks/useChartData.ts`, `frontend/src/components/PriceChart.tsx`, and `frontend/src/pages/DashboardPage.tsx` in full first — you are widening all three, not rewriting from scratch. `useChartData.ts` already exports a `chartIdentityKey(ticker, range)` helper and applies a render-phase reset to `points` and `error` on identity change; `zones` must be reset in that exact same block, for the exact same reason (see this plan's Global Constraints).

- [ ] **Step 1: Write the failing test for the widened `Zone`/`ChartData` types**

Read `frontend/src/api/types.ts`'s current `ChartPoint`/`ChartData` definitions first.

Read `frontend/src/api/client.test.ts`'s existing `getChartData` tests for style, then append this test:

```ts
  it('getChartData passes zones through unchanged', async () => {
    mockFetchOnce({
      points: [{ time: '2026-01-02', close: 100 }],
      zones: [{ price: 95, kind: 'support', strength: 3, source: 'auto' }],
    });

    const result = await getChartData('VTI', '1Y');

    expect(result.zones).toEqual([{ price: 95, kind: 'support', strength: 3, source: 'auto' }]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/api/client.test.ts`
Expected: FAIL — TypeScript error, `ChartData` has no `zones` property yet (or a runtime `undefined` mismatch if esbuild doesn't catch the type error — either failure mode confirms red state).

- [ ] **Step 3: Widen the types**

In `frontend/src/api/types.ts`, replace:

```ts
export interface ChartPoint {
  time: string | number;
  close: number;
}

export interface ChartData {
  points: ChartPoint[] | null;
}
```

with:

```ts
export interface ChartPoint {
  time: string | number;
  close: number;
}

export interface Zone {
  price: number;
  kind: 'support' | 'resistance';
  strength: number;
  source: 'auto';
}

export interface ChartData {
  points: ChartPoint[] | null;
  zones: Zone[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/api/client.test.ts && cd .. && cd frontend && npx tsc -b`
Expected: vitest PASS, `tsc -b` clean.

- [ ] **Step 5: Write the failing test for `useChartData`'s widened render-phase reset**

Read `frontend/src/hooks/useChartData.ts` in full — find the `chartIdentityKey`-based render-phase reset block; you are adding one line to it, not restructuring it.

Read `frontend/src/hooks/useChartData.test.tsx`'s existing tests for style, then append:

```ts
  it('fetches and stores zones alongside points', async () => {
    const points = [{ time: '2026-01-02', close: 100 }];
    const zones = [{ price: 95, kind: 'support' as const, strength: 3, source: 'auto' as const }];
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points, zones });

    const { result } = renderHook(() => useChartData('VTI', '1Y'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.zones).toEqual(zones);
  });

  it('clears zones immediately when the ticker changes, before the new fetch resolves', async () => {
    let resolveSecond!: (value: client.ChartData) => void;
    const secondPromise = new Promise<client.ChartData>((resolve) => {
      resolveSecond = resolve;
    });
    vi.spyOn(client, 'getChartData')
      .mockResolvedValueOnce({
        points: [{ time: '2026-01-02', close: 100 }],
        zones: [{ price: 95, kind: 'support', strength: 3, source: 'auto' }],
      })
      .mockReturnValueOnce(secondPromise);

    const { result, rerender } = renderHook(({ ticker }) => useChartData(ticker, '1Y'), {
      initialProps: { ticker: 'VTI' as string | null },
    });
    await waitFor(() => expect(result.current.zones.length).toBe(1));

    rerender({ ticker: 'SPY' });

    expect(result.current.zones).toEqual([]);

    resolveSecond({ points: [], zones: [] });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/hooks/useChartData.test.tsx -t "zones"`
Expected: FAIL — `result.current.zones` is `undefined` (the hook doesn't expose a `zones` field yet).

- [ ] **Step 7: Widen `useChartData`**

Add `Zone` to the existing `import type { ChartPoint, ChartRange } from '../api/types';` line, making it `import type { ChartPoint, ChartRange, Zone } from '../api/types';`.

Add a `zones` state declaration next to the existing `points` state:
```ts
  const [zones, setZones] = useState<Zone[]>([]);
```

In the render-phase reset block (the one comparing `chartIdentityKey`), add `setZones([])` alongside the existing `setPoints(null)` and `setError(null)`:
```ts
  const prevKeyRef = useRef(chartIdentityKey(ticker, range));
  const currentKey = chartIdentityKey(ticker, range);
  if (prevKeyRef.current !== currentKey) {
    prevKeyRef.current = currentKey;
    setPoints(null);
    setError(null);
    setZones([]);
  }
```

In the `useEffect`'s `ticker === null` branch, add `setZones([])` alongside the existing resets:
```ts
    if (ticker === null) {
      setPoints(null);
      setLoading(false);
      setError(null);
      setZones([]);
      return;
    }
```

In the `.then((data) => { ... })` success handler, set zones whenever a request lands (whether `data.points` is null or not — a ticker with unavailable points still has an empty zones array from the backend, and a ticker with real points may have real zones):
```ts
    getChartData(ticker, range)
      .then((data) => {
        if (requestId.current !== thisRequestId) return;
        if (data.points === null) {
          setPoints(null);
          setError(`No chart data available for ${ticker}.`);
        } else {
          setPoints(data.points);
        }
        setZones(data.zones);
      })
```

In the `.catch((err) => { ... })` handler, clear zones on a thrown error (matching the existing `setPoints(null)` there):
```ts
      .catch((err) => {
        if (requestId.current !== thisRequestId) return;
        setPoints(null);
        setError(toMessage(err));
        setZones([]);
      })
```

Finally, add `zones` to the hook's return statement:
```ts
  return { points, loading, error, zones };
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/hooks/useChartData.test.tsx`
Expected: PASS (all tests in this file — 9 pre-existing + 2 new = 11).

- [ ] **Step 9: Run the full frontend suite and type check**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: `tsc -b` will show a NEW error at this point — `DashboardPage.tsx` destructures `{ points, loading, error }` from `useChartData(...)` and passes them to `<PriceChart>`, which doesn't accept a `zones` prop yet. This is expected; Steps 10-15 add it. Confirm the vitest suite for `useChartData.test.tsx` specifically still passes (11/11) even though `tsc -b` for the whole project is not yet clean.

- [ ] **Step 10: Write the failing tests for zone rendering in `PriceChart`**

Read `frontend/src/components/PriceChart.tsx` and `frontend/src/components/PriceChart.test.tsx` in full — you are adding a `zones` prop and a price-line-rendering effect, alongside the existing `setData` effect, not replacing anything.

Append to `frontend/src/components/PriceChart.test.tsx`:

```tsx
  it('creates a price line for each zone with the right price, kind-based color, and title', () => {
    const createPriceLine = vi.fn(() => ({}));
    addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine: vi.fn() });

    render(
      <PriceChart
        points={null}
        loading={false}
        error={null}
        zones={[
          { price: 95, kind: 'support', strength: 3, source: 'auto' },
          { price: 110, kind: 'resistance', strength: 2, source: 'auto' },
        ]}
      />,
    );

    expect(createPriceLine).toHaveBeenCalledTimes(2);
    expect(createPriceLine).toHaveBeenCalledWith(expect.objectContaining({ price: 95, color: '#14b8a6' }));
    expect(createPriceLine).toHaveBeenCalledWith(expect.objectContaining({ price: 110, color: '#f59e0b' }));
  });

  it('removes stale price lines before drawing new ones when zones change', () => {
    const removePriceLine = vi.fn();
    const firstLine = { id: 'first' };
    const createPriceLine = vi.fn().mockReturnValueOnce(firstLine).mockReturnValue({ id: 'second' });
    addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine });

    const { rerender } = render(
      <PriceChart points={null} loading={false} error={null} zones={[{ price: 95, kind: 'support', strength: 3, source: 'auto' }]} />,
    );
    expect(createPriceLine).toHaveBeenCalledTimes(1);

    rerender(
      <PriceChart points={null} loading={false} error={null} zones={[{ price: 96, kind: 'support', strength: 4, source: 'auto' }]} />,
    );

    expect(removePriceLine).toHaveBeenCalledWith(firstLine);
    expect(createPriceLine).toHaveBeenCalledTimes(2);
  });

  it('does not create any price lines when zones is empty', () => {
    const createPriceLine = vi.fn();
    addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine: vi.fn() });

    render(<PriceChart points={null} loading={false} error={null} zones={[]} />);

    expect(createPriceLine).not.toHaveBeenCalled();
  });
```

`addSeries` is already declared at the `describe` block's scope (`let addSeries: ReturnType<typeof vi.fn>;`, assigned inside `beforeEach`) in the current file, so the three new tests above can call `addSeries.mockReturnValue(...)` directly, exactly as written, with no restructuring needed.

- [ ] **Step 11: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/PriceChart.test.tsx`
Expected: FAIL — `PriceChart` doesn't accept a `zones` prop yet (TypeScript error) and calls no `createPriceLine`.

- [ ] **Step 12: Implement zone rendering in `PriceChart`**

Add `Zone` to the existing `import type { ChartPoint } from '../api/types';` line, making it `import type { ChartPoint, Zone } from '../api/types';`.

Add `zones: Zone[]` to `PriceChartProps`:
```ts
interface PriceChartProps {
  points: ChartPoint[] | null;
  loading: boolean;
  error: string | null;
  zones: Zone[];
}
```

Add color constants near the top of the file, after the imports:
```ts
const SUPPORT_COLOR = '#14b8a6'; // teal — visually distinct from this app's rebalance-severity green/yellow/red
const RESISTANCE_COLOR = '#f59e0b'; // amber — visually distinct from this app's rebalance-severity green/yellow/red
```

Update the component signature to destructure `zones`:
```ts
export function PriceChart({ points, loading, error, zones }: PriceChartProps) {
```

Add a ref to track created price lines, alongside the existing `seriesRef`:
```ts
  const priceLinesRef = useRef<IPriceLine[]>([]);
```

Add `IPriceLine` to the existing `import { createChart, LineSeries, type IChartApi, type ISeriesApi, type Time, type UTCTimestamp } from 'lightweight-charts';` line, making it `import { createChart, LineSeries, type IChartApi, type IPriceLine, type ISeriesApi, type Time, type UTCTimestamp } from 'lightweight-charts';`.

Add a new effect after the existing `setData` effect (the one keyed on `[points]`):
```ts
  useEffect(() => {
    if (seriesRef.current === null) return;
    priceLinesRef.current.forEach((line) => seriesRef.current!.removePriceLine(line));
    priceLinesRef.current = zones.map((zone) =>
      seriesRef.current!.createPriceLine({
        price: zone.price,
        color: zone.kind === 'support' ? SUPPORT_COLOR : RESISTANCE_COLOR,
        title: `${zone.kind === 'support' ? 'S' : 'R'} (${zone.strength})`,
      }),
    );
  }, [zones]);
```

- [ ] **Step 13: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/PriceChart.test.tsx`
Expected: PASS (all tests in this file — 7 pre-existing + 3 new = 10).

- [ ] **Step 14: Wire `zones` through `DashboardPage`**

Read `frontend/src/pages/DashboardPage.tsx` in full.

Update the destructure of `useChartData(...)`'s return value:
```ts
  const { points, loading, error, zones } = useChartData(selectedTicker, range);
```

Update the `<PriceChart>` element to pass `zones` through:
```tsx
              <PriceChart key={chartIdentityKey(selectedTicker, range)} points={points} loading={loading} error={error} zones={zones} />
```

- [ ] **Step 15: Write a test proving zones reach the page**

Read `frontend/src/pages/DashboardPage.test.tsx`'s existing `beforeEach` (which mocks `createChart`) and the `'fetches and renders the chart for the ticker once selected'`-style test for the exact pattern to follow.

Append to `frontend/src/pages/DashboardPage.test.tsx`:

```tsx
  it('passes zones from the fetch through to the chart', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    const createPriceLine = vi.fn();
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn(), createPriceLine, removePriceLine: vi.fn() })),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);
    vi.spyOn(client, 'getChartData').mockResolvedValue({
      points: [{ time: '2026-01-02', close: 100 }],
      zones: [{ price: 95, kind: 'support', strength: 3, source: 'auto' }],
    });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

    await waitFor(() => expect(createPriceLine).toHaveBeenCalledWith(expect.objectContaining({ price: 95 })));
  });
```

- [ ] **Step 16: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/DashboardPage.test.tsx`
Expected: PASS (all tests in this file — 11 pre-existing + 1 new = 12).

- [ ] **Step 17: Run the full frontend suite and type check**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: all tests PASS (252 pre-existing + 1 client.test.ts + 2 useChartData.test.tsx + 3 PriceChart.test.tsx + 1 DashboardPage.test.tsx = 259), `tsc -b` exits with no output.

- [ ] **Step 18: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.test.ts frontend/src/hooks/useChartData.ts frontend/src/hooks/useChartData.test.tsx frontend/src/components/PriceChart.tsx frontend/src/components/PriceChart.test.tsx frontend/src/pages/DashboardPage.tsx frontend/src/pages/DashboardPage.test.tsx
git commit -m "feat: render support/resistance zones on the Dashboard price chart"
```

---

## Final Verification

- [ ] `cd backend && python -m pytest -q` → all pass (186)
- [ ] `cd frontend && npx vitest run` → all pass (259)
- [ ] `cd frontend && npx tsc -b` → no output (clean)
- [ ] Manually confirm: open the app, select a ticker with meaningful price history on the Dashboard tab, and see teal support lines and amber resistance lines drawn on the chart, with no more than 3 of each; switch range and confirm the zones redraw for that range's own history — requires a real backend + real yfinance access, which the automated tests (all of which mock `_fetch_from_provider`/`getChartData`/`lightweight-charts`) cannot verify.
