# 10 - Task: Trigger Engine — เปิดประชุมอัตโนมัติ (ข่าวแรง + โมเดลขยับ)

Type: task
Status: closed
Claimed: hermes/2026-08-09
Blocked by: 08

## Question

Implement เกณฑ์ trigger ที่ ticket 08 ตัดสินไว้ — ระบบเปิดประชุมเองเมื่อมีข่าวแรง (impact ≥ 70) หรือโมเดลขยับ (ข้ามเกณฑ์ 40/60 หรือ delta ≥ 8 จุด/6 ชม.) — กันเปิดรัวด้วยเพดาน/cooldown/dedupe และแสดง "ชนเพดาน" ให้เห็น

## ⚠️ ticket นี้เขียนโค้ดจริง — กติกาเดียวกับ ticket 06

หยุดให้ user ตรวจก่อน commit · รันเทสต์จริงรายงานเลขจริง · ติดขัดให้หยุดถาม

## สิ่งที่ต้องสร้าง (spec จาก ticket 08)

### 1. Schema เพิ่ม (backend/app/boardroom_service.py)
- `boardroom_meetings` + คอลัมน์ `trigger_key` (String, nullable — ตารางยังไม่มี production data แก้ได้ตรงๆ)
- ตารางใหม่ `boardroom_trigger_log`: id, checked_at, trigger_type (news/model/manual), reason, skipped (bool), skip_reason, meeting_id (nullable)

### 2. `check_triggers(db)` — ฟังก์ชันเดียว กันซ้ำ
- **ข่าว** (ตามข้อ 2): `news_items` impact ≥ 70 · published_at ใน 24 ชม. · รวมข่าวในกรอบ 6 ชม. = 1 ประชุม · วาระจากข่าว top + related_models
- **โมเดล** (ตามข้อ 3): `model_score_history` 2 แถวล่าสุดของแต่ละ model (ห่าง ≤ 6 ชม.) — ข้ามเกณฑ์ 40/60 (ขึ้น/ลง) หรือ delta ≥ 8 จุด
- **dedupe** (ข้อ 7): trigger_key `news:<title_th ปกติ>` / `model:<model_id>:<40|60>` — ข้ามถ้ามีประชุม key เดียวกันจบภายใน 6 ชม.
- **เพดาน** (ข้อ 6): daily_cap 6/วัน (นับรวม manual+auto, นับตามวันท้องถิ่น) · cooldown 60 นาทีจากประชุมล่าสุด (auto เท่านั้น)
- ทุกการตรวจ (เปิด/ข้าม) → เขียน `boardroom_trigger_log`
- เปิดประชุม mode=**short** (ประชุมสั้นตาม ticket 02 — trigger อัตโนมัติไม่ต้องวิจัยภายนอก)

### 3. Endpoints (backend/app/routers/boardroom.py)
- `POST /api/boardroom/triggers/check` → `{checked_at, triggered: bool, meeting_id?, reason?, skipped?}`
- `GET /api/boardroom/meetings` response + `today_meetings` (จำนวนวันนี้) + `trigger_log_today` (รายการข้ามวันนี้) — หน้า 07 ใช้แสดงแถบ "ชนเพดาน"

### 4. จุดเรียก piggyback (ข้อ 5)
- `GET /api/boardroom/meetings` — เรียก check_triggers (กับ cooldown guard 10 นาที)
- หลัง news refresh (`routers/news.py` POST /refresh) — เรียก check_triggers
- หลัง `/api/models` — เรียก check_triggers (ถ้าทำได้ไม่รบกวน — หรือข้ามจุดนี้ได้ถ้า news + meetings ครอบคลุม)

### 5. copy (จาก ticket 08)
- empty state 07: `"ยังไม่มีการประชุม — ระบบจะเปิดวาระเองเมื่อมีข่าวแรง หรือตัวเลขโมเดลขยับ"` (ตัด "ข่าวแดง")

## เทสต์ (`backend/tests/test_boardroom_triggers.py`)
- DeepSeek stub เสมอ — ห้ามยิง API จริง
- ข่าว impact ≥ 70 → เปิดประชุม mode short + agenda จากข่าว top
- ข่าว impact < 70 → ไม่เปิด + log skipped
- โมเดลข้ามเกณฑ์ 40/60 → เปิด · delta ≥ 8 จุดไม่ข้ามเกณฑ์ → เปิด
- dedupe: ข่าวเดิมซ้ำภายใน 6 ชม. → ข้าม (log skip_reason)
- daily_cap 6 → ข้าม + log · cooldown 60 นาที → ข้าม
- trigger_log เขียนทุกครั้ง · GET /meetings คืน today_meetings + trigger_log_today

