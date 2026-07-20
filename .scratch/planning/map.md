Label: wayfinder:map
Status: complete

Deliverable: [PRD.md](../../PRD.md) — assembled from the decisions below plus a post-completion reference sweep (see the last two entries in Decisions so far).

## Destination

A PRD/spec, ready to hand off to implementation, for a **personal (single-user) US stock/ETF portfolio-tracking web app**: record holdings (ticker, shares, average cost, target allocation %), compute average cost and rebalancing status, and show price charts with support/resistance overlays (auto-calculated defaults, manually editable). No brokerage integration, no trading, no multi-user auth — a personal analysis/tracking tool only.

Stack: FastAPI backend + React (Vite) frontend + TradingView Lightweight Charts for the price charts.

Reaching the end of this map means: every open decision needed to write that spec has been resolved, and nothing is left to decide before someone sits down and builds it.

## Notes

- Domain: personal finance / stock portfolio tracking.
- Skills to consult while resolving tickets: `/grilling`, `/domain-modeling`; `/prototype` for any "how should it look/behave" ticket.
- Reference products (feature/layout inspiration only — do not copy branding, logos, or wethaiinvest's proprietary admin-curated support/resistance numbers):
  - [wethaiinvest.com](https://wethaiinvest.com) — "ลงทุนหุ้นอเมริกา" membership dashboard. User is a paying member with full access rights. Its S/R levels are set by a human admin team, not purely algorithmic — this app has no admin team, so S/R must be auto-calculated by default with manual override (see Decisions so far).
  - [Google Finance beta](https://www.google.com/finance/beta?hl=th) — public, general layout reference (index strip, watchlist sidebar, AI research chat panel).
- Sibling project `lottery_stats/` (same machine) is the closest architectural precedent for "FastAPI + dark-themed dashboard," though this project uses React instead of vanilla JS/Chart.js.
- This map is plan-only: tickets resolve decisions for the spec. No app code gets written until the map is worked through and a spec is assembled from its resolved tickets.

## Decisions so far

- Destination scope (single-user, tracking-only, no brokerage integration, no login) — settled during the initial chart-the-map grilling; see Destination above.
- Tech stack: FastAPI + React (Vite) + TradingView Lightweight Charts — settled during the initial chart-the-map grilling; see Destination above.
- Portfolio data model: aggregate holding per ticker (shares, average cost, target allocation %) — no per-transaction/lot history — confirmed against the real "เพิ่มหุ้นใหม่" form on wethaiinvest.com.
- Support/resistance source: hybrid — auto-calculated default plus manual per-ticker override (matches the Freestyle/S/R/Trend controls seen on wethaiinvest.com).
- Rebalancing against a per-holding target allocation % is core to v1 (confirmed against the live wethaiinvest.com dashboard).
- Currency conversion (USD/THB) is in v1.
- AI-generated insights/news-chat are fog, not v1 (see Not yet specified).
- [โครงสร้างข้อมูล/schema พอร์ต](issues/03-portfolio-data-schema.md) — multiple portfolios supported (portfolio_id FK); Holding = {ticker, shares, avg_cost_usd, target_allocation_pct?}; separate WatchlistItem table (ticker + optional category, no shares/cost); persisted in SQLite via SQLAlchemy, not JSON.
- [เลือก API ราคาหุ้น](issues/01-price-data-api-research.md) — primary: yfinance (free, no key, best historical depth); fallback: Twelve Data (ToS-safe, 800 req/day free) if yfinance breaks or gets rate-limited. Alpha Vantage and Finnhub ruled out for this use case.
- [สูตรคำนวณแนวรับ-แนวต้านอัตโนมัติ](issues/02-sr-auto-calc-algorithm.md) — swing high/low (fractal) pivot detection + level clustering, timeframe-agnostic; first touch to a line marks that ticker/interval as user-edited and stops auto-recompute until the user resets it.
- [เกณฑ์แจ้งเตือน rebalancing](issues/04-rebalancing-alert-logic.md) — default ±5pp threshold (configurable), green/yellow/red bands on the existing progress bar, no push notifications — just per-holding color + a dashboard-level "N holdings need rebalancing" summary.
- [ระบบแปลงสกุลเงิน USD/THB](issues/05-currency-conversion.md) — free FX API (daily cache) with manual-override fallback; THB/USD toggle only at portfolio-summary level, per-holding numbers stay USD.
- [Prototype หน้า dashboard หลัก](issues/06-dashboard-main-prototype.md) — 3 variants built and reviewed; chose **Variant A** (fixed 3-column trading-terminal layout: holdings/watchlist sidebar, center chart with S/R overlay, manage-holding + DCA calculator sidebar). Reference mockup: `prototype-06-dashboard/index.html?variant=A`. Later extended (post-completion) to a two-page shell — Dashboard + Portfolios — see below.
- **Post-completion reference sweep** (after all 6 tickets resolved, before final PRD hand-off): a follow-up walkthrough of wethaiinvest.com's live flows surfaced 5 features not covered by the original tickets, described in our own words and folded into v1 scope: portfolio-level target allocation % (in addition to per-holding), cash balance per portfolio, realized/locked P&L (manual cumulative field, no lot tracking), a stress-test calculator (-5%/-10%/-20% price-drop scenarios), and a simple/precise UI density toggle. All 5 are now in [PRD.md](../../PRD.md) sections 2/4/7/10. AI-generated per-stock analysis was also observed on wethaiinvest.com but deliberately **not** added — it remains fog (see Not yet specified) and its content was never reproduced.
- **Prototype extended**: `prototype-06-dashboard/index.html` (Variant A) now has a top nav with Dashboard/Portfolios tabs — Portfolios page shows a multi-portfolio list (donut chart, target-vs-current allocation badge, cash/unrealized/realized, inline edit panel) per the additions above.

## Not yet specified

- AI-generated insights / chat-style Q&A over the portfolio or market news (which LLM, what budget, what triggers it) — deferred out of v1, but in scope for later.
- Market news feed / index-strip summary (à la Google Finance's front page) — in scope eventually, but the news data source isn't chosen yet.
- Importing buy transactions from a broker export / CSV — format varies per broker; which broker(s) to support first isn't decided. Manual entry is the confirmed v1 path (see ticket 03 and the confirmed form).

## Out of scope

- Multi-user accounts / login system — this is a single-user personal tool.
- Real trading / brokerage order execution — tracking and analysis only, never sends orders.
- "ดูพอร์ตแอดมิน" (view admin portfolio) — a wethaiinvest.com membership-specific feature with no equivalent in a single-user personal tool.
