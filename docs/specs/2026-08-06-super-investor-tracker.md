## Problem Statement

The app has no way to see what well-known professional investors ("super investors" — Warren Buffett, Cathie Wood, Ray Dalio, Bill Gates, Michael Burry, Li Lu, and others) are currently holding or have recently bought/sold. This kind of data is public (every US institutional manager over $100M AUM must file a Form 13F with the SEC each quarter) but SEC EDGAR's own filing format has no ready "top holdings per manager" view — it takes real parsing work to turn a raw 13F filing into a readable holdings table.

**Note (written retroactively):** this spec documents a Tools feature that was already built, tested, and shipped (commit `0551e83`) before this spec existed — the project's usual spec-first order was skipped. It's written now to bring the feature in line with this project's convention of a spec + ticket per feature, and to record what was actually decided (including two known gaps found while writing it — see Further Notes).

## Solution

A new "Super Investor Tracker" tab under Tools shows a card grid of tracked investors — name, fund, 1-year performance, portfolio value (AUM), a short strategy blurb, and their top 3 holdings — with a search box, a sort control (performance / AUM / name), a "View full portfolio" modal per investor showing their complete top-holdings table, and a second sub-tab listing recent new-holding activity (buys/sells) across all tracked investors. Data is proxied server-side from a public aggregator that already does the 13F-to-holdings parsing, cached for 10 minutes, with a curated static fallback dataset (seeded from SEC EDGAR CIK lookups) if the live fetch fails.

## User Stories

1. As a user, I want to see a list of well-known professional investors and their current top stock holdings, so that I can see what "smart money" is doing without reading raw SEC filings myself.
2. As a user, I want to search by investor name, fund name, or a ticker they hold, so that I can quickly check "does [famous investor] own [ticker]?" or find an investor by name.
3. As a user, I want to sort the list by 1-year performance, portfolio value, or name, so that I can browse by whichever dimension I care about.
4. As a user, I want to open an investor's full holdings breakdown (not just their top 3), including average buy price, current price, and gain %, so that I can see their whole tracked position, not a teaser.
5. As a user, I want a separate view of recent new-holding activity (new buys, increases, full sells, decreases) across tracked investors, so that I can spot what's changing quarter over quarter without comparing two full portfolios myself.
6. As a user, I want a visible "last updated" timestamp and a manual refresh button, so that I know how current the data is and can force a re-fetch.
7. As a user, if the live data source is unreachable, I want the tab to still show something real (a fallback dataset) rather than an empty or broken page.

## Implementation Decisions

- **Data source:** a direct SEC EDGAR integration was tried first (`data.sec.gov/submissions/CIK{cik}.json` against a hand-curated CIK registry of 6 investors — Buffett, Cathie Wood, Ray Dalio, Bill Gates, Michael Burry, Li Lu) but SEC EDGAR's raw 13F filing index has no "top holdings" view — turning it into one requires parsing the actual 13F XML/info tables per filing, which was not built. The shipped version instead proxies `konbalongtun.com`'s own public API (`/api-server/investors/investors-with-holdings`), which already aggregates and parses 13F data into a ready top-holdings shape, at up to 100 investors per call.
- **Backend** (`backend/app/routers/investors.py`, `prefix=/api/investors`): `fetch_live_investors_multi_provider()` fetches from konbalongtun, maps its JSON shape (`holdings[].logo` URL, `portfolioPercent`, `avgBuyPrice`, etc.) into this app's own `InvestorProfile`/`TopHolding` Pydantic models, and caches the result in a module-level variable for 10 minutes (`_CACHE_TIMESTAMP`/`_CACHED_INVESTORS`). On any fetch exception, it returns the last good cache if one exists, or else the static `INVESTORS_DATABASE` seed list (generated once from a konbalongtun snapshot via `.scratch/generate_investors_db.py`, not regenerated automatically).
- **Endpoints:** `GET /api/investors` (list, `search` + `sort_by` query params), `GET /api/investors/{slug}` (single profile, 404 if not found), `GET /api/investors/new-holdings` (static `NEW_HOLDINGS_ACTIVITIES` seed list — not sourced from the live konbalongtun call), `GET /api/investors/status` (cache timestamp + count), `POST /api/investors/refresh` (invalidates the cache and re-fetches).
- **Frontend** (`frontend/src/components/tools/InvestorTracker.tsx`, wired into `ToolsPage.tsx`'s `investor-tracker` sub-tab): card grid with a 12/24/all display-limit control (not true pagination — the full list is fetched in one call and sliced client-side), search + sort controls, a fixed-column KPI summary row, and a modal for the full per-investor holdings table. `client.ts` exposes `listInvestors`, `getInvestorProfile`, `listNewHoldings`, `getInvestorsStatus`, `refreshInvestorsApi`.
- **Currency:** holdings prices in the detail modal convert to THB via the existing `fxRate`/`currency` props already threaded through `ToolsPage` for other tools — no new FX logic.

## Testing Decisions

- Backend (`backend/tests/test_investors_router.py`, 6 tests): list endpoint returns the seed investors and each one's holdings are non-empty; `search` filters correctly (name/fund/ticker match); a single profile fetch by slug; 404 for an unknown slug; new-holdings list is non-empty and shaped correctly; and — the one adversarial case — with `urlopen` monkeypatched to raise a network error and the cache invalidated first, `GET /api/investors` still returns 200 with the static fallback data (proving the "never show a broken page" requirement, not just the happy path).
- No frontend test file exists for `InvestorTracker.tsx` — this is a gap, not a decision (see Further Notes / follow-up ticket).

## Out of Scope

- Parsing real SEC EDGAR 13F filings directly — deferred in favor of the konbalongtun proxy (see Implementation Decisions); revisiting this would remove the third-party dependency but is a separate, larger effort.
- `new-holdings` sourced live — currently a static seed list, not derived from the live konbalongtun fetch or from diffing successive 13F filings.
- True server-side pagination — the "12 / 24 / all" control slices a client-side array already fetched in full.
- Historical performance charting per investor — only a single current 1-year performance % is shown, no time series.
- Any change to this app's own portfolio/holdings data model — this tab is read-only market intelligence about *other* investors, not connected to the user's own portfolios.

## Further Notes

Two gaps were found while writing this spec retroactively, neither blocking but both real deviations from project convention — tracked as follow-up items in a new ticket rather than silently fixed here:

- **A fabricated stat.** The KPI row's "มูลค่าพอร์ตรวม (AUM)" card is hardcoded to the literal string `"$350.2B"` (`InvestorTracker.tsx`) — it is not computed from the fetched `investors` list, unlike the "top performer" and "fund count" cards next to it, which are real. This is a direct instance of the fabricated-data problem the project's own conventions (ADR 0005; the "never fabricate" rule applied everywhere else in this codebase) exist to prevent.
- **Off-palette styling.** Every other page in the app was migrated to the shared `--card-bg`/`--primary`/`--text` design tokens and the Noto Sans Thai + Inter font pairing during the UI redesign effort (six prior tickets, all shipped). `InvestorTracker.tsx` predates or was built outside that effort: it uses inline hardcoded hex colors (`#10b981`, `#fcd34d`, `#38bdf8`, `#0f172a`, etc.) and references `fontFamily: 'Outfit, sans-serif'` — a font whose `@import` was deliberately removed from `theme.css` in the theme-foundation ticket, so this now silently falls back to the browser default rather than actually rendering Outfit.
