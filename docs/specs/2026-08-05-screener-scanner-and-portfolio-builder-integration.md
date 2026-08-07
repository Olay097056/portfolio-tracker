## Problem Statement

The project now has a real, whole-market Stock Screener (backed by Finnhub, ~4,960 NASDAQ+NYSE+AMEX common stocks, fundamentals refreshed on demand — see ADR 0006). Three other tools still can't use it:

- **Momentum Scanner** and **Pre-Squeeze Scanner** only ever operate over the user's Watchlist (a deliberate scope limit from ADR 0004, made when the only market-wide data source was yfinance with no bulk endpoint). A user who wants to run momentum/squeeze signals over a *filtered* slice of the market — not just their existing Watchlist — has no way to do that.
- **Portfolio Builder** offers exactly three hardcoded model portfolios (Aggressive Growth, Dividend Income, Conservative), each a fixed list of ETF tickers with fixed allocation percentages. There is no way to build a portfolio informed by current market data.

## Solution

1. Momentum Scanner and Pre-Squeeze Scanner drop the Watchlist as their ticker universe entirely and automatically operate over every ticker in the Screener's cached universe (`screener_stocks`) instead — no manual filtering step, no "send" button. Each tool keeps applying its own existing signal logic and thresholds (RSI, volume ratio, BB width, ATR, and the existing badge rules) unchanged; only the candidate universe changes, from "whatever's on the Watchlist" to "every ticker the Screener knows about." Because computing these signals requires a yfinance price-history fetch per ticker — a separate step from the Screener's Finnhub-sourced fundamentals — this is a background refresh job with a progress bar, the same pattern as the Screener's own Finnhub refresh, populating a new cache table the scanners read from.
2. Portfolio Builder's three presets each gain a data-driven "Satellite" or "Pure Stock Picks" sleeve, built from transparent, individually-visible pass/fail criteria against real Screener fields — never a single composite score (per ADR 0005). Each preset's criteria are attributed to a named, public investing methodology they're modeled on. A per-preset toggle switches between:
   - **Core-Satellite** (default): existing ETF tickers stay as the "Core" bucket at a larger allocation; a new "Satellite" bucket of individually-selected stocks (passing that preset's criteria) takes a smaller allocation.
   - **Pure Stock Picks**: the ETF tickers are dropped; the preset is 100% individually-selected stocks passing its criteria.

## User Stories

1. As a user, I want Momentum Scanner and Pre-Squeeze Scanner to cover the whole market the Screener knows about, not just my Watchlist, so that these tools do what their own descriptions say (find momentum/squeeze setups) instead of only monitoring stocks I already picked.
2. As a user, I don't want to click a "send" button or configure a filter first — opening Momentum Scanner or Pre-Squeeze Scanner should just work over the full Screener universe automatically.
3. As a user, I want each scanner to keep applying its own existing rules (RSI thresholds, volume ratio, BB width percentile, ATR) exactly as it does today — only the number of tickers considered changes, not what counts as a signal.
4. As a user, I want a way to trigger (and watch the progress of) computing these signals for the whole universe, the same way I already do for the Screener's own data refresh, so that I understand why this takes a while and that it's actually working.
5. As a user, I want to see when these signals were last refreshed, so that I know how current the Momentum/Pre-Squeeze results are.
6. As a user, I want Portfolio Builder's "Dividend Income" preset to avoid classic dividend traps (unsustainably high yield, weak margins, high leverage), so that I'm not steered toward stocks that look attractive on yield alone.
7. As a user, I want to see exactly which criteria a stock passed or failed for a given preset, not a single opaque score, so that I can judge the selection myself instead of trusting a black box.
8. As a user, I want each preset's criteria to say what investing approach they're modeled on (e.g. "inspired by dividend-growth investing principles"), so that I understand the reasoning, not just the numbers.
9. As a user, I want to toggle each preset between "Core-Satellite" (keep the existing ETFs as a base, add a smaller sleeve of individually-selected stocks) and "Pure Stock Picks" (all individually-selected stocks, no ETFs), so that I can choose between a diversified-fund style and a concentrated-picks style.
10. As a user, when I switch a preset to Pure Stock Picks, I want to see how many stocks currently qualify and their combined allocation split evenly (or by whatever the plan's existing per-ticker split logic already does), so that the resulting plan is fully transparent.
11. As a user, if a preset's criteria currently match zero stocks (e.g. the Screener hasn't been refreshed yet, or the criteria are simply strict for current market conditions), I want to see that plainly stated rather than an empty or broken bucket.
12. As a developer, I want the criteria for each preset to be plain, named, testable functions over real `ScreenerStock` fields, so that they can be unit tested and adjusted without touching UI code.

## Implementation Decisions

### Full-market technical signals for Momentum Scanner and Pre-Squeeze Scanner

This explicitly supersedes ADR 0004's Watchlist-only scope for these two scanners (Dividend Ranking is untouched and stays Watchlist-scoped — it isn't part of this spec). ADR 0004's reasoning was "yfinance has no bulk endpoint, so keep the universe small"; that constraint is unchanged, so the fetch itself still has to happen one ticker at a time in a background job — this spec doesn't make yfinance calls disappear, it moves them from an interactive per-scan loop to a background refresh, the same way the Screener's own Finnhub data moved from "fetch live" to "cached, refreshed on demand."

