# 09 - Task: spec + ปิดแผน

Type: task
Status: closed
Claimed: hermes/2026-08-09
Blocked by: 01, 02, 03, 04, 05, 06, 07, 08, 10

## Question

ไม่มีอะไรให้ตัดสิน — เขียนเอกสารสรุปสิ่งที่สร้างจริง แล้วปิดแผน

## สิ่งที่ต้องทำ

### 1. Spec
`docs/specs/<วันที่>-boardroom.md` ตามฟอร์แมตของ `docs/specs/` ที่มีอยู่ — **เขียนตามของที่สร้างจริง ไม่ใช่ตามที่ตั้งใจจะสร้าง**

บทเรียนจากแผน forecast-tab: spec ที่นั่นเขียนสูตรผิด 2 จุดเพราะลอกจาก decision แทนที่จะอ่านโค้ดที่ ship จริง — **ticket นี้ต้องเปิดโค้ดจริงอ่านทีละไฟล์แล้วเขียนตามนั้น**

ต้องครบ: ขอบเขต (ทำ/ไม่ทำ) · ผังที่นั่ง+เฟส+turn plan · schema ทุกตาราง · endpoints ทุกตัวพร้อม request/response · กลไกตรวจสอบข้อกล่าวอ้าง · สมองส่วนกลาง+สถิติ (หรือระบุว่าตัดทิ้ง) · trigger (หรือระบุว่าตัดทิ้ง) · **ต้นทุนจริงต่อประชุมจาก ticket 03** · UI + copy ไทย · กลยุทธ์เทสต์ · หลักห้ามละเมิด · ข้อจำกัดที่รู้ตัว (correlated bias จากโมเดลเดียว)

### 2. ปิดแผน
- อัปเดต `## Decisions so far` ให้ครบทุกใบ (ชื่อ ticket + ลิงก์ + สรุปหนึ่งบรรทัด)
- เคลียร์ `## Not yet specified` — อะไรที่คลี่แล้วให้ลบออก อะไรที่ยังไม่ได้ทำให้ย้ายไป Out of scope พร้อมเหตุผล
- บันทึกว่าแผนจบแล้ว

### 3. ตรวจสอบตัวเองก่อนปิด
- รัน backend + frontend test suite เต็ม **รายงานเลขจริง**
- `npx tsc -b` ต้องสะอาด
- ยืนยันว่าเทสต์ไม่แตะ `portfolio.db` จริง (เทียบจำนวนแถวก่อน/หลังรัน — วิธีที่ใช้ตรวจตอนแก้ conftest เมื่อ 2026-08-09)

## เกณฑ์ว่าเสร็จ

อ่าน spec แล้วเข้าใจระบบได้ทั้งหมด**โดยไม่ต้องเปิด ticket สักใบ** และทุกสูตร/ชื่อคีย์ในนั้น**ตรงกับโค้ดที่ ship จริง**

## Answer

**แผนปิด 2026-08-09** — spec as-built + map อัปเดต + self-check ผ่าน

### 1. Spec
`docs/specs/2026-08-09-boardroom.md` — เขียนจากโค้ดที่ ship จริง (อ่าน `boardroom_service.py`/routers/frontend ทีละไฟล์ ไม่ลอกจาก decision — บทเรียน forecast-tab) ครบ 14 หัวข้อ: ขอบเขต · ที่นั่ง 7 · เฟส+turn plan · schema 8 ตาราง · endpoints 5+2 piggyback · กลไกตรวจ claims (tolerance จริงจากโค้ด) · สมองส่วนกลาง/สถิติ (decay จริง) · trigger (เกณฑ์จริง) · ต้นทุนจริง (ticket 03: เต็ม $0.021/สั้น $0.012–0.016) · UI+copy · กลยุทธ์เทสต์ · หลักห้ามละเมิด · ข้อจำกัด (correlated bias) · git history

### 2. ปิดแผน (`map.md`)
- `## Decisions so far` → ตารางครบทุกใบ (01–08, 10) + ลิงก์ + สรุปหนึ่งบรรทัด + 3 commits
- `## Not yet specified` → คลี่ครบ 3 ข้อ (วิจัยภายนอก / ระยะเวลาประชุม / กู้คืน) — backlog 5 รายการแยกชัด
- `## Out of scope` → + correlated bias (โมเดลเดียว) + ระบบสิทธิ์
- บันทึก "แผนปิดแล้ว 2026-08-09"

### 3. Self-check (เลขจริง — รันสด)
- `pytest tests/` → **494 passed** (0 failed)
- `vitest run` → **596 passed / 72 files** (16 skipped เดิม)
- `npx tsc -b` → **สะอาด (exit 0)**
- `hermes verify --json` → **ok: true** (docker build + readiness)
- **portfolio.db ไม่ถูกแตะ**: news_items 444→444 · model_score_history 1830→1830 · boardroom_meetings 0→0 (ก่อน/หลังรันเทสต์เต็ม)

### 4. บั๊กที่เจอระหว่าง self-check (แก้แล้ว — อยู่ในชุดนี้)
- `_meetings_today` เทียบ naive local midnight กับ created_at (aware UTC) → พลาดหลังเที่ยงคืน local (flaky) — แก้เป็น `local_midnight_utc()` (service + router) — เทสต์เต็มผ่าน 494

### เกณฑ์ว่าเสร็จ
✅ อ่าน spec แล้วเข้าใจระบบได้ทั้งหมดโดยไม่ต้องเปิด ticket · ✅ สูตร/ชื่อคีย์ทุกตัวตรงโค้ดที่ ship (re-read ระหว่างเขียน) · ✅ เทสต์เต็มผ่านเลขจริง · ✅ ไม่แตะ DB จริง

**⛔ ยังไม่ commit — รอ user ตรวจ spec + map ก่อน (กติกาข้อ 1 ของแผน)**
