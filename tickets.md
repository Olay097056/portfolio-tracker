# Tickets: Watchlist and Scanners

Builds the Watchlist area and its four Scanner tabs, from the spec in `docs/specs/2026-07-25-watchlist-and-scanners.md`. Respects ADR 0004 (scanning universe and provider split) and ADR 0005 (raw signals, never composite scores or subjective tags).

Work the **frontier**: any ticket whose blockers are all done. After "Watchlist area" lands, three tickets open at once — "Momentum Scanner walking skeleton", "Dividend Ranking", and "Trending Stocks Today" are independent of each other.

## Extract the shared tab navigation

**What to build:** Nothing changes for the user. The top-level navigation and the Tools sub-tab strip currently hand-roll the same pressed-button pattern in two places, and the Watchlist area about to be built needs a third copy with five tabs. Extract one reusable tab-strip so the new area is a list of tab definitions rather than another thirty lines of duplicated markup. This is prefactoring: make the change easy, then make the easy change.

**Blocked by:** None — can start immediately.

- [ ] Both the top-level navigation and the Tools sub-tabs render through one shared tab component
- [ ] Every existing test passes **without modification** — this is the proof the refactor preserved behaviour
- [ ] The active tab is still communicated to assistive technology the same way it is today
- [ ] Type checking passes

## Watchlist area

**What to build:** A new top-level Watchlist area, separate from Portfolios and Tools, whose first tab lets the user manage the Watchlist. The user can add a ticker, optionally tagging it with a free-text category, see everything they are following in one list, and remove entries. This is frontend-only work: the WatchlistItem model and its create/list/delete endpoints already exist and already have backend tests, and their shape does not change.

**Blocked by:** Extract the shared tab navigation

- [ ] A Watchlist entry appears in the top-level navigation and opens the Watchlist area
- [ ] The area uses the shared tab component, with Watchlist management as its first sub-tab
- [ ] Submitting a ticker adds it and it appears in the list
- [ ] A ticker can be added with a category and without one
- [ ] Tickers are stored upper-cased, so casing differences cannot create duplicate entries
- [ ] Each listed entry shows its ticker and its category
- [ ] An entry can be removed and disappears from the list
- [ ] An empty Watchlist shows a message inviting a first ticker rather than a blank area
- [ ] A failed add surfaces an error message and does not clear the form silently
- [ ] Existing backend endpoints are unchanged

## Momentum Scanner walking skeleton

**What to build:** The first complete path from a rate-limited market-data provider through to a rendered Scanner table. A Momentum Scanner sub-tab opens empty with a Scan button; pressing it fetches one year of daily history for each Watchlist ticker, sequentially, and fills in a single signal — percent change over a period the user selects. Everything a Scanner needs to survive real use is proven here: caching, per-ticker failure isolation, progress reporting, and the never-fabricate rule. Later tickets add signals to a shell that already works.

**Blocked by:** Watchlist area

- [ ] A history service fetches one year of daily history per ticker behind a single private provider function, caching per ticker in memory with a fifteen-minute TTL and exposing a cache-clearing entry point for tests, following the existing price and FX services
- [ ] A failed fetch is not cached
- [ ] The price-signals endpoint returns one row per Watchlist ticker, including tickers whose fetch failed, with unavailable values carried as null
- [ ] Tickers are fetched sequentially, and one ticker's failure does not abandon the rest of the scan
- [ ] The tab shows an empty table and a Scan button on open, and issues no request until Scan is pressed
- [ ] Pressing Scan reports per-ticker progress while running and disables the button until the scan completes
- [ ] Results remain on screen after the scan finishes and until Scan is pressed again
- [ ] A ticker whose data could not be fetched appears as a row marked unavailable, not omitted
- [ ] The user can select the percent-change period from one day, one week, and one month
- [ ] The percent-change column is sortable and its heading states the period measured
- [ ] An empty Watchlist shows a message saying there is nothing to scan, distinct from a scan that found nothing
- [ ] A second scan within the TTL is served from cache without refetching

## Momentum Scanner remaining signals

**What to build:** Fill out the Momentum Scanner with its three remaining measurements — 14-period RSI, latest volume against its 20-period average, and price's distance from its 50-period simple moving average as a percent. Each is a pure function over an in-memory price series, tested against hand-computed expectations. Separated from the walking skeleton because four signals plus their insufficient-history cases is a context window's worth of careful arithmetic on its own.

**Blocked by:** Momentum Scanner walking skeleton

