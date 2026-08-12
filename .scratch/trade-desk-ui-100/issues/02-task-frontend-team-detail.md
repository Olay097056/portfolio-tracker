# 02 — Task: Frontend — Team Detail 100% match

Type: task
Status: closed (superseded)
Claimed:
Blocked by: 01

## Answer — ปิดเพราะตกยุค (2026-08-12) ไม่ใช่เพราะทำเสร็จ

ใบนี้สั่ง "match reference **100%**" ซึ่ง map ของ reference-parity ห้ามไว้ตรงๆ:
*"ห้ามเขียนคำว่า 100% เว้นแต่มี checklist ที่ user เซ็นครบรองรับ"* — เพราะนิยาม "100%" แบบไม่มีคนเซ็น
คือสิ่งที่ทำให้ `TradeDeskDashboard.tsx` หดจาก 376 เหลือ 145 บรรทัดโดยเทสต์ผ่านหมด

จาก 14 ส่วนที่ขอ:
- **มีแล้ว**: directive + แก้ไข · equity chart · open positions · pending orders · meeting history ·
  ผังทีม + **"ดู prompt เต็ม"** (`expandedPrompt` บรรทัด 27, `analyst_prompts` บรรทัด 160-162) ·
  constitution · coach log · KB
- **user ตัดแล้ว**: org chart แบบมี `hit_rate%` + trust bars + "ประวัติ & คะแนน" (ใบ 05 → ทีหลัง) ·
  Reviews scorecard แบบมี **rank/composite** (กลไกแข่งขัน — Out of scope) · Ledger (ทีหลัง)
- **วัดไม่ได้ตอนนี้**: Max DD (peak→trough+dates) · Fees/Tokens/LLM calls/Wakes — `closed_count = 0`
**หลักฐานสภาพจริง (ตรวจ 2026-08-12 หลังใบ 07/08/09 ของ reference-parity)**
- `TradeDeskDashboard.tsx` 259 บรรทัด · `TeamDetailPage.tsx` 240 บรรทัด
- prod `/api/trade-desk/team/DEEPSEEK` คืน `extended_stats` ครบ: `win_rate · win_count · loss_count · avg_win · avg_loss · rr_ratio · profit_factor · net_pnl · closed_count · reserved_margin`
- endpoint ที่ใบ 01 ขอ มีแล้ว: `GET /team/{code}/equity` · `POST /team/{code}/directive` · `POST /team/{code}/master`
- แต่ `closed_count = 0` — **ยังไม่มีไม้ปิดสักไม้** สถิติทุกตัวจึงเป็น `None`

**ห้ามเปิดใบนี้ใหม่โดยไม่อ่าน `.scratch/reference-parity/map.md` หัวข้อ "รากของปัญหา" ก่อน**

## Question

Rewrite TeamDetailPage to match reference 100% (14 sections):

1. **Header**: team name + status + gen + lead model + analyst count + next turn + Force Turn/Pause/Resume buttons
2. **Weekly Target**: directive text + "ตั้งเมื่อ X" + edit/save/clear
3. **Stats Cards** (2 rows × 4 cards each): Equity/P&L, Closed P&L ($X / N ไม้ / กำไรสุทธิ), Cash/Margin/Reserved, Live P&L, Max DD (peak→trough+dates), Win Rate (W/L), Avg R:R (win avg $ / loss avg $), Profit Factor, Fees/Tokens/LLM calls/Wakes
4. **Equity Chart**: SVG 30-day area chart with time toggle
5. **MANDATE**: styled section — central-mandated, read-only
6. **Constitution**: lead-written rules + version date
7. **Open Positions**: full table — entry/mark/margin/P&L/SL/TP/LIQ/age
8. **Pending Orders**: type/target/size/reserved/expiry/status
9. **Meeting History**: paginated — type (turn/wake), success/fail/reject counts, seats, tokens, latency, errors
10. **Org Chart (6 analysts)**: hit_rate% + eval count, trust bars, "ตั้งโดยหัวหน้า", duty, style, "แก้ไขล่าสุด", "ดู prompt เต็ม" expandable, "ประวัติ & คะแนน" link
11. **Coach Log**: ปรับตัวตน/สั่งโค้ช + ✓ delivery + detail
12. **Reviews**: weekly/monthly scorecards — rank, composite, PnL/Sharpe/DD/PF/วินัย
13. **KB**: loss lessons + profit playbook (2-col)
14. **Ledger**: transaction history

Deliverable: rewrite `TeamDetailPage.tsx` + test · update types/client
