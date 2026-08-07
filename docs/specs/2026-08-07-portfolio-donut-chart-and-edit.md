## Problem Statement

The Portfolios tab shows each portfolio's value, cost, and unrealized P&L as a plain number row inside its card — there is no visual breakdown of how a portfolio's value is split across its holdings until the user clicks "Show holdings" to expand a full data table. Separately, a portfolio's name and target allocation % can only be set once, at creation (`AddPortfolioForm`) — there is no way to rename a portfolio or change its target allocation afterward; `Delete` is the only post-creation action available. When a user does want to change one portfolio's target %, there's also no help keeping multiple portfolios' targets summed to 100%, which is the number the existing rebalance-severity coloring (green/yellow/red) already depends on being meaningful.

## Solution

1. Each portfolio card gains an at-a-glance donut chart (drawn as plain SVG, no new chart library) showing each holding's share of the portfolio by value, with the portfolio's total value / unrealized P&L $ / unrealized P&L % overlaid in the chart's center, and a color-coded ticker legend beside it — all visible without expanding "Show holdings". This uses `current_pct` data the card's `usePortfolioSummary` hook already fetches; no backend change.
2. An "Edit" action is added to each portfolio card, opening a modal to rename the portfolio and change its target allocation %. Changing the target offers an optional expanded section listing every other portfolio's target %, so the user can rebalance all of them to sum to 100% in one save — backed by a new atomic backend endpoint rather than multiple sequential per-portfolio requests, so a mid-batch failure can't leave the portfolios' targets summing to something other than 100%.

## User Stories

1. As a user, I want to see how a portfolio's value is split across its holdings at a glance (a donut chart), without clicking "Show holdings" first, so that I can judge concentration/diversification quickly.
2. As a user, I want the portfolio's total value and unrealized P&L shown inside the donut itself, so that I don't need to look elsewhere on the card for the numbers I already see today.
3. As a user, I want a legend next to the donut showing which color is which ticker, so that the chart is readable without hovering or guessing.
4. As a user, I want to rename a portfolio after creating it, so that a typo or a change in what the portfolio represents doesn't require deleting and recreating it (losing its holdings).
5. As a user, I want to change a portfolio's target allocation % after creation, so that my rebalance-severity indicators stay accurate as my intended allocation strategy changes.
6. As a user, when I change one portfolio's target %, I want the option to adjust my other portfolios' targets in the same action, so that my targets keep summing to 100% instead of me having to edit each one separately and do the math myself.
7. As a user, if my edited targets don't sum to 100%, I want to be told before saving, not after, so that I don't end up with a rebalance calculation based on a target set that doesn't add up.
8. As a developer, I want the multi-portfolio rebalance saved as one atomic operation, so that a failure partway through can't leave portfolios with inconsistent, non-summing targets.

## Implementation Decisions

### Donut chart + legend

