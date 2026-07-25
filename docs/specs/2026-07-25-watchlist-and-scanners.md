# Watchlist and Scanners

## Problem Statement

I follow a couple dozen US tickers that I do not own yet. Today the app can only tell me about things I already hold: a Portfolio has shares and a cost basis, and everything in Tools asks me to type in my own assumptions. There is nowhere to keep a list of candidates, and nowhere to look at several candidates side by side.

So when I want to answer a question like "which of the tickers I'm watching pays the best dividend after tax", or "which one has pulled back hardest this month", or "which one has gone quiet and might be about to move", I have to open each ticker somewhere else, one at a time, and hold the comparison in my head. By the time I've looked at the tenth one I've forgotten the third.

I also have no way to notice a ticker I'm *not* already watching. Nothing in the app tells me what moved across the market today, so candidates only reach my Watchlist if I happen to read about them elsewhere.

## Solution

A new top-level **Watchlist** area, separate from Portfolios (what I own) and Tools (calculators I feed assumptions into).

Its first tab is the Watchlist itself: I add and remove tickers, optionally tagging each with a free-text category. This is the scanning universe.

Four **Scanner** tabs then work over that universe. Each one fetches real market data for every ticker I'm watching and lays the results out as a table of raw signals — one measurement per column, each sortable, each traceable to a single source. There is no headline score and no "good for X" label anywhere: I do the weighing, the app does the measuring.

- **Dividend Ranking** — price, gross yield, net yield after a withholding-tax rate I control, how often it actually paid over the last twelve months, and whether the payout grew or shrank year over year.
- **Momentum Scanner** — percent change over a period I choose, RSI, today's volume against its recent average, and how far price sits from its 50-day moving average.
- **Pre-Squeeze Scanner** — Bollinger Band width, where that width sits against the same ticker's own last six months, ATR as a percent of price, and volume against average.
- **Trending Stocks Today** — the market's biggest gainers, losers, and most-active names today, with a button on each row to drop it straight into my Watchlist.

Scans run when I press a button, not when I open a tab, and results stay on screen until I scan again. If a ticker's data cannot be fetched, that row says so — it never shows a plausible-looking guess.

## User Stories

### Watchlist management

1. As a single user, I want a top-level Watchlist tab in the navigation, so that following candidates is visibly a different activity from tracking what I own.
2. As a single user, I want to add a ticker to my Watchlist by typing its symbol, so that I can start following a candidate in one action.
3. As a single user, I want to optionally attach a free-text category to a Watchlist ticker when I add it, so that I can group candidates by my own reasoning (for example "Value", "Growth", "Dividend").
4. As a single user, I want to add a ticker without a category, so that I am not forced to classify something I have not thought about yet.
5. As a single user, I want to see every ticker in my Watchlist in one list with its category, so that I can review what I am following at a glance.
6. As a single user, I want to remove a ticker from my Watchlist, so that the list stays relevant and my scans do not waste time on names I have lost interest in.
7. As a single user, I want the ticker I type to be normalised to upper case, so that "vti" and "VTI" do not become two separate entries.
8. As a single user, I want to be told when adding a ticker fails, so that I do not think something was saved when it was not.
9. As a single user, I want an empty Watchlist to say so plainly and point me at adding my first ticker, so that a blank screen is not mistaken for a bug.
10. As a single user, I want the Scanner tabs to tell me my Watchlist is empty rather than showing an empty table, so that I understand there is nothing to scan yet rather than concluding the scan found nothing.

### Scanning behaviour, common to every Scanner

11. As a single user, I want each Scanner to start with an empty table and a Scan button, so that opening a tab costs me nothing.
12. As a single user, I want to press Scan to fetch data, so that I control when the app spends requests against a rate-limited data source.
13. As a single user, I want to see progress while a scan runs ("fetching 7 of 23"), so that a slow scan does not look like a hung screen.
14. As a single user, I want the Scan button disabled while a scan is running, so that I cannot accidentally start a second scan on top of the first.
15. As a single user, I want scan results to stay on screen after the scan finishes, so that I can study and re-sort them without refetching.
16. As a single user, I want a ticker whose data could not be fetched to appear as a row marked unavailable, so that I know it was attempted and know not to draw conclusions about it.
17. As a single user, I want one failing ticker not to abandon the rest of the scan, so that one bad symbol does not cost me the whole table.
18. As a single user, I want a repeated scan within a few minutes to return quickly from cache, so that re-checking is cheap.
19. As a single user, I want every column to be sortable, so that I can rank by whichever measurement I care about right now.
20. As a single user, I want each column to be labelled with exactly what it measures and over what period, so that I never have to guess what a number means.
21. As a single user, I never want to see a combined score or a "suitable for X" tag, so that I am not nudged toward trusting a weighting nobody validated.