- New backend table `technical_signals`: `symbol` (PK), `percent_change_pct`, `rsi_14`, `volume_ratio`, `distance_from_sma50_pct`, `bb_width_pct`, `bb_width_percentile`, `atr_pct`, `refreshed_at`. Same shape as the existing `PriceSignalOut` schema, one row per ticker, computed for the `1w` period (Momentum's own default period — see Out of Scope on per-period recompute).
- New backend module `technical_signals_refresh_manager.py`, mirroring `screener_refresh_manager.py`'s pattern exactly (module-level lock-guarded status dict, `start_refresh()`, `get_status()`, background `threading.Thread`). The refresh reads its ticker universe from `SELECT symbol FROM screener_stocks` (no new ticker-discovery step — it reuses whatever the Screener already fetched from Finnhub) and, for each symbol, calls the existing `get_history()` + `app.signals` functions (`rsi`, `volume_ratio`, `distance_from_sma`, `bollinger_band_width_pct`, `bollinger_band_width_percentile`, `atr_pct`, `percent_change`) already used by `GET /watchlist/scan/price-signals` — this is the exact same computation, just run in a loop over every Screener ticker instead of once per interactive request. Each row is written immediately on fetch (not batched), matching the fix already applied to the Screener's own refresh loop, so the cache reflects partial progress instead of appearing empty until some batch threshold is hit.
- New endpoints: `POST /api/technical-signals/refresh` (starts the background job, 202/409 same convention as `/api/screener/refresh`), `GET /api/technical-signals/refresh-status` (poll, same shape as `/api/screener/refresh-status`), `GET /api/technical-signals` (list all cached rows).
- The Data tab gains a second card, "Momentum & Squeeze Signals", with its own button and progress bar — same component pattern as the existing Screener refresh card, pointed at the new endpoints.
- `MomentumScanner` and `PreSqueezeScanner` drop `useWatchlist()` as their ticker/data source entirely. They fetch `GET /api/technical-signals` on mount, apply their existing client-side sort and badge logic unchanged, and show the cache's `refreshed_at` (oldest or a representative timestamp) in the heading so the user knows how current the data is. There is no per-visit "Scan" button anymore — the data is however fresh the last background refresh made it; a link/note points to the Data tab to trigger a refresh.
- Rate-limit safety: the same per-request delay discipline used for the Finnhub refresh applies here for yfinance (a fixed delay between `get_history()` calls). Because yfinance is unofficial and has previously 429'd under load, this delay is deliberately conservative — the exact value is a tuning knob set at implementation time based on observed behavior, not a hardcoded assumption baked into this spec.

### Portfolio Builder dynamic criteria

- New module `frontend/src/utils/portfolioBuilderCriteria.ts` defines, per preset id (`growth`, `dividend`, `conservative`), an ordered list of named criteria. Each criterion is `{ id: string, label: string, evaluate: (stock: ScreenerStock) => boolean }`. A stock's evaluation result for a preset is `{ symbol, passed: {criterionId: boolean}[], passesAll: boolean }` — never collapsed into a numeric score, matching ADR 0005.
- Criteria (all evaluated against real fetched `ScreenerStock` fields — `pe`, `peg`, `roe`, `div_yield`, `profit_margin`, `de_ratio`, `beta`, `market_cap`; nothing here is a new fabricated field):

  **Aggressive Growth** — labeled in the UI as "inspired by growth-investing principles (Peter Lynch's PEG heuristic, quality-of-growth checks)":
  - PEG ratio present and < 2 (Lynch's rule of thumb: PEG < 1 is classically "cheap growth", < 2 still reasonable; > 2 is excluded as overpriced relative to growth)
  - ROE > 15% (capital efficiency)
  - Profit margin > 0 (profitable, not speculative)

  **Dividend Income** — labeled "inspired by dividend-growth investing; screens out common dividend-trap red flags":
  - Dividend yield present and between 2% and 7% (excludes near-zero yield and the classic trap signal of an unsustainably/suspiciously high yield, which usually means the price has fallen faster than the payout was cut)
  - Profit margin > 5% (paying from real earnings, not from debt or asset sales)
  - D/E ratio present and < 2 (not overleveraged to sustain the payout)
  - Market cap > $2B (excludes small, less-stable payers)

  **Conservative** — labeled "inspired by Benjamin Graham's defensive-investor criteria: financial strength, low volatility, reasonable price":
  - Beta present and < 1 (less volatile than the market)
  - P/E present and between 0 and 25 (not richly valued)
  - D/E ratio present and < 1 (financially conservative)
  - Market cap > $10B (established, large companies)

  A stock with any required field missing (`null`) fails that specific criterion (shown as "unavailable", never assumed to pass or fail silently) — consistent with the project's existing never-fabricate handling of missing data.

- Each preset's evaluation runs against whatever's currently in `screener_stocks` (via the existing `POST /api/screener/stocks` endpoint, unfiltered/preset=all, then evaluated client-side against the criteria above — no new backend endpoint needed, since this is pure filtering logic over data the frontend already knows how to fetch).
- Selection: up to 5 stocks per preset for the Satellite sleeve, up to 8 for Pure Stock Picks — in both cases, the highest-`market_cap` stocks among those that pass all criteria (a plain, explainable tiebreaker, not a ranking score). If fewer stocks qualify than the target count, use however many qualify (see user story 11 — the UI states the actual count found, never pads to a target).
- `PORTFOLIO_BUILDER_PRESETS` (existing, ETF-based) is renamed to represent the "Core" bucket definitions only; a new function `buildDynamicBucket(presetId, screenerStocks, mode: 'core-satellite' | 'pure')` returns the additional/replacement bucket(s):
  - `core-satellite`: Core bucket(s) unchanged from today but reweighted (e.g. Growth: Core 70% / Satellite 30%; Dividend: Core 60% / Satellite 40%; Conservative: Core 70% / Satellite 30% — exact splits are a UI-adjustable default, not hardcoded permanently, but these are the shipped defaults), plus one new "Satellite (data-driven)" bucket with the qualifying stocks splitting that allocation evenly.
  - `pure`: Core bucket(s) omitted entirely; the qualifying stocks split 100% evenly.
- `PortfolioBuilderWizard` gains a per-preset toggle (Core-Satellite / Pure Stock Picks), defaulting to Core-Satellite. Switching modes re-derives the bucket list and re-runs the existing `buildPortfolioPlan` unchanged (it already just consumes a `preset.buckets` array — the dynamic bucket(s) are assembled into that same shape before being handed to it).
- Every criterion is shown per stock in the bucket breakdown (pass/fail list, not a score), and the preset's methodology label (the "inspired by…" line) is shown once per preset.

## Testing Decisions

- Only test genuine external behavior — matching existing project convention (see `MomentumScanner.test.tsx`, `PreSqueezeScanner.test.tsx`, `portfolioBuilder.test.ts`, `portfolioBuilderPresets.test.ts`).
- `portfolioBuilderCriteria.ts`: pure-function unit tests per criterion (a stock with each field individually at, above, and below its threshold; a stock with a missing field fails that criterion, not silently passes) and per-preset (a stock passing all criteria vs. failing exactly one).
- `buildDynamicBucket`: unit tests for both modes (core-satellite allocation split, pure allocation split), the "fewer than target qualify" case, and the "zero qualify" case (empty bucket, no fabricated placeholder rows).
- `test_technical_signals_refresh_manager.py` / `test_technical_signals_refresh_endpoints.py`: mirror the existing `test_screener_refresh_manager.py` / `test_screener_refresh_endpoints.py` coverage exactly (background start/already-running/error states; endpoint 202/409/status shapes) with `get_history` and the `app.signals` functions mocked, not real yfinance calls.
- Backend: `SELECT symbol FROM screener_stocks` is the only source of the ticker universe for this refresh — a test asserts it does not call any Finnhub/FMP endpoint itself.
- `MomentumScanner.test.tsx` / `PreSqueezeScanner.test.tsx`: rewritten to source rows from `GET /api/technical-signals` instead of `useWatchlist()`; existing badge/sort/threshold test cases are preserved (they test the same signal logic, just fed from the new source), and a "0 cached rows yet" state (never fetched) is tested distinctly from "cached rows exist but a given field is null for some tickers."

## Out of Scope

- Per-period recompute (the current interactive scan lets a user pick 1d/1w/1m; the background refresh computes one fixed period, `1w`, for the whole universe — switching periods for the full-market view is a possible future ticket, not this one).
- Dividend Ranking scanning the full market — it stays Watchlist-scoped; only Momentum and Pre-Squeeze change.
- Automatically re-running the technical-signals refresh on a schedule — it's manually triggered from the Data tab, same as the Screener refresh (a scheduled/cron trigger for either is a separate future concern).
- Making the preset criteria thresholds user-configurable (adjustable min/max yield, PEG cutoff, etc.) — ships with the fixed defaults above; configurability is a possible future ticket, not this one.
- Any change to Momentum/Pre-Squeeze Scanner's core signal computation (RSI, BB width, ATR, etc.) — unchanged, only the ticker source changes.
- Any change to the existing ETF-based Core bucket definitions' own tickers (VTI/SPY/QQQ/etc. stay as they are) beyond re-weighting their allocation percentage for Core-Satellite mode.
- A fourth, entirely new preset — this spec dynamically augments the existing three, not adds a fourth (that was option C, not chosen).

## Further Notes

- This spec reverses part of ADR 0004 (Momentum/Pre-Squeeze move from Watchlist-scoped to whole-Screener-universe-scoped); an ADR recording *why* — the Screener's Finnhub-backed universe removed the "no bulk data source" constraint ADR 0004 was originally written around — should be added alongside the implementation, not left implicit.
- The "inspired by [named methodology]" labeling is presented as a transparent description of *why these specific thresholds were chosen* for this tool's screening logic — not as investment advice, a guarantee, or a claim that Lynch/Graham endorsed this implementation. This framing matters for both correctness (it's true — these are well-documented, public heuristics, not this project's invention) and for staying clearly on the "screening tool" side of the line rather than "personalized advice."
- This spec assumes the Screener's `screener_stocks` table has been populated (via `refresh_screener.py` / the Data tab) — presets requiring criteria over real data will correctly show "0 stocks currently qualify" against an empty or stale table rather than falling back to anything fabricated.
