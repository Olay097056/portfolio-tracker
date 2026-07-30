# Dashboard — Price Chart (Phase 1 of 3)

## Problem Statement

Every price signal in this app — Momentum, Pre-Squeeze, Dividend Ranking, the DCA and stress-test calculators — is a number in a table. None of it is a picture. If I want to actually *see* what a ticker's price has done — is this pullback normal noise or a real trend break, does today's bar look like anything on the weekly chart — I have to leave the app and open a browser tab somewhere else.

The original layout plan for this app (ADR 0001) always included a Dashboard page built around a price chart, but it was never wired up. Nothing in the codebase renders a chart today: no charting library is installed, no chart component exists, and there is no Dashboard tab in the top navigation.

## Solution

A new top-level **Dashboard** tab, added to the navigation ahead of the existing Portfolios/Tools/Watchlist tabs (per ADR 0001's structural plan).

The tab holds one thing: a price chart. I pick a ticker from a single dropdown — populated from every ticker across all my Portfolios' holdings and my Watchlist, deduplicated — and a range (1D/5D/1M/6M/YTD/1Y/5Y). The chart redraws with that ticker's closing price over that range. There is no candlestick, no overlay, no per-ticker management panel yet — this phase proves the pipeline end-to-end (pick a ticker, fetch real data, render it) the same way the Momentum Scanner walking skeleton proved Watchlist scanning end-to-end before later tickets added more signals.

Two follow-on phases are already scoped in outline but explicitly out of scope for this spec:
- **Phase 2**: auto-detected support/resistance zones drawn over the chart (PRD.md section 6's swing-high/low pivot algorithm).
- **Phase 3**: manual support/resistance line editing (drag to move, click to add/remove).

## User Stories

1. As a single user, I want a Dashboard tab in the top navigation, so that a price chart is one click away instead of requiring a different app entirely.
2. As a single user, I want to pick which ticker to chart from a dropdown, so that I don't have to remember or retype symbols I'm already tracking somewhere else in the app.
3. As a single user, I want that dropdown to include every ticker from my Portfolios and my Watchlist with no duplicates, so that I can chart anything I already care about without adding it anywhere new first.
4. As a single user, I want to pick a range (1D, 5D, 1M, 6M, YTD, 1Y, or 5Y), so that I can zoom out to see a trend or zoom in to see recent noise.
5. As a single user, I want the chart granularity to be chosen for me based on the range I pick, so that I never have to know which range/interval combinations a data provider actually supports.
6. As a single user, I want the chart to show closing price as a line, so that phase 1 stays simple to build and still shows me the trend I came here for.
7. As a single user, I want an explicit loading state while chart data is being fetched, so that a blank chart area doesn't read as broken.
8. As a single user, I want an explicit error message when a ticker's chart data can't be fetched, so that I'm told the truth rather than shown a chart that silently has no data.
9. As a single user, I want no ticker selected by default when I open the Dashboard, so that the tab doesn't fire off a fetch I didn't ask for the moment I open it (same "nothing loads until I act" discipline as the Scanners).
10. As a single user, I want switching tickers or ranges to replace the chart's data, not fire a background request I can't see, so that what I'm looking at always matches what I selected.
11. As a single user, I want repeat requests for the same ticker+range within a short window to be served from cache, so that flipping back and forth between two tickers doesn't burn through the price provider's rate limit.
12. As a developer, I want the existing Scanners' `history_service.py` left untouched, so that this new chart feature can't destabilize Momentum/Pre-Squeeze/RSI/ATR/Bollinger signals that already depend on its exact 1-year-daily cache shape.

## Implementation Decisions

**Navigation**: a new `Dashboard` entry added to `App.tsx`'s top-level `TABS`, positioned first (ahead of Portfolios), per ADR 0001's structural layout decision. A new `DashboardPage` component hosts it. This phase does not build the 3-column layout from the original mockup — no portfolio-switcher sidebar, no per-ticker manage/DCA/stress-test panels (those already work today, embedded in `HoldingRow` under Portfolios; this phase does not move or duplicate them).

**Ticker source**: the dropdown's options come from the union of every ticker across all Portfolios' holdings (via the existing portfolios/holdings endpoints) and the Watchlist (via the existing `listWatchlist`), deduplicated. No new backend endpoint is needed for this list — it's assembled client-side from data already fetched by existing hooks.

**Range → interval mapping**: range and interval are not independent user choices. A fixed, hardcoded mapping derives the fetch interval from the selected range, matching what mainstream stock-chart UIs (Yahoo Finance, Google Finance) do rather than exposing the full cross-product of a data provider's period/interval matrix (most of which the provider rejects):

| Range | Interval |
| --- | --- |
| 1D | 5 minute |
| 5D | 30 minute |
| 1M | 1 day |
| 6M | 1 day |
| YTD | 1 day |
| 1Y | 1 day |
| 5Y | 1 week |

**Backend — new `chart_service.py`**: a new, independent service module, not a reuse or extension of `history_service.py`. `history_service.py` exists to serve the Scanners a fixed 1-year-daily window per ticker; this feature needs a window and granularity that vary per user selection, which is a different shape of problem entirely — coupling the two would mean teaching `history_service` to do resampling and intraday fetches it has no other reason to support. `chart_service.py` follows the same structural pattern as `history_service.py`/`trending_service.py`: a private raw-fetch function behind a cached public function, an in-memory cache (this time keyed by `(ticker, range)` rather than just `ticker`), a `clear_cache()` test hook, and a failed fetch is never cached. Cache TTL matches the project's existing convention for intraday-sensitive data (`history_service.py`'s 15 minutes).

**Backend — new endpoint**: `GET /market/chart?ticker=X&range=1D|5D|1M|6M|YTD|1Y|5Y` under the existing `market` router (alongside `/market/trending`), returning a list of `{time, close}` points (or an explicit failure indicator) for the requested ticker and range. Like every other price-fetching endpoint in this project, a fetch that fails returns an explicit "unavailable" signal rather than a fabricated or partial series — the frontend renders this as the error state from user story 8, never as an empty-but-successful chart.

**Frontend — data fetching**: a new `useChartData()` hook mirrors the existing `useTrendingData`/`usePriceSignalsScan` shape (`{ data, loading, error }`), triggered by ticker/range selection rather than a manual Scan button — this is a single-series fetch per selection change, not a multi-ticker batch scan, so the Scanners' "press Scan, watch progress" pattern doesn't apply here. Changing ticker or range triggers exactly one new fetch and supersedes any in-flight one.

**Frontend — charting library**: `lightweight-charts` (TradingView, Apache-2.0, no API key, no runtime cost) is added as a new frontend dependency — the first charting library in this project. It is chosen because it is purpose-built for exactly this category of chart, its `addLineSeries()` covers phase 1 directly, and its `createPriceLine()` and coordinate-transform APIs (`timeToCoordinate`/`priceToCoordinate`) directly serve phases 2 and 3, which is why this decision belongs in the phase 1 spec even though phase 1 doesn't use those features yet.

**Frontend — chart component**: a new `PriceChart` component wraps `lightweight-charts` behind a small, testable interface — it receives already-fetched `{time, close}[]` data and range/loading/error state as props, and owns no fetching itself (`DashboardPage` composes `useChartData()` with the ticker/range selectors and passes the result down). This mirrors the existing separation in this codebase between hooks (data) and presentational components (rendering) used throughout the Scanners.

## Testing Decisions

Tests only assert observable behavior — what a caller can see or measure — never internal implementation details, matching this project's existing test suites throughout `backend/tests/` and `frontend/src/**/*.test.tsx`.

- **`chart_service.py`**: unit tests monkeypatching the private raw-fetch function, following the exact pattern already used by `test_history_service.py` and `test_trending_service.py` — cache hit within TTL, cache miss/refetch after TTL, a failed fetch is never cached, and two different ranges for the same ticker cache independently (mirrors the existing "gainers and losers cache separately" test in `test_trending_service.py`).
- **The range→interval mapping**: a pure function with a direct table-driven unit test — one assertion per row of the mapping table above, following this project's "hand-computed expected values" convention used for `signals.py`/`dividend_metrics.py`.
- **`GET /market/chart` router**: FastAPI `TestClient` integration tests following `test_market_router.py`'s existing shape — a successful fetch, a failed fetch returning the explicit unavailable signal (never a 500, matching the "never fabricate" convention enforced throughout every other price-fetching endpoint in this project), and range/ticker query-param wiring.
- **`useChartData()`**: hook-level tests in the style of the existing scanner hooks — fetches on selection change, supersedes an in-flight fetch when the selection changes again before it resolves, surfaces the error state on failure.
- **`PriceChart` component**: since `lightweight-charts` renders to a `<canvas>` that JSDOM/RTL cannot meaningfully assert on pixel-by-pixel, tests mock the `lightweight-charts` module and assert the *calls* the component makes into it (`addLineSeries().setData(...)` called with the expected point array on data change, chart recreated or updated — not duplicated — on ticker/range change) — the same "assert the call, not the rendered pixels" approach already used for the `useSortableColumn`/`sortByNullableNumber` retrofit's `aria-sort` assertions where the underlying interaction (sort) isn't directly visible either.
- **`DashboardPage`**: RTL tests for the parts that are DOM-observable regardless of the chart's internals — no ticker selected on open issues no fetch (mirrors the Scanners' "no request until Scan is pressed" tests), the ticker dropdown lists the deduplicated union of Portfolio holdings and Watchlist tickers, loading and error states render, switching selection re-fetches.

