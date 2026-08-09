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
8. **Trading Signals (สัญญาณเทรด)** — the reference site's `/signals` trade desk: signals generated from the regime models (model ≥40 building) + a technical gate (ta_score ≥50, six conditions from 60 daily candles: EMA20/SMA50/RSI/MACD/Bollinger/Stoch/ATR + swing levels), stored in SQLite `trading_signals` with a 14-day expiry (P54); a stats panel (win rate, P&L ที่ปิดแล้ว/ลอยตัว, profit factor, expectancy, avg RR, payoff ratio, best/worst trade, max drawdown, equity curve), category breakdown, filters (category/sort), a 12-column expandable signal table with sparkline, and ปิดออเดอร์ action. History starts empty and accumulates from real closes — stats honestly show "—" until then (never seeded).

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
- **Signals backend** (`backend/app/signals_service.py` + `backend/app/routers/signals.py`, prefix `/api/signals`):
  - Signal engine: models building (≥40) whose signal-map asset passes the TA gate (ta_score ≥50) emit a signal; entry = current price, TP/SL from swing levels or RR fallback; signal_strength = Σ 5 factors (confluence, rr_quality, ta_quality, atr_quality, model_conviction); expires_at = +14 days (P54).
  - TA snapshot = 6 conditions (price_vs_ema20 15 / ema20_vs_sma50 10 / rsi_zone 20 / macd_state 20 / bb_room 20 / stoch_confirm 15) computed from 60 daily yfinance candles — formula verified against the reference's 31 real snapshots (ticket 03); bb_room measures room to the nearest swing level (band-edge fallback in strong trends).
  - SQLite table `trading_signals` (same columns as the reference) with a `sparkline` column added via an idempotent lifespan migration for pre-existing databases; de-dup per asset+model+day; active signals auto-expire past `expires_at` at the current price.
  - `GET /api/signals` generates on cache expiry (10 min), persists, refreshes current prices and returns signals + stats; `POST /api/signals/refresh` forces regeneration; `POST /api/signals/close` closes an active signal at the live price → tp_hit/sl_hit + pnl_pct.
  - Stats implement the reference module-26079 formulas exactly (win rate, realized/unrealized P&L, profit factor with ∞ handling, expectancy, avg RR, payoff ratio, equity curve, max drawdown); history starts empty and is never seeded.
- **Signals frontend** (`frontend/src/components/tools/SignalsDashboard.tsx`, rendered as the "สัญญาณเทรด" sub-tab): stats panels (6 + 9 detailed) with honest "—" when empty, category breakdown with per-category W/L/WR, category + sort filters, a 12-column expandable signal table (asset/direction/entry/TP/SL/current/P&L/strength bar/sparkline/status/ปิดออเดอร์) with TA detail on expand, and an equity-curve SVG — all in the reference ink palette, Thai-first labels.
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
- Signals (`backend/tests/test_signals_router.py`): signal engine stubbed (model scores + candles); the router's SQLite persistence, stats, close flow and P54 expiry run against a real test database.
  - Building model + rising candles → signals generated & persisted with ta_score ≥ threshold and strength = Σ factors; inactive models emit nothing with an honest note.
  - Close flow: POST /close sets tp_hit/sl_hit + pnl_pct + closed_at, feeds the stats panel; unknown id → 404; double close → 400; stale signal past expires_at auto-expires.
  - Cache: two GETs hit the engine once, refresh forces a second; stats formulas match the reference (win rate 50, profit factor 1.6, avg RR 2, equity curve cumulative).
- Frontend (`frontend/src/components/tools/SignalsDashboard.test.tsx`): renders stats + signal table; empty state with honest note; category filter + sort; expanding a row reveals TA detail; close button calls the API and reloads; refresh; error retry; equity curve appears with 2+ closed trades.

## Out of Scope

