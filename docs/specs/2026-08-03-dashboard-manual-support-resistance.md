# Dashboard — Manual Support/Resistance Editing (Phase 3 of 3)

## Problem Statement

The Dashboard's auto-computed support/resistance zones (built in the prior phase) are a starting point, not the final word — they're derived mechanically from pivot detection and can't know about a level I care about for reasons the algorithm has no way to see: a round number the market tends to respect, a level from a different timeframe I remember, or simply a line the auto-detection missed or drew slightly off from where I'd actually place it. Right now those zones are read-only. I have no way to correct one, add my own, or remove one that isn't useful to me — the chart's memory of "important price levels" is entirely the algorithm's opinion, never mine.

## Solution

Every support/resistance zone on the Dashboard's price chart — auto or manual — can now be dragged to a new price, and I can add new zones of my own or remove ones I don't want, all directly on the chart plus a small list alongside it that shows each zone's exact price and offers a delete button and a type-to-edit price field for the same zone.

The moment I touch any zone for a given ticker and range — drag an existing line, add a new one, or delete one — that ticker+range's *entire* zone set is captured as mine: every zone currently shown (not just the one I touched) is preserved at its current price and kept exactly as-is going forward, and the automatic recompute that would otherwise silently redraw the chart on every fetch stops for that ticker+range. A "Recompute defaults" button (with a confirmation, since it discards everything I've placed) throws away my edits for that ticker+range and returns to the auto-computed zones.

Three ways to add a zone: an "S" button adds a support zone, "R" adds a resistance zone, and "Freestyle" adds a plain, untyped horizontal level for anything else I want to mark — an entry price I'm planning, a stop level, or anything that isn't really "support" or "resistance" in the technical sense. Each new zone appears at the ticker's current price and I drag it into place, the same way I'd move any other zone.

## User Stories

