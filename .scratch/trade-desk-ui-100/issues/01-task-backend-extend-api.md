# 01 — Task: Backend — extend API with all missing fields

Type: task
Status: closed (superseded)
Claimed: hermes/2026-08-12

## Answer — ปิดเพราะตกยุค (2026-08-12) ไม่ใช่เพราะทำเสร็จ

แบ่งสิ่งที่ใบนี้ขอได้ 3 กอง ไม่มีกองไหนที่ควรลงมือตอนนี้

**กอง 1 — มีแล้ว** (ทำโดย reference-parity 07/08/09)
`equity` endpoint · `directive` · `master` toggle · weekly/monthly reviews (`trade_summaries`) ·
`extended_stats` ทั้งบล็อก (`_compute_team_stats` — `routers/trade_desk.py:135`)

**กอง 2 — user ตัดทิ้งแล้ว**
`hit_rate_pct` · `trust_score` · `trust_history` · `peer_scores[]` → ใบ 05 ของ reference-parity
ตัดสิน "ทีหลัง — รอไม้ปิดจริง นิยาม hit ยังไม่ชัด" · scorecard จัดอันดับ + peer review เป็นกลไก
ของระบบหลายทีมแข่งกัน ซึ่งอยู่ใน Out of scope ตั้งแต่ "1 ทีมก็พอ เลิกคิดเรื่องแข่ง"
→ **ทำใบนี้ = เอาของที่ user ตัดไปแล้วกลับมา**

**กอง 3 — ยังไม่มีจริง แต่วัดไม่ได้**
`max_drawdown` + `max_drawdown_dates` · `total_fees` · `total_tokens` / `total_llm_calls` ·
per-turn `latency_s` / `success_count` / `fail_count` / `reject_count`
ทุกตัวคำนวณจากไม้ที่ปิดแล้ว → ย้ายเข้า backlog ของ reference-parity ที่เขียนไว้แล้วว่า "รอไม้ปิดจริง"
**หลักฐานสภาพจริง (ตรวจ 2026-08-12 หลังใบ 07/08/09 ของ reference-parity)**
- `TradeDeskDashboard.tsx` 259 บรรทัด · `TeamDetailPage.tsx` 240 บรรทัด
- prod `/api/trade-desk/team/DEEPSEEK` คืน `extended_stats` ครบ: `win_rate · win_count · loss_count · avg_win · avg_loss · rr_ratio · profit_factor · net_pnl · closed_count · reserved_margin`
- endpoint ที่ใบ 01 ขอ มีแล้ว: `GET /team/{code}/equity` · `POST /team/{code}/directive` · `POST /team/{code}/master`
- แต่ `closed_count = 0` — **ยังไม่มีไม้ปิดสักไม้** สถิติทุกตัวจึงเป็น `None`

**ห้ามเปิดใบนี้ใหม่โดยไม่อ่าน `.scratch/reference-parity/map.md` หัวข้อ "รากของปัญหา" ก่อน**

## Question

Extend GET /api/trade-desk/team/{code} + GET /api/trade-desk/state with ALL fields the reference UI needs:

**Team stats**: win_rate, win_count, loss_count, avg_win, avg_loss, rr_ratio, profit_factor, max_drawdown, max_drawdown_dates, total_fees, total_tokens, total_llm_calls, wakes_today, closed_count, net_pnl, reserved_margin

**Analyst scoring**: per-analyst hit_rate_pct, hit_evaluations, trust_score, trust_history (last N evals), peer_scores[] (from peer review)

**Equity snapshots**: GET /api/trade-desk/team/{code}/equity?days=30 → [{date, equity}] — for SVG chart

**Meeting history extend**: per-turn — type (turn/wake), success_count, fail_count, reject_count, seats_total, seats_participated, latency_s, error (nullable)

**Weekly directive**: CRUD — POST/PUT/DELETE /api/trade-desk/team/{code}/directive

**Coach log extend**: delivered status update endpoint

**Reviews**: compute or store weekly/monthly scorecards — GET /api/trade-desk/team/{code}/reviews

Deliverable: updated trade_desk_service, router, tests, Supabase migration
