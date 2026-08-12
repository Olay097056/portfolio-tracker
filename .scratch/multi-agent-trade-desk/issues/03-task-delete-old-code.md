# 03 — Task: Delete existing trade desk + office 3D code

Type: task
Status: closed
Claimed: hermes/2026-08-11

## Answer

ของเก่าลบหมดแล้ว — commit `2586883`

**ลบแล้ว**:
- Backend: trade_desk_service.py, trade_desk router, main.py import/include, jobs.py subsystem, test_jobs references, conftest import
- Frontend: TradeDeskDashboard + .test.tsx, OfficeDashboard, OfficeLearnSettings.test.tsx (office section), BondCrisisPage tabs (trade-desk + office), client.ts API methods + types, types.ts 6 interfaces

**Tests**: pytest 523 passed (19 removed) · vitest 553 passed (11 removed) · tsc clean · verify ok
**Prod**: all 7 endpoints 200, `/api/trade-desk/state` 404 ✓
