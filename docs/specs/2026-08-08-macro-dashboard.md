# Macro Dashboard (Treasury Yields, Money Market, Risk Spreads & Market Assets) + Profit Models

Date: 2026-08-08
Status: Spec (implemented on `feature/investor-new-holdings-live-scrape`)

## Problem Statement

The app has no view of the macro backdrop its holdings trade against: US Treasury yields (the risk-free anchor every equity/ETF return is priced against), money-market funding rates (SOFR vs EFFR — the spread that flashed before the 2019 repo crisis), credit risk (high-yield spread), or the big liquid macro instruments (DXY, VIX, gold, oil). The user saw a Thai "Bond Crisis Dashboard" (`bond-crisis-dashboard-v2.vercel.app/macro`) that shows exactly this, and wants the same *functionality* inside this app's Tools tab. That site's own data is public market data sourced from Yahoo Finance / FRED (confirmed by inspecting its Supabase tables: `price_source: "yahoo"`), so nothing is lost by going straight to the public sources — no scraping of that site is needed or wanted.

Second, the reference site's `/models` page ("โมเดลทำกำไร") ranks six regime models (recovery/reflation, inflation-oil, Fed pivot, yield-shock, credit-panic, bank-run) scored 0-100 from the same macro inputs. The user wants that page's functionality too: live scores, a 30-day score history with building/active thresholds, and per-model detail (trade direction, regime, activation conditions, signal map).

## Solution

A new main tab "Bond-crisis" (renamed from "Macro Dashboard" and moved out of the
Tools sub-tabs per user request, 2026-08-08) showing four sections, all proxied
server-side and cached — the page mirrors the reference site's /macro layout:
a header with auto-refresh note and refresh button, an inverted-curve warning
banner, a yield-curve panel, a gold-CME card, and five metric-card sections
(treasury yields, money-market rates, macro indicators, credit spreads, banking
indicators) using the reference site's ink palette (#101623 panels, #1e2940
borders, #38bdf8 accent) and Thai labels:

1. **Treasury Yield Curve** — US 13W / 1Y / 2Y / 5Y / 10Y / 20Y / 30Y yields as
   a line chart (current line + dashed 1-month-ago line) with per-tenor cards
   showing 1-day change in bps, plus the 10Y-2Y spread readout.
2. **Money Market** — SOFR, EFFR, OBFR, ON RRP, TGA (via Treasury Fiscal Data API), and the SOFR–EFFR spread.
3. **Macro Indicators** — DXY, VIX, MOVE (via yfinance `^MOVE`), Gold, Silver, WTI, Brent, CPI/PCE/core-CPI YoY, 10Y real yield, 5Y/10Y breakeven inflation, unemployment.
4. **Credit & Fiscal** — HY/IG OAS spreads, debt-to-GDP, fiscal balance % GDP, household debt % GDP, SLOOS tightening, 10Y/2Y/5Y/30Y auction bid-to-cover + 10Y indirect-bidder share (via TreasuryDirect TA_WS).
5. **Positioning (COT/TIC)** — CFTC money-manager net for gold/silver/WTI/copper/wheat/corn, leveraged-funds + asset-manager nets for UST 10Y/30Y/DXY/JPY, and foreign holdings of US Treasuries (total + official, via TIC).
6. **Banking Indicators** — banking-stress composite, bank deposits + small-bank deposits (via FRED), Fed discount window, StL financial stress index, bank reserves, 90-day CP rate, FIMA repo pool/usage, EIA crude/gasoline/distillate inventories (+ WoW changes, needs free `EIA_API_KEY`).