- [ ] Signal maths lives in pure functions taking a series of closes, highs, lows, and volumes, performing no I/O and taking no ticker
- [ ] 14-period RSI, volume-to-20-period-average ratio, and percent distance from the 50-period simple moving average each appear as their own sortable column
- [ ] Every column heading states its measurement and its period, so a number can be reconciled against a chart elsewhere
- [ ] A signal whose window exceeds the available history reports unavailable rather than being computed on a short window
- [ ] A ticker with partial history still shows the signals that could be computed
- [ ] There is no composite score and no social-sentiment column anywhere
- [ ] Each signal has direct pure-function tests with hand-computed expected values, including an insufficient-history case

## Pre-Squeeze Scanner

**What to build:** A Pre-Squeeze Scanner sub-tab measuring volatility contraction relative to each ticker's *own* recent history: 20-period Bollinger Band width at two standard deviations as a percent of price, where that width sits as a percentile against the same ticker's trailing six months, 14-period ATR as a percent of price, and the volume ratio already built for Momentum. It rides the history service and price-signals endpoint that already exist, so scanning in either tab populates both.

**Blocked by:** Momentum Scanner remaining signals

- [ ] Band width, own-history band-width percentile, ATR percent, and volume ratio each appear as their own sortable column
- [ ] The percentile is computed against the same ticker's trailing six months, never against other tickers
- [ ] Column headings state the Bollinger parameters and the ATR period
- [ ] The signals come from the same cached history as Momentum — a scan in one tab populates the other, and switching tabs issues no second request
- [ ] A ticker with insufficient history reports the affected signals as unavailable while still showing the rest
- [ ] There is no composite score, no days-until-earnings column, and no market-capitalisation column
- [ ] New signal maths has direct pure-function tests with hand-computed expected values, including insufficient-history cases

## Dividend Ranking

**What to build:** A Dividend Ranking sub-tab showing, for every Watchlist ticker, its price, gross dividend yield, net yield after a withholding-tax rate the user controls, how many times it actually paid over the trailing twelve months, and how those payouts compare with the twelve months before. Frequency is counted from observed payment dates rather than inferred from what kind of fund a ticker is. Independent of the price-signal Scanners: different endpoint, different upstream data, different cache lifetime.

**Blocked by:** Watchlist area

- [ ] A dividend scan endpoint takes the tax rate as a query parameter and returns price, gross yield, net yield, observed payment frequency, and dividend growth per Watchlist ticker
- [ ] Dividend data is cached separately from price history with a twenty-four-hour TTL, matching the existing FX service, with a cache-clearing entry point for tests
- [ ] One row is returned per Watchlist ticker, including tickers whose fetch failed, with unavailable values as null
- [ ] The tab follows the same scan discipline as the other Scanners: empty on open, Scan button, progress, disabled while running, results persist
- [ ] A single tax-rate field defaults to fifteen percent and behaves as it does in the existing DCA Projection and Passive Income calculators
- [ ] Net yield is derived from gross yield and the tax rate using the same formula the existing calculators use
- [ ] Editing the tax rate updates the net column from data already on screen, issuing no second request
- [ ] Payment frequency is counted from observed payment dates in the trailing twelve months
- [ ] Dividend growth compares the trailing twelve months of payouts against the twelve months before it
- [ ] A ticker that paid nothing shows a zero or unavailable payout rather than being hidden from the table
- [ ] Every column is sortable and there are no "suitable for" tags anywhere
- [ ] Frequency, growth, and net-yield maths have direct pure-function tests with hand-computed expected values

## Trending Stocks Today

**What to build:** A Trending Stocks Today sub-tab showing what moved across the whole market today — biggest gainers, biggest losers, and most-active names — with a button on each row to drop that ticker straight into the Watchlist, which is how a name discovered here flows into the other Scanners. This is the only ticket that touches a provider the project has never used, which is why it lands last: a problem here cannot hold up features built on the existing provider.

**Blocked by:** Watchlist area

- [ ] A market-breadth provider is added as a backend dependency, with its key read from an environment variable following the existing provider-key convention
- [ ] The provider call sits behind a single private fetcher function so it can be replaced in tests
- [ ] A market-trending endpoint returns the gainers, losers, and most-active lists, capped at ten rows each
- [ ] Each row carries ticker, company name, price, and percent change, taken only from what the provider returned — no per-ticker enrichment from the other provider
- [ ] The endpoint reports the missing-key condition explicitly and never returns placeholder data
- [ ] When the key is absent the tab explains what needs configuring, rather than showing an empty or broken-looking page
- [ ] Each row has a button that adds that ticker to the Watchlist
- [ ] A ticker already on the Watchlist is shown as already watched instead of offering to add it again
- [ ] The endpoint does not read the Watchlist
