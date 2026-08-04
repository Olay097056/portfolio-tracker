# Tools Page UI Redesign (wethaiinvest.com-inspired layout)

## Problem Statement

The Tools page's four sub-tabs — DCA Projection, Passive Income, Portfolio Builder, and ETF Comparison — are, like every page before its own redesign ticket, visually bare: no card wrapping, no color on the two small result tables they contain, and no color on Passive Income's reachable/not-reachable outcome message despite it being exactly the kind of "good/bad direction" result the app's established gain/loss color convention exists for. This is the sixth and final page in the multi-ticket wethaiinvest.com-inspired UI effort — after this merges, every top-level page (Dashboard, Portfolios, Watchlist, Tools) will share the same visual language.

## Solution

Each of the four Tools sub-tabs gets wrapped in its own card. Portfolio Builder's allocation-preview table and ETF Comparison's results table both get the `zebra-table` class already defined for the Watchlist scanner tables — reused as-is, not redefined, even though these two tables are typically much shorter (a handful of rows) than a full watchlist scan. Passive Income's "Reachable in N years" / "Not reachable within 30 years" outcome message is colored `--green`/`--red` — unlike the Watchlist ticket's deliberately narrow color scope (which excluded RSI, ATR, yield, and other numbers with no inherent good/bad direction), this message genuinely represents a goal met or missed, the same kind of real positive/negative outcome the app's established convention is for. Portfolio Builder's "Create portfolio" button gets the `--primary` accent already used for Trending's "Add to Watchlist" button — both are the same kind of positive, creates-something action.

## User Stories

1. As the app's single user, I want each of the four Tools sub-tabs wrapped in its own card, so that the last remaining page in the app looks consistent with Dashboard, Portfolios, and Watchlist.
2. As the app's single user, I want Portfolio Builder's allocation-preview table and ETF Comparison's results table zebra-striped, so that the whole app applies the same table treatment consistently, even where a table is short.
3. As the app's single user, I want Passive Income's reachable/not-reachable message colored green or red, so that I can tell at a glance whether my current plan hits the target without reading the sentence.
4. As the app's single user, I want the "Create portfolio" button in Portfolio Builder to have the same `--primary` accent as "Add to Watchlist" elsewhere in the app, so that positive, creates-something actions read consistently everywhere.
5. As the app's single user, I want none of this visual work to change how any calculator computes its numbers, how the Portfolio Builder wizard creates a portfolio (including its existing rollback-on-partial-failure behavior), or how ETF Comparison fetches prices, so that already-working, already-tested logic across all four tabs isn't put at risk by a purely cosmetic ticket.
6. As the app's single user, I want this ticket to leave `role="alert"` error/success banners unstyled, exactly as every page's banners have been left throughout this whole UI effort, so that a cross-cutting decision about alert styling — which would affect every page, not just Tools — isn't made as a side effect of a single-page ticket.

## Implementation Decisions

**Scope boundary — visual/layout only:** this ticket touches `DcaProjectionCalculator.tsx`, `PassiveIncomeCalculator.tsx`, `PortfolioBuilderWizard.tsx`, and `EtfComparisonTool.tsx` for presentation only. It does not modify `calculateDcaProjection`, `calculateRequiredPortfolio`, `buildPortfolioPlan`, the debounced ticker-lookup effects, `PortfolioBuilderWizard`'s create/rollback flow, the API client, or any backend file.

**Card structure:** each of the four components' root content is wrapped in a single `.card`, the same token-driven class every prior UI ticket has used — no new card variant.

**Table zebra-striping:** Portfolio Builder's allocation-preview `<table>` and ETF Comparison's results `<table>` both get `className="zebra-table"`, reusing the exact CSS rule (`.zebra-table tbody tr:nth-child(even) { background: var(--panel3); }`) already defined in `theme.css` for the Watchlist scanner tables — no new CSS rule, no new class.