1. As a single user, I want to drag any zone (auto or mine) to a different price on the chart, so that I can correct a level the algorithm placed slightly wrong or move my own level as my view changes.
2. As a single user, I want the moment I first touch a zone for a ticker+range to preserve every other zone currently shown at its current price, so that adjusting one line doesn't silently discard the others I hadn't touched yet.
3. As a single user, I want auto-recompute to stop for a ticker+range once I've edited it, so that my placement isn't silently overwritten the next time the chart refetches.
4. As a single user, I want an "S" button that adds a new support zone at the ticker's current price, so that I can mark a level I care about and then drag it into position.
5. As a single user, I want an "R" button that adds a new resistance zone the same way.
6. As a single user, I want a "Freestyle" button that adds a plain, untyped horizontal level, so that I can mark a price that matters to me for a reason that isn't support or resistance — an entry point, a stop, or anything else.
7. As a single user, I want a small list next to the chart showing every zone's exact price and type, so that I don't have to eyeball a price from where a line crosses the axis.
8. As a single user, I want to edit a zone's price by typing a number into that list, so that I have a precise alternative to dragging with a mouse.
9. As a single user, I want a delete button in that list for each zone, so that removing a zone doesn't require any special click gesture on the chart itself.
10. As a single user, I want a "Recompute defaults" button that discards all my edits for the current ticker+range and returns to the auto-computed zones, so that I can start over without having to delete every zone by hand.
11. As a single user, I want "Recompute defaults" to ask for confirmation before it discards anything, so that a misclick doesn't silently erase everything I've placed for that ticker+range.
12. As a single user, I want my edited zones to persist — they should still be there the next time I open the Dashboard on this ticker and range, not just for the current session.
13. As a single user, I want switching to a different ticker or range to show that combination's own zone set (auto if untouched, mine if I've edited it there), so that my edits to one chart never bleed into another.
14. As a developer, I want the drag interaction built from the charting library's raw coordinate/price conversion and the chart container's mouse events, not a library feature that doesn't exist, so that the implementation is honest about what `lightweight-charts` actually provides.
15. As a developer, I want zone-strength (the auto algorithm's touch count) to never appear on a manual or freestyle zone, so that the UI never implies a fabricated measurement for a zone the user placed by hand.

## Implementation Decisions

**Freeze granularity**: manual editing is scoped to the whole zone set for one `(ticker, range)` pair, never per-zone. Auto-computed zones have no stable identity across recomputations (they're derived fresh from pivot detection on every fetch, and small bar-series changes shift their exact prices), so there is no reliable way to "override just one" auto zone across future refetches. The first edit for a `(ticker, range)` pair snapshots every zone currently shown into persisted rows, then applies that one edit on top of the snapshot — after that point, the `(ticker, range)` pair is entirely manual and is never auto-recomputed again until the user explicitly resets it.

**Zone kinds**: widens from `"support" | "resistance"` to `"support" | "resistance" | "freestyle"`. A freestyle zone has no technical meaning to the app — it's a plain horizontal price marker the user placed for their own reasons. It renders in a third color, distinct from both the existing support (teal) and resistance (amber) colors, and from this app's rebalance-severity palette.

**Strength on manual/freestyle zones**: `strength` (the auto algorithm's pivot-touch count) becomes nullable. A manual or freestyle zone always has `strength: null` — carrying over the auto algorithm's strength value into a manual row (even from the snapshot moment) would misrepresent a number the user's edit already invalidated as a measurement, and a freestyle zone was never a pivot cluster to begin with. The chart's zone-line title (`"S (3)"` today) omits the `(n)` suffix entirely when strength is null.

**Persistence**: a new database table stores manual/freestyle zones, one row per zone: ticker, range, price, kind, created/updated timestamps. There is no `source` column — every row in this table is manual by definition; `source: "manual"` is set at the API layer when returning rows from this table, the same way `source: "auto"` is set when returning computed zones. No migration tool exists in this project (schema is created via `Base.metadata.create_all` at startup) — this is a brand-new table, so no backfill concern applies (unlike the earlier unique-constraint fix on `watchlist_items`, which had to backfill an existing table).

**Read path**: `GET /market/chart` checks whether any manual zones exist for the requested `(ticker, range)` before deciding what to return for `zones` — if any do, those are returned (`source: "manual"`); if none do, the existing auto-computation path runs unchanged. `points` (the price line itself) is entirely unaffected by manual zones either way — only which zones accompany it changes. This is the first time the `market` router needs a database session; every other endpoint in that router is pure external-API/cache logic today.

**Write path**: four operations, added as new endpoints alongside the existing chart endpoint:
- **Freeze-and-edit** — the operation triggered by the *first* touch to a `(ticker, range)` pair that's still on auto zones: the caller sends the complete zone list it wants to end up with (every currently-shown auto zone, unchanged, plus the one edit — a moved price, or one new zone appended). The backend persists exactly that list as the new manual set for that pair. This one call handles both "I dragged an existing auto line" and "I clicked S/R/Freestyle to add a new one while still on auto" — the frontend doesn't need to separately orchestrate a snapshot step before its first edit; it always know its own current zone array and just includes it.
- **Add** — once a `(ticker, range)` pair is already manual, adds one new zone (used by the S/R/Freestyle buttons after the first edit).
- **Move** — once a `(ticker, range)` pair is already manual, updates one existing manual zone's price by its id (used by drag-end and by the list's price input, for every edit after the first).
- **Delete one** — removes a single manual zone by id (the list's delete button).
- **Delete all for a pair** — "Recompute defaults": removes every manual zone for a `(ticker, range)` pair in one call, after which the read path naturally falls back to auto-computed zones again.

**Drag interaction**: built directly on `lightweight-charts`' coordinate conversion (`series.priceToCoordinate()` / `series.coordinateToPrice()`) and raw mouse events on the chart's container element — `mousedown` hit-tests the click position against every currently-rendered zone's on-screen Y position within a small pixel tolerance; `mousemove` while a hit is active updates the dragged line's on-screen position immediately (calling the price line's own `applyOptions()`, no backend call per pixel moved); `mouseup` commits the final price to the backend exactly once (a Move call if the pair is already manual, a Freeze-and-edit call if this is the first edit for that pair). The library has no built-in draggable price line — this is genuinely new interaction code for this project, not a variant of an existing pattern.

**Adding a zone**: clicking S, R, or Freestyle adds a new zone at the ticker's current price (the last point's close) rather than entering a separate "click the chart to place it" mode — the newly-added zone is then repositioned with the same drag mechanism as any other zone, so there is exactly one interaction model for "put a zone at a specific price," not two.

**The side list**: a small panel next to the chart lists every currently-shown zone (auto or manual, whichever the `(ticker, range)` pair currently has) with its exact price, its kind, and — for manual/freestyle zones only — a delete button and an editable price input. Auto zones are listed read-only (no delete/edit controls) since editing one is exactly the action that triggers Freeze-and-edit, which the S/R/Freestyle buttons and chart-drag already cover; the list's edit controls only make sense once a pair is already manual. Editing the list's price input commits on blur or Enter, through the same Move (or Freeze-and-edit, if it's the first edit) call the drag interaction uses.

**Recompute-defaults confirmation**: a confirmation prompt before the delete-all call — this project has no existing confirmation-dialog pattern anywhere in its UI (checked: no `confirm()` call exists in the codebase today), so this introduces the app's first one. A native `window.confirm()` is sufficient for a single-user desktop tool; no custom modal component is being built for this alone.

## Testing Decisions

Tests only assert observable behavior — what a caller can see or measure — never internal implementation details, matching this project's existing test suites throughout `backend/tests/` and `frontend/src/**/*.test.tsx`.

- **The new database model and its CRUD**: FastAPI `TestClient` integration tests for all four write operations plus the read-path branching (manual zones present vs. absent), following the exact pattern already used for `watchlist.py`'s CRUD tests and `test_market_router.py`'s existing chart tests — real request/response assertions against a test database session, no mocking of the DB layer.
- **Freeze-and-edit specifically**: a test proving that touching one zone while a `(ticker, range)` pair is still on auto preserves every other currently-shown zone's price and kind unchanged in the resulting manual set — this is the single most important behavior this ticket adds, and the one most likely to be silently wrong if the snapshot step is skipped or partial.
- **Strength nullability**: a test proving a zone created through Freeze-and-edit, Add, or Move never carries a non-null `strength` in its response, regardless of whether the auto zone it originated from had one.
- **Drag interaction**: component-level tests mocking `lightweight-charts`' coordinate-conversion methods and the container's mouse events, following this ticket's own prior phase's convention of mocking the library entirely (`PriceChart.test.tsx`'s existing `vi.mock('lightweight-charts', ...)` setup) — asserting on the calls made into the mock (hit-test triggers a drag state, mouseup commits exactly once with the expected price), not on rendered pixels.
- **The side list**: RTL tests for price/kind display, the delete button calling the delete endpoint, and the price input committing on blur/Enter — following the form-control test conventions already used throughout this codebase (e.g. `DividendRanking.tsx`'s tax-rate input).
- **Recompute-defaults confirmation**: a test confirming the delete-all call is never issued without the confirmation being accepted first, and a test confirming it is issued when accepted — mocking `window.confirm`.

## Out of Scope

- Diagonal/trendlines — every zone (auto, support, resistance, or freestyle) is a horizontal price level; nothing in this ticket draws a line between two points in time.
- A "placement mode" where clicking the chart directly places a new zone at the click position — new zones always start at the current price and are repositioned by dragging (see Implementation Decisions).
- Per-zone override that survives auto-recompute for the zones the user *didn't* touch — the whole `(ticker, range)` pair freezes together, or not at all.
- Changing a zone's kind after creation (support → resistance, etc.) — a zone's kind is fixed at creation; changing it means deleting and re-adding.
- Any multi-user or sharing concept for manual zones — this remains a single-user local app; manual zones have no owner field.
- A custom confirmation modal component — the native `window.confirm()` is judged sufficient for this single use.

## Further Notes

- This is phase 3 of 3, completing the Dashboard price-chart effort that began with the walking-skeleton chart (phase 1) and the auto support/resistance zones (phase 2, already merged). The `source: "auto"` field phase 2 added specifically to make this ticket additive is now used exactly as planned — this ticket only ever needed to widen it to include `"manual"`, never to restructure the response.
- The drag interaction is the largest new frontend engineering surface introduced in this project to date — everything built before it (dropdowns, range selectors, sortable columns, price-line rendering) has been standard HTML form controls or read-only chart primitives, not custom pointer-tracking. Budget implementation time accordingly; it is the highest-risk part of this ticket, the same way the ticker+range stale-data render-phase reset was the highest-risk part of the two prior Dashboard tickets.
- The `market` router's first-ever database dependency is a small but real architectural first for that specific router — every other endpoint in `routers/market.py` (`/trending`, `/chart`) is pure external-API/cache logic with no DB session today.
