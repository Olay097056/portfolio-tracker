# Map — Trade Desk Multi-Agent + Office 3D = Reference 100%

## Destination

ทีมเทรดที่ทำงานด้วย **Multi-Agent AI จริง** — 1 ทีม deepseek (LLM จริงตัวเดียว) แต่ภายในทีมมี: **หัวหน้าทีม** (lead — เคาะออเดอร์+ประเมิน+ปรับธรรมนูญ) + **ลูกทีม** (2-4 analyst seats — วิเคราะห์ตามเลนส์ที่ได้รับมอบหมาย) · ประชุมตามวาระ (meeting agenda) · Peer review/ให้คะแนน · หัวหน้าปรับ prompt ลูกทีมที่คะแนนน้อย · **Knowledge base** (คลังกลาง: ไม้ขาดทุน / คลังทีม: ไม้กำไร) · AI แก้ SL/TP อัตโนมัติ · Weekly KPI · Equity curve สะท้อนพฤติกรรมที่เรียนรู้

**ข้อมูล**: ทั้งทีมใช้ข้อมูล bond-crisis ชุดเดียวกัน (macro/models/signals/news/sentiment) — แต่ "ธรรมนูญทีม" (constitution) กำหนดเลนส์/กลยุทธ์/กฎการเทรดที่ต่างกัน → สัญญาณเทรดต่างกัน

**LLM**: deepseek-v4-flash ผ่าน opencode-go — ตัวเดียว สวมหลาย persona (lead + 4 seats = 5 persona ต่อทีม)

**ออฟฟิศ 3D**: GLB/GLTF assets — สะท้อนระบบ multi-agent จริง (11 แผนก ห้องประชุม โต๊ะเทรด + ข้อมูลงานระบบจริง)

เหมือน reference (bond-crisis-dashboard-v2.vercel.app) **100% — frontend + backend + พฤติกรรม LLM จริง**

## Notes

- **ของเก่าต้องลบก่อน** (trade desk backend/frontend + office 3D ปัจจุบัน) → เริ่มใหม่ทั้งหมด
- **LLM**: deepseek-v4-flash ผ่าน opencode-go gateway (`opencode.ai/zen/go/v1/chat/completions`) — ตัวเดียว แต่สวมหลาย persona (หัวหน้า + ลูกทีม 2-4 seats)
- **Dig reference**: ใช้ `.scratch/overview-dig/` + dig ใหม่เฉพาะ trade desk module + office 3D module
- **Reference preview**: user login `oxyggn2@gmail.com` ใน Hermes preview — ใช้ `open_preview` + `read_preview`
- **HITL**: prototype multi-agent flow ให้ user ดูและอนุมัติก่อน build จริง
- **Office 3D**: Three.js 0.185 (มีอยู่แล้ว) — หา free GLB/GLTF assets (Sketchfab/Poly Pizza)
- **Tracker**: local-markdown (`.scratch/multi-agent-trade-desk/`)

## Decisions so far

- [01 research trade desk architecture](issues/01-research-trade-desk-architecture.md) — 9 ทีม 9 LLM (OpenRouter) · multi-agent: lead + 4 analysts (trend/tech/macro/contrarian) · 12 context types · 122 ตลาด Hyperliquid · edge fn trade-admin (RLS) · KB แยกทีม/กลาง · autonomous SL/TP · token ~$0.0004/turn — deliverable `docs/research/multi-agent-trade-desk-reference-2026-08-11.md`
- [02 research office 3D architecture](issues/02-research-office-3d-architecture.md) — React Three Fiber + OrbitControls · 13 แผนก · character system (board/staff, states: idle/meeting/speaking) · state model (pipeline+teams+meeting) · interaction model (orbit/zoom/pan/click/dblclick/Esc) · UI overlay (cards/news ticker/job runs/queue) — deliverable `docs/research/office-3d-reference-2026-08-11.md`

## Not yet specified

- **Peer review mechanism**: analyst scoring ยังไง? metric?
- **Constitution auto-adjustment**: lead ปรับ prompt ลูกทีมยังไง? เก็บ version?
- **Office 3D**: ยังไม่ dig (ใบ 02 open)

## Out of scope

- 9 ทีม LLM จริงหลาย provider (มี deepseek ตัวเดียว — honest)
- Telegram bot (ตัดไปแล้วใน bond-crisis-100 ใบ 09)
