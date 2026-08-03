# Tickets: Watchlist and Scanners

Builds the Watchlist area and its four Scanner tabs, from the spec in `docs/specs/2026-07-25-watchlist-and-scanners.md`. Respects ADR 0004 (scanning universe and provider split) and ADR 0005 (raw signals, never composite scores or subjective tags).

Work the **frontier**: any ticket whose blockers are all done. After "Watchlist area" lands, three tickets open at once — "Momentum Scanner walking skeleton", "Dividend Ranking", and "Trending Stocks Today" are independent of each other.

## Extract the shared tab navigation

**What to build:** Nothing changes for the user. The top-level navigation and the Tools sub-tab strip currently hand-roll the same pressed-button pattern in two places, and the Watchlist area about to be built needs a third copy with five tabs. Extract one reusable tab-strip so the new area is a list of tab definitions rather than another thirty lines of duplicated markup. This is prefactoring: make the change easy, then make the easy change.

**Blocked by:** None — can start immediately.

- [x] Both the top-level navigation and the Tools sub-tabs render through one shared tab component
- [x] Every existing test passes **without modification** — this is the proof the refactor preserved behaviour
- [x] The active tab is still communicated to assistive technology the same way it is today
- [x] Type checking passes

## Watchlist area

**What to build:** A new top-level Watchlist area, separate from Portfolios and Tools, whose first tab lets the user manage the Watchlist. The user can add a ticker, optionally tagging it with a free-text category, see everything they are following in one list, and remove entries. This is frontend-only work: the WatchlistItem model and its create/list/delete endpoints already exist and already have backend tests, and their shape does not change.

**Blocked by:** Extract the shared tab navigation

- [x] A Watchlist entry appears in the top-level navigation and opens the Watchlist area
- [x] The area uses the shared tab component, with Watchlist management as its first sub-tab
- [x] Submitting a ticker adds it and it appears in the list
- [x] A ticker can be added with a category and without one
- [x] Tickers are stored upper-cased, so casing differences cannot create duplicate entries
- [x] Each listed entry shows its ticker and its category
- [x] An entry can be removed and disappears from the list
- [x] An empty Watchlist shows a message inviting a first ticker rather than a blank area
- [x] A failed add surfaces an error message and does not clear the form silently
- [x] Existing backend endpoints are unchanged

## Momentum Scanner walking skeleton

**What to build:** The first complete path from a rate-limited market-data provider through to a rendered Scanner table. A Momentum Scanner sub-tab opens empty with a Scan button; pressing it fetches one year of daily history for each Watchlist ticker, sequentially, and fills in a single signal — percent change over a period the user selects. Everything a Scanner needs to survive real use is proven here: caching, per-ticker failure isolation, progress reporting, and the never-fabricate rule. Later tickets add signals to a shell that already works.

**Blocked by:** Watchlist area

- [x] A history service fetches one year of daily history per ticker behind a single private provider function, caching per ticker in memory with a fifteen-minute TTL and exposing a cache-clearing entry point for tests, following the existing price and FX services
- [x] A failed fetch is not cached
- [x] The price-signals endpoint returns one row per Watchlist ticker, including tickers whose fetch failed, with unavailable values carried as null
- [x] Tickers are fetched sequentially, and one ticker's failure does not abandon the rest of the scan
- [x] The tab shows an empty table and a Scan button on open, and issues no request until Scan is pressed
- [x] Pressing Scan reports per-ticker progress while running and disables the button until the scan completes
- [x] Results remain on screen after the scan finishes and until Scan is pressed again
- [x] A ticker whose data could not be fetched appears as a row marked unavailable, not omitted
- [x] The user can select the percent-change period from one day, one week, and one month
- [x] The percent-change column is sortable and its heading states the period measured
- [x] An empty Watchlist shows a message saying there is nothing to scan, distinct from a scan that found nothing
- [x] A second scan within the TTL is served from cache without refetching

## Momentum Scanner remaining signals

