# 08 - Task: spec + ปิดแผน

Type: task
Status: closed
Claimed: hermes/2026-08-10
Blocked by: 01, 02, 03, 04, 05, 06, 07

## Question

ไม่มีอะไรให้ตัดสิน — เขียนเอกสารสรุปสิ่งที่สร้างจริง แล้วปิดแผน

## สิ่งที่ต้องทำ

### 1. Spec
`docs/specs/<วันที่>-trade-desk.md` — **เขียนตามโค้ดที่ ship จริง ไม่ใช่ตามที่ตั้งใจ**

บทเรียนบังคับ: spec ของแผน forecast-tab เขียนชื่อคีย์ผิดและสูตรผิดรวม 2 จุด เพราะลอกจาก decision แทนที่จะอ่านโค้ด — **เปิดไฟล์จริงอ่านทีละบรรทัดแล้วเขียนตามนั้น**

ต้องครบ: ขอบเขต (รวมข้อที่ตัดจากต้นฉบับ: 9 ทีม→2, ข้ามค่ายโมเดล→ข้ามกลยุทธ์) · ผังสองทีม + บุคลิก + กลไกตัดสินใจ · กติกาพอร์ตทั้งหมด (leverage/SL/TP/โควตา/สถานะทีม/รุ่น หรือระบุว่าตัดทิ้ง) · รายการสินทรัพย์ + แหล่งราคา + ความสด · schema ทุกตาราง · endpoints พร้อม request/response · **ต้นทุนจริงต่อเทิร์นจาก ticket 03 + ผลว่าสองทีมต่างกันจริงไหม** · UI + copy ไทย · กลยุทธ์เทสต์ · **หลักห้ามละเมิดทั้ง 5 ข้อ โดยเฉพาะ PAPER ONLY และกำแพงที่ออกแบบไว้ใน ticket 05** · ข้อจำกัดที่รู้ตัว (สองทีมจากโมเดลเดียวกันมีอคติร่วม)

### 2. ปิดแผน
- `## Decisions so far` ครบทุกใบ (ชื่อ + ลิงก์ + สรุปหนึ่งบรรทัด)
- เคลียร์ `## Not yet specified` — คลี่แล้วลบ ยังไม่ทำให้ย้ายไป Out of scope พร้อมเหตุผล
- บันทึกว่าแผนจบ

### 3. ตรวจสอบตัวเองก่อนปิด
- รัน backend + frontend test suite เต็ม รายงานเลขจริง
- `npx tsc -b` สะอาด
- **ยืนยันกำแพง PAPER ONLY ด้วยการตรวจจริง** — grep ทั้งโปรเจคหาไลบรารี exchange client / endpoint ที่ส่งคำสั่งได้ / คีย์ที่มีสิทธิ์เทรด แล้วรายงานผลว่าไม่มี
- ยืนยัน `trading_signals` ไม่ถูกแตะ (นับแถวก่อน/หลังรัน suite)
- ยืนยันเทสต์ไม่แตะ `portfolio.db` จริง

## เกณฑ์ว่าเสร็จ

อ่าน spec แล้วเข้าใจระบบได้ทั้งหมดโดยไม่ต้องเปิด ticket · ทุกสูตร/ชื่อคีย์ตรงกับโค้ดจริง · **กำแพง PAPER ONLY ถูกบันทึกไว้ชัดเจนพร้อมหลักฐานการตรวจ**

## Answer

**แผนปิด 2026-08-10** — spec as-built + map อัปเดต + self-check ครบ

### 1. Spec
`docs/specs/2026-08-10-trade-desk.md` — 10 หัวข้อ เขียนจากโค้ดที่ ship จริง (ชื่อตาราง/ฟังก์ชัน/constant อ้างจาก `trade_desk_service.py` จริง — ไม่ใช่จาก decision)

### 2. Self-check (เลขจริง)
- backend: **521 passed** (test_trade_desk 15) · frontend: **611 passed | 16 skipped** (74 files) · **tsc -b สะอาด** · hermes verify **ok**
- **กำแพง PAPER ONLY ตรวจจริง**: grep ทั้งโปรเจค — ไม่มี exchange client (hit ทั้งหมด = ชื่อหุ้น/ETF: SCHD/Robinhood/Charles Schwab Corp.) · ไม่มี place/create/send order · **.env มีแค่ FMP/FINNHUB/DEEPSEEK** (ไม่มีคีย์ exchange)
- `trading_signals` **12 → 12** · trade_teams 2→2 · positions 0→0 · boardroom_meetings 0→0 — เทสต์ไม่แตะ portfolio.db จริง (note: trade_teams=2 มาจาก seed ของ debug run ก่อนหน้า — seed_teams idempotent ปกติ)
- map.md: Decisions ครบ 8 ใบ + "แผนปิดแล้ว" + Not yet specified เคลียร์ (ย้ายที่ตัดไป Out of scope เดิม)

### 3. เกณฑ์สำเร็จ
- [x] Spec อ่านแล้วเข้าใจระบบได้โดยไม่ต้องเปิด ticket · ทุกชื่อตรงโค้ดจริง · กำแพง PAPER ONLY บันทึก + หลักฐานการตรวจ

**แผน trade-desk ปิดครบ 6/6 — รวม 3 แผนนี้ ship แล้ว (boardroom + boardroom-signals + trade-desk = 10 commits)**
