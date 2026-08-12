# 08 — Task: Frontend trade desk dashboard

Type: task
Status: closed
Claimed: hermes/2026-08-12
Blocked by: 07

## Answer

Frontend — commit `7fcb99b`

**TradeDeskDashboard**:
- Team card: equity/P&L/margin/cash + MTD/turns/cost/next turn
- Open positions: symbol/side/entry/size/SL/TP/live P&L/age
- Turn history: action/consensus/rationale/tokens/cost
- Market table: 200+ markets with category filter
- Manual trigger: "สั่งเทิร์นเอง" → POST /api/trade-desk/turn
- Inline style + INK palette

**Tests**: 4 passed · vitest **557** · tsc clean
