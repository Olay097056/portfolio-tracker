# Portfolios Page UI Redesign (wethaiinvest.com-inspired layout)

## Problem Statement

The Portfolios page — the app's primary "how much do I have and how is it doing" view — is functionally complete but visually bare, same as the Dashboard was before its own redesign ticket: unstyled `<div>`s for every portfolio and holding, no card wrapping, and (worse) a severity indicator (`data-severity`, meant to flag holdings that need rebalancing green/yellow/red) that has never had any CSS color rule targeting it at all — it's rendered in the DOM today but has been completely invisible since the day it was built. Unrealized P&L is shown as plain, uncolored text regardless of whether it's a gain or a loss, unlike the color convention the Dashboard ticket already established. I want this page card-wrapped and colored to match the theme foundation and Dashboard tickets that already landed, using wethaiinvest.com's own portfolio view (inspected directly, logged in, earlier in this project) as the visual reference again.

## Solution

Wrap each portfolio in its own card (holding the portfolio's summary, its expand/collapse holdings list, and the add-holding form when expanded), with each holding rendered as its own visually distinct row inside that card rather than a bare unstyled `<div>`. The add-portfolio form at the top of the page gets the same card treatment. The severity indicator finally gets real color (a small dot in `--green`/`--yellow`/`--red` matching its `data-severity` value) — fixing a pre-existing defect, not a new feature. Unrealized P&L is colored green/red by sign, following the exact convention the Dashboard price-change readout already established, plus a small emoji next to it (a stylistic touch pulled directly from the reference, which uses one next to its own gain/loss readout). Delete buttons, at both the portfolio and holding level, get the same `--red` warning-toned styling the Dashboard's "Recompute defaults" button already uses for irreversible actions — style only, no new confirmation dialog. No data model, hook, or backend change anywhere in this ticket.

## User Stories

1. As the app's single user, I want each portfolio wrapped in a card matching the app's theme, so that the page looks intentional instead of a stack of bare divs.
2. As the app's single user, I want each holding rendered as its own visually distinct row within its portfolio's card, so that a portfolio with several holdings is easy to scan instead of reading as one undifferentiated block.
3. As the app's single user, I want the "add a new portfolio" form at the top of the page wrapped in a card too, so that it looks like part of the same design language as the portfolio cards below it.
4. As the app's single user, I want the severity indicator to actually show a color (green/yellow/red) instead of being invisible, so that the "needs rebalancing" signal I already rely on the count for is also visible per-holding, at a glance, without reading the summary line's count.
5. As the app's single user, I want Unrealized P&L colored green when positive and red when negative, so that I don't have to read the number's sign to know whether a portfolio is up or down.
6. As the app's single user, I want a small emoji next to the P&L readout, so that the page has the same bit of personality the reference site's own gain/loss readout has.
7. As the app's single user, I want the Delete buttons (both "delete this portfolio" and "delete this holding") styled as a warning action, matching how "Recompute defaults" already looks on the Dashboard, so that irreversible actions are visually distinguished from ordinary ones consistently across the whole app.
8. As the app's single user, I want none of this visual work to change how portfolios or holdings are created, edited, deleted, or summarized, so that the already-working, already-tested data logic isn't put at risk by a purely cosmetic ticket.
9. As the app's single user, I want the Delete buttons' behavior to stay exactly as it is today (no new confirmation dialog), so that this ticket doesn't silently change a workflow I didn't ask to change.

## Implementation Decisions

**Scope boundary — visual/layout only:** this ticket touches `PortfoliosPage.tsx`, `PortfolioCard.tsx`, `PortfolioHoldings.tsx`, and `HoldingRow.tsx` for presentation only. It does not modify `usePortfolios.ts`, `useHoldings.ts`, `usePortfolioSummary.ts`, `AddPortfolioForm.tsx`'s or `AddHoldingForm.tsx`'s submission logic, the API client, or any backend file. Delete buttons keep their exact current behavior (call `onDelete` immediately, no `window.confirm()`) — only their visual style changes, matching the explicit decision made during grilling not to bundle a behavior change into a styling ticket.

**Card structure:**
- **Add-portfolio card**: `AddPortfolioForm` wrapped in a `.card` (the same class the Dashboard ticket introduced), at the top of the page.
- **Portfolio card**: one `.card` per portfolio, containing the portfolio's name, value/P&L summary, target allocation, rebalance-needed count, the show/hide-holdings toggle, the delete button, and — when expanded — `AddHoldingForm` and the holdings list. This matches the Dashboard ticket's precedent of one card per cohesive interactive unit.
- **Holding rows**: each holding inside an expanded portfolio card gets its own distinct background/border (not the full `.card` treatment — a lighter, secondary visual separator appropriate for a row nested one level inside an already-carded container, using `--panel3` — already defined and already used for `input` backgrounds — as the row background, avoiding a third new "card-inside-a-card" style being invented for this single spot).

**Severity indicator color fix:** `HoldingRow.tsx`'s `<span data-testid="severity-indicator" data-severity={...} />` currently has no CSS rule anywhere targeting it — the element renders but is visually a zero-size, uncolored, invisible marker. This ticket adds a small colored dot (matching the existing pattern already used for the Dashboard's zone-kind badges: an inline-block circle, ~10px, `border-radius: 50%`) whose `background-color` is `--green`/`--yellow`/`--red` per the `data-severity` value (`'green' | 'yellow' | 'red' | null`), with no dot rendered at all when `data-severity` is `'none'`/absent (no stats yet, or a `null` severity) — never fabricating a color for a holding that has no computed severity.

