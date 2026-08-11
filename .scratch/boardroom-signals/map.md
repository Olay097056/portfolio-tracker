# Map — สัญญาณจากที่ประชุม (/boardroom/signals) สำหรับ Bond-crisis

## Destination

สร้าง sub-tab **"สัญญาณที่ประชุม"** ที่มิเรอร์หน้า `/boardroom/signals` ของต้นฉบับ: รวม **จุดยืนรายสินทรัพย์จากทุกมติที่ประชุม** มาแสดงเป็นสัญญาณที่ติดตามผลได้จริง — ราคาปัจจุบัน, P&L สด, นับถอยหลังจนครบกำหนด, จุดตรวจระหว่างทาง +1/+3/+7 วัน, และสถิติอัตราถูกทาง

**⚠️ แผนที่นี้แบกงานเขียนโค้ดด้วย (carries execution)** — ticket ชนิด `task` เขียนโค้ดจริงและ commit ได้ กติกาเดียวกับแผนพี่น้อง:
1. เขียนโค้ดได้เฉพาะ ticket `Type: task` — `research`/`grilling` ห้ามแตะโค้ด production
2. **หยุดให้ user ตรวจก่อน commit** ทุกครั้ง
3. ห้ามอ้างเลขเทสต์ที่ไม่ได้รันจริง

## Notes

- **Tracker: local markdown** — `issues/NN-*.md`, หัวไฟล์ `Type:` / `Status:` / `Claimed:` / `Blocked by:` / `Waiting on:` — **frontier** = `Status: open` + `Blocked by` ปิดหมด + **ไม่มี `Waiting on` ที่ยังค้าง**
- **แผนพี่น้องที่เดินขนานกัน**: `.scratch/boardroom/map.md` (ห้องประชุม — **เจ้าของเครื่องยนต์และรูปร่าง `resolution_json`**) และ `.scratch/trade-desk/map.md` (ทีมเทรด)
- **⚠️ Cross-map dependency ที่ต้องรู้ตั้งแต่แรก**: แผนนี้กินผลจากมติที่ประชุม ซึ่งเป็นของแผน `boardroom` — **research และออกแบบ UI เดินขนานได้เต็มที่ ติดแค่ตอน implement backend** ticket ที่ติดจะเขียน `Waiting on: boardroom/01` (รูปร่าง `resolution_json`) หรือ `Waiting on: boardroom/06` (เครื่องยนต์ที่ผลิตมติจริง)
- Domain: full-stack (FastAPI + React 19/Vite, **ไม่มี Tailwind**, Thai-first)
- ควร consult: `backend/app/signals_service.py` + `frontend/src/components/tools/SignalsDashboard.tsx` (**tab "สัญญาณเทรด" ที่มีอยู่แล้ว** — หน้านี้คล้ายกันมากแต่คนละแหล่งที่มา ต้องไม่สับสนกัน), `backend/app/price_service.py`

**ข้อเท็จจริงที่ตรวจแล้ว (2026-08-09) — อย่าขุดซ้ำ:**

- **ไม่ต้อง login** — chunk เปิดสาธารณะ: `/_next/static/chunks/app/boardroom/signals/page-74bc82dedeac55aa.js` (**28,633 B** — ใหญ่กว่าหน้าห้องประชุมเองเกือบ 4 เท่า) · copy ไทยใน `/_next/static/chunks/3474-e1aec38ee927d485.js` ค้นคีย์ `brSig*`
- ตารางที่หน้านี้อ่านของต้นฉบับ: `boardroom_meetings`, `market_prices`, `macro_series`
- คำโปรย: *"รวมจุดยืนทุกมติ — ราคาปัจจุบัน · P&L สด · นับถอยหลังจนครบกำหนด"*
- **สองแท็บ**: กำลังนับถอยหลัง / สรุปแล้ว
- **สถิติ**: อัตราถูกทาง · P&L สดเฉลี่ย · P&L สด (ยังไม่ปิด) · P&L สรุปแล้ว · *"รวมแบบน้ำหนักเท่ากันทุกสัญญาณ"*
- **แบ่งสองกลุ่มเพราะหน่วยต่างกัน**: **กลุ่มราคา (%)** — *"ETF · ดัชนี · ทอง/น้ำมัน · FX — P&L คิดเป็น % จากราคาเข้า"* และ **กลุ่ม Yield / สเปรด (bp)** — ทิศทางเป็น "ยีลด์" / "สเปรด"
- **จุดตรวจระหว่างทาง +1/+3/+7 วัน** — *"สรุปผลจุดตรวจระหว่างทาง (+1/+3/+7 วัน)"*, มี fallback *"จุดตรวจ +3วัน:"*, ยังไม่ถึงเวลาแสดง *"ยังไม่ถึงเวลา"*
- **ระบุชัดว่าไม่ใช่การเทรดจริง**: *"มุมมอง (ไม่เข้าบัญชี)"*
- empty state: *"ยังไม่มีสัญญาณครบกำหนดตัดสิน — ผลจุดตรวจระหว่างทางดูได้บนการ์ดและสรุปด้านล่าง"* + *"คิวแรกครบกำหนด"*

