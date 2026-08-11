# 04 - Task: backend สัญญาณจากที่ประชุม (เขียนโค้ดจริง)

Type: task
Status: closed
Claimed: hermes/2026-08-10
Blocked by: 02, 03
Waiting on: boardroom/01 (รูปร่าง `resolution_json`) · boardroom/06 (เครื่องยนต์ที่ผลิตมติจริง)

## Question

ไม่มีอะไรให้ตัดสิน — สร้าง backend ตามที่ ticket 02/03 ตัดสินไว้

## ⚠️ ticket นี้เขียนโค้ดจริง

หยุดให้ user ตรวจก่อน commit · รันเทสต์จริงรายงานเลขจริง · ติดขัดให้หยุดถาม

**`Waiting on` คืออะไร**: ticket นี้อ่านมติจากแผน `boardroom` ถ้าเครื่องยนต์ที่นั่นยังไม่เสร็จ จะไม่มีมติจริงให้ทดสอบ — **ทำได้เร็วสุดคือรอ `boardroom/01` (รู้รูปร่าง `resolution_json`) แล้วเขียนโดย stub มติไว้ก่อน** แต่ต้องไม่ปิด ticket จนกว่าจะต่อกับของจริงจาก `boardroom/06` ได้

## สิ่งที่ต้องสร้าง

### 1. Schema
ตารางสัญญาณจากที่ประชุม — **แยกจาก `trading_signals` เด็ดขาด** (หลักห้ามละเมิดข้อ 2 ของแผน) ตั้งชื่อให้ต่างชัด เช่น `boardroom_stances`

field ที่ต้องมี: อ้างอิงมติต้นทาง, สินทรัพย์, กลุ่ม (pct/bp), ทิศทาง, ราคา/ค่าเข้า, วันที่เริ่ม, กำหนดครบ, สถานะ (นับถอยหลัง/สรุปแล้ว), ผลตัดสิน, ผลจุดตรวจ +1/+3/+7

### 2. Service (`backend/app/boardroom_stance_service.py`)
- อ่านจุดยืนออกจาก `resolution_json` ของมติ (รูปร่างจาก `boardroom/01`)
- ดึงราคาปัจจุบันตามกลุ่ม (ticket 03) — **reuse `price_service` / `macro_service` ที่มีอยู่ อย่าเขียน fetcher ใหม่**
- คำนวณ P&L สองสูตรตามกลุ่ม (ticket 01/03)
- จุดตรวจ +1/+3/+7 จากราคาย้อนหลัง (ticket 02)
- สถิติ — **ดูก่อนว่า reuse `signals_service.compute_stats` ได้ไหม** ถ้า reuse ระวังเคสหารศูนย์ที่เคยทำ endpoint 500 มาแล้ว (ดู `signals_service.py:559` และคอมเมนต์ที่นั่น)

### 3. Endpoints (`backend/app/routers/boardroom_signals.py`)
- `GET /api/boardroom/stances` — รายการ + สถิติ (สองแท็บ: นับถอยหลัง / สรุปแล้ว)
- ต่อ router ใน `app/main.py`

### 4. เทสต์
- ราคาถูก stub เสมอ — ห้ามยิง yfinance/FRED จริงในเทสต์
- P&L ทั้งสองกลุ่มคำนวณถูก (รวมเคสทิศทางกลับ)
- จุดตรวจที่ยังไม่ถึงเวลา → "ยังไม่ถึงเวลา" ไม่ใช่ 0
- ครบกำหนดแล้วตัดสินถูกตามเกณฑ์ ticket 02
- **ยืนยันว่าไม่มีแถวไหนถูกเขียนลง `trading_signals`** (เทียบจำนวนแถวก่อน/หลัง — วิธีเดียวกับที่ `test_forecast_simulate.py` ใช้)
- สถิติตอนข้อมูลน้อยไม่โชว์ 100% หลอกตา
- สินทรัพย์ที่ดึงราคาไม่ได้ → "—" ไม่ใช่ 0

## Answer

**สร้างเสร็จ + เทสต์ผ่านจริง (2026-08-10) — ยังไม่ commit รอ user ตรวจตามกติกาแผน**

