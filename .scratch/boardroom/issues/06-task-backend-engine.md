# 06 - Task: เครื่องยนต์ประชุม + schema + endpoints (เขียนโค้ดจริง)

Type: task
Status: closed
Claimed: hermes/2026-08-09
Blocked by: 02, 03, 04

## Question

ไม่มีอะไรให้ตัดสินแล้ว — ticket นี้สร้างเครื่องยนต์ตามที่ ticket 02/03/04 ตัดสินไว้

## ⚠️ ticket นี้เขียนโค้ดจริง — อ่านกติกาก่อน

แผนนี้ **carries execution** (user ตัดสิน 2026-08-09) แต่มีเงื่อนไข:

1. **หยุดให้ user ตรวจก่อน commit** — เขียนเสร็จ รันเทสต์ รายงานผล **แล้วรอ** ห้าม commit เอง
2. รันเทสต์จริงแล้วรายงานเลขจริง — ห้ามอ้างเลขที่ไม่ได้รัน
3. ถ้าระหว่างทางพบว่า decision จาก ticket ก่อนหน้าใช้ไม่ได้จริง **ให้หยุดถาม** อย่าตัดสินใจแทนแล้วเดินต่อ

## สิ่งที่ต้องสร้าง

### 1. Schema (SQLite ใน `portfolio.db`)
ตาราง `boardroom_meetings` มิเรอร์ต้นฉบับ: `id, status, phase, current_turn, turn_plan, agenda, trigger_type, resolution_md, resolution_json, claim_until, llm_calls, tokens_in, tokens_out, error, created_at, updated_at, ended_at` + ตารางเทิร์น (บทสนทนารายเทิร์น: ที่นั่ง, เฟส, ข้อความ, tokens) + ตารางข้อกล่าวอ้าง/ผลตรวจ (จาก ticket 04)

**ระวัง**: `app/main.py` lifespan ใช้ `Base.metadata.create_all` ซึ่ง**ไม่ alter ตารางที่มีอยู่แล้ว** — ถ้าต้องเพิ่มคอลัมน์ทีหลังต้องเขียน migration แบบ `PRAGMA table_info` + `ALTER TABLE` เองเหมือนที่ทำกับ `trading_signals.sparkline`

### 2. เครื่องยนต์ (`backend/app/boardroom_service.py`)
- state machine 7 เฟสตาม turn plan จาก ticket 02
- เรียก DeepSeek ผ่าน pattern ที่มีอยู่ (`news_service._call_deepseek` / `country_ai_service`) — reuse ไม่เขียนใหม่
- **นับ `llm_calls / tokens_in / tokens_out` ทุกคอล** (หลักห้ามละเมิดข้อ 4)
- **เพดานความปลอดภัยตาม ticket 02** — ตัดเมื่อเกินคอล/เวลาที่กำหนด เขียน `error` แล้วจบสถานะ `failed`
- ตรวจสอบข้อกล่าวอ้างตาม ticket 04 (โค้ดตรวจ ไม่ใช่ LLM ตรวจ ถ้า ticket 04 ตัดสินแบบนั้น)
- กู้คืน: `claim_until` + resume ตามที่ ticket 01 พบว่าต้นฉบับทำ

### 3. Endpoints (`backend/app/routers/boardroom.py`)
- `POST /api/boardroom/meetings` — เปิดประชุม (รับ agenda + trigger_type)
- `GET /api/boardroom/meetings` — รายการ (สด + ย้อนหลัง)
- `GET /api/boardroom/meetings/{id}` — รายละเอียด + บทสนทนา + มติ
- `POST /api/boardroom/meetings/{id}/resume` — ประชุมต่อ
- ต่อ router ใน `app/main.py`

### 4. เทสต์ (`backend/tests/test_boardroom.py`)
- DeepSeek ถูก stub เสมอ — **ห้ามให้เทสต์ยิง API จริง**
- state machine เดินครบ 7 เฟสแล้วจบที่ `completed`
- เพดานความปลอดภัยตัดจริงเมื่อเกิน
- ข้อกล่าวอ้างที่ตัวเลขไม่ตรงข้อมูลจริง → ติดป้าย "ขัดกับข้อมูลจริง"
- นับ tokens ถูกต้อง
- ประชุมล้มกลางคัน → resume แล้วเดินต่อจากเฟสเดิม
- **`conftest.py` ชี้ DB ไป temp dir อยู่แล้ว** (แก้ไว้ 2026-08-09) — อย่าเขียนเทสต์ที่แตะ `portfolio.db` จริง

