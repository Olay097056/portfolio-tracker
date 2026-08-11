# 06 - Task: spec + ปิดแผน

Type: task
Status: closed
Claimed: hermes/2026-08-10
Blocked by: 01, 02, 03, 04, 05

## Question

ไม่มีอะไรให้ตัดสิน — เขียนเอกสารสรุปสิ่งที่สร้างจริง แล้วปิดแผน

## สิ่งที่ต้องทำ

### 1. Spec
`docs/specs/<วันที่>-boardroom-signals.md` — **เขียนตามโค้ดที่ ship จริง ไม่ใช่ตามที่ตั้งใจ**

บทเรียนบังคับ: spec ของแผน forecast-tab เขียนชื่อ ctx key ผิดและสูตรผิดรวม 2 จุด เพราะลอกจาก decision แทนที่จะอ่านโค้ด — **เปิดไฟล์จริงอ่านทีละบรรทัดแล้วเขียนตามนั้น** ทุกชื่อ field ทุกสูตร

ต้องครบ: ขอบเขต · โครงสร้างจุดยืน + schema ตาราง · สูตร P&L ทั้งสองกลุ่มพร้อมตัวอย่างคำนวณ · นิยาม "ถูกทาง" + กติกาครบกำหนด · จุดตรวจ +1/+3/+7 · รายการสินทรัพย์ที่รองรับ + แหล่งราคาต่อกลุ่ม + ความสด · endpoints พร้อม request/response · UI + copy ไทย · กลยุทธ์เทสต์ · **หลักห้ามละเมิด โดยเฉพาะข้อ "ห้ามเขียนลง `trading_signals`"** · ความสัมพันธ์กับแผน `boardroom` (มติมาจากไหน)

### 2. ปิดแผน
- `## Decisions so far` ครบทุกใบ (ชื่อ + ลิงก์ + สรุปหนึ่งบรรทัด)
- เคลียร์ `## Not yet specified` — คลี่แล้วลบ ยังไม่ทำให้ย้ายไป Out of scope พร้อมเหตุผล
- บันทึกว่าแผนจบ

### 3. ตรวจสอบตัวเองก่อนปิด
- รัน backend + frontend test suite เต็ม รายงานเลขจริง
- `npx tsc -b` สะอาด
- **ยืนยันด้วยการวัดจริงว่า `trading_signals` ไม่ถูกแตะ** — นับแถวก่อน/หลังรันทั้ง suite
- ยืนยันว่าเทสต์ไม่แตะ `portfolio.db` จริง (conftest ชี้ไป temp dir อยู่แล้ว)

## เกณฑ์ว่าเสร็จ

อ่าน spec แล้วเข้าใจระบบได้ทั้งหมดโดยไม่ต้องเปิด ticket และทุกสูตร/ชื่อคีย์ตรงกับโค้ดจริง

## Answer

**แผนปิด 2026-08-10** — spec as-built + map อัปเดต + self-check ผ่าน

### 1. Spec
`docs/specs/2026-08-10-boardroom-signals.md` — 10 หัวข้อ เขียนจากโค้ดที่ ship จริง (อ่าน `boardroom_stance_service.py`/router/dashboard ทีละบรรทัด — บทเรียน forecast-tab เรื่องลอกจาก decision): ขอบเขต · schema ตาราง (boardroom_stances + unresolved) · ladder resolve 5 ชั้น + ALIAS_MAP/MACRO_SERIES/classify_unit · สูตร P&L 2 กลุ่มพร้อมตัวอย่าง · push_line win/loss/push · state machine (pending/settled/awaiting/unresolved) · จุดตรวจ d1/d3/d7 · endpoint + payload keys · UI + copy ไทย · หลักห้ามละเมิด (แยกจาก trading_signals) · ความสัมพันธ์กับแผน boardroom · กลยุทธ์เทสต์ · ตัวเลขจริง · git history

### 2. ปิดแผน (`map.md`)
- `## Decisions so far` → ตารางครบ 6 ใบ + ลิงก์ + สรุป + 2 commits + spec link
- `## Not yet specified` → เคลียร์ 3 ข้อ (ตอบแล้วใน 01/02) → + `## Backlog` 4 รายการ (settlement job/quote_at/data-gaps/คริปโต) — ไม่ใช่ blocker
- บันทึก "แผนปิดแล้ว 2026-08-10"

### 3. Self-check (เลขจริง — รันสด)
- `pytest tests/` → **506 passed** (0 failed)
- `vitest run` → **603 passed / 73 files** (16 skipped เดิม)
- `npx tsc -b` → **สะอาด (exit 0)**
- **trading_signals ไม่ถูกแตะ (วัดจริง)**: 12 → 12 (ก่อน/หลังรัน suite เต็ม)
- **portfolio.db ไม่ถูกแตะ**: boardroom_stances 0→0 · boardroom_meetings 0→0

### เกณฑ์ว่าเสร็จ
✅ อ่าน spec แล้วเข้าใจระบบได้ทั้งหมดโดยไม่ต้องเปิด ticket · ✅ ทุกชื่อ field/สูตรตรงโค้ดที่ ship (re-read ระหว่างเขียน) · ✅ เทสต์เต็มผ่านเลขจริง · ✅ ยืนยันไม่แตะ trading_signals/portfolio.db ด้วยการวัด

**⛔ ยังไม่ commit — รอ user ตรวจ spec + map ก่อน (กติกาข้อ 1 ของแผน)**