**What to build:** Fill out the Momentum Scanner with its three remaining measurements — 14-period RSI, latest volume against its 20-period average, and price's distance from its 50-period simple moving average as a percent. Each is a pure function over an in-memory price series, tested against hand-computed expectations. Separated from the walking skeleton because four signals plus their insufficient-history cases is a context window's worth of careful arithmetic on its own.

**Blocked by:** Momentum Scanner walking skeleton

- [x] Signal maths lives in pure functions taking a series of closes, highs, lows, and volumes, performing no I/O and taking no ticker
- [x] 14-period RSI, volume-to-20-period-average ratio, and percent distance from the 50-period simple moving average each appear as their own sortable column
- [x] Every column heading states its measurement and its period, so a number can be reconciled against a chart elsewhere
- [x] A signal whose window exceeds the available history reports unavailable rather than being computed on a short window
- [x] A ticker with partial history still shows the signals that could be computed
- [x] There is no composite score and no social-sentiment column anywhere
- [x] Each signal has direct pure-function tests with hand-computed expected values, including an insufficient-history case

## Pre-Squeeze Scanner

**What to build:** A Pre-Squeeze Scanner sub-tab measuring volatility contraction relative to each ticker's *own* recent history: 20-period Bollinger Band width at two standard deviations as a percent of price, where that width sits as a percentile against the same ticker's trailing six months, 14-period ATR as a percent of price, and the volume ratio already built for Momentum. It rides the history service and price-signals endpoint that already exist, so scanning in either tab populates both.

**Blocked by:** Momentum Scanner remaining signals

- [x] Band width, own-history band-width percentile, ATR percent, and volume ratio each appear as their own sortable column
- [x] The percentile is computed against the same ticker's trailing six months, never against other tickers
- [x] Column headings state the Bollinger parameters and the ATR period
- [x] The signals come from the same cached history as Momentum — a scan in one tab populates the other, and switching tabs issues no second request
- [x] A ticker with insufficient history reports the affected signals as unavailable while still showing the rest
- [x] There is no composite score, no days-until-earnings column, and no market-capitalisation column
- [x] New signal maths has direct pure-function tests with hand-computed expected values, including insufficient-history cases

## Dividend Ranking

**What to build:** A Dividend Ranking sub-tab showing, for every Watchlist ticker, its price, gross dividend yield, net yield after a withholding-tax rate the user controls, how many times it actually paid over the trailing twelve months, and how those payouts compare with the twelve months before. Frequency is counted from observed payment dates rather than inferred from what kind of fund a ticker is. Independent of the price-signal Scanners: different endpoint, different upstream data, different cache lifetime.

**Blocked by:** Watchlist area

- [x] A dividend scan endpoint returns price, gross yield, observed payment frequency, and dividend growth per Watchlist ticker (**amended in delivery**: no `tax_rate_pct` query param, and no `net_yield` field — net yield is computed entirely client-side from gross yield and the tax rate, per the very next checkbox and the "no second request" checkbox two below; a backend tax-rate param would have contradicted both. See final review round 1, finding M6.)
- [x] Dividend data is cached separately from price history with a twenty-four-hour TTL, matching the existing FX service, with a cache-clearing entry point for tests
- [x] One row is returned per Watchlist ticker, including tickers whose fetch failed, with unavailable values as null
- [x] The tab follows the same scan discipline as the other Scanners: empty on open, Scan button, progress, disabled while running, results persist
- [x] A single tax-rate field defaults to fifteen percent and behaves as it does in the existing DCA Projection and Passive Income calculators
- [x] Net yield is derived from gross yield and the tax rate using the same formula the existing calculators use
- [x] Editing the tax rate updates the net column from data already on screen, issuing no second request
- [x] Payment frequency is counted from observed payment dates in the trailing twelve months
- [x] Dividend growth compares the trailing twelve months of payouts against the twelve months before it
- [x] A ticker that paid nothing shows a zero or unavailable payout rather than being hidden from the table
- [x] Every column is sortable and there are no "suitable for" tags anywhere
- [x] Frequency, growth, and net-yield maths have direct pure-function tests with hand-computed expected values

## Trending Stocks Today

