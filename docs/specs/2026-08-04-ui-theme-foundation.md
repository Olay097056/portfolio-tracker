# UI Theme Foundation (wethaiinvest.com-inspired dark palette)

## Problem Statement

I want the app's dark theme to look and feel like wethaiinvest.com (the reference product I'm already a member of and use daily) — a near-black flat background, a specific blue accent, its exact gain/loss colors, its Thai-first typography — instead of the app's current original navy/slate palette with cyan-purple glow gradients and no dedicated Thai font. Right now the app's colors and fonts are a one-off design that doesn't match the visual language I actually want, and almost none of that visual language is expressed as reusable tokens yet — `theme.css` defines a handful of CSS variables, but most of them (`--primary`, `--accent-purple`, `--green`, `--red`, `--yellow`) aren't consumed by any component today, and there is no card/container styling token at all.

## Solution

Replace `theme.css`'s color and font tokens with values sampled directly from wethaiinvest.com's own member dashboard (colors and fonts only — no logos, branding, copied CSS, or copied layout code), and add a new set of card/container tokens (background, border-radius, shadow) that later per-page tickets will use to wrap the app's currently-bare tables and forms. This ticket touches `theme.css` only — no component file changes, no page-layout changes, no new card usage anywhere yet. It is the foundation that every subsequent per-page redesign ticket (Dashboard, Portfolios, Watchlist, Tools — each its own future ticket, each grilled separately) will build on.

## User Stories

1. As the app's single user, I want the background to be a flat near-black like wethaiinvest.com, so that the two products feel visually consistent when I switch between them.
2. As the app's single user, I want the existing cyan/purple glow gradient removed, so that the background matches wethaiinvest.com's flat dark look exactly.
3. As the app's single user, I want the accent color used for interactive elements to match wethaiinvest.com's blue, so that buttons, links, and highlights feel like the same product family.
4. As the app's single user, I want gain values (green) to match wethaiinvest.com's exact green, so that profit/loss coloring feels identical between the two products.
5. As the app's single user, I want loss values (red) to keep using the app's current red, since it already matches wethaiinvest.com's red exactly — no change needed there.
6. As the app's single user, I want body text on dark backgrounds to use wethaiinvest.com's warm off-white instead of the current cool near-white, so the overall page doesn't read as a colder, bluer dark theme than the reference.
7. As the app's single user, I want Thai and English text to render in the same typeface family wethaiinvest.com uses (`Noto Sans Thai` + `Inter`), so that Thai text — a large fraction of this app's copy — looks intentional and consistent rather than falling back to whatever font the OS happens to supply, and so English/Thai text visually match each other.
8. As the app's single user, I want the app's current `Outfit` display font removed entirely, so the typography is fully aligned with the reference rather than a hybrid.
9. As the app's single user, I want new CSS variables for a card/container style (dark card background, rounded corners, drop shadow) defined now, even though no component uses them yet, so that the next per-page ticket can wrap the app's bare tables and forms in a consistent, pre-agreed card style without re-deriving these values from the reference site again.
10. As the app's single user, I want this ticket to touch only the theme file, not any page or component, so that its review is small, fast, and low-risk, and so no page ends up in an inconsistent "half redesigned" state (some elements re-themed, most not) before its own dedicated redesign ticket lands.
11. As a developer working on this app later, I want the exact source values (hex/rgb) this ticket samples from wethaiinvest.com recorded in this spec, so that a future ticket adding a new token doesn't have to re-derive them from the live site.

## Implementation Decisions

**Fidelity policy for this effort (applies to this ticket and all future per-page tickets it unblocks):** color and typography values are sampled directly from wethaiinvest.com's live, authenticated member dashboard and reused closely — but no logos, brand marks, copied CSS/markup, or copied written content are used. This continues the project's existing "features/layout as inspiration, described/rebuilt in our own words" policy recorded in `docs/adr/0003-original-content-for-ported-features.md` and `PRD.md` §0, extended here explicitly to also cover close (not just described-in-words) visual/color fidelity, per an explicit decision made for this effort.