**หลักการที่ห้ามละเมิด:**
1. **ไม่แต่งตัวเลข** — ไม่มีข้อมูล → "—"
2. **ห้ามปนกับ tab "สัญญาณเทรด" เดิม** — สัญญาณจากที่ประชุมต้อง**ไม่**เขียนลงตาราง `trading_signals` เด็ดขาด (จะทำให้สถิติ win rate ของ tab เดิมเพี้ยน) เป็นกฎเดียวกับที่ tab จำลองสถานการณ์ยึดไว้
3. **ไม่ใช่คำแนะนำการลงทุน** — ต้นฉบับเขียนเองว่า "มุมมอง (ไม่เข้าบัญชี)" เราต้องชัดกว่านั้นหรือเท่ากัน
4. **สถิติต้องซื่อสัตย์ตอนข้อมูลน้อย** — ห้ามโชว์ 1/1 = 100% (บทเรียนจากแผน investor-upgrades)

## Decisions so far

**แผนปิดแล้ว 2026-08-10** — ทุก ticket resolve · shipped ใน 2 commits (`44f0b2b` backend, `a0d0848` frontend) · spec as-built: `docs/specs/2026-08-10-boardroom-signals.md`

| Ticket | สรุป |
|---|---|
| 01 research | ขุดหน้า /boardroom/signals — 10 ข้อครบ (ใช้ chunk เดิมจาก dig แผน boardroom + โหลดเพิ่ม 3 chunk) → `docs/research/boardroom-signals-page-2026-08-10.md` — เจอ module 18551 ($p/j$/m$) + 26079 (IQ=DD) + ตรวจข้อมูลจริงของ reference (user อนุญาต 2026-08-10): 24 สินทรัพย์/333 stances, stance schema จริงมี unit/due_at/qualified |
| 02 grilling | "ถูกทาง" = เกิน push_line `(bp?4:.5)×√(days/3)` (win/loss/push) · จุดตรวจ/ settlement คำนวณ on-read จากประวัติ (ไม่มี scheduler) · ครบกำหนด = ended_at + horizon_days (clamp 1–90) · ระบบตัดสินเอง · ราคาดึงไม่ได้แยก 2 กรณี (รอสรุปผล/ตรวจไม่ได้) · สถิติ cold-start n<10 ไม่โชว์ % · ขัดกันข้ามมติ = เก็บทั้งคู่ |
| 03 grilling | โหมดเปิดอิสระ (soft-open) + ladder 5 ชั้น + re-resolve อัตโนมัติ · alias map ~68 ตัว (ตัดหุ้นไทยตาม user) · ป้ายความสด (bp = ราคารายวัน) · คริปโตได้ฟรีผ่าน yfinance · ทิศทาง = เดิมพัน series ตรงๆ + field unit (validate กันกลับทิศ) · หน่วยแยกกลุ่ม %/bp ไม่แปลงข้าม |
| 04 task | backend: `boardroom_stance_service.py` (ตาราง boardroom_stances + unresolved, resolver, P&L, settlement on-read, stats cold-start) + `GET /api/boardroom/stances` + engine hook (resolution prompt + unit/due_at/qualified + materialize) + 12 เทสต์ (stub 100%) — **แยกจาก trading_signals เด็ดขาด** |
| 05 task | frontend: `BoardroomSignalsDashboard.tsx` sub-tab (สถิติ/แท็บ/กลุ่ม/การ์ด/มุมมอง/จุดตรวจ/track record/empty/cold-start/disclaimer) + "ไปที่ประชุม" focus handoff + 7 เทสต์ |
| 06 task | spec as-built + ปิดแผน (ใบนี้) |

## Not yet specified

<!-- เคลียร์แล้ว — ทั้ง 3 ข้อตอบใน ticket 01/02 แล้ว -->

- ~~ราคาสำหรับกลุ่ม yield/สเปรดมาจากไหน~~ → macro_service (FRED รายวัน) + ป้าย "ราคารายวัน" — ตัดสินใน 02/03
- ~~สัญญาณครบกำหนดแล้วใครตัดสิน~~ → ระบบตัดสินเอง on-read — ตัดสินใน 02
- ~~จุดยืนขัดกันข้ามมติ~~ → เก็บทั้งคู่ วัดผลอิสระ (ตามต้นฉบับ) — ตัดสินใน 02

## Backlog (ไม่ใช่ blocker)

- **settlement job รอบเช้า ~07:00 + แจ้งเตือน** (ต้นฉบับมี — เราคำนวณ on-read แทน) — ต้องมี scheduler
- **ป้ายความสดระดับ quote_at** สำหรับกลุ่ม pct (backend ยังไม่ส่ง quote_at)
- **หน้ากรีดข้อมูล (data gaps)** สำหรับ unresolved assets
- **คริปโตผ่านแหล่งเฉพาะ** (ปัจจุบันได้ฟรีผ่าน yfinance search — BTC-USD/ETH-USD)

## Out of scope

- **หน้า `/boardroom` เอง** — แผน `.scratch/boardroom/map.md`
- **หน้า `/trade-desk`** — แผน `.scratch/trade-desk/map.md`
- **การส่งคำสั่งซื้อขายจริง** — หน้านี้เป็น "มุมมอง (ไม่เข้าบัญชี)" ตามต้นฉบับ และเป็นกฎความปลอดภัยของเราด้วย
- **แจ้งเตือน Telegram**