### Dividend Ranking

22. As a single user, I want to see each Watchlist ticker's current price, so that I can relate yield to what a share actually costs.
23. As a single user, I want to see each ticker's gross dividend yield as a percent, so that I can compare payouts before tax.
24. As a single user, I want a single editable withholding-tax-rate field for the whole table, defaulting to 15%, so that the net figures match my own tax situation.
25. As a single user, I want to see net dividend yield computed from that rate, so that I can compare what I would actually receive.
26. As a single user, I want the tax-rate field to behave the same way it does in the DCA Projection and Passive Income calculators, so that I learn the app's conventions once.
27. As a single user, I want to see how many times a ticker actually paid a dividend in the last twelve months, so that I know whether it pays monthly, quarterly, or irregularly — as observed, not as assumed from what kind of fund it is.
28. As a single user, I want to see dividend growth as the change between the last twelve months of payouts and the twelve months before that, so that I can tell a growing payout from a shrinking one.
29. As a single user, I want a ticker that paid no dividends to show a zero or unavailable payout rather than being hidden, so that I can see that I checked it.
30. As a single user, I want changing the tax rate to update the net column, so that I can try a different rate without rescanning.

### Momentum Scanner

31. As a single user, I want to choose the percent-change period (one day, one week, one month), so that I can look at momentum on the horizon I actually trade on.
32. As a single user, I want to see the 14-day RSI for each ticker, so that I can spot stretched or washed-out conditions using a standard measure.
33. As a single user, I want the RSI period stated in the column heading, so that I can reconcile it with charts elsewhere.
34. As a single user, I want to see the latest volume divided by its 20-day average, so that I can tell whether a move came with real participation.
35. As a single user, I want to see how far price is from its 50-day moving average as a percent, so that I can see whether a ticker is extended from its own trend.
36. As a single user, I want a ticker with too little price history for a signal to show that signal as unavailable while still showing the signals that could be computed, so that partial data is still useful.
37. As a single user, I never want to see a social-sentiment column, so that the app does not present a number it has no source for.

### Pre-Squeeze Scanner

38. As a single user, I want to see 20-day Bollinger Band width at two standard deviations as a percent of price, so that I can see how tightly a ticker is currently trading.
39. As a single user, I want to see where today's band width sits as a percentile against that same ticker's last six months, so that "tight" means tight for *this* ticker rather than tight compared with unrelated names.
40. As a single user, I want to see 14-day ATR as a percent of price, so that I can confirm a volatility contraction from a second independent measure.
41. As a single user, I want to see volume against its 20-day average here too, so that I can see whether participation is picking up inside a quiet range.
42. As a single user, I want the Bollinger parameters stated in the column heading, so that the measurement is reproducible.
43. As a single user, I never want to see a days-until-earnings column, so that I am not shown a date the data source cannot reliably supply.
44. As a single user, I want switching between the Momentum and Pre-Squeeze tabs after one scan to show both sets of signals without a second scan, so that I am not made to wait twice for the same underlying data.

### Trending Stocks Today

45. As a single user, I want to see today's biggest gainers across the market, so that I can notice strength outside my current Watchlist.
46. As a single user, I want to see today's biggest losers, so that I can notice pullbacks in names I might want to buy.
47. As a single user, I want to see today's most-active names by volume, so that I can see where attention is going.
48. As a single user, I want each of the three lists limited to ten rows, so that the page stays readable.
49. As a single user, I want each row to show ticker, company name, price, and percent change, so that I have enough to decide whether to look further.
50. As a single user, I want a button on each row to add that ticker to my Watchlist, so that a name I spot here flows into the other Scanners in one click.
51. As a single user, I want a row I have already added to show that it is already on my Watchlist, so that I do not create duplicates.
52. As a single user, I want to be told clearly that this tab needs an API key configured when it is missing, so that I understand why the tab is empty rather than assuming the app is broken.
53. As a single user, I want this tab to show only what the market-breadth provider returned, so that it loads in one request rather than dozens.

## Implementation Decisions

### Reuse of the existing Watchlist backend

The `WatchlistItem` model and its CRUD router already exist — `POST /watchlist`, `GET /watchlist`, `DELETE /watchlist/{id}`, with `ticker` and an optional `category` — and have backend test coverage, but no frontend code references them at all. This spec adds the frontend for that existing API and does not change its shape. Ticker normalisation to upper case is applied at the point of creation so that the stored value is canonical.

### Navigation structure

