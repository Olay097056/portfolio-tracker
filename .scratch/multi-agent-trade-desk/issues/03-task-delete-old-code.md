# 03 — Task: Delete existing trade desk + office 3D code

Type: task
Status: open
Claimed: hermes/2026-08-11

## Question

ลบของเก่าทั้งหมดก่อนเริ่มใหม่ — clean slate:

**Backend**:
- `backend/app/trade_desk_service.py` — ลบทั้งหมด
- `backend/app/routers/trade_desk.py` — ลบทั้งหมด (เหลือ shell endpoint placeholder?)
- DB tables: `trade_teams`, `trade_turns`, `trade_positions`, `trade_knowledge` (ถ้ามี) — drop/recreate?
- `backend/tests/test_trade_desk.py` — ลบ/rewrite placeholder

**Frontend**:
- `frontend/src/components/tools/TradeDeskDashboard.tsx` — ลบ
- `frontend/src/components/tools/TradeDeskDashboard.test.tsx` — ลบ
- `frontend/src/components/tools/OfficeDashboard.tsx` — ลบ
- `frontend/src/components/tools/OfficeLearnSettings.test.tsx` — ลบ office tests

**Cleanup**:
- Remove tab entries from `BondCrisisPage.tsx` (trade-desk + office tabs)
- Remove client API methods (`getTradeDesk`, `getJobStatus` — keep job status for future?)
- Remove types

Deliverable: working tree สะอาด — team trade-desk/office tabs no longer accessible; no broken imports; tests still pass on remaining code