**What to build:** A Trending Stocks Today sub-tab showing what moved across the whole market today — biggest gainers, biggest losers, and most-active names — with a button on each row to drop that ticker straight into the Watchlist, which is how a name discovered here flows into the other Scanners. This is the only ticket that touches a provider the project has never used, which is why it lands last: a problem here cannot hold up features built on the existing provider.

**Blocked by:** Watchlist area

- [x] A market-breadth provider is added as a backend dependency, with its key read from an environment variable following the existing provider-key convention
- [x] The provider call sits behind a single private fetcher function so it can be replaced in tests
- [x] A market-trending endpoint returns the gainers, losers, and most-active lists, capped at ten rows each
- [x] Each row carries ticker, company name, price, and percent change, taken only from what the provider returned — no per-ticker enrichment from the other provider
- [x] The endpoint reports the missing-key condition explicitly and never returns placeholder data
- [x] When the key is absent the tab explains what needs configuring, rather than showing an empty or broken-looking page
- [x] Each row has a button that adds that ticker to the Watchlist
- [x] A ticker already on the Watchlist is shown as already watched instead of offering to add it again
- [x] The endpoint does not read the Watchlist

# Tickets: Dashboard — Price Chart (Phase 1 of 3)

Builds a new Dashboard tab with a single-ticker price chart, from the spec in `docs/specs/2026-07-30-dashboard-price-chart.md`. Phase 1 of 3 — auto support/resistance (phase 2) and manual support/resistance editing (phase 3) are deliberately separate specs/tickets, grilled only once this phase ships. Respects ADR 0001's structural layout decision (Dashboard tab, positioned first).

Work the **frontier**: Ticket 1 can start immediately; Ticket 2 needs Ticket 1 done first — this is a linear chain, not a fan-out.

## Dashboard price chart walking skeleton

**What to build:** A new Dashboard tab, positioned first in the top navigation. It holds a dropdown listing every ticker across all Portfolios' holdings and the Watchlist, deduplicated, and nothing is selected by default. Picking a ticker fetches and renders its closing price as a line chart over a fixed one-year daily window — this ticket proves the full pipeline (pick a ticker, fetch real data through a new independent chart service, render it with a newly-added charting library) end-to-end before a range selector is layered on. No candlesticks, no support/resistance, no 3-column mockup layout, no moving the DCA/stress-test calculators out of `HoldingRow` — those stay exactly where they are today.

**Blocked by:** None — can start immediately.

- [x] A Dashboard tab appears in the top navigation, positioned ahead of Portfolios
- [x] The tab shows a ticker dropdown populated from the deduplicated union of every ticker across all Portfolios' holdings and the Watchlist
- [x] No ticker is selected on open, and no chart request is issued until one is picked
- [x] Picking a ticker fetches and renders its closing price as a line chart over a fixed one-year daily window
- [x] A new, independent chart-data service is added, following the existing provider-service pattern (private raw-fetch function behind a cached public function, in-memory cache, a cache-clearing test entry point, a failed fetch is never cached) — it is not a reuse or extension of the existing Scanner history service, and that service is left untouched
- [x] A new endpoint returns chart data for a requested ticker and range; the range parameter is accepted and threaded through from day one even though this ticket only ever sends one fixed range, so the next ticket needs no API-shape change
- [x] A fetch that fails returns an explicit unavailable signal, never a 500 and never a fabricated or partial series
- [x] The frontend shows an explicit loading state while fetching and an explicit error state on failure — never a blank chart that looks like an empty result
- [x] A charting library is added as a new frontend dependency and used to render the line series
- [x] Switching to a different ticker replaces the chart's data; an in-flight request for a since-abandoned selection cannot land after a newer one (fixed post-review: a naive `key`-based remount alone left a one-commit window where the freshly-mounted chart still received the outgoing ticker's stale data — closed via a render-phase `points` reset in `useChartData`, not just the remount)

## Dashboard range selector