A new top-level Watchlist area sits alongside Portfolios and Tools. Tools already holds four calculators and is conceptually distinct: a calculator takes assumptions the user types and projects forward, while a Scanner fetches market data across many tickers. Mixing them would dilute both. Inside the Watchlist area, sub-tabs follow the pattern the Tools page already established: Watchlist management first, then Dividend Ranking, Momentum Scanner, Pre-Squeeze Scanner, Trending Stocks Today.

### No composite scores, no subjective tags

Recorded as an ADR. Every Scanner presents raw signals as separate sortable columns. The originating draft's headline scores and "suitable for DCA / suitable for passive income" tags are deliberately absent, as is its social-sentiment signal, for which this project has no data source at all. Column headings state the measurement and its period so each number is reproducible.

### Scanning universe and providers

Recorded as an ADR. The three signal Scanners scan the Watchlist, because the project's existing market-data provider has no screener or bulk endpoint and can only be queried one ticker at a time. Trending Stocks Today needs whole-market breadth that cannot be assembled that way, so it uses Financial Modeling Prep, a new backend dependency chosen because its free tier exposes ready-made gainers, losers, and most-active lists. Its key is read from an `FMP_API_KEY` environment variable, following the existing `TWELVE_DATA_API_KEY` convention. When the key is absent the endpoint reports that fact explicitly and the tab explains what to configure; it never falls back to placeholder data.

### One history fetch serves two Scanners

Momentum needs roughly sixty trading days (RSI 14, 20-day volume average, 50-day moving average) and Pre-Squeeze needs roughly a hundred and fifty (six months of band-width history). A single one-year daily history per ticker covers both. A new history service owns that fetch behind one private fetcher function, mirroring how the price service isolates its providers, and caches per ticker in memory with a fifteen-minute TTL and a `clear_cache()` entry point for tests — the same shape as the existing price and FX services, which use sixty seconds and twenty-four hours respectively. Dividend data comes from a separate fetch cached for twenty-four hours, since payouts change quarterly at most.

### Signal computation is pure

All signal maths lives in pure functions that take an in-memory series of closes, highs, lows, and volumes and return numbers. They take no ticker, perform no I/O, and know nothing about caching or HTTP. Parameters are fixed and stated: RSI over 14 periods, volume against a 20-period average, distance from a 50-period simple moving average, Bollinger Bands over 20 periods at two standard deviations, band-width percentile against the trailing six months, ATR over 14 periods. A signal whose window exceeds the available history returns unavailable rather than being computed on a short window; other signals for the same ticker are unaffected.

Dividend frequency is counted from observed payment dates in the trailing twelve months, not inferred from fund type. Dividend growth compares the sum of the trailing twelve months against the sum of the twelve months before it. Net yield follows the formula the existing calculators already use: gross yield multiplied by one minus the tax rate.

### API contracts

Two Watchlist scan endpoints rather than three, plus one market endpoint:

- `GET /watchlist/scan/price-signals` returns, per Watchlist ticker, both the momentum and pre-squeeze signals, because they derive from the same cached history. Splitting them per tab would either refetch or depend on cache timing, which is more fragile. The frontend holds one response and both tabs render from it, so scanning in one tab populates the other.
- `GET /watchlist/scan/dividends` takes the tax rate as a query parameter and returns price, gross yield, net yield, observed payment frequency, and dividend growth per ticker.
- `GET /market/trending` returns the three market-breadth lists, capped at ten rows each, with ticker, company name, price, and percent change per row. It touches the Watchlist not at all.

Both scan endpoints return a row for every Watchlist ticker, including ones whose fetch failed, with unavailable fields carried as null. Omitting failed tickers would make a failure indistinguishable from a ticker having been removed from the Watchlist.

### Fetching discipline

Tickers are fetched sequentially rather than concurrently. The existing provider is unofficial and rate-limited, and has returned HTTP 429 during development; a single user's Watchlist is small enough that sequential fetching is acceptable. Each ticker's failure is isolated so the scan continues. No secondary provider fallback for historical data ships in this version — the project's other provider does expose a time-series endpoint, but wiring a second data shape is deferred until rate limiting proves to be a problem in real use.

### Scan trigger

Scans are user-initiated. Auto-loading on tab open would spend requests whenever a tab was clicked through and would make the tab appear to hang for the duration of a sequential fetch. The button shows per-ticker progress while running, is disabled during the scan, and leaves its results in place until pressed again. Adjusting the tax rate on Dividend Ranking recomputes the net column from data already on screen without rescanning.

### Delivery sequence

One spec, four implementation plans, each merged independently: Watchlist management UI first as the prerequisite for everything else; then the history service, the price-signals endpoint, and the Momentum and Pre-Squeeze tabs together, since they share that service; then Dividend Ranking; then Trending Stocks Today last, so that a problem with the new external dependency cannot hold up features built on the provider the project already uses.