- New component `frontend/src/components/PortfolioDonutChart.tsx`: pure SVG, concentric-arc technique (one `<circle>` per holding, `stroke-dasharray`/`stroke-dashoffset` sized to that holding's `current_pct`, rotated to start where the previous one ended). No new npm dependency — the project's only existing chart library (`lightweight-charts`) is a candlestick/line library and isn't suited to a donut.
- Input props: the same `summary.holdings` array (`HoldingStatsOut[]`, already typed in `api/types.ts`) `PortfolioCard.tsx` already fetches via `usePortfolioSummary` — no new hook, no new backend field.
- A fixed 8-color palette (module-level constant `HOLDING_COLORS` in `PortfolioDonutChart.tsx`, shared by the chart and the legend so colors always match), assigned by holdings array index: `#3b82f6` (blue, same as `--primary`), `#8b5cf6` (violet), `#06b6d4` (cyan), `#f97316` (orange), `#ec4899` (pink), `#14b8a6` (teal), `#6366f1` (indigo), `#94a3b8` (slate). Deliberately excludes red/green/amber — those are already reserved elsewhere in this app for P&L sign and rebalance severity, and reusing them on a holding slice would read as a signal that isn't one. A portfolio with more than 8 holdings cycles the palette rather than erroring — visually degrades (two holdings same color) rather than crashing, and this is called out in a code comment, not silently hidden.
- Center overlay (absolutely-positioned `<div>` over the SVG, matching the existing card's numbers): total value, unrealized P&L $, unrealized P&L % — reusing `PortfolioCard.tsx`'s already-computed `totalVal`/`pnlVal`, not recomputed.
- Legend: a small column of `{colored dot} {ticker}` rows beside the chart, reading directly from the same `summary.holdings` array used to draw it.
- Zero-holdings state: the donut renders as a single flat gray ring (100%, no P&L split) with the total value centered and no legend rows — never a blank/broken chart, matching the project's existing "never show empty as broken" pattern (e.g. the investor-tracker fallback).
- This replaces the current plain-text `Total value:` / `Unrealized P&L:` row inside the *collapsed* card; "Show holdings" still expands to the existing detailed per-holding table (shares, avg cost, live price, weight %, P&L %, Calculate, Delete) unchanged — the donut is a summary view, not a replacement for that detail.

### Edit portfolio (single)

- Reuses the existing `PATCH /portfolios/{id}` endpoint and `usePortfolios().update` (already implemented, currently unused by any UI).
- New component `frontend/src/components/EditPortfolioModal.tsx`: name field (required, non-empty) and target allocation % field (optional, same validation as `AddPortfolioForm`'s), pre-filled with the portfolio's current values.
- Opened via a new "Edit" button added next to each portfolio card's existing "Show holdings" / "Delete" buttons in `PortfolioCard.tsx`.

### Rebalance (multi-portfolio cascade)

- New backend endpoint `PATCH /portfolios/rebalance-targets`, request body `{ updates: [{ id: int, target_allocation_pct: float }] }` (new schema `PortfolioRebalanceIn` / item schema `PortfolioTargetUpdate` in `schemas.py`).
- Server validates every `id` belongs to an existing portfolio (404 if not) and that the *submitted* targets' sum is within a small tolerance of 100% (±0.01, floating point) — 400 with a clear message if not. Only portfolios included in `updates` are changed; a portfolio not mentioned keeps its existing target (the request always includes every portfolio when the cascade UI is used, but the endpoint itself doesn't require "all or nothing" — that's a UI-level choice, not a backend constraint, so the endpoint stays reusable).
- All updates commit in a single DB transaction (one `session.commit()` after updating every row) — either every portfolio's target changes, or (on validation failure or a mid-loop DB error) none do.
- `EditPortfolioModal`: below the target % field, a collapsed "▼ Edit other portfolios' allocation" toggle (this project's own wording, not the source site's) — expands to list every *other* portfolio with its own editable target % input and a running "Total: X%" readout that turns red below/above 100%. Saving calls the new rebalance endpoint with every portfolio's current-or-edited target (including the one being renamed) in one request; if the section was never expanded, saving falls back to the existing single-portfolio `PATCH /portfolios/{id}` (no need to touch the others when the user didn't touch them). The name field is never part of the rebalance endpoint's payload (it only handles `target_allocation_pct`) — a name change is always sent as its own `PATCH /portfolios/{id}` call, fired alongside the rebalance call when both changed in the same save.

## Testing Decisions

- `PortfolioDonutChart.tsx`: unit tests for — correct arc proportions for a known holdings/percentage fixture, palette color reuse beyond 8 holdings, the zero-holdings flat-gray-ring state, and that legend entries match chart segments 1:1.
- `EditPortfolioModal.tsx`: tests for pre-filled values, name-required validation, the collapsed/expanded rebalance section toggle, the running total turning red when ≠100%, and that saving with the section collapsed calls the single-portfolio update while saving with it expanded calls the rebalance endpoint.
- Backend `test_portfolios_router.py` additions: rebalance endpoint happy path (targets sum to 100, all rows updated), sum-not-100 rejected with 400 and no rows changed, unknown portfolio id in the batch rejected with 404 and no rows changed (atomicity check — assert the DB state is unchanged after a rejected request, not just the response code).

## Out of Scope

- Dragging/reordering holdings within the donut, or any interactivity on the chart itself beyond display (e.g., no click-to-drill-down) — it's a summary visualization, not a new interaction surface.
- Editing a portfolio's cash balance from the new Edit modal — cash deposit/withdraw already has its own dedicated modal (`💰 ฝาก/ถอน`) and stays there.
- Any change to how `target_allocation_pct` feeds the existing rebalance-severity (green/yellow/red) calculation — this spec only adds a way to *edit* the number after creation, not a change to what it means or how it's used downstream.
- A generic "bulk edit any portfolio field" endpoint — the new endpoint is scoped to `target_allocation_pct` only, matching the one UI flow that needs atomicity (name changes never need cross-portfolio consistency, so they stay on the existing single-portfolio `PATCH`).

## Further Notes

This spec is inspired by browsing wethaiinvest.com's own member "พอร์ตของฉัน" page (the user's own logged-in account) — the *functional ideas* (donut summary, editable targets with a cascade-to-100% helper) are taken from there, but per this project's established policy ([ADR 0003](../adr/0003-original-content-for-ported-features.md)), all copy, styling, and markup here are written fresh, not copied from the source site's code or wording.