- The reference site's other pages (sentiment index, country risk, scenario simulator, AI boardroom, 3D office) — the user chose to evaluate the macro set first, then revisit later. (The trading-signals, news and banking pages ARE mirrored — see their own spec sections below.)
- Gold CME open interest / volume / options IV, the ~20 CME ATM-IV series, FedWatch probabilities, ratings (S&P/Moody's/DBRS), the proprietary banking-stress composite, CDS proxy, auction tail/dealer breakdowns — no free public source exists (the reference site computes/scrapes these itself); skipped rather than fabricated.
- EIA inventories — implemented but inert until the user registers a free key at api.eia.gov and sets `EIA_API_KEY`.
- Historical yield-curve chart (time series of curves) — only the current curve is shown.
- THB conversion of gold/oil prices.
- Supabase migration (hosted Postgres + Realtime + Auth) — evaluated 2026-08-09 and rejected by the user: staying on local SQLite; the connection layer already isolates the DB so a future move stays cheap.

## News tab (ข่าวสาร) — added 2026-08-09, mirroring the reference /news page

The Bond-crisis page gained a fourth sub-tab rendering real RSS headlines
enriched with Thai titles, impact scores, categories and related-model badges.

- **Backend** (`backend/app/news_service.py` + `backend/app/routers/news.py`, prefix `/api/news`):
  - 9 feeds / 7 hosts fetched concurrently (ZeroHedge, Al Jazeera, CNN World, MarketWatch, Reuters + top stories via Google News RSS, CNBC, Bangkok Post business + topstories) — all free, no key; exact URLs surveyed in `docs/research/rss-feeds-2026-08-09.md`.
  - Parsed with stdlib `xml.etree` (RSS 2.0 + Atom, namespace-aware; RFC-822 + ISO-8601 dates; `description→summary→content` fallback; 600-char summary cap for ZeroHedge's full-article summaries). No new dependency.
  - Dedupe on canonicalized URL (Google News redirect params stripped); SQLite `news_items` mirrors the reference table shape.
  - **Fast by design:** fetch+persist returns in ~4s; DeepSeek enrichment (Thai title + impact 0-100 + category + related models, batched 20/call with `response_format: json_object`, translate-once) runs in a **background daemon thread** (40 items/round) so the page never blocks on ~300 headlines. Thai analysis (impact ≥ 40 only — user's cost-control pick) generates in the same background sweep.
  - `GET /api/news?page&sort=date|impact&source&min_impact` — pagination 20/page with exact count, nulls-last ordering, 5-minute cache; `POST /api/news/refresh`. No `DEEPSEEK_API_KEY` → items persist with English titles and null Thai fields — never fabricated.
- **Frontend** (`frontend/src/components/tools/NewsDashboard.tsx`, rendered as the ข่าวสาร sub-tab of the Bond-crisis page):
  - Item cards: color-coded impact score (≥70 red, ≥40 amber, ≥15 blue), source + relative-time + category pill, related-model badges in the reference per-model colors with Thai labels, Thai title with English fallback, summary, expandable Thai analysis panel, external-link.
  - Sort (วันที่/IMPACT), source dropdown, IMPACT ≥ N filter (15/40/60), pagination 20/page with ellipsis; honest loading/error/empty states.
  - Ink-palette inline styles (no Tailwind), matching ModelsDashboard/SignalsDashboard.
- **DeepSeek** (`docs/research/deepseek-enrichment-prototype-2026-08-09.md`): key read from `DEEPSEEK_API_KEY` env (never hardcoded); model `deepseek-v4-flash`; A/B-verified prompt shape (json_object beats free-form 34% tokens / 38% latency; 20/call beats 10/call).

## Banking tab (วิกฤตแบงก์รัน) — added 2026-08-09, mirroring the reference /banking page

The Bond-crisis page gained a fifth sub-tab: a bank-run stress monitor —
gauge, funding rates, deposits, discount window, bank-stock prices and two
history charts.

- **Backend** (`backend/app/banking_service.py` + `backend/app/routers/banking.py`, prefix `/api/banking`):
  - **Gauge = the bank-run regime-model score** (user decision 2026-08-09) — no new computation; the gauge and the model card agree by construction. Zones 0-40/40-70/70-100 in the reference colors.
  - Funding cards (SOFR/EFFR/OBFR/SOFR-EFFR spread) and stat cards (deposits, discount window) come from `macro_service.build_dashboard()`'s shared 10-min cache — **never a second fetch** of the same series.
  - KRE / `^BKX` via yfinance `history(period="5d")` with one retry (Yahoo rate-limits when the cold dashboard pulls ~8 tickers at once); `BKX` bare is delisted in yfinance — the caret form is required (`docs/research/kre-bkx-price-source-2026-08-09.md`).
  - Deposit-flow WoW % series from DPSACBW027SBOG weekly history (55 points); SOFR-EFFR bps from SOFR/DFF daily history (60 points).
  - `GET /api/banking` + `POST /api/banking/refresh`, 10-min cache; missing series → `None` (renders "—"), never a fabricated 0.
- **Frontend** (`frontend/src/components/tools/BankingDashboard.tsx`, rendered as the วิกฤตแบงก์รัน sub-tab):
  - Hand-rolled SVG gauge (240° arc, zone colors, needle, value; "ข้อมูลเข้าไม่ครบ" badge on partial inputs; "ยังไม่มีข้อมูลดัชนี" placeholder when absent).
  - Four funding cards with the red(>20)/orange(>10)/emerald spread thresholds and change-bps lines; four stat cards (เงินฝากธนาคารรวม / Fed Discount Window with WoW %, KRE / BKX with 1D %).
  - Deposit-flow WoW bar chart (green/red bars) + SOFR-EFFR area chart (#38bdf8 gradient) — hand-rolled SVG, no new dependency.
  - Bank-run model card (score + status badge + concept + trade direction) reusing the models-tab visual language; refresh button + 5-min auto-refresh; "—" for missing values.

### FRED fix (2026-08-09) — this was breaking every FRED-backed series in Docker

FRED's CDN runs **TLS-fingerprint bot detection**: it serves only requests
whose User-Agent matches the client library's real fingerprint
(`python-httpx/0.27.2`). The app's custom `portfolio-tracker/1.0` UA — or
any browser UA — timed out from container egress IPs (while the host got
200), which is why the Docker-based dashboard had missing FRED series from
the very first version. Fix: `macro_service._fetch_fred_series` sends **no
custom headers** for FRED (every other source keeps its UA). `docker-compose`
stays on the default bridge network — `network_mode: host` is unreachable
from the Windows host on Docker Desktop.

## Countries tab (รายประเทศ) — added 2026-08-09, mirroring the reference /countries page

The Bond-crisis page gained a sixth sub-tab: a country-risk overview with
27 country cards (flag, Thai name, code · currency, risk badge, 0-100
score, 10Y yield, bps vs US, progress bar, 60-day sparkline, data-tier
note).

### Data sources

- **10Y yields** — FRED `IRLTLT01<CC>M156N` for 13 OECD countries (US JP GB
  CA AU CH KR MX ZA PL FR NO; RU exists but is stale at 2018-06 and flagged)
  + **worldgovernmentbonds.com scraped via Playwright** for the other 14
  (TH VN SG HK CN IN ID BR TR PH MY LA SA AE — the last three have no free
  source at all and render "—"). Chromium ships in the Docker image; the
  service locates it cross-platform (`_chromium_path()`).
- **Risk score** (user-confirmed 2026-08-09): `yield_level` (spread vs US,
  cap 25) + `yield_momentum` (1M bp ÷ 10, cap 10) + `fx_depreciation`
  (currency vs USD 3M, cap 24) + `data_freshness` (cap 5). Levels:
  ≥75 crisis-watch / ≥55 high / ≥30 medium / else low (the reference
  progress-bar bands).
- **bps vs US** = (country 10Y − US 10Y) × 100, hidden for US.
- **60-day trend** — recomputed from the stored FRED yield history (FRED
  countries); Playwright countries' trends accumulate in SQLite over time.
- **Currency depreciation** — Yahoo Finance `{ccy}=X` 3-month history.

### API

`GET /api/countries` (+ `POST /api/countries/refresh`) — 10-minute cache.
Payload: `countries[]` (code, name_th/en, currency, flag, data_tier,
data_tier_note_th, yield_value, yield_asof, yield_stale, chg_bp, score,
level, components, bps_vs_us, trend[]), `us_10y`, `updated_at`,
`data_sources`.

### Never-fabricate guarantees

- No yield source → `score: null` → renders "—" (LA, SA, AE).
- RU's 2018 FRED data is shown but flagged `yield_stale: true` + freshness
  component = 5.
- A Playwright page that fails one sweep is retried once, then left "—"
  until the next cache expiry.

### Coverage page (/countries/coverage)

**Ruled out of scope** — the reference coverage table tracks 9 data
channels per country (FX, 10Y, curve 2/5/30Y, CPI, policy rate, debt/GDP,
current account, reserves, ratings), most of which we have no free source
for (ratings are paid; debt/CA/reserves sources failed live probes:
World Bank indicator API 502, IMF 404). The header link is therefore not
rendered rather than dead-linking to a near-empty table.

## Further Notes

- The reference site gates its own "CME zones" card behind login; we are not replicating that (it needs their Supabase session).
- fredgraph.csv returns full history; the service reads only the tail (recent rows) — a few KB per series, so fetching all ten series on cache expiry is cheap.