## Answer

**สร้างเสร็จ + เทสต์ผ่านจริง (2026-08-09) — ยังไม่ commit รอ user ตรวจตามกติกาแผน**

### ไฟล์ที่สร้าง (production code — backend/)
| ไฟล์ | เนื้อหา |
|---|---|
| `backend/app/boardroom_service.py` | ORM 7 ตาราง (meetings/messages/claims/seats/memory/knowledge/seat_stats) + เครื่องยนต์ 7 เฟส (advance ทีละเทิร์น — resume ได้) + ตรวจ claims ด้วยโค้ด (ticket 04) + memory decay/ท้าทายซ้ำ (ticket 05) + เพดาน + นับ llm_calls/tokens ทุกคอล |
| `backend/app/routers/boardroom.py` | 4 endpoints: POST/GET /meetings, GET /meetings/{id}, POST /{id}/resume — เปิดประชุมรัน background thread |
| `backend/app/main.py` | + router (create_all สร้างตารางใหม่ให้อัตโนมัติ — ไม่ต้อง ALTER) |
| `backend/tests/conftest.py` | + import boardroom_service (ลงทะเบียนตารางกับ temp DB) |
| `backend/tests/test_boardroom.py` | 11 เทสต์ — **DeepSeek stub 100% ไม่ยิง API จริง** |

### เลขเทสต์จริง (รันสด 2026-08-09)
- `pytest tests/test_boardroom.py` → **11 passed**
- `pytest tests/` (ทั้ง suite) → **481 passed** (470 เดิม + 11 ใหม่)
- `hermes verify --json` → **ok: true** (docker compose build exit 0 + readiness http://127.0.0.1:8000 ready)

### เทสต์ครอบคลุม (ตามที่ ticket กำหนด)
1. ✅ ประชุมเต็ม 23 คอลจบ `completed` (contested → debate r2 วิ่ง + มี data request → evidence/external_data แทรก) — resolution_md/json เก็บ, memory จาก proven, seat stats อัปเดต
2. ✅ ตรวจ claims ด้วยโค้ด: level ±2%/±5% · change ±20%/±50% (floor 5bp) · direction · คะแนนโมเดล ±1 · opinion/no_data → unverifiable
3. ✅ เพดานคอลตัดจริง (CAP_MAX_CALLS=2 → failed + error "เกินเพดาน")
4. ✅ นับ tokens ตรง (meeting.tokens_in == ผลรวม messages)
5. ✅ ล้มกลางคัน → resume → เดินต่อจาก turn เดิมจบ completed
6. ✅ unanimous → ข้าม debate r2 (skip turn, 18 คอล ไม่มีข้อความ debate_r2)
7. ✅ โหมดสั้นไม่มีเฟส research
8. ✅ endpoints ผ่าน TestClient (201/200/404/409) — seats 7 ตัว seeded

### หมายเหตุ design ที่ implementation ตัดสินเอง (อิง ticket 02/04/05)
- mode เดิมทีละเทิร์น (`advance()`) แทนลูปใหญ่ — เทสต์ง่าย + resume ต่อตรง turn — กลไก `claim_until` ยังมีใน schema (กัน 2 กระบวนการชนกัน)
- เฟส evidence/external_data แทรกเข้า turn_plan เฉพาะเมื่อมี `ขอข้อมูล:` (เหมือน prototype วัดไว้)
- resolution สั่ง JSON ล้วน (ไม่ใช่ md+JSON ปน) — parse แม่นกว่า prototype
- prompt มีกติกา "(สมมติ)" กำกับฉากทัศน์ (คำตัดสิน ticket 03)

**ส่งต่อ:** 07 (frontend) ได้ endpoint/schema ครบ · 08 (auto-triggers) ได้ `trigger_type` + mode field + เพดานรายวันชัด

**⛔ ยังไม่ commit — รอ user ตรวจโค้ดก่อน (กติกาข้อ 1 ของแผน)**
