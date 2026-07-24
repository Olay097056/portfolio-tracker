# Stockvision Tools Merge — Spec

Status: ready for implementation
Source: `/grill-with-docs` session on 2026-07-24, synthesizing a merge of the user's own draft app (`stockvision-app`, vanilla JS/HTML/CSS, path: `C:\Users\bit-it.helpdesk\.gemini\antigravity\scratch\stockvision-app`) into `portfolio-tracker`. See [`CONTEXT.md`](../../CONTEXT.md) for the domain glossary and [`docs/adr/0001`](../adr/0001-stockvision-theme-over-variant-a-gold-theme.md)–[`0003`](../adr/0003-original-content-for-ported-features.md) for the three hard-to-reverse decisions made during grilling.

## Problem Statement

`portfolio-tracker` has a real backend (persisted multi-portfolio holdings, live pricing) but its intended visual design (the "Variant A" trading-terminal prototype) was never actually wired into the running app — the app currently renders as unstyled default HTML. Separately, the user drafted their own standalone app, `stockvision-app`, with a visual style they like and a set of financial planning tools (DCA projection, passive-income target, portfolio-builder presets, ETF comparison, plus six data-driven discovery tools) that `portfolio-tracker` doesn't have. The user wants the parts of `stockvision-app` they value merged into `portfolio-tracker`, without inheriting its architectural limitations (no persistence, no live data, hardcoded preset data standing in for real market data) or its content-provenance risk (its own code comments describe it as an "exact replication" of a third-party site, doohoon.net).

## Solution

Restyle `portfolio-tracker` using `stockvision-app`'s color/typography/card-treatment tokens, replacing the never-wired gold/dark theme, while keeping the existing structural layout (3-column dashboard shell concept + the working Portfolios page). Add a new **Tools** tab containing four ported features — DCA Projection, Passive Income, Portfolio Builder, ETF Comparison — rebuilt as real React components backed by the app's actual price service (extended to also surface dividend yield and price-growth rate) instead of `stockvision-app`'s hardcoded preset data, and written with original copy rather than reused from the draft. The six remaining `stockvision-app` tabs that depend on market-wide scanning/ranking of arbitrary stocks (Dividend Ranking, Momentum Scanner, Pre-Squeeze Scanner, Trending Stocks) or AI-generated content (AI News, AI Analysis) are explicitly deferred — logged as open backlog items in `PRD.md` §12, not built now.

## User Stories