**What to build:** The range selector (1D, 5D, 1M, 6M, YTD, 1Y, 5Y) that Ticket 1 deferred. Each range maps to a fixed, hardcoded fetch interval (1D→5min, 5D→30min, 1M/6M/YTD/1Y→daily, 5Y→weekly) rather than exposing interval as a separate user choice, so no combination the user can pick is ever one the price provider rejects. Changing range re-fetches through the same service and endpoint Ticket 1 built, now exercising the cache's per-range keying for real.

**Blocked by:** Dashboard price chart walking skeleton

- [x] A range selector offers all seven ranges (1D, 5D, 1M, 6M, YTD, 1Y, 5Y)
- [x] The range→interval mapping table is complete for all seven ranges, each with a direct hand-computed test
- [x] Changing the selected range re-fetches and re-renders the chart for the current ticker
- [x] The chart-data cache is keyed by ticker and range together — switching between two ranges for the same ticker, then back, is served from cache within the TTL without a second fetch
- [x] Changing ticker or range while a fetch is in flight supersedes it — the stale response cannot land and relabel the chart with the wrong range's data (widened the Ticket 1 fix from ticker-only to a shared `chartIdentityKey(ticker, range)` used by both the `PriceChart` remount key and `useChartData`'s render-phase reset — verified by hand-trace across two independent reviews)
- [x] There is still no interval selector anywhere in the UI

**Also fixed post-review (not in the original acceptance criteria):** intraday ranges (1D, 5D) needed UNIX-timestamp time-encoding instead of date strings, since multiple points share a calendar day — `ChartPoint.time` widened to `str | int` end-to-end (backend `Literal["date","timestamp"]` per-range encoding, frontend `UTCTimestamp` cast in `PriceChart`). A stale-`error` variant of the Ticket 1 stale-chart-data bug was also found and fixed (render-phase reset now clears `error` alongside `points`).

## Dashboard auto support/resistance zones

**What to build:** The price chart draws support and resistance zones automatically, computed from the same bar series already being charted for the selected ticker and range. Zones come from swing high/low pivot detection, clustered by price proximity, ranked by how many times price has touched each zone, and classified as support or resistance by their position relative to the ticker's current price rather than by which kind of pivot originally formed them — so a broken resistance level correctly becomes support once price has closed above it. At most 3 support and 3 resistance zones are drawn at once, in colors visually distinct from each other and from this app's existing rebalance-severity palette. Changing range recomputes zones for that range's own history, the same way it already reflows the chart line. There is no manual editing in this ticket — every zone is machine-computed, and every zone carries a `source: "auto"` marker so a later ticket can introduce manually-drawn zones without changing the response shape again.

**Blocked by:** Dashboard range selector

- [ ] The chart-data fetch captures each bar's high and low alongside its existing close, from the same provider call already being made — no new network request
- [ ] A new, independent pure-function module detects swing high/low pivots (5-bar window on each side), clusters pivots within 1.5% of each other's price into zones, and ranks each zone by pivot count — no I/O, no ticker, direct hand-computed tests with fixture bar series, mirroring `signals.py`'s and `dividend_metrics.py`'s existing convention
- [ ] A zone is classified support or resistance by comparing its price to the current price at classification time, not by the kind of pivot it originally formed from — a zone whose pivot was originally a high, but that price has since closed above, is classified support
- [ ] Support zones and resistance zones are each capped at 3, keeping only the strongest (highest pivot count) when there are more candidates than the cap
- [ ] A bar series too short to produce any pivot returns an empty zone list — a valid result, not an error and not a fabricated zone
- [ ] Support/resistance zones are returned from the existing chart endpoint alongside the existing price points — not a separate endpoint — computed from the same cached bar series and expiring on the same TTL, with no new cache dimension
- [ ] Each returned zone carries a price, a support/resistance kind, a strength (touch count), and a `source` field fixed to `"auto"`
- [ ] The chart draws each zone as a horizontal price line at its level, not as a second plotted series
- [ ] Support zones and resistance zones render in visually distinct colors from each other, and both are visually distinct from this app's existing rebalance-severity green/yellow/red colors
- [ ] Changing the selected range recomputes and redraws zones for that range's own bar series, replacing the previous range's zones with no stale line left behind (same remount/render-phase discipline already established for the chart line itself)
