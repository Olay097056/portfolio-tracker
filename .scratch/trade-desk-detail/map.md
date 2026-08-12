# Map — Trade Desk Team Detail Page = Reference 100%

## Destination

หน้า detail ของทีม (`/trade-desk/DEEPSEEK`) — เหมือน reference (`/trade-desk/deepseek-g1`) 100%:
- **6 analysts** (มหภาค, เทรนด์, news, ควอนต์, สวนฝูง, เทคนิคอล — เพิ่มจาก 4)
- **MANDATE** (ลู่ทีม — กำหนดจากส่วนกลาง, ทีมแก้ไม่ได้)
- **ธรรมนูญทีม** (constitution — หัวหน้าเขียน/แก้, versioned)
- **Hit rate** ต่อ analyst (คำนวณอัตโนมัติ)
- **ประวัติประชุม** paginated (success/fail/reject, tokens, latency, type)
- **คำสั่งซื้อขาย** (LIMIT/STOP orders, expiry, status)
- **Peer review & coach** (หัวหน้าสั่งโค้ช+ปรับตัวตน, history)
- **Weekly/Monthly review** (Scorecard PnL/Sharpe/DD/PF/วินัย/ขัดมติ)
- **KB แยก** (บทเรียนขาดทุน + เพลย์บุ๊กกำไร)
- **Equity curve** SVG 30 วัน
- **Pending orders** table
- **Team chart** (ผังทีม — 6 analysts with roles, styles, prompts)

## Notes

- **Base**: ต่อจาก multi-agent-trade-desk (schema: TradeTeam/TradeTurn/TradePosition/TradeKnowledge)
- **Frontend**: NO Tailwind, inline style + shared INK palette
- **LLM**: deepseek-v4-flash via opencode-go
- **Tracker**: local-markdown (`.scratch/trade-desk-detail/`)

## Decisions so far

- [01 research detail page](issues/01-research-detail-page.md) — 12 sections (stats, MANDATE, constitution, weekly target, equity curve, open pos + pending orders, meeting history paginated, org chart 6 analysts, coach log, reviews, KB, ledger) · 82 i18n keys · new tables: constitutions, coach_log, pending_orders — deliverable `docs/research/trade-desk-detail-reference-2026-08-12.md`
- [02 task backend detail](issues/02-task-backend-detail.md) — 6 analysts (trend/tech/macro/contrarian/news/quant) · 3 new tables · GET /api/trade-desk/team/{code} · mandate/constitution/coach/pending orders · suite 538 — commit `ee0c27f`
- [03 task frontend detail](issues/03-task-frontend-detail.md) — TeamDetailPage (12 sections: stats, 6 analysts, positions, pending orders, paginated meetings, constitutions, coach log, KB loss/profit) · "ดูรายละเอียดทีม →" button · vitest 559 — commit `38636df`

## Status: ✅ CLOSED (2026-08-12) — 3/3 ใบปิดครบ · team detail page LIVE

## Not yet specified

- **Analyst scoring**: hit rate คำนวณยังไง? supervisor? หรือวิเคราะห์จาก closed positions?
- **MANDATE vs Constitution**: MANDATE มาจากไหน? ระบบกลาง? hardcoded?
- **Pending orders**: ต้องมี order book หรือ mock?
- **Review scorecard**: PnL/Sharpe/DD/PF คำนวณฝั่ง frontend หรือ backend?

## Out of scope

- 9 ทีม (1 ทีม deepseek — ตัดสินแล้วใน multi-agent-trade-desk)
- Telegram bot