1. As the app's single user, I want the app's visual theme to match the look I designed in stockvision-app, so that the app feels like the product I envisioned instead of unstyled default HTML.
2. As the user, I want the rebalance-severity colors (green/yellow/red) to keep their meaning even under the new theme, so that I can still read portfolio health at a glance.
3. As the user, I want a new "Tools" section separate from Portfolios, so that planning/comparison utilities don't clutter the portfolio-management UI.
4. As the user, I want the existing Portfolios page to keep working exactly as it does today, so that the merge doesn't regress anything I already rely on.
5. As the user, I want a DCA Projection calculator, so that I can see how a recurring investment in a ticker could grow over N years given an assumed dividend yield and price growth rate.
6. As the user, I want DCA Projection's yield/growth inputs pre-filled from real market data when available, so that I don't have to guess realistic numbers myself.
7. As the user, I want to still be able to manually edit the pre-filled yield/growth numbers, so that I can model my own assumptions instead of only the fetched ones.
8. As the user, if real yield/growth data can't be fetched (source down or rate-limited), I want the fields to just be blank and editable, so that I'm never shown a fabricated number as if it were real.
9. As the user, I want DCA Projection's target income figures denominated in THB, so that the numbers map onto my real-world monthly budget in my home currency.
10. As the user, I want the DCA Projection tool clearly distinguished by name from the existing "DCA calculator" on a holding, so that I don't confuse "recompute my average cost" with "project future growth" — they answer different questions.
11. As the user, I want a Passive Income calculator, so that I can see what portfolio size I'd need to reach a target monthly passive income in THB.
12. As the user, I want Passive Income to use the same real-data-with-manual-fallback behavior as DCA Projection, so that the two planning tools behave consistently.
13. As the user, I want a Portfolio Builder tool, so that I can pick a goal-oriented preset allocation (e.g. beginner/conservative/growth) as a starting point for a new portfolio instead of designing an allocation from scratch.
14. As the user, I want Portfolio Builder to show its own originally-written preset descriptions and allocation percentages, not text or curated presets carried over unmodified from the draft, so that the app isn't distributing another site's replicated content.
15. As the user, I want to set an investable capital amount in Portfolio Builder and see it split across the preset's allocation buckets in THB, so that I understand roughly how much goes where.
16. As the user, when a Portfolio Builder allocation bucket lists multiple candidate tickers (e.g. "Total Market: VTI, SPY"), I want the bucket's capital split evenly across all of them, so that I end up appropriately diversified rather than forced to pick just one.
17. As the user, I want Portfolio Builder to end by actually creating a real Portfolio and its Holdings via the existing API (fetching each ticker's live price to compute shares and set the initial average cost), so that the wizard's output is a usable portfolio, not just a preview.
18. As the user, I want the existing simple "+ Add portfolio" form to remain available alongside Portfolio Builder, so that I can still create an empty portfolio quickly when I don't want a guided wizard.
19. As the user, I want an ETF Comparison tool, so that I can view two tickers side-by-side.
20. As the user, I want ETF Comparison's v1 to show real price and P&L data (not the draft's hardcoded fundamentals), so that what I see is trustworthy even though it's not as rich as the original mockup yet.
21. As the user, I want to enter any two tickers to compare (not be limited to the draft's 4 preset ETFs), so that the tool is generally useful.
22. As the user, I want the six remaining `stockvision-app` tabs (Dividend Ranking, Momentum Scanner, Pre-Squeeze Scanner, Trending Stocks, AI News, AI Analysis) explicitly recorded as deferred backlog items rather than silently dropped, so that they aren't forgotten and can be individually grilled and speced later.
23. As the user, I want it explicit that if AI Stock Analysis is ever built, it must use an independently-written prompt, not the draft's prompt that's labeled as an exact copy of doohoon.net's, so that the app doesn't distribute another product's proprietary prompt engineering.
24. As the developer picking this spec up later, I want it recorded that the app currently has no USD→THB conversion capability anywhere in the codebase yet, so that I don't assume this spec can lean on existing infrastructure that doesn't exist.
25. As the developer, I want the new market-data fetch (price + yield + growth) added at the same seam as the existing price fetch (`price_service.py` / `GET /prices`), so that the new capability follows established conventions instead of introducing a parallel one.

## Implementation Decisions

**Theme (frontend/src/styles/theme.css, currently unused — see App.tsx / main.tsx)**
- Replace `theme.css`'s token values with `stockvision-app`'s: dark radial-gradient background, glass/blur card treatment with glow shadows, primary blue `#38bdf8` / accent purple `#8b5cf6` / accent green `#10b981`, Inter (body) + Outfit (heading) fonts via Google Fonts `@import`.
- Actually `import './styles/theme.css'` from `main.tsx` (or `App.tsx`) — it is written today but never imported, which is why the running app currently has no styling at all.
- Keep the rebalance severity colors semantically green/yellow/red per PRD §8, re-shaded to sit naturally against the new palette (do not reuse the draft's literal hex values without checking contrast against the new background).

**Navigation (frontend/src/App.tsx)**
- `App.tsx` currently renders only `<h1>` + `<PortfoliosPage />` with no navigation at all. Add a top nav bar with two tabs: **Portfolios** (existing page, now reached via nav instead of being the only thing rendered) and **Tools** (new). Do not add a "Dashboard" tab/stub — PRD §10.2's 3-column ticker/chart dashboard page has never been built and is unrelated, unspecced work.
- Simple client-side tab state (e.g. `useState<'portfolios' | 'tools'>`) is sufficient; no router library exists in the project today and none is being introduced by this spec.

**Backend: market data (backend/app/price_service.py, backend/app/routers/prices.py)**
- Add `get_market_data(tickers: list[str]) -> dict[str, MarketData]` alongside the existing `get_price` / `get_prices`, where `MarketData` is `{price: float | None, dividend_yield_pct: float | None, growth_rate_pct: float | None}`. Each field is independently nullable — a ticker can have a price but no yield, etc. — matching the existing "fail to None, never fabricate" convention in `_fetch_from_yfinance`.
- Source: yfinance only, no Twelve Data fallback for yield/growth (Twelve Data's free tier doesn't carry fundamentals). `dividend_yield_pct` from `Ticker.info` (or `fast_info` if it carries a yield field — confirm at implementation time), `growth_rate_pct` computed as CAGR from 5-year historical close prices (`Ticker.history(period="5y")`), consistent with PRD §5's existing note that yfinance is unofficial and should be treated as failure-prone.
- New endpoint `GET /market-data?tickers=A,B` returning `{"market_data": {"A": {...}, "B": {...}}}`, modeled directly on the existing `GET /prices` handler in `routers/prices.py`.
- Apply the same in-memory cache pattern as `get_price` (`CACHE_TTL_SECONDS`), keyed separately from the plain-price cache since the fetch cost/shape differs.

**Backend: USD→THB FX rate (new capability — does not exist anywhere in the codebase today)**
- Add a minimal `fx_service.py`: `get_usd_to_thb_rate() -> float | None`, fetching from Frankfurter (`api.frankfurter.app`, no API key required — resolves PRD §11's still-open "choose a real FX provider" item in favor of the no-key option). Cache for 24h in-memory per PRD §9's "update once a day" rule.
- Scope note: this is a minimal FX capability built only to support the two THB-native planning calculators (DCA Projection, Passive Income). It is not the full portfolio-summary-level USD/THB toggle described in PRD §9 — that remains separate, unbuilt, unspecced work.

**Frontend: pure calculation utils (frontend/src/utils/)**
- `dcaProjection.ts`: port `calculateDCA` from the draft's `dcaEngine.js` — signature `calculateDcaProjection({ initialInvestmentThb, monthlyContributionThb, years, dividendYieldPct, priceGrowthRatePct, reinvestDividends, taxRatePct }) -> YearlyProjection[]`. Pure function, no I/O — same shape of seam as the existing `utils/dca.ts`.
- `passiveIncome.ts`: port `calculateFreedomTarget` from `freedomEngine.js` — signature `calculateRequiredPortfolio({ targetMonthlyIncomeThb, initialInvestmentThb, monthlyContributionThb, dividendYieldPct, priceGrowthRatePct, taxRatePct }) -> { requiredPortfolioThb, yearsToTarget, yearlyProjection }`. Reuses `calculateDcaProjection` internally, same as the draft's `freedomEngine.js` reuses `dcaEngine.js`.
- Default `taxRatePct` stays configurable (not hardcoded to 15% as a silent constant) — expose it as a parameter with 15% as the pre-filled default value, so it's visibly a Thai dividend-withholding-tax assumption the user can see and override, not a buried constant.

**Frontend: API client (frontend/src/api/client.ts, api/types.ts)**
- Add `getMarketData(tickers: string[]): Promise<Record<string, MarketData>>` calling `GET /market-data`, and `getUsdToThbRate(): Promise<number | null>` calling a new `GET /fx/usd-thb` (thin wrapper endpoint over `fx_service.get_usd_to_thb_rate`).

**Frontend: components (frontend/src/pages/, frontend/src/components/)**
- `pages/ToolsPage.tsx`: composes the four sub-features behind an internal sub-tab switcher (same pattern as the top-level nav — client-side state, no router).
- `components/DcaProjectionCalculator.tsx`, `components/PassiveIncomeCalculator.tsx`: each fetches `getMarketData` for a user-entered ticker to pre-fill yield/growth, renders editable inputs bound to `dcaProjection.ts` / `passiveIncome.ts`, and a results table/summary.
- `components/PortfolioBuilderWizard.tsx`: goal selector → preset (originally-authored presets per ADR 0003) → capital input (THB) → allocation preview, split evenly per-ticker within each bucket per user story 16 → on confirm, calls `createPortfolio` then one `createHolding` per resulting ticker bucket, using `getMarketData`/existing price fetch to compute shares and set `avg_cost_usd` at the live price.
- `components/EtfComparisonTool.tsx`: two free-text ticker inputs, fetches price (existing `getPrices` — no need for `getMarketData` here since v1 is price/P&L only per user story 20) for both, renders side-by-side.
- `AddPortfolioForm.tsx` / the current Portfolios-page "+ Add portfolio" flow is unchanged; `PortfolioBuilderWizard` is additive, reached only from the Tools tab.

## Testing Decisions

- Only test external behavior (inputs/outputs, rendered text, API calls made), never internal implementation details — matches this project's established convention (e.g. `utils/dca.test.ts` tests `calculateDca`'s return shape, not its internal loop).
- Pure calculation modules (`dcaProjection.ts`, `passiveIncome.ts`) get direct unit tests with boundary cases (zero yield, zero growth, zero years) — prior art: `frontend/src/utils/stressTest.test.ts` and `frontend/src/utils/dca.test.ts`.
- Backend `get_market_data` / `fx_service.get_usd_to_thb_rate`: unit test with the yfinance/httpx call mocked, asserting graceful `None` on exception — prior art: `price_service`'s existing tests around `_fetch_from_yfinance`/`_fetch_from_twelvedata` swallowing exceptions.
- New router endpoints (`GET /market-data`, `GET /fx/usd-thb`): test with `price_service`/`fx_service` mocked at the module boundary, not real network — prior art: `routers/prices.py`'s existing tests.
- New components: every test file that renders a component transitively calling `getMarketData`/`getPortfolioSummary`/`getPrices` MUST mock those `api/client` functions in a `beforeEach`, even in tests that don't care about pricing — this exact defect class (unmocked real network calls in tests) was found and fixed multiple times during this project's earlier plans (see `PortfolioHoldings.test.tsx`'s `beforeEach` mock for the established pattern to follow).
- `PortfolioBuilderWizard.tsx` end-to-end test: assert `createPortfolio` is called once and `createHolding` is called once per resulting ticker (after bucket-splitting), with the correct computed share counts given mocked prices — prior art for asserting multiple sequential API calls: the existing per-portfolio ticker isolation test in the backend's summary endpoint tests.
- No visual/CSS regression tests — consistent with the rest of the project (theme correctness is verified by hand in the browser preview, not automated).

## Out of Scope

- The six deferred `stockvision-app` tabs (Dividend Ranking, Momentum Scanner, Pre-Squeeze Scanner, Trending Stocks, AI News, AI Analysis) — tracked in `PRD.md` §12 as backlog items for future grilling, not designed here.
- ETF Comparison's fundamentals depth (dividend yield, P/E, beta, MA score) — v1 is price/P&L only; tracked as a follow-up ticket in `PRD.md` §12.
- The PRD §10.2 Dashboard page (3-column ticker/chart view with S/R lines) — does not exist yet, unrelated to this merge, not built or stubbed here.
- The full PRD §9 portfolio-summary-level USD/THB display toggle — only a minimal FX capability scoped to the two new planning calculators is built here.
- Any of `stockvision-app`'s literal HTML/CSS/JS files, DOM wiring, or the "PRO UNLOCKED" / paywall-style UI conceits — none of it is reused; only the color/typography tokens and the calculation formulas are ported, both rewritten into this project's TypeScript/React/FastAPI stack.

## Further Notes

- `stockvision-app`'s `app.js` was found to target DOM element IDs that don't exist in its own current `index.html` (it's stale relative to `bundle.js`, which is what the page actually loads) — this was cross-checked during grilling and doesn't affect this spec since neither file is being reused directly, but is worth knowing if anyone goes back to that draft for reference.
- Three ADRs were recorded during grilling and should be read alongside this spec: [0001](../adr/0001-stockvision-theme-over-variant-a-gold-theme.md) (theme supersedes the old gold prototype), [0002](../adr/0002-thb-native-planning-calculators.md) (why these two calculators are THB-native against the grain of the rest of the app), [0003](../adr/0003-original-content-for-ported-features.md) (why Portfolio Builder/ETF Comparison content is rewritten, not reused).