**Passive Income outcome color:** the `isAchievableWithin30Years` message is colored `--green` when true, `--red` when false — an explicit exception to the Watchlist ticket's narrow-color-scope precedent, justified because this specific message is a genuine goal-met/goal-missed outcome (the same category of meaning the app's `--green`/`--red` convention represents everywhere else it's used), not a volatility or yield measurement with no inherent direction.

**"Create portfolio" button:** styled with `border-color`/`color: var(--primary)`, matching the exact treatment already given to Trending's "Add to Watchlist" button — both represent the same "positive action that creates a new record" category.

**Explicitly left untouched:** `role="alert"` banners (present in all four components) keep their current unstyled appearance — styling them is a cross-cutting, app-wide decision (every page has `role="alert"` banners, not just Tools) that no ticket in this UI effort has made, and making it here as a side effect of a single-page ticket would be exactly the kind of scope creep the Watchlist ticket's `TabStrip`/scanner-table split was designed to avoid. `DcaCalculator.tsx` and `StressTestCalculator.tsx` — despite their similar names — are separate components rendered inside Portfolios' `HoldingRow` "Calculate" toggle, not part of the Tools page at all, and are unaffected by this ticket.

## Testing Decisions

Tests continue to assert observable behavior through the existing seams already used throughout this codebase — `DcaProjectionCalculator.test.tsx`, `PassiveIncomeCalculator.test.tsx`, `PortfolioBuilderWizard.test.tsx`, and `EtfComparisonTool.test.tsx` (all RTL, following the `.card`-presence, `toHaveStyle` color-assertion, and `zebra-table` class-presence patterns every prior UI ticket in this effort has established). No new test files, no new testing seams.

- **Card wrapping**: a `.card`-presence assertion in each of the four test files.
- **Zebra-striping**: a `table.zebra-table` class-presence assertion in `PortfolioBuilderWizard.test.tsx` and `EtfComparisonTool.test.tsx` — following the Watchlist ticket's own precedent of testing the class's presence, not the computed CSS (which jsdom doesn't load from `theme.css` during tests, as discovered and documented while implementing the Watchlist scanner-table ticket).
- **Reachable/not-reachable color**: two tests in `PassiveIncomeCalculator.test.tsx` — one input set that's reachable within 30 years asserting `--green`, one that isn't asserting `--red`.
- **"Create portfolio" button color**: a `toHaveStyle` assertion in `PortfolioBuilderWizard.test.tsx`.
- No visual regression / screenshot testing — none exists in this codebase, none added here.

## Out of Scope

- Any change to `calculateDcaProjection`, `calculateRequiredPortfolio`, `buildPortfolioPlan`, the debounced ticker-lookup effects in `DcaProjectionCalculator.tsx`/`PassiveIncomeCalculator.tsx`, `PortfolioBuilderWizard.tsx`'s create/rollback flow, `EtfComparisonTool.tsx`'s price-fetch flow, the API client, or any backend file.
- Styling `role="alert"` banners anywhere — explicitly deferred as a cross-cutting, app-wide decision no ticket in this effort has made.
- `DcaCalculator.tsx` and `StressTestCalculator.tsx` — different components, rendered inside Portfolios, not part of the Tools page.
- Any further page redesign — this is the sixth and final page in the originally agreed sequence (theme foundation → Dashboard → Portfolios → TabStrip/Manage-Watchlist → Watchlist scanner tables → Tools).
- Visual regression/screenshot test tooling.

## Further Notes

- This is the sixth and final ticket of the multi-ticket wethaiinvest.com-inspired UI effort. After this merges, every top-level page in the app shares the same theme tokens, card system, warning/positive-action button conventions, and (where applicable) zebra-striped tables and gain/loss color coding.
- The Passive Income color decision is the one place this ticket deliberately diverges from the Watchlist ticket's narrow-scope precedent — worth flagging explicitly here (as it was during grilling) since a future reader comparing the two tickets might otherwise wonder why one signed outcome got colored and RSI/ATR/yield didn't: the distinction is "does this number have an inherent good/bad direction," not "is it colored elsewhere in the app."
