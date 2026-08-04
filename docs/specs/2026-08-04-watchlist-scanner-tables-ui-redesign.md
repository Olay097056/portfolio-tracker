# Watchlist Scanner Tables UI Redesign (wethaiinvest.com-inspired layout)

## Problem Statement

The four Watchlist scanner/ranking sub-tabs — Dividend Ranking, Momentum Scanner, Pre-Squeeze Scanner, and Trending Stocks Today — are functionally complete but, like every page before its own redesign ticket, visually bare: no card wrapping, no row separation in tables that can run to dozens of rows for a large watchlist, and no color coding anywhere despite two of their columns (Momentum's "% change" and Trending's "% change") being the exact same kind of price-change value the Dashboard's price readout and Portfolios' P&L already color green/red. This is the second of two Watchlist-area UI tickets — the first (`docs/specs/2026-08-04-tabstrip-and-manage-watchlist-ui-redesign.md`) already restyled the shared `TabStrip` and the Manage Watchlist sub-tab; this one covers the remaining four sub-tabs, which is why it was split out as its own ticket during grilling (a much larger surface — four separate tables, each with several columns — than `TabStrip`'s isolated, app-wide change warranted combining).

## Solution

Each of the four sub-tabs gets wrapped in its own card (using the `--card-*` tokens already defined), containing its controls (period/tax-rate inputs, Scan/Refresh button, progress status) and its table together as one cohesive unit — the same "controls and their result are one card" reasoning already applied to the Dashboard's chart card. Trending Stocks Today, which renders three sub-lists (Gainers, Losers, Most active) from a single fetch, gets one card wrapping all three, not three separate cards, since they're one result set from one action. Every table's rows get a light zebra-stripe (alternating `--panel3` on even rows) for readability on a watchlist with many tickers. Exactly two columns get gain/loss color coding — Momentum Scanner's "% change (period)" and Trending's "% change" — because those two are the only columns in any of the four tables that represent an actual price change in the same sense the Dashboard and Portfolios tickets already established that convention for; every other signed-percent column (RSI, volume ratio, distance from SMA, gross/net dividend yield, dividend growth, Bollinger Band width, ATR) stays uncolored, since a color there would misleadingly imply a value is "good" or "bad" when it's really just a volatility or yield measurement with no inherent positive/negative direction. Trending's per-row "Add to Watchlist" button gets a `--primary` accent, the positive-action counterpart to the `--red` warning style every Delete/Remove button in the app already uses.

## User Stories

1. As the app's single user, I want each of the four scanner/ranking sub-tabs wrapped in its own card, so that they look like part of the same design language as every other page already redesigned.
2. As the app's single user, I want Trending Stocks Today's three lists (Gainers, Losers, Most active) wrapped in one card together, so that I see them as one result from one refresh, not three unrelated panels.
3. As the app's single user, I want every scanner table's rows lightly zebra-striped, so that a watchlist with many tickers is easy to scan across without losing my place row to row.
4. As the app's single user, I want Momentum Scanner's "% change" column colored green for a gain and red for a loss, matching the exact convention the Dashboard and Portfolios pages already use for price changes, so that scanning for movers is faster than reading every sign character.
5. As the app's single user, I want Trending's "% change" column colored the same way, for the same reason.
6. As the app's single user, I want every other signed-percent column (RSI, volume ratio, distance from SMA, dividend yield and growth, Bollinger Band width, ATR) to stay uncolored, so that this ticket doesn't apply a "gain/loss" visual meaning to numbers that aren't gains or losses.
7. As the app's single user, I want the "Add to Watchlist" button in Trending's rows to have a `--primary` accent, so that it reads as a clear positive action, the visual counterpart to the app's now-consistent red Delete/Remove buttons.
8. As the app's single user, I want none of this visual work to change how a scan runs, how sorting works, how the dividend tax rate is applied, or how a ticker gets added from Trending, so that already-working, already-tested behavior across all four tabs isn't put at risk by a purely cosmetic ticket.

## Implementation Decisions

**Scope boundary — visual/layout only:** this ticket touches `DividendRanking.tsx`, `MomentumScanner.tsx`, `PreSqueezeScanner.tsx`, and `TrendingStocksToday.tsx` for presentation only. It does not modify `useDividendScan.ts`, `usePriceSignalsScan.ts`, `useTrendingData.ts`, `useSortableColumn.ts`, `sortByNullableNumber`, `netYieldPct`, the API client, or any backend file. Sorting, scanning, tax-rate clamping, and the add-from-Trending flow all keep their exact current behavior.

**Card structure:** each of `DividendRanking`, `MomentumScanner`, and `PreSqueezeScanner`'s root content (heading, controls, progress status, table or empty-state message) is wrapped in a single `.card`. `TrendingStocksToday`'s root content is wrapped in one `.card` containing all three `TrendingList` sub-renders (Gainers/Losers/Most active), each still under its own existing `<h4>` inside that one card — not three separate cards.

**Zebra-striping:** every `<tbody>`'s `<tr>` gets `background: var(--panel3)` on even rows (`:nth-child(even)`), odd rows staying transparent (the card's own background shows through) — applied identically to all four tables, including each of Trending's three sub-tables.

