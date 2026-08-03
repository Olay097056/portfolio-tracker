# Dashboard — Auto Support/Resistance (Phase 2 of 3)

## Problem Statement

The Dashboard's price chart (built in the prior two tickets) shows me a line and nothing else. Every time I look at a chart to gauge where a pullback might stall, or where a breakout would actually mean something, I'm doing that pattern-matching in my head — eyeballing where price has repeatedly turned before. The chart has no memory of its own history beyond what's drawn on the line.

## Solution

The Dashboard's price chart now draws horizontal support and resistance zones automatically, computed from the same bar series already being charted for the selected ticker and range — switching range recomputes the zones for that range's own history, the same way it already reflows the line.

Zones are found by detecting swing high/low pivots in the bar series, clustering pivots that sit close to each other in price into a single zone, and ranking zones by how many times price has touched them — the more touches, the stronger the zone. Only the three strongest zones above the current price and the three strongest below it are drawn, so the chart doesn't fill up with noise on a choppy ticker. A zone is labeled support or resistance by its position relative to the ticker's current price, not by whether it originally formed from a swing high or a swing low — a resistance level price has since broken through and closed above becomes a support level, the same "role reversal" a trader would call it by eye.

There is no manual editing yet — that's phase 3, deliberately kept out of this ticket. Every zone this ticket draws is machine-computed, and every zone carries a marker recording that fact so phase 3 can later distinguish an auto zone from a user-drawn one without changing the response shape again.

## User Stories

1. As a single user, I want the price chart to draw support and resistance zones automatically, so that I don't have to eyeball where price has turned before every time I open a chart.
2. As a single user, I want zones drawn as horizontal lines at specific price levels, so that I can read the exact level a zone represents at a glance.
3. As a single user, I want at most three support zones and three resistance zones drawn at once, so that the chart stays readable on a ticker that's chopped around a lot.
4. As a single user, I want the strongest zones (the ones price has touched most often) to be the ones kept when there are more candidates than the cap, so that the zones I see are the ones most likely to matter.
5. As a single user, I want a zone below the current price labeled support and a zone above it labeled resistance, regardless of whether that price level was originally a swing high or a swing low, so that the labels match how the level is actually behaving right now, not how it behaved when it first formed.
6. As a single user, I want zones to recompute when I change the chart's range, so that a zone I'm shown was actually found in the same window of history I'm looking at, not from some other window silently left over.
7. As a single user, I want support zones and resistance zones drawn in visually distinct colors from each other, so that I don't have to read the price to know which side of the market a line represents.
8. As a single user, I want the support/resistance color palette to be visually distinct from this app's existing rebalance-severity colors (green/yellow/red), so that a colored line on a price chart is never confused with a rebalance warning shown elsewhere in the app.
9. As a single user, I want no S/R zones drawn when there isn't enough history to find any (a very short intraday window, or a newly-listed ticker), rather than a fabricated or empty-looking zone, so that the chart never implies structure that isn't really there.
10. As a developer, I want the support/resistance algorithm to be a pure function over an explicit bar series (highs, lows, closes), not something that fetches its own data, so that it can be tested with hand-computed fixtures the same way every other signal in this codebase already is.
11. As a developer, I want every zone in the API response to carry a `source` field fixed to `"auto"` in this ticket, so that phase 3 (manual zone editing) can introduce `"manual"` zones later without changing the response shape again.

## Implementation Decisions

**Data source**: `chart_service.py`'s existing provider fetch already retrieves the full OHLC bar from yfinance for every range; today it discards everything except `Close`. This ticket widens the extraction to also keep `High` and `Low` per bar — no new network call, no new cache dimension, since it's the same `history()` call already being made and cached per `(ticker, range)`.

**Pivot detection**: swing high/low (fractal) pivots, using a 5-bar window on each side (a bar is a pivot high if its high is the maximum of the 5 bars before and 5 bars after it; symmetric for pivot lows). This is timeframe-agnostic — it runs unmodified against whatever bar series the selected range produced (5-minute bars for 1D, weekly bars for 5Y), with no special-casing per range.

**Clustering**: all detected pivots (highs and lows together, not kept separate) are grouped into zones by price proximity — two pivots within 1.5% of each other's price merge into the same zone. A zone's price is the average of the pivot prices that formed it, and a zone's strength is the count of pivots that merged into it (how many times price has touched that level).

**Classification (support vs. resistance)**: computed at classification time, not fixed at detection time. A zone is support if its price is below the ticker's current price (the closing price of the most recent bar in the series), resistance if above. This means the same underlying price level can be resistance when the chart is old and price hasn't reached it yet, and support after price closes above it — matching how a trader actually reads level "role reversal," not how the level originally formed.

**Ranking and cap**: after classification, support zones are ranked by strength (descending) and the top 3 are kept; resistance zones are ranked and capped the same way, independently. A ticker with fewer than 3 zones on either side simply shows fewer — there is no padding to reach the cap.

**Zero zones is a valid, non-error result**: a bar series too short to produce any pivots (fewer than 11 bars, the minimum for a single 5-bar-each-side pivot) returns an empty zone list, not an error and not a fabricated zone — this is a real result, not a fetch failure, and is represented differently from the chart's existing "ticker unavailable" state (which still means the underlying `points` fetch itself failed).