## Answer

**สร้างเสร็จ + เทสต์ผ่านจริง (2026-08-09) — ยังไม่ commit รอ user ตรวจตามกติกาแผน**

### ไฟล์ที่สร้าง/แก้ (backend เท่านั้น — ห้ามแตะ frontend ตามกติกาใบ)
| ไฟล์ | เนื้อหา |
|---|---|
| `backend/app/boardroom_service.py` | + `BoardroomTriggerLog` (ตาราง log การประเมิน) + `BoardroomMeeting.trigger_key` (dedupe) + `check_triggers()` + เกณฑ์ทั้งหมดจาก ticket 08 (impact≥70 / 24ชม. / batch 6ชม. / ข้ามเกณฑ์ 40-60 / Δ≥8 จุด / dedupe 6ชม. / daily 6 / cooldown 60 / rate-limit 10 นาที) |
| `backend/app/routers/boardroom.py` | + `POST /triggers/check` (ปุ่มตรวจตอนนี้) + `GET /meetings` คืน `today_meetings` + `trigger_log_today` + piggyback check_triggers บน GET /meetings |
| `backend/app/routers/news.py` | piggyback: หลัง POST /refresh → check_triggers |
| `backend/app/routers/models.py` | piggyback: หลัง POST /refresh → check_triggers |
| `backend/tests/test_boardroom_triggers.py` (ใหม่) | 13 เทสต์ — **stub FRED/thread/DeepSeek 100%** |

### เลขเทสต์จริง (รันสด 2026-08-09)
- `pytest tests/test_boardroom_triggers.py` → **13 passed**
- `pytest tests/` (ทั้ง suite) → **494 passed** (481 เดิม + 13 ใหม่ — ไม่หักงานเดิม)
- `hermes verify --json` → **ok: true** (docker compose build + readiness)

### ครอบคลุมตาม ticket
1. ✅ ข่าว impact ≥ 70 → ประชุม **mode=short** + agenda จากข่าว top + trigger_key ตั้ง
2. ✅ ข่าว impact < 70 → ข้าม (log no_candidate)
3. ✅ batch: ข่าวที่เคยประเมินแล้ว (log ใหม่กว่า published_at) → ไม่เปิดซ้ำ
4. ✅ โมเดลข้ามเกณฑ์ 40/60 → เปิด (key `model:<id>:40`) · Δ≥8 ไม่ข้าม → เปิด (key `model:<id>:delta`)
5. ✅ history เกินกรอบ 6 ชม. → ข้าม · โมเดลนิ่ง → ข้าม
6. ✅ dedupe: trigger_key ซ้ำภายใน 6 ชม. → ข้าม (log duplicate)
7. ✅ daily_cap 6 → ข้าม (log daily_cap) · cooldown 60 นาที → ข้าม (log cooldown)
8. ✅ rate-limit 10 นาที → ข้ามโดยไม่เขียน log
9. ✅ `POST /triggers/check` คืน shape ถูก · `GET /meetings` มี today_meetings + trigger_log_today

### หมายเหตุ design (ตัดสินเอง — อิง ticket 08)
- **Batch logic**: "ข่าวใหม่ที่ยังไม่เคยถูกประเมิน" = เทียบ `last trigger log.checked_at` กับ `published_at` — แทนการเทียบ age 6 ชม. ล้วน (กันพลาดตอนแอปปิดนานแล้วเปิดใหม่ — ข่าว 8 ชม.ที่แล้วยังเปิดได้ถ้ายังไม่เคยประเมิน) — batch 6 ชม. ทำงานผ่านกลไกนี้
- `trigger_type` ของ log ข่าว/โมเดลแยกกัน — หน้า UI รู้ว่าข้ามเพราะอะไร
- piggyback ปิด `try/except` — trigger ล้มไม่ทำให้หน้า news/models พัง
- **แถบ "ชนเพดาน" ใน UI**: ข้อมูลพร้อม (trigger_log_today) แต่**ยังไม่ทำ frontend** — ตามกติกาใบนี้ห้ามแตะ frontend → ต่อยอดในใบ UI ใบถัดไป

**ส่งต่อ:** ticket 09 (spec+close) เหลือ blocker 07 (✅ ปิดแล้ว) — 09 ปลดล็อกหมดแล้วยกเว้น review/commit ของใบนี้

**⛔ ยังไม่ commit — รอ user ตรวจโค้ดก่อน (กติกาข้อ 1 ของแผน)**