### ไฟล์ที่สร้าง/แก้ (backend เท่านั้น)
| ไฟล์ | เนื้อหา |
|---|---|
| `backend/app/boardroom_stance_service.py` (ใหม่) | `BoardroomStance` + `BoardroomUnresolvedAsset` (ตารางแยกจาก trading_signals) · alias map ~68 ตัว · **ladder resolve** (alias→FRED/system→yfinance search→unresolved log) · unit classifier (regex yield + spread set ตาม reference) · P&L 2 กลุ่ม (bp/pct ×direction) · push_line win/loss/push · จุดตรวจ d1/d3/d7 + settlement **on-read จากประวัติ** · DD (max adverse excursion) · สถิติ cold-start (n<10 → ไม่โชว์ %) · re-resolve อัตโนมัติ (แคป 10/ครั้ง) |
| `backend/app/routers/boardroom_signals.py` (ใหม่) | `GET /api/boardroom/stances` → {stances, stats} |
| `backend/app/boardroom_service.py` (แก้) | resolution prompt + `unit`/`due_at`/`qualified` (กติกา soft-open) · `_after_resolution` เรียก `materialize_stances` (try/except — สัญญาณล้มไม่ทำให้ประชุม fail) |
| `backend/app/main.py` (แก้) | + router |
| `backend/tests/conftest.py` (แก้) | + import boardroom_stance_service (ลงทะเบียนตาราง) |
| `backend/tests/test_boardroom_stances.py` (ใหม่) | 12 เทสต์ — **stub ราคา/FRED/LLM 100% ไม่ยิง network จริง** |

### เลขเทสต์จริง (รันสด 2026-08-10)
- `pytest tests/test_boardroom_stances.py` → **12 passed**
- `pytest tests/` (ทั้ง suite) → **506 passed** (494 เดิม + 12 ใหม่)
- `hermes verify --json` → **ok: true**

### ครอบคลุมตาม ticket
1. ✅ Schema `boardroom_stances` แยกจาก `trading_signals` — **test_no_write_to_trading_signals**: COUNT ก่อน/หลังเท่ากัน
2. ✅ Resolver: alias (gold→XAUUSD, US10Y→us10y) · unknown → `boardroom_unresolved_assets` + re-resolve
3. ✅ P&L สองกลุ่ม (yield ×100 bp / price %) + ทิศทางกลับ (short ได้กำไรเมื่อลง)
4. ✅ จุดตรวจยังไม่ถึงเวลา → `correct=None` (ไม่ใช่ 0 — ไม่เดา)
5. ✅ ครบกำหนด → win/loss/push ตาม push_line `(bp?4:.5)×√(days/3)` · ราคาดึงไม่ได้ → awaiting
6. ✅ unit AI เขียนผิด (US10Y=pct) → ใช้ derived (bp) + flag `unit_mismatch` · horizon 365 → clamp 90
7. ✅ qualified default = conf≥60 (มุมมอง semantics brSigViewsDesc) · due_at = ended_at + horizon_days
8. ✅ สถิติ cold-start: n<10 → `win_rate=None` + `cold_start=true` (ห้าม 100% หลอกตา) · checks summary judged<10 → ไม่โชว์ %
9. ✅ endpoint `GET /api/boardroom/stances` ผ่าน TestClient

### หมายเหตุ design (ตัดสินเอง — อิง ticket 02/03)
- settlement/checks **คำนวณสดทุก read** (deterministic จากประวัติ — ไม่มี storage ไม่มี scheduler) — ตาม ticket 02 ข้อ 2 (ก)
- ราคากลุ่ม bp ใช้ `macro_service.build_dashboard()` (FRED รายวัน cache 10 นาที) · กลุ่ม pct ใช้ `price_service.get_price` + `_yf_candles` (reuse — ไม่เขียน fetcher ใหม่)
- `materialize_stances` กันล้ม (rollback) — ประชุมไม่ fail เพราะสัญญาณ
- re-resolve แก้เฉพาะ stance ที่ `price_key IS NULL` (ยังไม่ due — ยังนับผลได้)

**ส่งต่อ:** ticket 05 (frontend) ได้ payload ครบ (stances + stats + track record + checks summary + cold-start flags)

**⛔ ยังไม่ commit — รอ user ตรวจโค้ดก่อน (กติกาข้อ 1 ของแผน)**