## Out of Scope

- Support/resistance zones, auto-detected or manual (phases 2 and 3 — separate specs).
- Candlestick rendering, or any OHLC-dependent chart type (`history_service.py`-style bars only carry close/high/low/volume today; `chart_service.py` only fetches what a line chart needs).
- The full 3-column Dashboard layout from the original mockup: portfolio-switcher sidebar, per-ticker manage-holding panel, and moving the DCA/stress-test calculators out of `HoldingRow`. These already work where they are.
- Volume as a chart series or overlay.
- Any chart interaction beyond range/ticker selection (zoom, pan, crosshair tooltips) — `lightweight-charts` provides these by default and nothing here disables them, but none are a deliverable of this phase; whatever the library does out of the box is accepted as-is, not tested for.
- Reusing or modifying `history_service.py` in any way.

## Further Notes

- This is phase 1 of 3. Phases 2 (auto S/R) and 3 (manual S/R override) are deliberately separate specs/tickets, grilled and written only once phase 1 has shipped, since S/R rendering and editing both build directly on `PriceChart`'s existence and phase 1's data shape.
- The range→interval mapping is a product decision as much as a technical one (it decides how "zoomed in" 1D actually looks); if it ever needs to change, the fix is one row in one table, not a redesign.
- This spec follows the same walking-skeleton philosophy as Ticket 3 of the Watchlist and Scanners effort (`docs/specs/2026-07-25-watchlist-and-scanners.md`): the smallest possible slice that proves the real pipeline end-to-end, with richer signals layered on in later, separately-grilled work.