**Gain/loss color scope — deliberately narrow:** only `MomentumScanner.tsx`'s `percent_change_pct` cell and `TrendingStocksToday.tsx`'s (inside `TrendingList`) `change_pct` cell get `--green`/`--red` coloring by sign (`>= 0` green, negative red — the same threshold convention the Dashboard and Portfolios tickets already established). No other column in any of the four tables is colored — `rsi_14`, `volume_ratio`, `distance_from_sma50_pct` (Momentum); `bb_width_pct`, `bb_width_percentile`, `atr_pct`, `volume_ratio` (Pre-Squeeze); `price`, `gross_yield_pct`, `net_yield_pct`, `payment_frequency`, `dividend_growth_pct` (Dividend Ranking) all stay their default text color, since none of them represent a price change in the sense the app's established green/red convention means — coloring them would falsely imply a "good"/"bad" direction a volatility, yield, or frequency number doesn't inherently have.

**"Add to Watchlist" button:** `TrendingList`'s per-row button (rendered when `watchedTickers.has(row.ticker)` is false) gets `border-color`/`color` set to `--primary`, the positive-action counterpart to the `--red` styling already applied to every Delete/Remove button across the app.

**Scan/Refresh buttons, period/tax-rate inputs:** left as plain buttons/inputs relying on `theme.css`'s existing global `button`/`input` element rules — no special per-tab styling beyond what already applies app-wide, consistent with how the Dashboard's own ticker `<select>` was left "restyled via the global rule, not rebuilt" in that ticket.

## Testing Decisions

Tests continue to assert observable behavior through the existing seams already used throughout this codebase — `DividendRanking.test.tsx`, `MomentumScanner.test.tsx`, `PreSqueezeScanner.test.tsx`, and `TrendingStocksToday.test.tsx` (all RTL, following the `toHaveStyle` color-assertion and `.card`-presence patterns the Dashboard, Portfolios, and TabStrip/Manage-Watchlist tickets already established). No new test files, no new testing seams.

- **Card wrapping**: a structural `.card`-presence assertion in each of the four test files, matching the minimal-assertion convention already used for prior card-wrapping tests.
- **Gain/loss color**: `MomentumScanner.test.tsx` gets a test asserting a positive `percent_change_pct` row renders `--green` and a negative one renders `--red`; the same pair of tests is added to `TrendingStocksToday.test.tsx` for `change_pct`.
- **No color on other columns**: at least one test per the other three tables (Pre-Squeeze, Dividend Ranking, and Momentum's own non-`percent_change_pct` cells) asserting those cells do NOT resolve to `--green`/`--red` — proving the narrow scope decision actually holds, not just that the two intended cells happen to be colored.
- **"Add to Watchlist" button color**: a `toHaveStyle` assertion in `TrendingStocksToday.test.tsx`.
- **Zebra-stripe**: a lightweight assertion (e.g. the second `<tr>` in a multi-row table resolves `--panel3` as its background, the first does not) in one of the four test files — proving the pattern renders correctly once is sufficient given all four apply the identical CSS rule, matching this codebase's existing preference for not re-testing an identical mechanism four times over.
- No visual regression / screenshot testing — none exists in this codebase, none added here.

## Out of Scope

- Any change to `useDividendScan.ts`, `usePriceSignalsScan.ts`, `useTrendingData.ts`, `useSortableColumn.ts`, `sortByNullableNumber`, `netYieldPct`, the API client, or any backend file.
- Coloring any column other than Momentum's `percent_change_pct` and Trending's `change_pct` — every other signed-percent column stays uncolored, per the explicit narrow-scope decision above.
- Restyling the Scan/Refresh buttons or the period/tax-rate inputs beyond what `theme.css`'s existing global element rules already provide.
- Card-wrapping the Tools page or any of its sub-tabs — a separate future ticket per the sequence already agreed.
- Visual regression/screenshot test tooling.

## Further Notes

- This is the fifth ticket of the multi-ticket wethaiinvest.com-inspired UI effort, and the second (and final planned) Watchlist-area ticket, following the theme foundation, Dashboard, Portfolios, and TabStrip/Manage-Watchlist tickets. After this merges, the only remaining page in the originally agreed sequence is Tools.
- The narrow gain/loss color scope (exactly two columns, out of roughly a dozen signed-percent cells across four tables) is the most consequential decision in this ticket — it was explicitly grilled rather than assumed, specifically because a blanket "color every signed percent" rule would have applied the app's established gain/loss visual language to numbers (RSI, ATR, Bollinger Band width, dividend yield) that don't carry that meaning.
- Every other visual decision in this ticket reuses a convention an earlier ticket already established (`.card` wrapping from Dashboard/Portfolios, `--panel3` row separation from Portfolios' holding rows and the Manage Watchlist ticket's ticker rows, the `--red`/`--primary` warning/positive-action button styles) — this ticket is "apply the same visual language to the four remaining Watchlist tables," not a fresh design pass.