**Unrealized P&L color + emoji:** `PortfolioCard.tsx`'s existing `Unrealized P&L: $X` line is colored `--green` when the value is `>= 0` and `--red` when negative — the exact same sign convention the Dashboard's price-change readout already uses (`>= 0` counts as a gain, consistent with that prior ticket, not a new threshold rule invented here). A small emoji is shown next to the value: a positive-leaning emoji (e.g. 😊) for `>= 0`, a downcast one (e.g. 😟) for negative — a simple two-state mapping, not the reference's own finer-grained magnitude ladder (which belongs to this app's separate loss-scenario stress-test calculator, already built in the Tools tab, and is not being duplicated here).

**Delete button styling:** every Delete button in this page's component tree (portfolio-level in `PortfolioCard.tsx`, holding-level in `HoldingRow.tsx`) gets the same `--red` border/text treatment the Dashboard's "Recompute defaults" button already established — an outline/border style using `--red` at the color values already in use there, not a filled/solid red button. No `type="button"` behavior change, no `onClick` handler change, no new confirmation step.

**No new shared constant needed for severity colors:** unlike the Dashboard's zone-kind colors (which needed a single source of truth shared across three files), severity colors are a straightforward mapping of exactly three existing theme tokens (`--green`/`--yellow`/`--red`) to exactly three existing string values (`'green'`/`'yellow'`/`'red'`) consumed in exactly one place (`HoldingRow.tsx`) — a local mapping object in that file is sufficient; extracting a shared module would be premature for a single consumer.

## Testing Decisions

Tests continue to assert observable behavior through the existing seams already used throughout this codebase's Portfolios test suite — `PortfoliosPage.test.tsx`, `PortfolioCard.test.tsx`, `PortfolioHoldings.test.tsx`, and `HoldingRow.test.tsx` (all RTL, querying by role/label/text, following the exact pattern already established for `DashboardPage.test.tsx`/`ZoneList.test.tsx`'s color-badge tests from the prior ticket). No new test files, no new testing seams.

- **Severity indicator color**: extends `HoldingRow.test.tsx`'s existing "renders current price, value, and a severity indicator when stats are provided" test (or a new adjacent test) to assert the indicator's resolved `background-color` matches `--green`/`--yellow`/`--red` for each severity value, using `toHaveStyle` — the same assertion style the Dashboard ticket's `ZoneList` kind-badge test already introduced to this codebase.
- **P&L color + emoji**: extends `PortfolioCard.test.tsx`'s existing "shows the real total value from the summary once loaded" test (or a new adjacent test) with a positive-P&L case asserting green + the positive emoji, and a new negative-P&L case asserting red + the downcast emoji.
- **Delete button styling**: a test in both `PortfolioCard.test.tsx` and `HoldingRow.test.tsx` asserting the Delete button's border/text color resolves to `--red`.
- **Card wrapping**: a lightweight structural assertion (e.g. `container.querySelector('.card')` is present, or the rendered root has the `card` class) in `PortfoliosPage.test.tsx` and/or `PortfolioCard.test.tsx` — following this codebase's existing preference for behavior-level assertions, this stays minimal (presence of the class, not a full style/computed-CSS assertion, since the class's own effect is already covered by the Dashboard ticket's `.card` definition and its own tests).
- No visual regression / screenshot testing — none exists in this codebase, none added here.

## Out of Scope

- Any change to portfolio/holding create/edit/delete logic, `usePortfolios.ts`, `useHoldings.ts`, `usePortfolioSummary.ts`, or any backend file.
- Adding a `window.confirm()` (or any other) confirmation step to either Delete button — style only.
- The reference site's THB/USD currency toggle and live FX-rate display on the portfolio summary — this app has no such feature today anywhere on this page (a related THB/USD flow exists only in the Tools tab's Portfolio Builder wizard, unaffected by this ticket) and adding one would be a new feature, not a redesign.
- The reference's finer-grained loss-scenario emoji ladder (😟/😩/😱 at -5%/-10%/-20%) — that concept already exists in this app as the Tools tab's stress-test calculator; this ticket's P&L emoji is a simple two-state (gain/loss) indicator only, not a duplicate of that calculator.
- Card-wrapping any other page (Watchlist, Tools) — each gets its own future ticket per the sequence already agreed.
- Visual regression/screenshot test tooling.

## Further Notes

- This is the third ticket of the multi-ticket wethaiinvest.com-inspired UI effort, following the theme foundation ticket (`docs/specs/2026-08-04-ui-theme-foundation.md`) and the Dashboard redesign ticket (`docs/specs/2026-08-04-dashboard-ui-redesign.md`). The remaining pages in the agreed sequence — Watchlist, Tools — each get their own spec and grilling round after this one merges.
- The severity-indicator color fix and the P&L color convention both directly reuse decisions the Dashboard ticket already made (the `.card` class, the `--green`/`--red` sign convention, the `--red`-bordered warning-button style) rather than inventing new ones — this ticket is largely "apply the same visual language to a second page," not a fresh design pass.
- The severity-dot fix is the same class of pre-existing, unrelated-to-wethaiinvest defect the Dashboard ticket's white-chart-background fix was — caught only because this ticket is already re-touching `HoldingRow.tsx` for the reason described above, the same "lowest-cost point to fix it" reasoning used last time.