**Module boundary**: the algorithm lives in a new, independent module — pure functions taking explicit `highs`/`lows`/`closes` arrays and returning zones, doing no I/O and calling no external service — mirroring the existing convention set by `signals.py` (RSI, Bollinger Band width, ATR) and `dividend_metrics.py`. It is not added to either of those files, since support/resistance is a distinct concern (whole-series structure) from a per-ticker scanner signal (a single current value) or a dividend calculation.

**API shape**: support/resistance zones are bundled into the existing `GET /market/chart` response alongside `points`, computed from the exact same bar series `chart_service.py` already fetches and caches per `(ticker, range)` — not a separate endpoint. The frontend always needs both together (there's no scenario where zones are wanted without the chart, or vice versa), and a separate endpoint would mean a second fetch and a second cache entry for data that comes from one already-cached bar series. Each zone in the response carries: a price level, a `kind` of `"support"` or `"resistance"`, a `strength` (touch count), and a `source` fixed to `"auto"` for this ticket — the `source` field exists now specifically so phase 3 doesn't need to change the response shape when manual zones arrive.

**Caching**: no new cache — zones are computed from the same bar series that's already behind `chart_service.py`'s existing `(ticker, range)`-keyed, TTL'd cache, so they expire and refetch on exactly the same schedule the chart line already does.

**Rendering**: each zone is drawn as a horizontal price line via the charting library's price-line primitive (`lightweight-charts`'s `createPriceLine()` API, added to the existing `PriceChart` line-series instance), not a second data series — this is the API the library provides specifically for a fixed horizontal level with a label, distinct from a plotted series. Support and resistance use visually distinct colors from each other, and both are visually distinct from this app's existing rebalance-severity green/yellow/red palette (used elsewhere for holding/portfolio deviation, an unrelated concept) — support renders in a teal/cyan tone, resistance in an amber tone. Price lines are recreated whenever the chart's underlying data changes, matching the existing `PriceChart` pattern of a `useEffect` keyed on the data it renders (the same effect that already calls `setData()` on the series).

## Testing Decisions

Tests only assert observable behavior — what a caller can see or measure — never internal implementation details, matching this project's existing test suites throughout `backend/tests/` and `frontend/src/**/*.test.tsx`.

- **The pivot/clustering/classification/ranking algorithm**: direct unit tests with hand-computed bar-series fixtures and expected zones, following the exact convention `signals.py`'s and `dividend_metrics.py`'s tests already use (no mocking, no I/O — pure input/output assertions). Cases to cover: a clean pivot high and low each detected correctly; two pivots within 1.5% merging into one zone with the combined strength; two pivots further than 1.5% apart staying separate; a zone below current price classified support, one above classified resistance, and — the "role reversal" case — a zone that would have been a pivot-high classified as support once fed a `closes` series where the final close sits above that pivot's price; more than 3 candidate zones on one side, asserting only the 3 strongest survive and the rest are dropped; a bar series too short to produce a single pivot, asserting an empty result, not an error.
- **`chart_service.py`'s widened OHLC extraction and zone integration**: extends the existing test suite's `_fetch_from_provider`-level tests (see `test_chart_service.py`'s existing `test_fetch_from_provider_maps_yfinance_rows_to_time_and_close`-style tests) to also assert `high`/`low` are captured per point, and that `get_chart_data` (or its return shape) includes zones computed from those highs/lows — following the same monkeypatched-provider style already used throughout that file, no real yfinance calls.
- **`GET /market/chart` router**: extends the existing `test_market_router.py` chart tests to assert the response includes a `zones` field with the expected shape (`price`, `kind`, `strength`, `source`) when the service returns some, and an empty list when it returns none — following that file's existing `patch("app.routers.market.get_chart_data", ...)` pattern.
- **`PriceChart` component**: extends the existing mocked-`lightweight-charts` test suite (see `PriceChart.test.tsx`'s existing `vi.mock('lightweight-charts', ...)` setup) to assert `createPriceLine()` is called once per zone with the expected price/color, and that stale price lines from a prior render are removed before new ones are added when the underlying data changes (mirroring how the existing `setData` test already asserts on calls into the mocked series, not on canvas output).

## Out of Scope

- Manual zone editing — dragging, adding, or removing a zone by hand (phase 3, a separate spec, grilled only once this phase ships).
- Any UI control to adjust the pivot window, the clustering tolerance, or the zone cap — all three are fixed constants for this ticket, not user-facing settings.
- Persisting zones anywhere — they are recomputed from the bar series on every cache-fresh fetch, never written to the database. (Manual zones in phase 3 will need persistence; auto zones in this phase do not.)
- Any change to `history_service.py` or the Watchlist Scanners that depend on it — this ticket touches only `chart_service.py` and the Dashboard's own chart rendering path.
- Volume-based or time-decay weighting of zone strength — strength is a simple touch count for this ticket.

## Further Notes

- This is phase 2 of 3. Phase 3 (manual zone editing) is a separate spec/ticket, grilled only once phase 2 has shipped, since it builds directly on the zone data shape (in particular the `source` field) this phase introduces.
- The `source: "auto"` field is the one piece of this spec written specifically to make phase 3 additive rather than a breaking change — the same anticipatory-field pattern already used for `range` in Ticket 1 of this effort.
- This spec follows the same phase-scoping discipline as Tickets 1 and 2: the smallest slice that ships real, usable behavior (auto zones a user can see and trust) without reaching into the next phase's harder problem (letting a user edit them).
