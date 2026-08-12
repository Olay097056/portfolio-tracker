# 03 — Task: Frontend team detail page

Type: task
Status: closed
Claimed: hermes/2026-08-12
Blocked by: 02

## Answer

Frontend — commit `38636df`

**TeamDetailPage** (12 sections):
- Header stats: equity, P&L, closed/live P&L, cash, margin, turns, cost
- 6 analyst cards (trend/tech/macro/contrarian/news/quant) with prompt preview
- Open positions table, pending orders
- Paginated meeting history (page nav)
- Constitutions, coach log
- KB: loss lessons + profit playbook (side by side)
- "ดูรายละเอียดทีม →" button in TradeDeskDashboard
- All collapsible, inline style + INK palette

**Tests**: vitest **559** · tsc clean
