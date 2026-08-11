# 07 - Task: แก้ dead read — FRED history ไม่เคยถูกส่งต่อ

Type: task
Status: closed
Claimed: hermes/2026-08-10
Blocked by: —

## บั๊ก (ตรวจแล้ว 2026-08-10 — ห้ามตรวจซ้ำ)

`_macro_data()["history"]` + `build_snapshot()["macro_history"]` ว่างถาวร:
- `build_dashboard()` items ไม่มีคีย์ `rows`/`history` (ยืนยันสด: 66 items — คีย์ =
  available/change_pct/change_val/name_en/name_th/recorded_at/series_id/trend/unit/value)
- `_macro_data()` (boardroom_stance_service:231) และ `build_snapshot()`
  (boardroom_service:514) อ่าน `it.get("rows") or it.get("history")` → None เสมอ
- ผล: bp-group stances (yield/spread) settle ไม่ได้ (due-passed → "รอสรุปผล" ถาวร)
  + จุดตรวจ d1/d3/d7 ว่าง + claims แนวโน้มย้อนหลังใน boardroom unverifiable

## แหล่งข้อมูลที่มีอยู่แล้ว

- `macro_service._fetch_fred_series(series_id)` — ~270 แถว เรียงเก่า→ใหม่
- `macro_service._fetch_fred_series_map(ids)` — ดึงขนาน

## ข้อบังคับ

1. **ห้ามแก้ build_dashboard** ให้ใส่ rows ลง items — สัญญานั้นใช้ร่วม 6 โมดูลที่ ship แล้ว
   → `_macro_data()` ดึงประวัติแยกของตัวเอง
2. **ต้องมี cache** — ตัดสิน: ดึงเฉพาะซีรีส์ที่ถูกอ้างถึงจริง vs ดึงทั้งหมดแล้ว cache —
   เสนอ user เลือกพร้อมตัวเลขเวลาที่วัดจริง
3. อัปเดต stub ในเทสต์ให้มี history จริง + เพิ่มเทสต์: bp stance เลยกำหนด settle ได้จริง ·
   จุดตรวจ d1/d3/d7 มีค่าจริง · claim แนวโน้มย้อนหลังใน boardroom verify ได้
4. แก้ `docs/specs/2026-08-10-boardroom-signals.md` ที่สัญญา FRED history ไว้
5. หยุดให้ user ตรวจก่อน commit
6. **ห้ามแตะบั๊ก bp ใน trade_desk_service** — แก้ไปแล้ว (ใช้ `_macro_data()` เหมือนกัน
   จะได้ประโยชน์จากการแก้นี้เอง)

## Answer

**แก้เสร็จ + เทสต์ผ่านจริง (2026-08-10) — ยังไม่ commit รอ user ตรวจตามกติกาแผน**

### สิ่งที่แก้ (4 ไฟล์ production + 3 ไฟล์เทสต์ + spec)
| ไฟล์ | การแก้ |
|---|---|
| `backend/app/macro_service.py` | เพิ่ม **`fred_history_map(series_ids)`** — [(date,value)] ต่อ FRED series, cache **TTL 6 ชม.** (ดึงเฉพาะที่ขาด — ขนาน `_fetch_fred_series_map`) |
| `backend/app/boardroom_stance_service.py` | `_macro_data()` — history จาก `fred_history_map()` (เก็บ items ที่มี FRED id ผ่าน `_SERIES` map) — เลิกอ่าน items.rows/history ที่ไม่มีจริง |
| `backend/app/boardroom_service.py` | `build_snapshot()` — ใช้ `_macro_data()` เดียวกัน (ลบสำเนา dead read ที่ 2) |
| `backend/tests/test_boardroom_stances.py` | fixture stub ที่ขอบเขต network (build_dashboard + fred_history_map) — เส้นทาง _macro_data จริงถูกเทสต์ · เพิ่มเทสต์ 2: **bp stance เลยกำหนด settle ได้จริง (win)** + **pipeline history ผ่าน fred map** |
| `backend/tests/test_boardroom.py` | เพิ่มเทสต์: **claim แนวโน้มย้อนหลัง (direction-only) verify ได้** |
| `backend/tests/test_trade_desk.py` | เพิ่ม stub `fred_history_map` 2 จุด (กันยิง FRED จริง — fixture + bp contract test) |
| `docs/specs/2026-08-10-boardroom-signals.md` | แก้คำสัญญา "rows/history" → กลไกจริง (fred_history_map · cache 6 ชม. · 31 ซีรีส์ · "อย่าไปอ่าน items.rows") |

### ตัวเลขจริง
- **พิสูจน์ production (รันจริง):** `_macro_data()` history **0 → 31** · `build_snapshot` macro_history **0 → 31** · values 60 เดิม
- วัดเวลา (FRED id จริง): 1 ตัว 0.51s (273 แถว/400 วัน) · 8 ตัวขนาน 1.57s · **31 ตัว ≈ 5–6s ครั้งแรก → cache 6 ชม. = 0s ต่อมา**
- เทสต์: 4 ไฟล์ **55 passed** · full suite **525 passed** (521+4) · 20s (ไม่มี network) · hermes verify **ok**

### ข้อบังคับครบ
- [x] ไม่แตะ build_dashboard (6 โมดูลที่ใช้ร่วมไม่กระทบ) · [x] cache 6 ชม. (ตัวเลือก A — user อนุมัติ)
- [x] stub มี history จริง + เทสต์ใหม่ 3 ตัว (bp settle / pipeline / direction claim)
- [x] spec อัปเดต · [x] หยุดรอตรวจก่อน commit · [x] ไม่แตะ bp ใน trade_desk_service (ได้อานิสงส์ผ่าน `_macro_data()` เดียวกัน)
