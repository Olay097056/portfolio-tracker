# Map — Trade Desk UI 100% Match (main page + team detail)

> ## ⛔ แผนนี้ถูกยกเลิก (2026-08-12) — ทั้ง 3 ใบปิดด้วยสถานะ superseded
>
> **อย่าหยิบไปทำต่อ** งานส่วนที่ยังถูกต้องถูกทำไปแล้วในแผน `reference-parity`
> (ใบ 07/08/09) ส่วนที่เหลือ user ตัดทิ้งหรือยังวัดไม่ได้
>
> - **"100%" ในชื่อแผนคือปัญหาเอง** — commit ที่ปิดใบ 03 ชื่อ "Trade Desk Main 100%"
>   แล้วลบโค้ดทิ้ง 250 บรรทัด (`3cf88fe`) จนหน้าทีมเทรดเหลือ 145 บรรทัด
>   ดู `.scratch/reference-parity/map.md` หัวข้อ "รากของปัญหา"
> - **Destination ด้านล่างขัดกับคำตัดสินของ user**: "9 team cards" · "competition chart" ·
>   "monthly ranking" · "open positions all teams" · org chart แบบมี hit rate + trust bars
>   → ทั้งหมดอยู่ใน Out of scope ตั้งแต่ user สั่ง "1 ทีมก็พอ เลิกคิดเรื่องแข่ง"
> - สภาพจริงตอนนี้: `TradeDeskDashboard.tsx` 259 บรรทัด · `TeamDetailPage.tsx` 240 บรรทัด
>   prod คืน `extended_stats` ครบแล้ว แต่ `closed_count = 0` — ยังไม่มีไม้ปิด สถิติจึงเป็น `None`
>
> ของที่ยังอยากได้จริงถูกย้ายไป backlog ของ `reference-parity` แล้ว

## Destination

Trade desk pages เหมือน reference 100%:
- **หน้า Main** (`/trade-desk`): 9 team cards, competition chart, monthly ranking, open positions all teams, market table with TA signals + TIER
- **หน้า Team Detail** (`/trade-desk/DEEPSEEK`): header stats 15 fields, equity chart 30d, MANDATE+constitution+weekly target, meeting history paginated with stats, org chart 6 analysts with hit rates+trust bars+full prompt, coach log with delivery, reviews scorecards, KB, ledger

## Notes

- **Frontend**: NO Tailwind, inline style + shared INK palette
- **Backend**: extend GET /api/trade-desk/team/{code} + GET /api/trade-desk/state with missing fields
- **Data**: 1 team (DEEPSEEK) — main page simplifies to 1-team view but with all reference data density
- **Tracker**: local-markdown (`.scratch/trade-desk-ui-100/`)

## Decisions so far

<!-- empty — new map -->

## Not yet specified

- TA signals algorithm (bull trend+12, golden cross+8...)
- TIER calculation (1/2/3)
- Trust bars / peer scoring algorithm
- Equity chart data resolution (daily snapshots?)

## Out of scope

- 9 teams (1 team DEEPSEEK ตัดสินแล้ว)
- Real Hyperliquid order execution
- Telegram bot
