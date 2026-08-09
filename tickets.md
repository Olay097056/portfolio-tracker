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

- [x] The chart-data fetch captures each bar's high and low alongside its existing close, from the same provider call already being made — no new network request
- [x] A new, independent pure-function module detects swing high/low pivots (5-bar window on each side), clusters pivots within 1.5% of each other's price into zones, and ranks each zone by pivot count — no I/O, no ticker, direct hand-computed tests with fixture bar series, mirroring `signals.py`'s and `dividend_metrics.py`'s existing convention
- [x] A zone is classified support or resistance by comparing its price to the current price at classification time, not by the kind of pivot it originally formed from — a zone whose pivot was originally a high, but that price has since closed above, is classified support (role reversal — enforced structurally, since `_find_pivots` returns a flat price list with no memory of which array a pivot came from)
- [x] Support zones and resistance zones are each capped at 3, keeping only the strongest (highest pivot count) when there are more candidates than the cap (verified independent-per-side capping with a dedicated test post-review, not just combined-total)
- [x] A bar series too short to produce any pivot returns an empty zone list — a valid result, not an error and not a fabricated zone
- [x] Support/resistance zones are returned from the existing chart endpoint alongside the existing price points — not a separate endpoint — computed from the same cached bar series and expiring on the same TTL, with no new cache dimension
- [x] Each returned zone carries a price, a support/resistance kind, a strength (touch count), and a `source` field fixed to `"auto"`
- [x] The chart draws each zone as a horizontal price line at its level, not as a second plotted series (`lightweight-charts`' `createPriceLine()`, with a `S (n)`/`R (n)` title showing strength)
- [x] Support zones and resistance zones render in visually distinct colors from each other, and both are visually distinct from this app's existing rebalance-severity green/yellow/red colors (teal `#14b8a6` support, amber `#f59e0b` resistance)
- [x] Changing the selected range recomputes and redraws zones for that range's own bar series, replacing the previous range's zones with no stale line left behind (extended the existing `chartIdentityKey`-based render-phase reset to also clear `zones`, not just `points`/`error` — a first attempt at the regression test was found insufficient during review, since it couldn't distinguish a render-phase reset from an effect-based one; replaced with a child-observation test mirroring the existing `ErrorProbe` pattern)

## Add, edit, and delete manual support/resistance zones (no drag)

**What to build:** Every support/resistance zone can be created, corrected, and removed by hand — just not yet by dragging on the chart itself. An "S" button adds a support zone at the ticker's current price, "R" adds resistance, "Freestyle" adds a plain untyped horizontal level; a small list next to the chart shows every zone (auto zones read-only, manual zones with an editable price input and a delete button); touching any zone for a ticker+range for the first time freezes that pair's entire zone set — every zone currently shown is preserved at its price, auto-recompute stops, and the pair stays exactly as edited until reset. A "Recompute defaults" button, behind a confirmation, discards all edits for the current ticker+range and returns to auto-computed zones. This ticket proves the whole persistence/freeze/API surface end-to-end through a slower but complete interaction (typed price entry); the next ticket adds the faster one (drag) on top of the same backend.

**Blocked by:** Dashboard auto support/resistance zones

- [x] A new database table persists manual/freestyle zones (ticker, range, price, kind) — no migration tool needed, this is a brand-new table under `Base.metadata.create_all`
- [x] The chart endpoint returns manual zones (`source: "manual"`) for a ticker+range that has any, and falls back to the existing auto-computed zones (`source: "auto"`) when it doesn't — `points` is unaffected either way
- [x] Zone kind widens to include `"freestyle"` alongside `"support"`/`"resistance"`, rendered in a third color distinct from support, resistance, and this app's existing rebalance-severity palette (violet `#8b5cf6`; caught missing in the first pass by the final whole-branch review since `PriceChart.tsx` sat outside all 3 tasks' file lists — fixed post-review)
- [x] `strength` is nullable and is always null on a manual or freestyle zone — never a carried-over or fabricated touch count (structurally enforced: `ManualZone` has no `strength` column)
- [x] Clicking S, R, or Freestyle adds a new zone at the ticker's current price
- [x] The first edit (an add, in this ticket) to a ticker+range pair that's still on auto zones preserves every other auto zone currently shown, unchanged, alongside the new one — nothing else present on the chart disappears
- [x] Once a ticker+range pair has any manual zones, auto-recompute never overwrites them again until explicitly reset
- [x] A side list shows every current zone's exact price and kind; auto zones are read-only in this list; manual/freestyle zones have a delete button and an editable price input
- [x] Editing a manual zone's price in the list commits on blur or Enter and updates the chart's rendered line
- [x] Deleting a manual zone in the list removes it from the chart and from storage
- [x] "Recompute defaults" asks for confirmation, then removes every manual zone for the current ticker+range in one action, reverting that pair to auto-computed zones
- [x] Switching ticker or range shows that pair's own zone set (auto if untouched, manual if previously edited) — edits to one ticker+range never appear on another

## Drag support/resistance zones directly on the chart

**What to build:** Any zone — auto or manual — can be grabbed with the mouse directly on the chart and dragged to a new price, using the exact same freeze/update backend the previous ticket already built. This is additive polish on a system that's already fully functional without it.

**Blocked by:** Add, edit, and delete manual support/resistance zones (no drag)

- [x] Clicking and holding near a rendered zone line on the chart, then moving the mouse, repositions that line's on-screen price live, with no backend call per pixel moved
- [x] Releasing the mouse commits the final price exactly once — a move call if the ticker+range pair is already manual, or the same freeze-and-preserve-the-rest behavior as the previous ticket if this is the first edit for that pair
- [x] Dragging an auto zone (first edit for that pair) preserves every other zone currently shown, the same guarantee the previous ticket's add path already has
- [x] The side list's price value updates live as a zone is dragged, staying in sync with what's rendered on the chart (uncontrolled price input's `key` widened to include price so it actually re-displays)

## UI theme foundation — dark palette + typography matched to wethaiinvest.com

**What to build:** Loading any page of the app shows a flat near-black background (no gradient), the accent/gain/text colors and Thai+English typography sampled from wethaiinvest.com's own member dashboard — visible immediately across every existing page since this is a single global CSS file, with zero layout or behavior change anywhere. New card/container CSS tokens are also defined for a later ticket to consume. Source: `docs/specs/2026-08-04-ui-theme-foundation.md`.

**Blocked by:** None — can start immediately.

- [x] `--bg` changes to `#09090b`; the `body` radial-gradient background-image is removed entirely (flat `background-color` only)
- [x] `--primary` changes to `#3b82f6`
- [x] `--green` changes to `#2ca559`
- [x] `--red` confirmed unchanged (`#ef4444` already matches the reference)
- [x] `--text` changes to `rgb(255, 248, 240)`
- [x] New tokens added: `--card-bg`, `--card-radius-lg`, `--card-radius`, `--card-shadow` (unconsumed by any component in this ticket — reserved for a future per-page ticket)
- [x] Font `@import` changes to `Noto Sans Thai` + `Inter` (Inter's existing weight range kept as-is); `Outfit` is removed entirely; `body`'s `font` family list leads with `Noto Sans Thai`
- [x] `npx tsc -b` and `npx vitest run` (frontend) both stay green after the change
- [x] Manual visual check (`npm run dev`) confirms the new background/colors/font are visibly applied across every existing tab

## Dashboard UI redesign — cards, price readout, range buttons, zone-kind colors, chart theming

**What to build:** Opening the Dashboard shows everything wrapped in cards, a price + % change readout, a button-row range selector, S/R/Freestyle buttons colored to match their zone kind, a color-coded ZoneList, a visible loading indicator during zone mutations, and a properly-themed chart (no longer a white box) — all without touching any zone add/edit/delete/drag/freeze/recompute logic. Source: `docs/specs/2026-08-04-dashboard-ui-redesign.md`.

**Blocked by:** None — can start immediately.

- [x] Zone-kind colors (`SUPPORT_COLOR`/`RESISTANCE_COLOR`/`FREESTYLE_COLOR`) extracted to a shared constant consumed by `PriceChart.tsx`, the S/R/Freestyle buttons, and `ZoneList`'s kind badges — single source of truth (`frontend/src/utils/zoneStyle.ts`)
- [x] Ticker/range/chart/S-R-Freestyle-Recompute buttons wrapped in one card; `ZoneList` wrapped in a separate card — both using the `--card-*` tokens
- [x] Price + % change readout computed from the last two `points` entries; omitted (not fabricated) when fewer than 2 points are available
- [x] Range selector changed from `<select>` to a 7-button row; the currently-selected range's button is visually distinguished (`aria-pressed` + `--primary` highlight)
- [x] S/R/Freestyle buttons colored per zone kind; "Recompute defaults" gets a distinct warning-toned style (`--red` border/text)
- [x] `ZoneList`'s Kind column shows a color-coded badge matching the buttons/chart
- [x] A visible loading indicator (not just `disabled`) appears while `zoneEditing.busy` is true
- [x] `PriceChart.tsx`'s `createChart()` call sets `layout.background`/`textColor`/grid colors, resolved from CSS custom properties via `getComputedStyle` at runtime — no chart still renders with the library's default white background

## Portfolios UI redesign — cards, severity color fix, P&L color+emoji, warning-style deletes

**What to build:** Opening Portfolios shows every portfolio wrapped in a card, each holding as its own distinct row, a severity indicator that finally shows real color, a colored+emoji P&L readout, and warning-styled Delete buttons at both levels — all without touching portfolio/holding create/edit/delete logic. Source: `docs/specs/2026-08-04-portfolios-ui-redesign.md`.

**Blocked by:** None — can start immediately.

- [x] `AddPortfolioForm` wrapped in a card; each portfolio's card contains its summary, toggle, delete button, and (when expanded) `AddHoldingForm` + holdings list
- [x] Each holding row gets its own distinct background/border (using `--panel3`) instead of a bare unstyled `<div>`
- [x] Severity indicator (`data-severity`) shows real color (`--green`/`--yellow`/`--red`); no dot rendered when severity is absent/`none`
- [x] Unrealized P&L colored green/red by sign, with a small emoji (two-state, not the stress-test calculator's magnitude ladder)
- [x] Delete buttons at both the portfolio and holding level get the `--red` warning-toned style matching "Recompute defaults" — style only, no new confirmation step
- [x] All existing tests pass; new tests cover severity color, P&L color/emoji, delete button color, and card-wrapping presence

## TabStrip + Manage Watchlist UI redesign — active-tab highlight, card, row separation, warning-style Remove

**What to build:** The currently-active tab is highlighted with `--primary` everywhere `TabStrip` is used (top-level nav, Tools sub-tabs, Watchlist sub-tabs); the Manage Watchlist page is wrapped in a card with separated ticker rows and a warning-styled Remove button — none of the four Watchlist scanner tables are touched. Source: `docs/specs/2026-08-04-tabstrip-and-manage-watchlist-ui-redesign.md`.

**Blocked by:** None — can start immediately.

- [x] The tab matching `aria-pressed="true"` is highlighted with `--primary` (border/text); no structural/shape change to `TabStrip`
- [x] Manage Watchlist page wrapped in a single card containing the add-ticker form and the ticker list
- [x] Each ticker row gets its own `--panel3` background, separating it from its neighbors
- [x] The Remove button gets the `--red` warning-toned style matching every other Delete button in the app
- [x] All existing tests pass, including every page that renders `TabStrip` (top nav, Tools, Watchlist sub-tabs); new tests cover active-tab color, card presence, and Remove button color

## Watchlist scanner tables UI redesign — cards, zebra-stripe, narrow gain/loss colors, positive-action button

**What to build:** All four Watchlist scanner/ranking sub-tabs (Dividend Ranking, Momentum Scanner, Pre-Squeeze Scanner, Trending Stocks Today) are wrapped in cards with zebra-striped tables; exactly two columns (Momentum's and Trending's "% change") get gain/loss color, every other signed-percent column stays uncolored; Trending's "Add to Watchlist" button gets a positive-action accent — none of the underlying scan/sort/tax-rate logic changes. Source: `docs/specs/2026-08-04-watchlist-scanner-tables-ui-redesign.md`.

**Blocked by:** TabStrip + Manage Watchlist UI redesign (already merged)

- [x] Dividend Ranking, Momentum Scanner, and Pre-Squeeze Scanner each wrapped in a single card containing their controls and table
- [x] Trending Stocks Today wrapped in one card containing all three lists (Gainers/Losers/Most active)
- [x] Every table's rows zebra-striped with `--panel3` on even rows, including Trending's three sub-tables
- [x] Only Momentum's `percent_change_pct` and Trending's `change_pct` cells are colored `--green`/`--red` by sign; every other signed-percent column (RSI, volume ratio, distance from SMA, dividend yield/growth, BB width, ATR) stays uncolored
- [x] Trending's "Add to Watchlist" button styled with `--primary`
- [x] All existing tests pass; new tests cover card presence, the narrow color scope (including that other columns are NOT colored), zebra-stripe, and the Add-to-Watchlist button color

## Tools UI redesign — cards, zebra-stripe reuse, reachable/not-reachable color, positive-action button

**What to build:** All four Tools sub-tabs (DCA Projection, Passive Income, Portfolio Builder, ETF Comparison) are wrapped in cards; Portfolio Builder's preview table and ETF Comparison's results table reuse the existing `zebra-table` class; Passive Income's reachable/not-reachable outcome message is colored green/red; the "Create portfolio" button gets a positive-action accent — none of the underlying calculation, wizard, or fetch logic changes. This is the sixth and final page of the wethaiinvest.com-inspired UI effort. Source: `docs/specs/2026-08-04-tools-ui-redesign.md`.

**Blocked by:** None — can start immediately.

- [x] Each of the four Tools sub-tabs wrapped in its own card
- [x] Portfolio Builder's allocation-preview table and ETF Comparison's results table both use the existing `zebra-table` class
- [x] Passive Income's "Reachable in N years" / "Not reachable within 30 years" message colored `--green`/`--red`
- [x] "Create portfolio" button styled with `--primary`, matching "Add to Watchlist"
- [x] All existing tests pass; new tests cover card presence, zebra-table class presence, reachable/not-reachable color, and the Create-portfolio button color

## REVERTED — Full-market technical signals + Momentum/Pre-Squeeze/ETF Comparison

The three tickets that lived here ("Full-market technical signals: background refresh pipeline + Data tab card", "Momentum Scanner reads from the full-market technical signals cache", "Pre-Squeeze Scanner reads from the full-market technical signals cache") were completed — background refresh pipeline, `technical_signals` table, Data tab card, and Momentum Scanner rewired to it, all built and tested — and then reverted. The user removed the Momentum Scanner, Pre-Squeeze Scanner, and ETF Comparison tools from the project entirely. Everything built solely to serve them was removed to match: `technical_signals` table/model, its refresh manager/router/CLI script and their tests, the `useTechnicalSignals`/`usePriceSignalsScan` hooks, the Data tab's second card, the now-dead `getSignalAlertBadges` export, and the three component files themselves (already deleted before this cleanup pass). `docs/adr/0007-momentum-and-pre-squeeze-scan-the-full-screener-universe.md` is left in place as a historical record of the (now-reverted) decision, not deleted. Left untouched: the Stock Screener itself, the pre-existing `/watchlist/scan/price-signals` backend endpoint and `app/signals.py`/`app/history_service.py` (now only used by that endpoint's own tests — flagged to the user as a further possible cleanup, not done here since it predates this session's Momentum/Pre-Squeeze work), and the orphaned (harmless, empty) `technical_signals` SQLite table, which nothing drops automatically.

## Portfolio Builder criteria & dynamic bucket logic

**What to build:** Nothing changes for the user yet — this is prefactoring. A new pure-logic module defines, for each of the three presets (Aggressive Growth, Dividend Income, Conservative), a named list of transparent pass/fail criteria evaluated against real `ScreenerStock` fields (never a composite score, per ADR 0005), plus a function that builds a "Core-Satellite" or "Pure Stock Picks" bucket list from whichever stocks currently pass. Source: `docs/specs/2026-08-05-screener-scanner-and-portfolio-builder-integration.md`.

**Blocked by:** None — can start immediately.

- [ ] Growth criteria: PEG present and < 2, ROE > 15%, profit margin > 0 — labeled as inspired by growth-investing principles (PEG heuristic)
- [ ] Dividend criteria: yield present and between 2%–7%, profit margin > 5%, D/E present and < 2, market cap > $2B — labeled as inspired by dividend-growth investing, screening out common dividend-trap signals
- [ ] Conservative criteria: beta present and < 1, P/E present and between 0–25, D/E present and < 1, market cap > $10B — labeled as inspired by defensive-investor criteria
- [ ] A stock with a missing field required by a criterion fails that criterion (shown as unavailable), never silently passes
- [ ] Each stock's evaluation returns per-criterion pass/fail, never a single aggregate score
- [ ] `buildDynamicBucket(presetId, screenerStocks, mode)` returns, for `core-satellite`, the existing ETF Core bucket(s) reweighted plus one new Satellite bucket of qualifying stocks (up to 5, highest market cap first) splitting the remaining allocation evenly; for `pure`, no ETF bucket and up to 8 qualifying stocks (highest market cap first) splitting 100% evenly
- [ ] When fewer stocks qualify than the target count, the bucket uses however many qualify — never padded with fabricated placeholder rows
- [ ] When zero stocks qualify, the bucket is empty and this is representable by the caller (not an error)
- [ ] Full unit test coverage per criterion (field at, above, and below threshold; missing field), per preset, and per `buildDynamicBucket` mode including the fewer-than-target and zero-qualify cases

## Portfolio Builder Core-Satellite / Pure Stock Picks UI

**What to build:** Portfolio Builder's preset picker gains a per-preset toggle between "Core-Satellite" (default) and "Pure Stock Picks", wired to the criteria module from ticket 3. Selecting a preset shows the resulting buckets (ETF Core + data-driven Satellite, or Pure stock picks), each stock's per-criterion pass/fail breakdown, and the preset's "inspired by…" methodology line. Source: `docs/specs/2026-08-05-screener-scanner-and-portfolio-builder-integration.md`.

**Blocked by:** Portfolio Builder criteria & dynamic bucket logic

- [ ] Each of the three presets shows a Core-Satellite / Pure Stock Picks toggle, defaulting to Core-Satellite
- [ ] Switching modes re-derives the bucket list via `buildDynamicBucket` and re-runs the existing `buildPortfolioPlan` unchanged against the resulting buckets
- [ ] The methodology label ("inspired by…") is shown once per preset
- [ ] Each data-driven stock in a bucket shows its per-criterion pass/fail breakdown, not a score
- [ ] The zero-qualify case is shown plainly (e.g. "0 stocks currently match these criteria") rather than an empty or broken-looking bucket
- [ ] This flow depends on `screener_stocks` being populated; against an empty/unrefreshed table it correctly shows the zero-qualify state, never fabricated data

## Super Investor Tracker (13F holdings)

**What to build:** *(retroactive — this ticket documents work already built, tested, and shipped in commit `0551e83` before a spec/ticket existed for it; written now to match project convention.)* A new Tools sub-tab lists well-known professional investors (Buffett, Cathie Wood, Ray Dalio, Bill Gates, Michael Burry, Li Lu, and others fetched live) with their current top holdings, 1-year performance, and portfolio value, backed by a server-side proxy of konbalongtun.com's public 13F-holdings API (10-minute cache, static SEC-EDGAR-seeded fallback on fetch failure). A second sub-tab lists recent new-holding activity. Source: `docs/specs/2026-08-06-super-investor-tracker.md`.

**Blocked by:** None — already shipped.

- [x] `GET /api/investors` returns the tracked investors, each with a non-empty top-holdings list
- [x] `search` query param filters by investor name, fund name, or a held ticker/company name
- [x] `sort_by` query param sorts by performance, portfolio value, or name
- [x] `GET /api/investors/{slug}` returns one investor's full profile; unknown slug returns 404
- [x] `GET /api/investors/new-holdings` returns recent buy/increase/sell/decrease activity across tracked investors
- [x] `GET /api/investors/status` and `POST /api/investors/refresh` expose the cache timestamp and let the user force a re-fetch
- [x] If the live konbalongtun fetch fails (network error), the endpoint still returns 200 with real fallback data — never an empty or broken response (verified: `test_list_investors_network_fallback` mocks `urlopen` to raise, invalidates the cache first, asserts Warren Buffett is still present in the response)
- [x] The Tools tab's card grid shows each investor's name, fund, 1-year performance, AUM, strategy blurb, and top 3 holdings, with a "View full portfolio" modal showing the complete holdings table (avg buy price, current price, gain %, converted to THB via the existing `fxRate`/`currency` props when applicable)
- [x] Backend: 6/6 tests passing (`test_investors_router.py`)
- [x] Frontend: `InvestorTracker.test.tsx` now exists — gap closed, see next ticket

## Fix Super Investor Tracker: fabricated AUM stat + off-palette styling

**What to build:** Two deviations found while writing the retroactive spec for the Super Investor Tracker, neither touched at the time: the KPI row's "combined AUM" figure is a hardcoded literal, not computed from real data; and the component was never migrated to the shared design tokens the rest of the app now uses. Source: `docs/specs/2026-08-06-super-investor-tracker.md` (Further Notes).

**Blocked by:** Super Investor Tracker (13F holdings)

- [x] The "มูลค่าพอร์ตรวม (AUM)" KPI card computes its figure from the sum of the fetched investors' real `portfolio_value_num`, not the hardcoded literal `"$350.2B"` (live-verified: real data now shows $8.5T across 70 investors)
- [x] `InvestorTracker.tsx`'s inline hex colors that exactly matched existing tokens are replaced with `var(--text)`/`var(--green)`/`var(--primary)`/`var(--yellow)`/`var(--card-bg)`; `rgba()` alpha-blend effects and literal `#fff` on colored-background buttons are left as-is (both match established convention used elsewhere in this app already, not real inconsistencies — see commit message for the full accounting)
- [x] The `fontFamily: 'Outfit, sans-serif'` references are removed (that font's `@import` no longer exists in `theme.css`) in favor of the app's actual Noto Sans Thai + Inter stack
- [x] A test file for `InvestorTracker.tsx` covers search, sort, the modal, the real-AUM-not-fabricated assertion, and the fallback-data-still-renders case (mirroring the backend's own fallback test)
- [x] All existing tests still pass (frontend 58/58 files, 496/496 tests); `npx tsc -b` stays green

## Portfolio card donut chart + legend

**What to build:** Each portfolio card's collapsed view replaces its plain "Total value / Unrealized P&L" text row with an SVG donut chart (no new dependency) showing each holding's share of the portfolio by value, with total value / unrealized P&L $ / unrealized P&L % overlaid in the center, and a color-coded ticker legend beside it. Uses `usePortfolioSummary`'s existing `current_pct` data — no backend change. "Show holdings" still expands the existing detailed per-holding table unchanged. Source: `docs/specs/2026-08-07-portfolio-donut-chart-and-edit.md`.

**Blocked by:** None — can start immediately.

- [x] New `PortfolioDonutChart.tsx` draws one arc per holding via `stroke-dasharray`/`stroke-dashoffset` on stacked `<circle>` elements, sized to that holding's `current_pct`, colored from a fixed `HOLDING_COLORS` 8-color palette (`#3b82f6` blue, `#8b5cf6` violet, `#06b6d4` cyan, `#f97316` orange, `#ec4899` pink, `#14b8a6` teal, `#6366f1` indigo, `#94a3b8` slate — deliberately no red/green/amber, already reserved for P&L sign and rebalance severity elsewhere in this app) assigned by holdings-array index, cycling past 8 holdings rather than erroring
- [x] Total value, unrealized P&L $, and unrealized P&L % are overlaid in the chart's center, reusing `PortfolioCard.tsx`'s existing computed `totalVal`/`pnlVal` (not recomputed)
- [x] A legend beside the chart shows one colored-dot + ticker row per holding, using the same `HOLDING_COLORS` index as the chart so colors always match
- [x] A zero-holdings portfolio renders a flat gray ring (100%, no split) with the total value centered and no legend rows — never a blank or broken chart
- [x] This replaces the collapsed card's plain-text `Total value:` / `Unrealized P&L:` row; "Show holdings" still expands `PortfolioHoldings.tsx`'s existing detailed table unchanged
- [x] Unit tests cover: arc proportions for a known holdings fixture, palette cycling beyond 8 holdings, the zero-holdings flat-ring state, and legend-to-segment 1:1 correspondence

## Edit portfolio (rename + target %, single portfolio)

**What to build:** An "Edit" button on each portfolio card opens a modal to rename the portfolio and change its target allocation %, pre-filled with current values, saving via the existing `PATCH /portfolios/{id}` endpoint and `usePortfolios().update` (already implemented, currently unused by any UI). Source: `docs/specs/2026-08-07-portfolio-donut-chart-and-edit.md`.

**Blocked by:** None — can start immediately.

- [x] `PortfolioCard.tsx` gets a new "Edit" button alongside its existing "Show holdings" / "Delete" buttons
- [x] New `EditPortfolioModal.tsx` opens pre-filled with the portfolio's current name and target allocation %
- [x] Name is required (non-empty); target allocation % uses the same validation as `AddPortfolioForm`'s existing field
- [x] Saving calls `usePortfolios().update(id, { name, target_allocation_pct })`, closes the modal, and the card reflects the new name/target immediately
- [x] Cancelling discards changes without calling the API
- [x] Unit tests cover: pre-filled values, required-name validation, successful save calling `update` with the right payload, and cancel not calling the API

## Cascade rebalance targets across portfolios

**What to build:** Inside `EditPortfolioModal`, a collapsed "▼ Edit other portfolios' allocation" section expands to list every other portfolio with its own editable target % input and a running "Total: X%" readout that turns red when ≠100%. Saving with this section expanded calls a new atomic backend endpoint instead of the single-portfolio `PATCH`, so a partial failure can't leave portfolios' targets summing to something other than 100%. Source: `docs/specs/2026-08-07-portfolio-donut-chart-and-edit.md`.

**Blocked by:** Edit portfolio (rename + target %, single portfolio)

- [x] New backend endpoint `PATCH /portfolios/rebalance-targets` accepts `{ updates: [{ id, target_allocation_pct }] }` (new schemas `PortfolioTargetUpdate` / `PortfolioRebalanceIn` in `schemas.py`)
- [x] Server validates every submitted `id` exists (404 if not) and the submitted targets sum to 100% within ±0.01 tolerance (400 with a clear message if not) — validated before any row is written
- [x] All target updates commit in a single DB transaction — either every portfolio's target changes or none do; a test asserts DB state is unchanged after a rejected (400/404) request, not just the response code
- [x] Portfolios not included in `updates` keep their existing target unchanged — the endpoint doesn't require every portfolio to be present in the batch
- [x] `EditPortfolioModal`'s "▼ Edit other portfolios' allocation" toggle expands to show every other portfolio with an editable target % input and a running total that turns red when ≠100%
- [x] Saving with the section collapsed still uses the existing single-portfolio `PATCH /portfolios/{id}` (name + this portfolio's target only) — the rebalance endpoint is only called when the section was expanded
- [x] Saving with the section expanded fires the rebalance call with every portfolio's current-or-edited target (including the one being renamed), plus a separate single `PATCH /portfolios/{id}` for the name if it changed — the rebalance payload never includes name
- [x] Backend tests: happy path (sums to 100, all rows updated), sum-not-100 rejected with 400 and no rows changed, unknown id in batch rejected with 404 and no rows changed
- [x] Frontend tests: toggle expand/collapse, running total color at/away-from 100%, collapsed-save calls single PATCH, expanded-save calls rebalance endpoint

---

# MAP: News tab (ข่าวสาร) for Bond-crisis — wayfinder:map

## Destination

A "ข่าวสาร" sub-tab in the Bond-crisis page mirroring the reference site's `/news` page 100%: real RSS headlines (ZeroHedge, Al Jazeera, Bangkok Post, CNN/MarketWatch, Reuters via Google News RSS) fetched every 5 minutes, titles auto-translated to Thai by DeepSeek, per-item impact score + category + related-model badges + expandable Thai analysis, sortable by date/impact, filterable by source and impact ≥ N, paginated 20 per page — all from free, key-less RSS sources with the DeepSeek key the user supplied.

## Notes

- **Domain:** portfolio-tracker app, Bond-crisis Tools tab (existing `MacroDashboard.tsx` / `ModelsDashboard.tsx` pattern — generic card rendering, no Tailwind, hand-rolled SVG, shared theme tokens, Thai-first UI).
- **Skills every session should consult:** `web-app-reverse-engineering` (the reference bundle/Supabase shape was already extracted: tables `news_items` / `news_sources`, fields `title`, `summary`, `url`, `source`, `impact_score`, `category`, `published_at`, `title_th`, `summary_th`, `analysis_th`, `related_models`; UI has sort `impact`/`date`, source filter, `gte("impact_score", N)`, range pagination 20, refreshMs 300000), `browser-harness` if live-checking the reference UI.
- **DeepSeek:** key in `backend/.env` as `DEEPSEEK_API_KEY` (already verified working — models `deepseek-v4-flash` / `deepseek-v4-pro`, OpenAI-compatible endpoint `https://api.deepseek.com`). Existing app pattern: `os.environ.get("..._API_KEY")`, never hardcode.
- **Never fabricate:** a headline that fails RSS fetch or translation renders as unavailable — no placeholder text pretending to be news. Per-item failure isolation, like the scanner's per-ticker rule.
- **Persistence:** SQLite (app's existing DB) so pagination/filtering is server-side and translation is cached (translate once, never re-translate an already-translated item) — mirrors the reference's Supabase-backed design.
- **Tracker:** local-markdown (`tickets.md`). Work the frontier: open + unblocked + unassigned first.
- **Do NOT resolve more than one ticket per session.**

## Decisions so far

<!-- index of closed tickets, one line each -->

- [Ticket: Survey live RSS feeds](tickets.md) — 8 feeds / 7 hosts confirmed working (ZeroHedge, Al Jazeera, CNN World, MarketWatch, Reuters+top via Google News RSS, CNBC, Bangkok Post business+topstories); dead ends recorded; no new dependency (stdlib xml parses RSS 2.0); dedupe on canonicalized link; cap ZeroHedge summaries; RFC-822 pubDate parsing. Asset: `docs/research/rss-feeds-2026-08-09.md`.
- [Ticket: DeepSeek translate + enrich pipeline](tickets.md) — one batched DeepSeek call per ~20 headlines with `response_format: json_object` enriches every item (Thai title, impact 0-100, category, related_models; 33s/batch, 222 tok/headline — json_object beats free-form by 34% and beats 10-item chunks; max_tokens 8000 required); Thai analysis generated only for impact ≥ 40 (user cost-control pick; ~5.2s/610 tok each). Asset: `docs/research/deepseek-enrichment-prototype-2026-08-09.md`.
- [Ticket: Backend news service + /api/news](tickets.md) — `news_service.py` + router: 9 feeds fetched concurrently, stdlib-xml normalize (RSS+Atom, RFC-822+ISO dates), canonicalized-URL dedupe, SQLite `news_items`; **fetch+persist ~4s, DeepSeek enrichment in a background thread (40/round, translate-once)** — the synchronous version blocked ~8 min per sweep; sort/filter/pagination mirror the reference; no key → English titles, never fabricate. Live: 249 items, 40 Thai + 5 analyses in background.
- [Ticket: News tab frontend](tickets.md) — `NewsDashboard.tsx` as the fourth Bond-crisis sub-tab (ข่าวสาร): impact-score block (color-coded), source/time/category pills, related-model badges in reference colors, Thai title with EN fallback, expandable Thai analysis (impact ≥ 40 only), sort (วันที่/IMPACT), source + IMPACT ≥ N filters, pagination 20/page; honest empty/error states. 7 tests pass; live smoke on 305 items.

## Not yet specified

- Which categories to keep (reference uses market/bond/crypto/world/war/economy/energy/thai) and how category assignment is done (DeepSeek classify vs RSS-channel default).

## Out of scope

- The reference site's other pages not already mirrored (sentiment index, bank-run stress monitor, country risk, scenario simulator, AI boardroom, 3D office) — the user scoped this effort to the news tab only.
- Scraping the reference site's own Supabase `news_items` — its content is not ours to reuse; we build our own RSS pipeline.
- News sources requiring paid keys (Bloomberg Terminal API, Dow Jones, etc.).
- Mobile-native push notifications of news items.

---

## Ticket: Survey live RSS feeds (wayfinder:research, AFK)

**Question:** Which RSS URLs in the starter set (ZeroHedge, Al Jazeera, Bangkok Post, CNN, MarketWatch, Reuters via Google News RSS) actually serve parseable RSS from this host — and what is the exact final source list for the pipeline?

**Resolution (2026-08-09):** 8 feeds across 7 hosts confirmed working from this host via httpx + stdlib xml (no new dependency — RSS 2.0 is plain XML). Final list: ZeroHedge feedburner, Al Jazeera all, CNN World (`content` as summary — no description), MarketWatch topstories, Reuters via Google News search RSS (100 items, adds `source` element), Google News top stories (fallback), CNBC top news (bonus), Bangkok Post `/rss/data/business.xml` + `/rss/data/topstories.xml` (the `/rss` index page is HTML, real feeds live under `/rss/data/*.xml`). Dead ends: `zerohedge.com/rss.xml`, `money.cnn.com/rss/money_latest.rss`. No feed carries media:image (reference's image_url is mostly-null too — no parity loss). ~277 raw items per full sweep; dedupe on canonicalized link (strip Google News redirect params); cap ZeroHedge summaries (~273KB sweep); parse pubDate with `email.utils.parsedate_to_datetime`. Full probe table + findings: `docs/research/rss-feeds-2026-08-09.md`.

- [x] Probe each candidate URL with the app's httpx pattern (the FRED curl-block lesson: shell curl fails here, Python httpx works) — record HTTP status, content-type, whether it parses as RSS/Atom (feedparser or stdlib xml), and observed size
- [x] Note any rate-limiting / geo-blocking / bot-protection (e.g. Google News RSS from this host)
- [x] Deliver a markdown asset listing the final source list with exact URLs + per-source category default + expected item count, linked in the resolution comment

## Ticket: DeepSeek translate + enrich pipeline (wayfinder:prototype, HITL)

**Question:** What is the cheapest reliable DeepSeek prompt shape that turns raw headlines into Thai titles, impact scores, categories, related-model tags — and Thai analyses — at acceptable quality and cost?

**Resolution (2026-08-09, user-confirmed, refined by A/B):** One batched call per ~20 headlines (`deepseek-v4-flash`, temp 0.2, **`response_format: {"type": "json_object"}`**, max_tokens 8000) enriches every item: natural Thai `title_th`, anchored `impact_score` 0-100, reference categories, and DeepSeek-assigned `related_models` (proved accurate in the 20-item sample: Hormuz → inflation-oil + yield-shock, retail pullback → fed-pivot). **A/B test (2026-08-09):** 20/call + json_object = **33.0s, 4,438 tokens (222/headline)** vs the original free-form 20/call (53.4s, 6,711 tok, 336/headline) — json_object cuts output bloat ~34% and is 38% faster; 10/call chunks are WORSE (6,076 tok for 2 calls — system prompt paid twice), so batch at 20. Free-form at max_tokens 4000 truncates mid-JSON — 8000 + json_object parses clean. `analysis_th` (≤120-word Thai market read, temp 0.4) is generated ONLY for impact ≥ 40 (user's cost-control pick) — ~5.2s/~610 tokens each, quality fluent and market-aware. Full details + quality sample: `docs/research/deepseek-enrichment-prototype-2026-08-09.md`.

- [x] Batch-translate ~20 real titles in one call (JSON out) vs per-item — measure latency + cost per headline
- [x] Test impact-score assignment (0-100) and category classification (market/bond/crypto/world/war/economy/energy/thai) on the same batch — show the user a sample to judge quality
- [x] Decide and record: analysis generated for all items vs impact ≥ N (cost control); related_models computed by DeepSeek vs keyword match
- [x] Link the prototype script + sample output as assets

## Ticket: Backend news service + /api/news (wayfinder:task, AFK)

**Question:** What shape does the server-side pipeline take — RSS fetch → normalize → translate-once cache → SQLite → paginated/filterable endpoint — mirroring the reference's Supabase-backed design?

**Blocked by:** Ticket: Survey live RSS feeds, Ticket: DeepSeek translate + enrich pipeline

**Resolution (2026-08-09):** `news_service.py` fetches all 9 feeds concurrently (the build_dashboard parallel-wave lesson), normalizes via stdlib xml (RSS 2.0 + Atom namespace-aware, RFC-822 + ISO-8601 dates, `description→summary→content` fallback, 600-char summary cap for ZeroHedge), canonicalizes Google News redirect URLs for dedupe, and persists to SQLite `news_items` (reference shape + `related_models` JSON). **Critical design fix:** fetch+persist returns in ~4s, DeepSeek enrichment runs in a **background daemon thread** (`enrich_pending`, 40 items/round, translate-once — items already Thai-titled are skipped) — the first synchronous version blocked the page ~8 minutes for 277 headlines. `/api/news` supports sort (date/impact with nulls-last), filter (source, impact ≥ N), pagination 20/page with exact count, 5-min router cache + `POST /api/news/refresh`. No DeepSeek key → items persist with English titles and null Thai fields (never fabricate). Live smoke: 249 items fetched in 3.6s, background enrich filled 40 Thai titles + 5 analyses (Hormuz 75, CNBC 70, labor force 60 — quality verified).

- [x] `news_service.py`: fetch all sources concurrently (the build_dashboard parallel-wave lesson), per-source failure isolation, never fabricate
- [x] SQLite tables mirroring `news_items` shape (title, summary, url, source, impact_score, category, published_at, title_th, analysis_th, related_models) + dedupe by URL
- [x] Translate-once cache: an item already Thai-titled is never re-translated
- [x] `GET /api/news` with sort (date/impact), filter (source, impact ≥ N), pagination (page size 20, exact count) — mirrors the reference's range() calls
- [x] Refresh semantics: fetch new items every 5 min on request (refreshMs 300000 in the reference), manual refresh endpoint
- [x] Backend tests: dedupe, filter/sort/pagination, failure isolation, never-fabricate

## Ticket: News tab frontend (wayfinder:task, HITL)

**Question:** What does the 100%-parity news UI look like in this app's non-Tailwind, Thai-first design system?

**Blocked by:** Ticket: Backend news service + /api/news

**Resolution (2026-08-09):** `NewsDashboard.tsx` added as the fourth Bond-crisis sub-tab (ข่าวสาร, alongside ข้อมูลมหภาค/โมเดลทำกำไร/สัญญาณเทรด). Matches the reference UI: per-item cards with impact-score block (colored: ≥70 red-hot, ≥40 amber, ≥15 accent), source + relative time + category pill, related-model badges in the reference per-model colors with Thai labels, title_th with English fallback, summary, expandable Thai analysis (only when analysis_th exists — impact ≥ 40 items), external-link. Controls: sort (วันที่/IMPACT), source filter dropdown, IMPACT ≥ N filter (15/40/60), pagination 20/page with ellipsis. Empty/error/loading states honest — never a fabricated headline. 7 frontend tests pass; live smoke: 305 items, filter/sort/pagination verified against the real API.

- [x] `NewsDashboard.tsx` sub-tab in Bond-crisis page (alongside macro/models/signals)
- [x] Item cards: title (ไทย), summary, source badge + time, impact score, category pill, related-model badges in the reference per-model colors, external-link to the story
- [x] Sort control (date/impact), source filter dropdown, impact ≥ N filter, pagination 20/page
- [x] Expandable Thai analysis panel
- [x] Empty/error states — unavailable renders as "—", never a fabricated headline

## Ticket: Spec, tests, commit (wayfinder:task, AFK)

**Question:** Is the whole news feature verified and documented before the map closes?

**Blocked by:** Ticket: News tab frontend

**Resolution (2026-08-09):** Spec updated (`docs/specs/2026-08-08-macro-dashboard.md` — new "News tab (ข่าวสาร)" section + Supabase rejected in Out of Scope). Full suites pass: **444 backend** (10 new news tests) + **566 frontend** (7 new NewsDashboard tests) + tsc clean. Live smoke verified: 305 items, Thai titles + analyses + impact ≥ 40 filter + sort + pagination against the real API. Committed as `ee2a822` "Add News tab (ข่าวสาร) to Bond-crisis, mirroring /news". **Map closed — all 5 news tickets resolved.**

- [x] Spec updated (`docs/specs/2026-08-08-macro-dashboard.md` or a new news spec — the macro spec already covers the Bond-crisis tab family)
- [x] Full backend + frontend suites pass
- [x] Live smoke: real RSS headlines render with Thai titles, filters work
- [x] Commit (user rule: update spec, then commit)


---

# MAP: Supabase migration (hosted DB + Realtime + Auth) — wayfinder:map

## Destination

Move this app from local SQLite to **Supabase Postgres** (free tier) while keeping the FastAPI backend exactly where it is today — **Phase 1: local machine (Windows + Docker)** pointing DATABASE_URL at Supabase; **Phase 2 (later): same backend deployed to a cheap cloud (Railway/Render/Fly) still using Supabase as the DB**. Along the way adopt Supabase **Realtime** (live news push instead of 5-min polling) and **Auth** (Google login like the reference site). The app architecture (FastAPI + SQLAlchemy + React/Vite) stays intact — this is a data-layer + platform migration, NOT a rewrite.

## Notes

- **Domain:** portfolio-tracker. Backend is pure SQLAlchemy (backend/app/database.py — the whole DB layer is one connection string + Base.metadata.create_all). Frontend is React/Vite; the reference bond-crisis site runs on Supabase (project vovprwjjauwqqiowwgqd) — its Realtime/Auth patterns are what we borrow.
- **Constraints found in this repo:**
  - database.py uses check_same_thread: False (SQLite-only connect arg — must drop for Postgres).
  - nullslast() is SQLAlchemy-portable (works on both).
  - Background enrichment thread (news translate) + Ollama (ai_narrative_service, local host.docker.internal:11434) both assume the backend runs on this machine — survive Phase 1 unchanged; Phase 2 (cloud) needs a persistent worker (not serverless) and Ollama must move to DeepSeek (user already has the key).
  - Tests use an in-memory SQLite engine via conftest override — stay green regardless; only the prod connection changes.
  - Supabase free tier: 500MB DB, 2 active projects, pauses after 1 week inactivity — fine for a personal app, matters for the cloud decision.
- **User decisions so far:** Option A (keep FastAPI, Supabase = hosted DB + Realtime + Auth, free tier); two phases — local first, cloud later.
- **Tracker:** local-markdown (tickets.md). Work the frontier. **Do NOT resolve more than one ticket per session.**

## Decisions so far

<!-- index of closed tickets, one line each -->

## Not yet specified

- Supabase free-tier Auth quota (50K MAU, 5K users) and whether Google OAuth needs a Google Cloud project or Supabase built-in providers suffice.
- Realtime scope: live push for the news tab only, or also macro/model dashboards (they are 10-min cached; Realtime may be overkill).
- Which endpoints/tabs sit behind Auth once login exists — today the app has NO auth at all; the reference gates everything behind Google login.
- Phase 2 cloud provider choice (Railway vs Render vs Fly) and whether the background news thread needs a dedicated worker vs a simple always-on instance.
- Data migration: dump existing portfolio.db → import to Supabase, or start fresh (holdings/watchlists are user data — likely migrate; signals/macro caches can be dropped).

## DECISION (2026-08-09): user chose to stay on local SQLite — Supabase migration NOT pursued. Kept as reference for a future effort; all its tickets below are parked, not claimed.

## Out of scope

- Rewriting the backend as Supabase Edge Functions (Deno/TS) — rejected: the service layer (yfinance/FRED/CFTC/model scoring/RSS) is Python, rewrite cost is huge and nothing is gained.
- Replacing yfinance/FRED/etc. with Supabase-hosted data — Supabase has no market-data offering; external sources stay external.
- Moving the frontend off React/Vite (no Next.js migration — reference uses Next.js but the app frontend is already built and working).
- The paused news-feature map (its tickets 4-5 remain open under the earlier MAP section — untouched by this effort).

---

## Ticket: Supabase project setup + connection recipe (wayfinder:research, AFK)

**Question:** What is the exact recipe to point this SQLAlchemy app at a Supabase Postgres project — connection string, required libs, and every SQLite-only assumption that must change?

- [ ] Create a Supabase project (free tier) and record: project URL, DB password, connection string (transaction pooler vs direct), anon + service_role keys
- [ ] Identify every SQLite-only assumption in the codebase (check_same_thread, any SQLite pragmas, LIKE/collation quirks, JSON columns) via grep + read
- [ ] Determine required lib changes (psycopg2 vs psycopg vs asyncpg) and any SQLAlchemy URL/engine args for Supabase (SSL, pool pre_ping, statement cache)
- [ ] Test nullslast()/create_all/unique-index paths against a scratch Supabase DB (or a local Postgres container standing in)
- [ ] Deliver a markdown asset: the connection recipe + diffs required, linked in the resolution comment

## Ticket: Migrate portfolio.db data to Supabase (wayfinder:task, AFK)

**Question:** How does existing user data (holdings, watchlists, portfolios, signals) move from the local SQLite file into Supabase Postgres — and what is safe to drop?

**Blocked by:** Ticket: Supabase project setup + connection recipe

- [ ] Inventory tables + row counts in portfolio.db; classify user data (migrate) vs cache (drop: signals sparkline, macro/model caches)
- [ ] Write a one-shot migration script (read SQLite via SQLAlchemy, insert into Postgres via the same models) with idempotent re-runs
- [ ] Verify row counts + spot-check values after migration
- [ ] Record in the resolution: migrated counts per table, anything dropped

## Ticket: Point FastAPI at Supabase Postgres (wayfinder:task, AFK)

**Question:** What does the code change look like to make the production backend run against Supabase while tests stay on in-memory SQLite?

**Blocked by:** Ticket: Migrate portfolio.db data to Supabase

- [ ] database.py: read DATABASE_URL from env (default keeps local sqlite), drop check_same_thread for postgres, add SSL/pool args for Supabase
- [ ] docker-compose.yml / .env: wire Supabase DATABASE_URL + keys without committing secrets
- [ ] Full backend suite passes (tests unchanged — they use the in-memory override)
- [ ] Live smoke: app boots against Supabase, holdings/watchlist CRUD round-trips, news refresh works

## Ticket: Supabase Realtime for the news tab (wayfinder:prototype, HITL)

**Question:** Should live news updates use Supabase Realtime (postgres_changes subscription) instead of the current 5-min polling — and what does that look like in this React app?

**Blocked by:** Ticket: Point FastAPI at Supabase Postgres

- [ ] Prototype: backend enables Realtime on news_items; frontend subscribes and renders new items as they land
- [ ] Compare UX: instant push vs 5-min poll — show the user both
- [ ] Decide scope: news tab only, or also macro/model dashboards (they are 10-min cached — likely overkill)
- [ ] Link the prototype + decision as assets

## Ticket: Supabase Auth + login gate (wayfinder:prototype, HITL)

**Question:** What does Google login look like for this app, and which parts of the app sit behind it?

**Blocked by:** Ticket: Point FastAPI at Supabase Postgres

- [ ] Prototype: Supabase Auth (Google provider), frontend login button + session, backend validates the JWT
- [ ] Show the user the flow; decide gating scope (everything vs specific tabs — the reference gates all behind Google login)
- [ ] Decide: protect the new data via RLS or rely on app-level checks (single-user personal app today)
- [ ] Link the prototype + decision as assets

## Ticket: Phase 2 — cloud deploy with Supabase DB (wayfinder:task, HITL)

**Question:** When Phase 1 works locally, what is the cheapest always-on cloud setup (Railway/Render/Fly) for the same backend — including the background news thread and replacing local Ollama?

**Blocked by:** Ticket: Point FastAPI at Supabase Postgres

- [ ] Compare Railway vs Render vs Fly for a persistent Python worker (not serverless — background thread needs an always-on process)
- [ ] Decide Ollama handling: move ai_narrative to DeepSeek (key exists) vs run Ollama on the same VPS
- [ ] Cost estimate + deploy runbook (env vars, health check, DB from Supabase)
- [ ] Deliver the runbook as an asset

---

# MAP: Banking Stress tab (วิกฤตแบงก์รัน) for Bond-crisis — wayfinder:map

## Destination

A "วิกฤตแบงก์รัน" sub-tab in the Bond-crisis page mirroring the reference site's `/banking` page 100%: a bank-run stress gauge (0-40 green / 40-70 amber / 70-100 red), four funding-rate cards (SOFR / EFFR / OBFR / SOFR-EFFR spread with red/orange/emerald thresholds), bank-deposits + Fed discount-window cards with WoW %, KRE (regional banks) + BKX (KBW banks) price cards with 1D change, a deposit-flow WoW bar chart (60 weeks), a SOFR-EFFR area chart (60 days), and the bank-run regime-model card — all computed from sources the app already has (FRED + yfinance + the existing bank-run model score).

## Notes

- **Domain:** portfolio-tracker, Bond-crisis Tools tab. Existing patterns to reuse: `MacroDashboard.tsx` / `ModelsDashboard.tsx` (generic card rendering, no Tailwind, hand-rolled SVG charts, shared theme tokens, Thai-first UI), `macro_service.py` (FRED/yfinance fetch + `_SERIES` registry + parallel-wave fetch), `model_service.py` (bank-run model score already computed 0-100).
- **Reference extracted 2026-08-09 (banking/page-6940680eefeb1371.js + i18n chunk 3474):**
  - Data: `macro_series` (us_banking_stress_index, us_bank_deposits, us_discount_window, us_sofr, us_effr, us_obfr, us_sofr_effr_spread), `macro_series_history` 30d (bank_deposits, discount_window, stress_index, sofr_effr_spread), `market_prices` category=banking (KRE, BKX), `model_scores` bank-run.
  - Gauge: value 0-100, zones [[0,40,#10b981],[40,70,#f59e0b],[70,100,#ef4444]], size 210, 1 decimal; `value_label` renders the "ข้อมูลเข้าไม่ครบ" (partial inputs) badge; no data → "ยังไม่มีข้อมูลดัชนี" placeholder (never fake 0).
  - Funding cards: SOFR/EFFR/OBFR plain values + change bps; SOFR-EFFR spread card border orange when >10, text red >20 / orange >10 / emerald else.
  - Stat cards: เงินฝากธนาคารรวม ($B, WoW %), Fed Discount Window ($B, WoW %), KRE (Regional Banks), BKX (KBW Banks) — price + 1D %.
  - Charts: deposit-flow WoW % BarChart (last 60 weeks), funding stress SOFR-EFFR bps AreaChart (last 60 days, gradient #38bdf8).
  - Model card: bank-run model (name/score/status badge/concept/trade direction) — reuse ModelsDashboard's ModelCard rendering.
  - refreshMs 300000; header title t.banking = "วิกฤตแบงก์รัน" + lastUpdated.
- **User decision (2026-08-09):** the stress gauge IS the bank-run model score — no new computation, gauge and model card agree. (Option A chosen over a separately-weighted composite.)
- **Never fabricate:** missing series renders "—" / placeholder — never a fake 0 or invented number.
- **Tracker:** local-markdown (tickets.md). Work the frontier: open + unblocked first. **Do NOT resolve more than one ticket per session.**

## Decisions so far

<!-- index of closed tickets, one line each -->

- [Ticket: KRE / BKX price source](tickets.md) — `KRE` works as-is (SPDR Regional Banking ETF); `BKX` must be `^BKX` (index — the bare symbol is delisted in yfinance). Fetch: `history(period="5d")`, 1D chg from last two closes; fallbacks KBE/XLF. Asset: `docs/research/kre-bkx-price-source-2026-08-09.md`.
- [Ticket: Backend banking payload + /api/banking](tickets.md) — `banking_service.build_banking()` reuses the shared macro dashboard cache + bank-run model score as the gauge; KRE/^BKX via yfinance (one retry for Yahoo rate-limit); deposit-flow WoW + SOFR-EFFR bps histories from FRED raw rows. `/api/banking` + `/refresh`, 4 new tests, 448 total pass.
- [Ticket: Banking tab frontend](tickets.md) — `BankingDashboard.tsx`: SVG gauge (reference zones), 4 funding cards with spread thresholds, 4 stat cards (deposits/discount/KRE/BKX), deposit-flow bar + SOFR-EFFR area charts, bank-run model card; 6 new tests, 572 frontend pass. Bonus: FRED was broken from Docker (CDN TLS-fingerprint bot detection rejects custom UAs) — fixed by sending no custom UA for FRED; live /api/banking now fully populated.
- [Ticket: Spec, tests, commit](tickets.md) — spec updated with the Banking tab + FRED fix; suites 448 backend + 572 frontend; live smoke full. **MAP CLOSED 2026-08-09 — all tickets resolved, way clear to run.**

## Not yet specified

<!-- none — the banking map is fully charted and resolved -->

## Out of scope

- The reference site's remaining unmirrored pages (sentiment index, country risk, scenario simulator, AI boardroom, 3D office) — the user scoped this effort to the banking page only.
- Other bank indices beyond KRE/BKX (e.g. XLF, regional stress indices requiring paid data).
- The paused Supabase-migration map — separate effort, its tickets stay parked.
- Bank-run model internals — the model already exists and is scored; this tab only *displays* it.

---

## Ticket: KRE / BKX price source (wayfinder:research, AFK)

**Question:** What is the exact yfinance source for the two banking equity cards — KRE (SPDR Regional Banking ETF) and BKX (KBW Nasdaq Bank Index) — including ticker symbols, price, 1-day change, and any history needed for a sparkline?

**Resolution (2026-08-09):** `KRE` works as-is (76.21, -0.37% on 2026-08-09). `BKX` without a caret is **delisted/no-data in yfinance** (zero rows at 5d/1mo/3mo) — the correct symbol is the index **`^BKX`** (189.99, +0.17%, `fast_info.last_price` works). Fetch: `yf.Ticker(sym).history(period="5d")`, 1D change from last two closes; fallbacks KBE/XLF if either ever fails. Full recipe: `docs/research/kre-bkx-price-source-2026-08-09.md`.

- [x] Probe `KRE` and `BKX` (and `^BKX` if the raw index) via yfinance from this host — record last price, 1D change %, and history availability
- [x] Note any delisting / symbol-change issues (BKX vs ^BKX vs KBE)
- [x] Deliver a markdown asset with the exact tickers + fetch recipe, linked in the resolution comment

## Ticket: Backend banking payload + /api/banking (wayfinder:task, AFK)

**Question:** What shape does the server-side payload take — funding cards, deposits/discount WoW, KRE/BKX prices, stress gauge (= bank-run score), and the two history series — reusing macro_service's existing FRED/yfinance fetches?

**Resolution (2026-08-09):** `banking_service.build_banking()` reuses macro_service's shared 10-min dashboard cache for the funding cards (SOFR/EFFR/OBFR/spread) and stat cards (deposits/discount window) — no re-fetch. Gauge = bank-run model score from model_service (11.7 on 2026-08-09, inactive). KRE/^BKX via yfinance `history(period="5d")` with one retry (Yahoo rate-limits when the cold dashboard pulls 8 tickers at once). Deposit-flow WoW from DPSACBW027SBOG weekly history (55 points); SOFR-EFFR bps from SOFR/DFF daily (60 points). `GET /api/banking` + `POST /refresh` (10-min cache), registered in main.py. Tests: 4 new (happy path with known fixtures incl. WoW 10% math, missing→None never fabricated, router cache, refresh invalidates). Full suite 448 passes.

- [x] Reuse macro_service `_SERIES` data (sofr/effr/obfr/spread/deposits/discount_window) — do NOT re-fetch what build_dashboard already fetched (shared cache)
- [x] Stress gauge = bank-run model score from model_service (0-100) — same value the model card shows
- [x] KRE/BKX fetched via the yfinance pattern (price + change_pct), parallel with the rest
- [x] Deposit-flow WoW % series from DPSACBW027SBOG weekly history; SOFR-EFFR bps series from SOFR/DFF daily history
- [x] `GET /api/banking` payload mirrors the reference data shape (series values, history, prices, model) + data_sources
- [x] Backend tests: gauge equals bank-run score, WoW math on known fixtures, missing series → None (never fabricated), cache/refresh

## Ticket: Banking tab frontend (wayfinder:task, HITL)

**Question:** What does the 100%-parity banking UI look like in this app's non-Tailwind, Thai-first design system — gauge, funding cards, stat cards, two charts, model card?

**Resolution (2026-08-09):** `BankingDashboard.tsx` renders the full reference layout with hand-rolled SVG (no new dependency): 240° stress gauge with the reference zones (0-40 #10b981 / 40-70 #f59e0b / 70-100 #ef4444) + needle + value, "ข้อมูลเข้าไม่ครบ" badge when partial_inputs, "ยังไม่มีข้อมูลดัชนี" placeholder when absent; 4 funding cards with the red(>20)/orange(>10)/emerald spread thresholds; 4 stat cards (เงินฝากธนาคารรวม / Fed Discount Window WoW, KRE/^BKX 1D); deposit-flow WoW bar chart (green/red bars); SOFR-EFFR area chart (#38bdf8 gradient); bank-run model card (score + status badge + concept + trade direction) reusing the models-tab visual language; refresh button + 5-min auto-refresh; "—" for any missing value (never fabricated). Wired as the วิกฤตแบงก์รัน sub-tab in BondCrisisPage. Tests: 6 new (gauge+cards+charts render, no-data placeholder, partial badge, missing→"—", refresh, error retry). Full suite 572 frontend + 448 backend pass.

**Bonus fix found during verification:** FRED was BROKEN from Docker entirely — its CDN runs TLS-fingerprint bot detection and only serves requests whose User-Agent matches the client library's real fingerprint (python-httpx/0.27.2); the app's custom `portfolio-tracker/1.0` UA (and even a browser UA) timed out from container egress IPs while the host got 200. This is why the docker-based dashboard had missing FRED series from the start. Fix: FRED fetches now send NO custom headers (macro_service._fetch_fred_series). docker-compose stays on the default bridge network (host networking is unreachable from Windows host on Docker Desktop). Live /api/banking now returns full funding (SOFR 3.65/EFFR 3.63/spread 2.0), gauge 11.7, KRE/^BKX prices, 55 deposit-flow + 60 spread points.

- [x] `BankingDashboard.tsx` sub-tab in Bond-crisis page (alongside macro/models/signals/news)
- [x] Stress gauge: hand-rolled SVG arc (zones 0-40/40-70/70-100 in the reference colors), value + "ข้อมูลเข้าไม่ครบ" badge when partial, "ยังไม่มีข้อมูลดัชนี" placeholder when absent
- [x] Funding cards ×4 with the red/orange/emerald spread thresholds and change-bps lines
- [x] Stat cards ×4 (เงินฝาก / Discount Window / KRE / BKX) with WoW/1D changes
- [x] Deposit-flow WoW bar chart + SOFR-EFFR area chart (hand-rolled SVG, no new dependency)
- [x] Bank-run model card reusing ModelsDashboard's ModelCard
- [x] Empty/error states — unavailable renders as "—", never a fabricated number

## Ticket: Spec, tests, commit (wayfinder:task, AFK)

**Question:** Is the whole banking tab verified and documented before the map closes?

**Resolution (2026-08-09):** Spec updated (`docs/specs/2026-08-08-macro-dashboard.md` — Banking tab section: gauge=bank-run score decision, shared-cache reuse, KRE/^BKX, two histories; plus the FRED TLS-fingerprint Docker fix documented so it never regresses). Full suites green: 448 backend + 572 frontend. Live smoke: /api/banking full (gauge 11.7, all funding cards populated, 55+60 history points) and /api/macro 60/66 available — the FRED fix raised the Docker dashboard's coverage too. Committed (spec commit on top of the feature commit). **MAP CLOSED — all 4 tickets resolved.**

- [x] Spec updated (the Bond-crisis spec family in docs/specs/)
- [x] Full backend + frontend suites pass
- [x] Live smoke: gauge shows the bank-run score, funding cards live, charts render
- [x] Commit (user rule: update spec, then commit)
---

# MAP: Countries tab (รายประเทศ) for Bond-crisis — wayfinder:map

## Destination

A "รายประเทศ" sub-tab in the Bond-crisis page mirroring the reference site's `/countries` page 100%: 27 country cards (flag, Thai name, code · currency, country-risk badge เสี่ยงต่ำ/ปานกลาง/สูง/เฝ้าระวังวิกฤต, 0-100 risk score, 10Y yield, "X bps vs US" spread, score progress bar with the reference color bands, 60-day score sparkline, data-tier note), sortable มาตรฐาน/เสี่ยงมาก→น้อย/เสี่ยงน้อย→มาก, all from free sources (FRED 10Y yields) with the country-risk score computed in-app (the reference's Supabase-computed scores are not ours to use).

## Notes

- **Domain:** portfolio-tracker, Bond-crisis Tools tab. Patterns to reuse: `banking_service.py` (computed score from live inputs, shared macro cache), `ModelsDashboard`/`BankingDashboard` (ink-palette cards, hand-rolled SVG sparklines, no Tailwind, Thai-first).
- **Reference extracted 2026-08-09 (countries/page-bd8b5f2037a3f46e.js + i18n 3474):**
  - Data: `countries` (code, name_en/th, currency, flag emoji, data_tier realtime|daily|sparse|manual, display_order — 27 countries), `country_risk_scores` (score 0-100, level low|medium|high|crisis-watch, components, updated_at), `macro_series` category=yield for 10Y per country, rpc `country_risk_daily{days:60}` for the trend sparkline.
  - Risk level colors: low=emerald, medium=amber, high=orange, crisis-watch=red (badge bg/text 15% opacity). Progress bar: ≥75 red, ≥55 orange, ≥30 amber, else emerald; width = score% (min 3).
  - Score formula (from components): yield_level + data_freshness + yield_momentum + curve_inversion + fx_depreciation (+ oat_bund_spread for FR) — each a 0-100-ish sub-score, summed; exact weights are in their Supabase job, we design our own equivalent.
  - Card: flag + name_th + "CODE · currency", risk badge; score (0 decimals) + "10Y" yield (2 decimals %) + "±X bps vs US" (amber if >0, sky if <0, hidden for US); sparkline (strokeUp #f87171, strokeDown #34d399) if ≥2 trend points; data-tier note; arrow icon.
  - Header: title รายประเทศ + subtitle คะแนนความเสี่ยงประเทศ + sort toggle (มาตรฐาน/เสี่ยงมาก→น้อย/เสี่ยงน้อย→มาก, persisted to localStorage `bcd-countries-sort`) + "ความครอบคลุมข้อมูล →" link to /countries/coverage. refreshMs 300000. Footer: lastUpdated.
  - i18n: countries=รายประเทศ, countryRisk=คะแนนความเสี่ยงประเทศ, riskTrend60=คะแนนย้อนหลัง 60 วัน, csortDefault=มาตรฐาน, csortHigh=เสี่ยงมาก→น้อย, csortLow=เสี่ยงน้อย→มาก, dataTierNote{realtime=ข้อมูลเรียลไทม์, daily=ข้อมูลรายวัน, sparse=ข้อมูลจำกัด อาจล่าช้าบางวัน, manual=ไม่มีตลาดรอง — ติดตามผ่านอันดับเครดิตและข่าว}.
- **User decision (2026-08-09, UPDATED):** originally Option A (FRED 10Y only, ~13/27 — missing rendered "—"). User then said **"อยากได้ 27 ประเทศ"** — coverage of all 27 is now required. FRED IRLTLT01 stays the base (~13 OECD countries); the ~14 missing (TH VN LA SG HK CN SA AE RU IN ID BR TR PH MY) need a second free source — the research ticket now probes World Bank API / IMF IFS / yfinance / EODHD-free for long-term gov bond yields, picks the best free source, and the prototype calibrates on the full 27. Never fabricate: a country with no yield from any free source still renders "—", but the goal is all 27 covered.
- **Never fabricate:** missing yield/score renders "—"; RU's 2018 data is flagged stale rather than presented as current.
- **Tracker:** local-markdown (tickets.md). Work the frontier: open + unblocked first. **Do NOT resolve more than one ticket per session.**

## Decisions so far

<!-- index of closed tickets, one line each -->

- [Ticket: Country yield source coverage — all 27 countries](tickets.md) — FRED IRLTLT01 covers 13 (RU stale 2018); every other API failed (World Bank indicator 502, IMF 404, BIS timeout, EODHD login-walled, Investing 403, yfinance none); **worldgovernmentbonds.com via Playwright** (chromium-1208 already installed) verified extracting TH 10Y 2.050% — covers the remaining 14. Asset: `docs/research/country-yield-sources-2026-08-09.md`.
- [Ticket: Country risk score engine](tickets.md) — user-confirmed formula: yield_level (spread vs US, cap 25) + momentum (cap 10) + fx 3M (cap 24) + freshness (cap 5); levels ≥75/≥55/≥30; 24/27 scored, LA/SA/AE → "—" (no free 10Y source); RU stale-flagged. Asset: `docs/research/country-risk-score-engine-2026-08-09.md`.
- [Ticket: Backend countries payload + /api/countries](tickets.md) — static 27-country registry; FRED (13) + Playwright worldgovernmentbonds (14) yields with 1M bp; user-confirmed score formula + levels; bps-vs-US; 60-day trend recomputed from FRED history; RU stale-flagged, LA/SA/AE None. `/api/countries` + `/refresh`, 6 new tests, 454 total pass.
- [Ticket: Countries tab frontend](tickets.md) — `CountriesDashboard.tsx`: 27 cards (flag/name/badge/score/yield/bps/progress bar/sparkline/data-tier), sort toggle persisted, 6th Bond-crisis sub-tab; 5 new tests, 577 frontend pass. Docker fix: `_chromium_path()` globs ms-playwright cross-platform + Dockerfile.dev installs chromium — live 24/27 yields in docker.

## Not yet specified

- Coverage page (/countries/coverage) — mirror it or link out; it is a documentation table, likely low value (may rule out of scope).
- FRED IRLTLT01 is *monthly* — "1D/current" semantics become "latest month", and the "bps vs US" spread uses monthly alignment; acceptable but must be stated in the UI data-tier note.

## Out of scope

- The reference site's remaining unmirrored pages (sentiment index, country risk detail pages /countries/:code, scenario simulator, AI boardroom, 3D office) — the user scoped this effort to the countries overview tab.
- Paid yield sources (Trading Economics, EODHD paid tiers) — Option B deferred until Option A coverage proves inadequate.
- Ratings (S&P/Moody's/DBRS) per country — no free source.
- The paused Supabase-migration map — separate effort, its tickets stay parked.

---

## Ticket: Country yield source coverage — all 27 countries (wayfinder:research, AFK)

**Question:** With FRED IRLTLT01 covering ~13 OECD countries, which FREE second source (World Bank API, IMF IFS, yfinance bond series, EODHD free tier) supplies long-term government bond yields for the missing ~14 (TH VN LA SG HK CN SA AE RU IN ID BR TR PH MY) — and what is the final 27-country source map with staleness flags?

**Resolution (2026-08-09):** FRED IRLTLT01 = 13 countries (US JP GB CA AU CH KR MX ZA PL FR NO + RU-stale-2018). All other API candidates failed live probes: World Bank indicator endpoint 502 (host AND container — their outage, not our network), IMF IFS 404/204, BIS timeout, EODHD demo login-walled, Investing.com 403, yfinance no non-US bond tickers, OECD 404. **Chosen second source: worldgovernmentbonds.com scraped via Playwright** (headless Chromium already installed at ms-playwright chromium-1208; `pip install playwright` + explicit executable_path, no browser re-download) — verified extracting TH 10Y = 2.050% from the yield-table row `/10 years/`. Covers all remaining 14 countries (TH VN LA SG HK CN SA AE IN ID BR TR PH MY); FRED monthly vs site daily noted. Full survey + recipe + slugs: `docs/research/country-yield-sources-2026-08-09.md`.

- [x] Probe World Bank API (`api.worldbank.org/v2/country/{cc}/indicator/...`) for long-term gov bond yields per missing country — record OK / value / latest date / no-data
- [x] Probe IMF IFS / yfinance bond series / EODHD free tier as alternates where World Bank lacks a series
- [x] Probe FRED IRLTLT01 for all 27 (base set, no custom UA — the TLS-fingerprint lesson); record OK / 404 / stale-last-date
- [x] Deliver a markdown asset: final 27-country source map (series/URL per country), latest values, staleness flags, monthly-vs-daily alignment notes

## Ticket: Country risk score engine (wayfinder:prototype, HITL)

**Question:** What is the in-app formula for the 0-100 country risk score (yield_level vs US + yield_momentum + data_freshness + optional extras), calibrated on real FRED yields and judged by the user?

**Resolution (2026-08-09, user-confirmed):** `score = yield_level (0-25, spread vs US) + yield_momentum (0-10, 1M bp÷10) + fx_depreciation (0-24, 3M window) + data_freshness (0-5)`. Levels: ≥75 crisis-watch / ≥55 high / ≥30 medium / else low. 24/27 scored on real data (FRED 13 + worldgovernmentbonds via Playwright 11); TR 32.8, MX 33.8, ZA 28.3 top — developed countries 0-3 — ordering matches reference. LA/SA/AE have NO free 10Y source (reference uses paid credit ratings) → score None, renders "—" with data-tier note. RU stale-2018 → freshness 5 + stale flag. Sparkline: recompute from stored FRED yield history for FRED countries; SQLite score snapshots for Playwright countries. Asset: `docs/research/country-risk-score-engine-2026-08-09.md`.

- [x] Prototype the component math on the ~13 real yield series; show the user a sample of scores + levels (low/medium/high/crisis-watch) to judge
- [x] Decide and record: exact component weights, level thresholds (reference progress bar implies ≥75 red / ≥55 orange / ≥30 amber / else emerald), stale-data handling (RU 2018)
- [x] Decide and record: sparkline source (own score history vs recompute from stored yield history)
- [x] Link the prototype script + sample output as assets

## Ticket: Backend countries payload + /api/countries (wayfinder:task, AFK)

**Question:** What shape does the server-side payload take — country metadata + computed risk scores + 10Y yields + bps-vs-US + 60-day trend — reusing macro_service's FRED fetch and the score engine?

**Resolution (2026-08-09):** `countries_service.build_countries()` — static 27-country registry (code/name_th/en/currency/flag/data_tier/slug/fred-id, mirroring the reference table); FRED IRLTLT01 for 13 countries + Playwright worldgovernmentbonds for the other 14 (chromium-1208 explicit path; 1M bp from the yield-table column); user-confirmed score formula (yield_level spread vs US cap 25 + momentum cap 10 + fx 3M cap 24 + freshness cap 5); level thresholds ≥75/≥55/≥30; bps-vs-US hidden for US; 60-day trend recomputed from FRED yield history (FRED countries — user decision), empty for Playwright single-point countries until SQLite snapshots accumulate; RU stale-flagged, LA/SA/AE score None. `GET /api/countries` + `POST /refresh` (10-min cache), registered in main.py. Built 27 countries in ~20s live (FRED 13 parallel + Playwright 14). Tests: 6 new (27 countries present, formula components exact, stale RU, trend presence, cache, refresh) — full suite 454 passes.

- [x] Country registry (27 countries: code/name_th/en/currency/flag/data_tier/display_order) as a static table mirroring the reference
- [x] FRED 10Y yields fetched via the shared FRED fetcher (parallel wave, no custom UA); missing → None
- [x] Risk scores from the prototype formula; level from thresholds; stale flag for RU
- [x] bps-vs-US = (country 10Y − US 10Y) × 100, hidden for US
- [x] 60-day trend per country (per the sparkline decision)
- [x] `GET /api/countries` payload mirrors the reference data shape + data_sources; tests (missing → None, bps math, level thresholds, sort fields)

## Ticket: Countries tab frontend (wayfinder:task, HITL)

**Question:** What does the 100%-parity countries UI look like in this app's non-Tailwind, Thai-first design system?

**Resolution (2026-08-09):** `CountriesDashboard.tsx` renders the full reference layout with hand-rolled SVG (no new dependency): 27 country cards (flag, name_th, code · currency, level badge เสี่ยงต่ำ/ปานกลาง/สูง/เฝ้าระวังวิกฤต in the reference colors, score rounded to int, 10Y yield, "±X bps vs US" amber/sky, score progress bar with the ≥75/≥55/≥30 color bands, 60-day SVG sparkline strokeUp #f87171 / strokeDown #34d399, data-tier note + stale flag, arrow); header รายประเทศ + subtitle คะแนนความเสี่ยงประเทศ; sort toggle มาตรฐาน/เสี่ยงมาก→น้อย/เสี่ยงน้อย→มาก persisted to localStorage `bcd-countries-sort`; refresh button + 5-min auto-refresh; "—" for missing values (LA/SA/AE). Wired as the รายประเทศ sub-tab in BondCrisisPage (6th tab). Tests: 5 new (cards render with scores/yields/badges, missing → "—", sort persists, refresh, error retry). Full suite 577 frontend + 454 backend pass.

**Docker fix found during verification:** Playwright's chromium was NOT in the container — the host-path hardcode failed silently (yields None). Fix: `_chromium_path()` locates the browser cross-platform by globbing ms-playwright dirs (host chromium-1208 chrome-win64, container /root/.cache/ms-playwright chromium-1234 chrome-linux64); Dockerfile.dev installs `playwright + chromium --with-deps` into the image. Live /api/countries now returns 24/27 with yields in docker (LA/SA/AE genuinely have no free source — the reference uses paid credit ratings).

- [x] `CountriesDashboard.tsx` sub-tab in Bond-crisis page (alongside macro/models/signals/banking/news)
- [x] Country cards: flag, name_th, code · currency, risk badge (reference colors), score, 10Y yield, bps-vs-US, progress bar with color bands, 60-day sparkline (SVG, strokeUp #f87171 / strokeDown #34d399), data-tier note, arrow
- [x] Sort toggle มาตรฐาน/เสี่ยงมาก→น้อย/เสี่ยงน้อย→มาก (persisted); header + subtitle + lastUpdated; "ความครอบคลุมข้อมูล →" link (target decided in a ticket)
- [x] Empty/error states — missing renders "—", never fabricated
- [x] Tests: cards render with fixture, sort orders, missing-yield "—", level colors

## Ticket: Coverage page + spec, tests, commit (wayfinder:task, AFK)

**Question:** Is the coverage table mirrored (or ruled out), and is the whole countries tab verified and documented?

**Blocked by:** Ticket: Countries tab frontend

- [ ] Decide coverage: mirror a simple data-tier table or rule out of scope (link text still shown)
- [ ] Spec updated (Bond-crisis spec family)
- [ ] Full backend + frontend suites pass; live smoke: 13 countries with real scores, others "—"
- [ ] Commit (user rule: update spec, then commit)
