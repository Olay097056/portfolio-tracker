# TabStrip and Manage Watchlist UI Redesign (wethaiinvest.com-inspired layout)

## Problem Statement

`TabStrip` — the shared tab component used for the app's top-level navigation, the Tools sub-tabs, and the Watchlist sub-tabs — renders `aria-pressed` correctly but has no visual styling at all distinguishing the active tab from the others; every tab button looks identical regardless of which one is selected. The Manage Watchlist page (the first Watchlist sub-tab) is, like the Dashboard and Portfolios pages were before their own redesign tickets, a stack of bare unstyled `<div>`s: an unwrapped add-ticker form and a list of ticker rows with no card, no row separation, and a plain Remove button with no visual weight signaling it's a destructive action. I want both brought in line with the theme, the `--primary`-highlight convention the Dashboard's range-button row already established, and the card/warning-button conventions the Dashboard and Portfolios tickets already established.

## Solution

`TabStrip` gets a visible active-state style: the currently-active tab (`aria-pressed="true"`) is highlighted with `--primary` (border and text color), exactly matching the convention the Dashboard's range-button row already uses — no structural change to the tab-strip's shape (it stays the existing inline row of buttons, not the pill-shaped floating nav the reference site uses, per the explicit decision already made in the theme-foundation ticket's grilling not to restructure navigation). Because `TabStrip` is shared, this one change is visible everywhere it's used: the app's top-level nav, the Tools sub-tabs, and the Watchlist sub-tabs, all at once. The Manage Watchlist page gets one card (using the `--card-*` tokens already defined) wrapping both the add-ticker form and the ticker list together — they're one cohesive interactive unit, the same reasoning already applied to the Dashboard's chart-plus-controls card. Each ticker row inside that card gets its own `--panel3` background, the same row-separator treatment the Portfolios ticket already gave holding rows. The Remove button gets the same `--red` warning-toned border/text style the Dashboard's "Recompute defaults" and the Portfolios page's Delete buttons already use.

This is the first of two Watchlist-area UI tickets. `TabStrip` and Manage Watchlist are split out here specifically because `TabStrip` is a shared, app-wide component — its change needs to be verified in isolation before being combined with the larger, four-scanner-table redesign that will follow in a second ticket.

## User Stories

1. As the app's single user, I want the currently-active tab visually highlighted everywhere `TabStrip` is used (top-level nav, Tools sub-tabs, Watchlist sub-tabs), so that I always know which section I'm in without reading every tab label.
2. As the app's single user, I want that highlight to use the same `--primary` convention the Dashboard's range-button row already established, so that "this is the selected one" looks and feels the same everywhere in the app, not like three different UI languages.
3. As the app's single user, I want `TabStrip`'s shape (an inline row of buttons, not floating pills) to stay exactly as it is today, so that this ticket doesn't quietly restructure navigation as a side effect of adding color.
4. As the app's single user, I want the Manage Watchlist page's add-ticker form and ticker list wrapped in one card, so that it looks like a single cohesive tool rather than two unrelated bare elements.
5. As the app's single user, I want each ticker row inside that card visually separated from its neighbors, so that a watchlist with many tickers is easy to scan.
6. As the app's single user, I want the Remove button styled as a warning action, matching every other destructive-delete button in the app, so that irreversible actions read consistently everywhere, not just on Dashboard and Portfolios.
7. As the app's single user, I want none of this visual work to change how tabs switch, how a ticker is added, or how a ticker is removed, so that already-working, already-tested behavior isn't put at risk by a purely cosmetic ticket.
8. As the app's single user, I want this ticket to leave the four Watchlist scanner tables (Dividend Ranking, Momentum Scanner, Pre-Squeeze Scanner, Trending Stocks Today) untouched, so that this ticket stays small and low-risk, verifiable on its own before the larger scanner-table redesign follows separately.

## Implementation Decisions

**Scope boundary — visual/layout only, and deliberately narrow:** this ticket touches `TabStrip.tsx`, `WatchlistManagementPage.tsx`, and `WatchlistItemRow.tsx` for presentation only. It does not modify `useWatchlist.ts`, `AddWatchlistItemForm.tsx`'s submission logic, the API client, any backend file, or any of the four scanner/ranking components (`DividendRanking.tsx`, `MomentumScanner.tsx`, `PreSqueezeScanner.tsx`, `TrendingStocksToday.tsx`) — those are explicitly the second Watchlist-area ticket's job, not this one's, per the split decided during grilling specifically because `TabStrip` is shared and app-wide and needs isolated verification first.

**`TabStrip` active-state styling:** the button matching `activeTab` (i.e. `aria-pressed="true"`) gets `border-color`/`color` set to `--primary`, using inline styles keyed off the same `activeTab === tab.id` check the component already computes for `aria-pressed` — the exact pattern `DashboardPage.tsx`'s range-button row already uses (conditional inline style alongside an `aria-pressed` boolean, not a CSS class toggle). No change to the `<nav>`/`<button>` element structure, no pill shape, no new dependency.

**Manage Watchlist card:** `WatchlistManagementPage.tsx`'s root content — the `<h3>`, the error banner, `AddWatchlistItemForm`, and the ticker list (or its empty-state message) — is wrapped in a single `.card` (the class the Dashboard ticket already defined in `theme.css`), the same "form and its list are one cohesive unit" reasoning already applied to the Dashboard's chart card.

**Ticker row separation:** `WatchlistItemRow.tsx`'s root `<div>` gets a `--panel3` background, matching the exact style values `HoldingRow.tsx` already uses for the same purpose (background color, border-radius, padding, bottom margin) — reusing those literal values rather than inventing new ones, since both are "one row in a list inside a card" in the same visual language.

**Remove button styling:** `WatchlistItemRow.tsx`'s Remove button gets the same `--red` border/text treatment already used for Dashboard's "Recompute defaults" and Portfolios' Delete buttons. Style only — no confirmation dialog is added, and the `onClick`/`onDelete` wiring is unchanged.

## Testing Decisions

Tests continue to assert observable behavior through the existing seams already used throughout this codebase — `TabStrip.test.tsx`, `WatchlistManagementPage.test.tsx`, and `WatchlistItemRow.test.tsx` (all RTL, following the `toHaveStyle` color-assertion pattern the Dashboard and Portfolios tickets already introduced for `aria-pressed`/warning-button color checks). No new test files, no new testing seams.

- **`TabStrip` active-state color**: extends `TabStrip.test.tsx` with a test asserting the tab matching `activeTab` resolves to `--primary` for its border/text color, and a non-active tab does not.
- **Because `TabStrip` is shared**, this ticket also runs (not necessarily extends with new assertions, just re-runs as regression coverage) the existing test suites for every page that renders it — `App.test.tsx` (or wherever the top-level nav is tested), `ToolsPage.test.tsx`'s sub-tab tests, and `WatchlistPage.test.tsx`'s sub-tab tests — to confirm the shared-component change doesn't break tab-switching behavior anywhere it's used, even though none of those call sites need new assertions of their own.
- **Manage Watchlist card**: a structural assertion (`.card` class present) in `WatchlistManagementPage.test.tsx`, matching the minimal-assertion convention the Dashboard and Portfolios tickets already used for their own card-wrapping tests.
- **Remove button color**: a `toHaveStyle` assertion in `WatchlistItemRow.test.tsx`, matching the Delete-button color tests already added to `PortfolioCard.test.tsx`/`HoldingRow.test.tsx`.
- No visual regression / screenshot testing — none exists in this codebase, none added here.

## Out of Scope

- Any change to `useWatchlist.ts`, `AddWatchlistItemForm.tsx`'s submission logic, the API client, or any backend file.
- Adding a confirmation dialog to the Remove button — style only.
- The four Watchlist scanner/ranking tables (`DividendRanking.tsx`, `MomentumScanner.tsx`, `PreSqueezeScanner.tsx`, `TrendingStocksToday.tsx`) — explicitly deferred to the second Watchlist-area ticket.
- Restructuring `TabStrip` into the reference site's pill-shaped floating nav — already decided against in the theme-foundation ticket's grilling; this ticket only adds an active-state color, not a shape change.
- Card-wrapping the Tools page or any of its sub-tabs — that's a separate future ticket per the sequence already agreed.
- Visual regression/screenshot test tooling.

## Further Notes

- This is the fourth ticket of the multi-ticket wethaiinvest.com-inspired UI effort, following the theme foundation, Dashboard, and Portfolios tickets. It is explicitly split from the Watchlist area's second, larger ticket (the four scanner tables) specifically because `TabStrip` is shared and app-wide — isolating and verifying that change alone, before combining it with a much larger surface, is the deliberate reason this ticket exists as its own unit rather than being folded into the scanner-table ticket.
- Every visual decision in this ticket reuses a convention an earlier ticket already established (the `--primary` active-tab highlight from Dashboard's range buttons, the `.card` wrapping and `--panel3` row-separator from Dashboard/Portfolios, the `--red` warning-button style from Dashboard/Portfolios) — this ticket is "apply the same visual language to a third and fourth surface (nav + Manage Watchlist)," not a fresh design pass.
