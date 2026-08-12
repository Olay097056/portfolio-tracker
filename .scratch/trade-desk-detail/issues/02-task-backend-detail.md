# 02 — Task: Backend schema upgrade + detail API

Type: task
Status: closed
Claimed: hermes/2026-08-12
Blocked by: 01

## Answer

Backend upgraded — commit `ee0c27f`

**New fields on TradeTeam**: mandate, team_directive, gen, paused
**3 new tables**: TradeConstitution, TradeCoachLog, TradePendingOrder
**6 analysts** (was 4): +news, +quant — turn engine parallel 6
**Router**: GET /api/trade-desk/team/{code} — full detail (12 sections)
- Stats, mandate, 6 analysts, open/closed positions, pending orders
- Paginated meeting history, constitutions, coach log, KB loss/profit

**Prod verified**: 6 analysts, 2 turns, all new endpoints 200
