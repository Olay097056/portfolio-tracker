Type: prototype
Blocked by: 04
Status: resolved

## Question

What should the dashboard look like once it shows **both** the deterministic rule-based confidence score (today's badge + score bar + pillar breakdown, unchanged) **and** the local LLM's qualitative analysis (shape decided in [LLM integration contract](04-llm-integration-contract.md)) — side by side, never one replacing the other?

Build a rough, reactable mockup (per `/prototype`) of the AI Technical Signal section of `frontend/src/pages/DashboardPage.tsx` covering:

- Placement: new card/panel next to the existing score bar, an expandable section below it, a tab/toggle between "System" and "AI" views, or something else.
- How the LLM's output fields (per ticket 04's output shape) get laid out — especially if it includes a structured conflicting-signals flag or caveats list, distinct from the main narrative.
- Loading/fallback states: what the panel shows while the LLM is generating (if synchronous) or when it's unavailable (per ticket 04's fallback behavior) — must not block or degrade the existing deterministic display.
- Visual language: reuse the existing dark-themed badge/color system (`badgeColor`/`badgeBg` conventions already in `aiTechnicalSignal.ts`) so the AI panel reads as part of the same product, not bolted on.

Resolve open layout questions by reacting to the mockup, the same way [Prototype หน้า dashboard หลัก](../../planning/issues/06-dashboard-main-prototype.md) settled the original dashboard layout.

## Answer

Followed `/prototype` (sub-shape A — mounted directly in the live `DashboardPage.tsx` route, gated by `?variant=A|B|C` and a floating switcher, per the skill's strong preference over a standalone static mockup — this let the user react to the real, already-working ticket 09 pipeline with real live data and real ~35-40s latency, not fake placeholder content).

**3 variants built and reacted to:**
- **A — Foregrounded callout**: AI panel inline below the system narrative (ticket 09's original placement), `conflicting_signals` (the highest-value output per ticket 02) shown as a prominent amber warning box at the top of any result.
- **B — Side-by-side sidebar**: 2-column grid, system score (left, 1.3fr) and AI Analyst (right, 1fr), both visible simultaneously without scrolling.
- **C — Tabbed toggle**: switch between "📊 System" / "🧠 AI Analyst", with a ⚠️ badge on the AI tab when a conflict exists even while viewing the other tab.

**Chosen: Variant B.** Reasoning: ticket 04's contract explicitly wanted the two views shown "alongside (never replacing)" each other — B is the only variant where both are genuinely visible at once, not sequenced (A) or toggled (C). The tradeoff (narrower columns on small screens) was addressed directly rather than accepted: added a `.ai-signal-split` CSS class (`frontend/src/styles/theme.css`) with a `@media (max-width: 880px)` breakpoint collapsing to a single stacked column — verified live via `resize_window` to 700px.

**Folded into production** (per this map's "carries execution" note — not left as a follow-on ticket):
- `frontend/src/components/AiAnalystPanel.tsx` — the permanent component (was the prototype's `VariantB`, promoted; `VariantA`/`VariantC` and the prototype switcher deleted per the skill's cleanup step).
- `DashboardPage.tsx` — system score and `<AiAnalystPanel>` wrapped in `.ai-signal-split`; all prototype-only state (`aiPanelVariant`, `systemTabActive`, `changeVariant`) removed.
- `theme.css` — `.ai-signal-split` + its responsive breakpoint.

**Verified live in the browser** (not just code review): grid columns computed correctly (≈490px/377px at desktop width, 1.3:1 ratio as specified), collapsed to a single track at 700px width, prototype switcher confirmed fully removed. Full test suite: 53/53 files, 462/462 tests passing (2 unrelated flaky failures seen mid-session — a `DcaProjectionCalculator` timing test and a drag-zone timing test in `DashboardPage.test.tsx` — both confirmed to pass in isolation and on a clean re-run; pre-existing test-parallelism flakiness under this machine's load, not a regression from this ticket).

This was the last open ticket on the map — see the map's Destination for what "done" means; nothing left in Not yet specified or as a live frontier ticket.