7. **Profit Models (โมเดลทำกำไร)** — six regime models scored 0-100 (matching the reference site's model set, names, weights and signal maps, captured from its public frontend bundle): a 30-day score-history chart with building (40) / active (60) threshold lines, and one expandable card per model showing rank, score, confidence, status badge (ไม่ทำงาน / กำลังก่อตัว / ทำงาน / อ่อนแรง), the five factor bars (โครงสร้างตลาด / มหภาค / ข่าว / ยืนยัน / บทลงโทษ), trade direction, suitable regime, activation conditions and the asset signal table.

Every section carries an `available` flag and the response names its data
sources; the UI renders missing sections as "—" — never a fabricated number.

## User Stories

1. As a user, I want to see today's US Treasury yield curve at a glance, so that I can judge whether bonds are pricing recession (inverted curve) or stress (steep curve).
2. As a user, I want the SOFR–EFFR spread, so that I can watch the funding-stress signal that pre-dated the 2019 repo crisis.
3. As a user, I want the high-yield spread, so that I can see how much credit risk the market is demanding.
4. As a user, I want live DXY / VIX / Gold / Oil quotes, so that I can see the macro asset moves alongside my portfolio.
5. As a user, if a data source is unreachable, I want that section to say so plainly rather than show stale or made-up numbers.
6. As a user, I want a "last updated" timestamp and a refresh button, so that I can control how current the data is.

## Implementation Decisions

- **Data source — FRED (primary, no API key):** `https://fred.stlouisfed.org/graph/fredgraph.csv?id=<SERIES>` is FRED's public CSV download endpoint and needs no key (verified live 2026-08-08). Series used:
  - DGS3MO, DGS1, DGS2, DGS5, DGS10, DGS20, DGS30 → treasury yields (constant maturity, %)
  - BAMLH0A0HYM2, BAMLC0A0CM → high-yield / investment-grade OAS spreads (%)
  - SOFR, DFF (EFFR), OBFR, RRPONTSYD → money-market rates and ON RRP outstanding
  - DPSACBW027SBOG → bank deposits (all commercial banks, $M → $B)
  - CPIAUCSL, PCEPI, CPILFESL → CPI / PCE / core-CPI YoY
  - H41RESPPALDKNWW, STLFSI4, WRESBAL → banking indicators
  - GFDEBTN, FYFSD, GDP → debt-to-GDP and fiscal-balance ratios
  - Same "use the public endpoint, never depend on it" spirit as `fear_greed_service.py`'s CNN scrape.
- **Data source — Yahoo Finance (assets, always):** `yfinance` (already a project dependency, `price_service.py`) for `DX-Y.NYB`, `^VIX`, `^MOVE`, `GC=F`, `SI=F`, `CL=F` — 5 days of history, last two closes give price + 1-day change %. Live values matched the reference site's own table (DXY 99.60, VIX 14.90, MOVE 72.03) at verification time.
- **Data source — US Treasury Fiscal Data API (TGA, free, no key):** `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/operating_cash_balance?sort=-record_date&page[size]=10` returns the Daily Treasury Statement's operating cash balance. The endpoint emits 4 rows per day (opening balance, deposits, withdrawals, closing); only the `Treasury General Account (TGA) Opening Balance` row is used (values $M → $B). Verified live 2026-08-08: opening balance 929,325 ($M) = $929.3B, matching the reference site's TGA card.
- **Data source — TreasuryDirect TA_WS (auction bid-to-cover, free, no key):** `https://www.treasurydirect.gov/TA_WS/securities/auctioned?pagesize=50&type=Note&format=json` returns recent Treasury auctions. Filter on the original `term` (`10-Year` — includes reopenings whose `securityTerm` reads "9-Year 10-Month") and take the latest `bidToCoverRatio`; the 2Y/5Y/30Y cards filter their own terms, and the 10Y indirect-bidder share is `indirectBidderAccepted / totalAccepted`. Verified live 2026-08-08: 10Y BTC 2.59 on the 2026-07-08 reopening, matching the reference site's auction card.
- **Data source — CFTC Commitments of Traders (COT, free, no key):** the public Socrata API serves the disaggregated report (`publicreporting.cftc.gov/resource/72hh-3qpy.json`) and the Traders-in-Financial-Futures report (`gpe5-46if.json`). Money-manager net = `m_money_positions_long_all - short_all`; TFF leveraged = `lev_money_positions_long - short`; asset manager = `asset_mgr_positions_long - short`. Contracts are matched by 6-digit `cftc_contract_market_code` (the 3-digit `cftc_commodity_code` column is NOT the reference site's code). Verified live 2026-08-08: gold MM net 130,766 contracts.
- **Data source — TIC (foreign UST holdings, free, no key):** `https://ticdata.treasury.gov/Publish/mfh.txt` is the monthly Major Foreign Holders table (fixed-width, $B). The `Grand Total` and `For. Official` rows become the two cards.
- **Data source — EIA (inventories, free key required):** `https://api.eia.gov/v2/petroleum/stoc/wst/data/` needs a free key in the `EIA_API_KEY` env var; without one the inventory cards render honestly unavailable. `WCESTUS1` / `WGTSTUS1` / `WDISTUS1` are the weekly crude/gasoline/distillate stock levels; the `_chg` variants are week-over-week deltas.
- **Yield fallback:** if FRED is unreachable, the yield section tries yfinance's four CBOE tickers (`^IRX` 13W, `^FVX` 5Y, `^TNX` 10Y, `^TYX` 30Y). The tenors yfinance cannot provide (1Y/2Y/20Y) are reported `available: false` — no guessing. If both fail, the whole section is unavailable.
- **Backend** (`backend/app/macro_service.py` + `backend/app/routers/macro.py`, prefix `/api/macro`):
  - One endpoint `GET /api/macro` returning `MacroDashboardOut` with `treasury_yields`, `money_market`, `hy_spread`, `assets`, `updated_at`, `data_sources`.
  - Module-level cache in the router (10 minutes), same shape as `fear_greed.py`/`investors.py`; `POST /api/macro/refresh` invalidates it.
  - Change values: yields/spreads report `change_bps` from the last two *non-null* FRED rows (DGS series have gaps; `.` rows are skipped). Assets report `change_pct` from the last two closes.
  - Registered in `main.py` alongside the other routers.
  - **Performance (2026-08-08, cold build 31.7s → ~7.5s):** FRED fetches request a ~400-day window (`cosd`/`coed`) instead of the full multi-decade CSV; CFTC fetches take one ordered page (newest week only) instead of 2000 rows per report; ALL external sources (FRED series, TGA, auctions, CFTC, TIC, EIA, yfinance) fetch in a single parallel wave; and a module-level 10-minute cache in `macro_service.build_dashboard()` is shared by BOTH the macro and models routers — previously `/api/models` re-fetched the entire external set (~30s) on top of `/api/macro`, which made the models page hang.
- **Frontend** (`frontend/src/components/tools/MacroDashboard.tsx`, wired into `ToolsPage.tsx` as a new `macro` sub-tab + FEATURE_CARD):
  - Yield curve drawn as a hand-rolled SVG polyline (tenor-categorical x-axis — the project's `lightweight-charts` is time-series-only, so no new dependency; a small SVG line + dots matches the app's existing chart styling).
  - Uses the shared theme tokens (`--card-bg`, `--text`, `--text-muted`, `--border`, `--primary`) and the Noto Sans Thai + Inter font pairing — this component must NOT repeat the off-palette mistake documented for `InvestorTracker.tsx` (spec 2026-08-06, Further Notes).
  - `client.ts` exposes `getMacroDashboard` / `refreshMacroDashboard`; `types.ts` gains the response interfaces.
  - Thai labels for section headers (the app's UI is Thai-first), values shown in USD.
- **Models backend** (`backend/app/model_service.py` + `backend/app/routers/models.py`, prefix `/api/models`):
  - The six models, Thai/English names, concepts, indicator weights and signal maps are captured verbatim from the reference site's public frontend bundle (module 57362, chunk 7362, 2026-08-08). Scores are computed here from the same live sources the macro dashboard uses — never scraped at runtime.
  - Scoring follows the reference formula: Total = โครงสร้างตลาด (cap 25) + มหภาค (30) + ข่าว (15) + ยืนยัน (20) + บทลงโทษ (0-15 deduction). Each indicator is scored 0-100 by a per-indicator rule (e.g. HY spread narrowing, VIX < 18, DXY range, curve slope, MOVE calm/stress) and blended by its weight. Stress models flip the polarity of shared indicators (yield-shock wants a *strong* dollar, a *breaking* NAS100 and *spiking* 10Y; recovery wants the reverse) via per-model overrides. Indicators whose input data is unavailable are dropped — never guessed.
  - Status thresholds match the reference: ≥60 active, ≥40 building, else inactive; confidence = % of the model's indicators with live data.
  - Score history: SQLite table `model_score_history` (one snapshot row per model per cache build, pruned to 30 days) — the chart fills in over time exactly like the reference's per-hour history, instead of fabricating 30 days of backfill.
  - Router caches 10 minutes with `POST /api/models/refresh` to invalidate (same pattern as macro/fear-greed).
- **Models frontend** (`frontend/src/components/tools/ModelsDashboard.tsx`, rendered as the "โมเดลทำกำไร" sub-tab of the Bond-crisis page):
  - Score-history chart is a hand-rolled SVG multi-line (six coloured lines, threshold reference lines at 40/60, hover crosshair + tooltip, thinned x labels) — no new chart dependency, matching the yield-curve approach.
  - Model cards mirror the reference layout: rank badge + name + status badge + concept in the header row with score/confidence on the right; five factor bars underneath; click to expand trade direction, suitable regime, activation conditions (name + score bar) and the signal table (asset / category / long-short pill / reason).
  - Ink palette constants + per-model colours copied from the reference site (recovery #38bdf8, oil #f59e0b, pivot #a78bfa, yield-shock #f97316, credit-panic #f87171, bank-run #34d399).
- **Currency:** all instruments are USD-denominated; yields/spreads have no FX dimension. No THB conversion (unlike tools that convert holding prices).

## Testing Decisions

- Backend (`backend/tests/test_macro_router.py`): FRED fetches stubbed by monkeypatching the service's CSV loader; yfinance stubbed by monkeypatching the service's asset loader; TGA + auction + CFTC + TIC + EIA fetchers stubbed the same way (nothing touches the network).
  - Happy path: all six sections populated with the stub data (bank deposits $B, TGA $B, auction bid-to-cover, MOVE index, COT gold net 130,766, TIC total $7,402.5B, EIA crude 418.0 M bbl + WoW change -7.0 all `available: true`), cache timestamp set.
  - FRED down → yield section falls back to yfinance tickers where available; the two yfinance-can't-cover tenors are `available: false`.
  - Both sources down → 200 with all sections unavailable (never 500, never fabricated values).
  - `change_bps` correctness: feed a stub CSV whose last two non-null rows differ by 6bp and assert 6 (and that `.` null rows are skipped).
  - TGA parser: the DTS endpoint returns 4 rows per day (opening / deposits / withdrawals / closing); assert only the `TGA Opening Balance` row is kept.
  - COT matcher: assert the 6-digit `cftc_contract_market_code` is used (gold MM long 139,809 − short 9,043 = 130,766).
- Models (`backend/tests/test_models_router.py`): macro dashboard stubbed with the same fixtures; yfinance extras (JPY/NAS100/KRE) stubbed; the SQLite history table is written and pruned.
  - Happy path: six models, ranks 1-6, factors within caps, score = sum of the five factors, Thai/English meta + signal maps present.
  - Regime sensitivity: calm tape keeps stress models (yield-shock / credit-panic / bank-run) below the risk-on models; 10Y > 4.5% + real yield up + MOVE elevated makes yield-shock the top active model; deposit flight + discount-window spike + low reserves pushes bank-run above 40.
  - History: fresh snapshots recorded, 40-day-old rows pruned.
- Frontend (`frontend/src/components/tools/MacroDashboard.test.tsx`): renders the four sections with fixture data; renders "Unavailable" states when a section is `available: false`; refresh button calls the API again.
- Frontend (`frontend/src/components/tools/ModelsDashboard.test.tsx`): renders all model cards with scores/status/factor labels; expanding a card reveals trade direction, regime, conditions and signal table; the 30-day chart shows threshold labels; empty-history placeholder; refresh calls the API; error state shows retry.

## Out of Scope

- The reference site's other pages (sentiment index, trading signals, bank-run stress monitor, country risk, scenario simulator, AI boardroom, 3D office) — the user chose to evaluate this macro set first, then revisit (option C) later.
- Gold CME open interest / volume / options IV, the ~20 CME ATM-IV series, FedWatch probabilities, ratings (S&P/Moody's/DBRS), the proprietary banking-stress composite, CDS proxy, auction tail/dealer breakdowns — no free public source exists (the reference site computes/scrapes these itself); skipped rather than fabricated.
- EIA inventories — implemented but inert until the user registers a free key at api.eia.gov and sets `EIA_API_KEY`.
- Historical yield-curve chart (time series of curves) — only the current curve is shown.
- THB conversion of gold/oil prices.

## Further Notes

- The reference site gates its own "CME zones" card behind login; we are not replicating that (it needs their Supabase session).
- fredgraph.csv returns full history; the service reads only the tail (recent rows) — a few KB per series, so fetching all ten series on cache expiry is cheap.