## Testing Decisions

A good test here asserts behaviour a user could observe: the number a table cell shows, the row that appears when a fetch fails, the request that is or is not sent. It does not assert that a private helper was called, or reach into component state, or pin down the internal shape of a cached value.

**No new test seams are introduced.** All four seams the project already uses cover this work:

1. **Backend HTTP** — the existing `client` fixture over `TestClient`, as used by the current watchlist and prices router tests. Every new endpoint is tested through it: response shape, the row-per-ticker-including-failures rule, the tax-rate query parameter, and the explicit missing-key response for market breadth.
2. **Backend private fetcher monkeypatch** — the pattern in the current price service tests, which replaces `_fetch_from_yfinance` and `_fetch_from_twelvedata` with plain functions. The history service and the market-breadth service each hide their provider behind one private fetcher, monkeypatched the same way. This is also the seam for cache behaviour: no refetch inside the TTL, refetch after it, failures not cached, and a monkeypatched `time.monotonic` to advance the clock — all mirroring the existing price service cache tests.
3. **Backend pure maths** — direct function calls with hand-computed expectations, as the existing calculation tests do. Every signal is covered here: RSI, volume ratio, distance from moving average, band width, band-width percentile, ATR, dividend frequency, dividend growth, and net yield. Each also gets a too-little-history case asserting unavailable rather than a value computed on a short window.
4. **Frontend component render plus `vi.spyOn` on the API client** — the pattern used throughout the current component tests, with a default mock installed in `beforeEach`. Each new tab is tested for: empty state before scanning, no request until Scan is pressed, the button disabled during a scan, rendered values after it, an unavailable row when a ticker's data is null, column sorting, the empty-Watchlist message, and the missing-key message on the market-breadth tab. Dividend Ranking additionally asserts that editing the tax rate updates net yield without issuing a second request. The Momentum and Pre-Squeeze pair asserts that one scan populates both tabs. Trending Stocks asserts that the add button calls watchlist creation and that an already-watched row indicates so.

Pure frontend helpers, if any are needed for sorting or formatting, are tested directly as direct-call utility tests, matching the existing utility test files.

Two known hazards to test against explicitly, both drawn from this project's own history:

- **Label ambiguity.** A loose `getByLabelText` regex previously matched both a form label and an unrelated rendered string. Use exact label strings wherever a regex could collide with any other text the component renders — column headings here are long and descriptive, so collisions are likely.
- **Fabricated values.** For every field that can be missing, assert the unavailable presentation rather than only asserting the happy path. A test that only ever supplies complete data cannot catch a silently substituted default.

## Out of Scope

- **AI News Summary.** Deferred to its own grilling session, merged with the pre-existing backlog item for a market-news overview. It needs a news provider chosen on its own merits.
- **AI Stock Analysis.** Deferred to its own grilling session. It needs an LLM provider decision and, per the existing content-provenance ADR, an independently written prompt — the originating draft's prompt self-describes as an exact replica of a third-party product's and must not be reused.
- **A secondary provider fallback for historical prices.** Backlog; revisit if rate limiting bites in real use.
- **Days-until-earnings and market-capitalisation columns** on Pre-Squeeze, dropped as unreliable or not a squeeze signal.
- **Social-sentiment signals** anywhere, for want of any data source.
- **Automatic or scheduled scanning**, background refresh, and push alerts on signal thresholds.
- **Concurrent or parallel fetching** of Watchlist tickers.
- **Editing a Watchlist entry in place** — remove and re-add instead.
- **Bulk import of tickers** into the Watchlist.
- **Charts of any kind.** Scanners present tables of numbers.
- **Any link between Watchlist and Portfolio** beyond both being lists of tickers. Adding a watched ticker does not create a holding.
- **Persisting scan results.** They live in the page until rescanned.

## Further Notes

The `stockvision-app` draft that these four tabs derive from is no longer present in the working tree. It is not needed: its data shapes were recorded during grilling, and the content-provenance ADR requires this project to describe these features in its own words regardless. Its headline scores, category tags, and per-row signals were all hardcoded mock values with no computation behind them, which is precisely why this spec commits to computing every displayed number from real data or showing nothing.

The existing `category` field on a Watchlist entry is free text and carries no behaviour in this version. No Scanner filters or groups by it. It exists so the user can record their own reasoning; making it meaningful to scanning is a later decision.

Four terms were added to the project glossary while grilling this feature: Watchlist, Scanner, raw signal, and pre-squeeze. Two decisions were recorded as ADRs: the scanning universe and provider split, and the refusal of composite scores and subjective tags.