**Scope boundary:** this ticket modifies `frontend/src/styles/theme.css` only. No component, page, or test file changes. Verified before writing this spec: none of `theme.css`'s existing color variables (`--primary`, `--accent-purple`, `--green`, `--yellow`, `--red`, `--muted`) are referenced by any other file in the codebase today (only the global `body`/`button`/`input` element rules inside `theme.css` itself consume any theme variables) — so retargeting their values has zero ripple effect into component code. This ticket is a pure token-value change plus new token additions; no new tokens are consumed by anything yet either.

**Color tokens — sampled from wethaiinvest.com (authenticated dashboard, 2026-08-04):**

| Token | Old value | New value | Source on wethaiinvest.com |
|---|---|---|---|
| `--bg` (page background) | `#0b0f19` | `#09090b` (Tailwind `zinc-950`) | Inferred from the reference's card-vs-page background pairing convention (see Further Notes) — the page itself renders near-pure-black; the sampled card value below is one step lighter, matching the standard Tailwind `zinc-950`/`zinc-900` page/card pairing the reference otherwise consistently uses. |
| `--primary` (accent) | `#38bdf8` | `#3b82f6` (Tailwind `blue-500`) | Computed style of the reference's primary action buttons. |
| `--green` (gains) | `#10b981` | `#2ca559` | Computed style of a positive `%` change value (`+18.26%`) on the reference's portfolio summary card. |
| `--red` (losses) | `#ef4444` | `#ef4444` (unchanged) | Computed style of a negative `%` change value on the reference — already an exact match, confirmed by direct comparison; no edit needed. |
| `--text` (body text on dark bg) | `#f8fafc` | `rgb(255, 248, 240)` | Computed style of the reference's primary price/value text. |

**New card/container tokens (defined now, not consumed by any component until a later per-page ticket):**

| Token | Value | Source |
|---|---|---|
| `--card-bg` | `#18181b` (Tailwind `zinc-900`) | Computed background-color of the reference's portfolio-summary and price-panel card containers. |
| `--card-radius-lg` | `16px` | Computed `border-radius` of the reference's outer card container (Tailwind `rounded-2xl`). |
| `--card-radius` | `12px` | Computed `border-radius` of the reference's inner card container (Tailwind `rounded-xl`). |
| `--card-shadow` | `0 25px 50px -12px rgba(0, 0, 0, 0.25)` | Computed `box-shadow` of the reference's outer card container (Tailwind `shadow-2xl`). |

