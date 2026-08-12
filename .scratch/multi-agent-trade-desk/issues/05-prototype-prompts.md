# 05 — Prototype: Multi-agent prompt design

Type: prototype
Status: closed
Claimed: hermes/2026-08-12
Blocked by: 01

## Answer

Prototype ทดสอบด้วย LLM จริง — 2 runs สำเร็จ (script: `prototype-05/prototype_meeting.py`)

### Results:
- 4 analysts (trend/tech/macro/contrarian) + lead → complete meeting cycle
- Run 1: bearish consensus → **SHORT BTC-USD**
- Run 2: split opinion (trend/macro bearish vs contrarian bullish) → **HOLD** — "รอหลักฐานแรก...งดเทรดช่วงข่าว" — ฉลาด! ตรงกับ reference (Claude team: "เชื่อสัญญาณเตือน จึงไม่เพิ่มไม้")
- Cost: **$0.0010/turn** (~$0.14/day for 144 turns) — cheaper than reference's $5-7/day

### Deliverable: `prototype-05/README.md` (full analysis + next steps)
### Issues: technical analyst JSON parsing ~50% fail (need stricter format)
### Production recommendations: parallelize 4 analysts, add KB retrieval
