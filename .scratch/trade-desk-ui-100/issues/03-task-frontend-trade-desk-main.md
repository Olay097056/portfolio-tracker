# 03 — Task: Frontend — Trade Desk Main 100% match

Type: task
Status: closed (superseded)
Claimed:
Blocked by: 01

## Answer — ปิดเพราะตกยุค (2026-08-12) ไม่ใช่เพราะทำเสร็จ

**ใบนี้คือใบที่ก่อปัญหาโดยตรง** — commit ที่ปิดใบนี้ชื่อ "Trade Desk Main 100%" และลบโค้ดทิ้ง 250 บรรทัด
(`3cf88fe`) จนหน้าทีมเทรดเหลือ 145 บรรทัด บางที่สุดในโปรเจค ทั้งที่ต้นฉบับหน้านี้ซับซ้อนที่สุด
บันทึกไว้ในหัวข้อ "รากของปัญหา" ของ `.scratch/reference-parity/map.md`

สิ่งที่ใบนี้ขอ ขัดกับคำตัดสินที่ตามมาทีหลังหลายข้อ:
- **"rank badge"** → ใบ 03 ของ reference-parity **เอาป้าย `#1` ออกไปแล้ว** (1 ทีม ไม่แข่ง) · grep `#1` ตอนนี้ = 0
- **"Open Positions All Teams"** + คอลัมน์ทีม · **"Competition Chart"** → กลไกหลายทีม Out of scope
- **"9 ทีม AI"** ในหัวข้อ → เหลือทีมเดียว

ส่วนที่เหลือและยังถูกต้อง **ทำไปแล้วทั้งหมด**: MTD (ใบ 03 — คำนวณจาก `trade_snapshots` จริง) ·
turn stats จริงแทน `✗0 ⏳0` ฮาร์ดโค้ด (ใบ 03) · โควตา `เทิร์นวันนี้ {turns_today}/4` + countdown
(`NextTurnCountdown` บรรทัด 109-110) · equity chart · pending orders · master switch · การ์ดสรุป
รายวัน/รายเดือน (บรรทัด 159-160)

เหลือที่ยังไม่มีจริง: TA signals column + TIER column ในตารางตลาด — ไม่เคยผ่านการตัดสินของ user
→ ย้ายเข้า backlog ไม่ใช่ทำเลย
**หลักฐานสภาพจริง (ตรวจ 2026-08-12 หลังใบ 07/08/09 ของ reference-parity)**
- `TradeDeskDashboard.tsx` 259 บรรทัด · `TeamDetailPage.tsx` 240 บรรทัด
- prod `/api/trade-desk/team/DEEPSEEK` คืน `extended_stats` ครบ: `win_rate · win_count · loss_count · avg_win · avg_loss · rr_ratio · profit_factor · net_pnl · closed_count · reserved_margin`
- endpoint ที่ใบ 01 ขอ มีแล้ว: `GET /team/{code}/equity` · `POST /team/{code}/directive` · `POST /team/{code}/master`
- แต่ `closed_count = 0` — **ยังไม่มีไม้ปิดสักไม้** สถิติทุกตัวจึงเป็น `None`

**ห้ามเปิดใบนี้ใหม่โดยไม่อ่าน `.scratch/reference-parity/map.md` หัวข้อ "รากของปัญหา" ก่อน**

## Question

Rewrite TradeDeskDashboard main page to match reference 100%:

1. **Header**: "ห้องเทรดจำลอง 9 ทีม AI..." → adapted to "1 ทีม AI (DeepSeek)" — same layout
2. **Team Card** (full detail): rank badge, team name+status, equity chart mini-sparkline, P&L%, margin/cash, **MTD** (current vs 5-20%) + **Weekly** (current vs target), **turn stats** (✓wins ✗losses ⏳pending 📌flagged), next turn countdown with live timer
3. **Open Positions All Teams**: table with team column, entry/mark/margin/P&L/SL/TP/LIQ/age
4. **Available Markets** (122 → 200+): category tabs (คริปโต/หุ้น/MACRO/FX) with count (20/40 style), **TA signals column** (bull trend+12, golden cross+8 icons + scores), **TIER column** (1/2/3)
5. **Competition Chart** (simplified for 1 team): equity sparkline
6. **Turn stats summary**: total calls, cost today

Deliverable: rewrite `TradeDeskDashboard.tsx` + test · update types/client