**Tokens explicitly left unchanged (not sampled this round, no reference equivalent identified):** `--panel`, `--panel2`, `--panel3` (existing translucent-panel tokens — still unused by any component today, same as before this ticket; left as-is rather than retargeted, since the reference's card system is being introduced as new `--card-*` tokens instead of a replacement for these), `--accent-purple`, `--yellow`, `--border`, `--muted` (no corresponding sampled value gathered for these in this grilling round — out of scope for this pass, may be revisited in a later ticket if a per-page redesign needs them).

**Background gradient removal:** the existing `body`'s `background-image` (two radial-gradient glows, cyan top-left and purple bottom-right) is deleted entirely. `body` becomes a flat `background-color: var(--bg)` with no `background-image` at all, matching the reference's flat dark background.

**Typography:** the `@import` in `theme.css` changes from `Inter:wght@300;400;500;600;700` + `Outfit:wght@400;600;700;800` to `Noto Sans Thai` (weights matching the reference: 400/500/700 at minimum) + the existing `Inter` weight range (kept as-is — only `Outfit` is dropped, `Inter`'s own weight set is unaffected). The `body`'s `font` shorthand changes its family list from `'Inter', -apple-system, "Segoe UI", Roboto, sans-serif` to `'Noto Sans Thai', 'Inter', -apple-system, "Segoe UI", Roboto, sans-serif` — Noto Sans Thai first so Thai glyphs render from it, falling through to Inter for Latin text (matching the reference's own font-family order exactly: `"Noto Sans Thai", Inter, ui-sans-serif, system-ui, sans-serif`). Verified before writing this spec: `Outfit` is `@import`-ed today but not referenced by any `font-family` rule anywhere in the codebase (grepped — zero matches outside the `@import` line itself), so removing it has no other code to update.

**Element-level border-radius (buttons, inputs — not cards):** left unchanged in this ticket. The reference uses two shapes (fully-pill `border-radius: 9999px` for its floating nav buttons, `4-6px` for other action/toggle buttons); this app's `input` rule already uses `6px` today, which already sits inside that "other buttons" range and needs no change. Pill-shaped navigation is explicitly out of scope for this ticket (see Out of Scope) since this app's navigation is a tab-underline pattern, not floating pill buttons, and restructuring nav is layout work for a later ticket, not a token-value change.

## Testing Decisions

`theme.css` is a plain CSS file with no existing test coverage in this codebase (confirmed: no `.test.` file targets it, and no component test asserts on computed CSS values from it today — the one place a computed-style assertion exists in this codebase, `PriceChart.test.tsx`'s zone-color tests, asserts against hardcoded hex literals passed as component props, not against anything read from `theme.css`). This ticket does not add automated tests, consistent with how `theme.css` has been treated throughout the project to date — a global CSS file where correctness is visually verified, not unit-tested. Verification for this ticket is: `npx tsc -b` and `npx vitest run` both stay green (proving the CSS edit didn't break anything that depends on the file existing/parsing), plus a manual visual check (`npm run dev`, load the app, confirm the flat dark background, updated accent/green colors, and new font are visibly applied) — no new automated test is expected or required.

## Out of Scope

- Any component, page, or `.tsx` file change — this ticket is `theme.css` only.
- Wrapping any table, form, or section in the new `--card-*` tokens — the tokens are defined but not consumed by anything in this ticket; a later per-page ticket does the wrapping.
- Restructuring the navigation into pill-shaped floating buttons (the reference's nav pattern) — this app's tab-underline nav is unchanged.
- Any per-page layout change (Dashboard, Portfolios, Watchlist, Tools) — each gets its own future ticket, each grilled separately, each expected to fully re-theme that page (including card-wrapping) rather than leaving it partially done.
- The reference's chart-interaction mode toggle (its explicit "Move Chart / Add Support/Resistance / Clear All" button group, which sidesteps the drag-vs-pan conflict this app's own Dashboard S/R drag feature currently has, per `PRD.md`'s recorded residual finding I3) — noted here as a real, relevant precedent for a future Dashboard ticket to consider, but not decided or actioned in this ticket.
- `--accent-purple`, `--yellow`, `--border`, `--muted`, `--panel`/`--panel2`/`--panel3` — no new sampled values for these in this pass.
- Any AI-generated analysis/insight content, admin-curated ticker feeds, favorites bars, or other reference-site features unrelated to visual theming — these remain explicitly deferred/out-of-scope per `PRD.md` §2 and §12, unaffected by this ticket.
- Reproducing the reference's own copyrighted written content, branding, or logo in any form — explicitly excluded regardless of how closely colors/fonts are matched.

## Further Notes

- The exact page-background value (`--bg: #09090b`) is an informed inference, not a directly-sampled value: repeated DOM inspection of the reference's `html`/`body`/root wrapper elements all returned a transparent `background-color` (the visible dark background is painted by some other mechanism I could not isolate in the time spent on this — possibly a full-viewport fixed element, or a Tailwind arbitrary-value class resolving through a custom property I didn't locate). The directly-sampled, confirmed value is the *card* background (`#18181b`, Tailwind `zinc-900`). `#09090b` (`zinc-950`) is used for `--bg` because it is the standard one-step-darker Tailwind pairing for a `zinc-900` card sitting on a page background, and because Tailwind's own default palette is otherwise confirmed throughout the reference (blue-500 accent, gray-800/gray-400 secondary buttons, standard shadow scale) — but if a future ticket samples the true page background directly and finds a different value, `--bg` should be corrected then.
- This ticket is the first of what will be a multi-ticket effort. The natural next tickets, in the priority order agreed during grilling, are: Dashboard (closest comparison to the reference — same S/R zone concept, same chart-range controls), then Portfolios, then Watchlist, then Tools. Each should be grilled on its own, the same way the three-phase Dashboard price-chart effort was.
- This effort's fidelity policy (close visual match, sampled from the authenticated reference site, colors/fonts only) is a explicit, deliberate widening of this project's earlier, more conservative "describe in our own words" policy from `docs/adr/0003-original-content-for-ported-features.md` — recorded here as the operative policy for this specific effort going forward, not a silent overriding of that ADR's original content-copying concern (which remains fully in force for written/AI-generated content, per `PRD.md` §0 and §12's AI Stock Analysis backlog note).
