# 01 — Research: Dig reference team detail page

Type: research
Status: closed
Claimed: hermes/2026-08-12

## Answer

Deliverable: `docs/research/trade-desk-detail-reference-2026-08-12.md`

### Key findings (12 sections):
1. **Team stats**: equity, closed P&L, cash, margin, drawdown, win rate, R:R, PF, fees, tokens
2. **MANDATE (ลู่ทีม)**: central-mandated — immutable by lead (contrarian, trend, etc)
3. **Constitution (ธรรมนูญ)**: lead-written, versioned — rules like SL breakeven at ≥1%
4. **Weekly target**: $ directive set by lead
5. **Equity curve**: 30-day SVG
6. **Open positions** + **Pending orders** (LIMIT/STOP with expiry)
7. **Meeting history**: paginated (267 turns) — type (turn/wake), success/fail, seats, tokens
8. **Org chart (ผังทีม)**: **6 analysts** — macro/trend/news/quant/contrarian/technical — with hit rates, duty, style, "ดู prompt เต็ม"
9. **Coach log**: adjust_identity or coach_order, with delivery status
10. **Reviews**: weekly/monthly scorecards (PnL/Sharpe/DD/PF/discipline/dissent)
11. **KB**: loss lessons + profit playbook (separate from trade_knowledge?)
12. **Ledger**: transaction history

### New tables needed:
- `trade_constitutions` (versioning)
- `trade_coach_log` (coach + adjust)
- `trade_pending_orders` (LIMIT/STOP)
- Analyst scoring fields + MANDATE field on TradeTeam
