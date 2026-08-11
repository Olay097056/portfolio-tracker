# 06 - Task: เครื่องยนต์ทีมเทรด + schema + endpoints (เขียนโค้ดจริง)

Type: task
Status: closed
Claimed: hermes/2026-08-10
Blocked by: 02, 03, 04, 05

## Question

ไม่มีอะไรให้ตัดสิน — สร้างตามที่ ticket 02/03/04/05 ตัดสินไว้

## ⚠️ ticket นี้เขียนโค้ดจริง

หยุดให้ user ตรวจก่อน commit · รันเทสต์จริงรายงานเลขจริง · ติดขัดให้หยุดถาม

## สิ่งที่ต้องสร้าง

### 1. Schema (SQLite ใน `portfolio.db`)
- ทีม: id, ชื่อ, กลยุทธ์, รุ่น, สถานะ, ทุนตั้งต้น, เงินสด, สร้างเมื่อ
- ไม้/สถานะการเทรด: ทีม, สินทรัพย์, ทิศทาง, ขนาด, ราคาเข้า, SL, TP, สถานะ, ราคาปิด, P&L, เปิดเมื่อ, ปิดเมื่อ, เหตุผล
- snapshot equity รายช่วง (สำหรับกราฟ)
- เทิร์น: ทีม, เวลา, บทสนทนา, ออเดอร์ที่ออก, **llm_calls / tokens_in / tokens_out**

**ห้ามปนกับ `trading_signals`** (หลักห้ามละเมิดข้อ 5) · ระวัง `create_all` ไม่ alter ตารางเดิม — ถ้าเพิ่มคอลัมน์ทีหลังต้องเขียน migration เองแบบที่ `main.py` ทำกับ `trading_signals.sparkline`

### 2. Service (`backend/app/trade_desk_service.py`)
- เทิร์นตัดสินใจของสองทีมตามผัง ticket 02 (reuse เครื่องยนต์ประชุมจากแผน `boardroom` ถ้า ticket 02 ตัดสินแบบนั้น)
- กลไกพอร์ตตาม ticket 04 — เปิด/ปิดไม้, เช็ค SL/TP จากราคาย้อนหลัง, คำนวณ equity
- ดึงราคาตาม ticket 05 — **reuse `price_service` อย่าเขียน fetcher ใหม่**
- **นับ tokens ทุกคอล** (หลักห้ามละเมิดข้อ 4)
- โควตาเทิร์น + สวิตช์หลัก (เบรกฉุกเฉิน)
- เพดานความปลอดภัยตาม ticket 03 — เกินแล้วหยุด บันทึก ไม่เงียบ

### 3. Endpoints (`backend/app/routers/trade_desk.py`)
- `GET /api/trade-desk` — สถานะทั้งสองทีม + ไม้ที่เปิด + equity + สถิติ
- `GET /api/trade-desk/history` — ไม้ที่ปิดแล้ว + snapshot สำหรับกราฟ
- `POST /api/trade-desk/turn` — เปิดเทิร์นเทรด (เคารพโควตา + สวิตช์หลัก)
- `POST /api/trade-desk/master-switch` — เปิด/ปิดสวิตช์หลัก
- ต่อ router ใน `app/main.py`

### 4. เทสต์ (`backend/tests/test_trade_desk.py`)
- **DeepSeek + ราคา ถูก stub เสมอ — ห้ามยิงของจริงในเทสต์**
- **🚫 เทสต์กำแพงกันเทรดจริง (บังคับ ตาม ticket 05)** — ยืนยันว่าไม่มีเส้นทางโค้ดที่ส่งคำสั่งออกไปได้ ทุกออเดอร์ลงตารางเราเท่านั้น
- P&L คำนวณถูกทั้งขาขึ้นขาลง
- SL/TP ถูกทริกเกอร์จากราคาย้อนหลังถูกจุด (รวมเคสแตะแล้วเด้งกลับ)
- โควตาเทิร์นกันการเปิดเกิน
- สวิตช์หลักปิด → ไม่เปิดเทิร์นใหม่ แต่ SL/TP ของไม้เดิมยังทำงาน
- นับ tokens ถูกต้อง
- ราคาดึงไม่ได้ → ไม่แต่งราคา (ข้ามเทิร์นหรือ "—" ตามที่ ticket 05 ตัดสิน)
- **ยืนยัน `trading_signals` ไม่ถูกแตะ** — นับแถวก่อน/หลัง

## Answer

**สร้างเสร็จ + เทสต์ผ่านจริง (2026-08-10) — ยังไม่ commit รอ user ตรวจตามกติกาแผน**

### ไฟล์ที่สร้าง/แก้ (backend เท่านั้น)
| ไฟล์ | เนื้อหา |
|---|---|
| `backend/app/trade_desk_service.py` | 🔑 ตาราง 5: trade_teams/trade_positions/trade_turns/trade_snapshots/trade_settings · seed 2 ทีม (A เทรนด์ 4ชม. risk 5–10% / B กลับค่า 12ชม. 2–5%) · เทิร์นลูป 3 คอล (ลูกทีม 2 → หัวหน้าเคาะ) · `run_due_turns()` ฟังก์ชันเดียว (master+โควตา+next_turn → รัน — ย้าย pg_cron ได้) · `run_due_turns_background()` (piggyback) · SL/TP อัตโนมัติ (ทำงานแม้สวิตช์ปิด) · equity = balance+Σ(margin+unrealized) (สูตรต้นฉบับ) · clamp size เข้ากรอบทีม · prompts จาก prototype 03 + `"thinking": disabled` + parser robust |
| `backend/app/routers/trade_desk.py` | GET /api/trade-desk/state (SL/TP + piggyback + state) · POST /turn (เปิดเทิร์นเลย) · POST /settings (master/cap) |
| `backend/app/main.py` | wire router |
| `backend/tests/conftest.py` | register trade_* tables |
| `backend/tests/test_trade_desk.py` | **14 เทสต์** — stub llm/ราคา/snapshot 100% |

### ตัวเลขเทสต์จริง
- trade-desk: **14 passed** · full backend suite: **520 passed** (506+14) · hermes verify **ok: true**

### ข้อที่ครอบคลุม (ผัง ticket 02 + prototype 03)
- [x] หัวหน้าเคาะเด็ดขาด + สวนลูกทีมได้ (S1/A hold จำลองใน stub) · ทีมไม่เห็นผลกัน (build_team_context กรองพอร์ตตัวเอง)
- [x] clamp size เข้ากรอบทีม (25% → 10% A / 3% B) · SL/TP ปิดอัตโนมัติทั้ง 2 ทิศ (sl/tp test) · ทำงานตอนสวิตช์ปิด
- [x] master switch + daily cap (4) + next_turn_at scheduling (A 4ชม. B 12ชม.) + not_due skip
- [x] equity formula ตรงต้นฉบับ + snapshot ต่อเทิร์น + state shape ครบ (equity/pnl/margin/turns_today/positions)
- [x] **ไม่แตะ trading_signals** (test นับแถว = 0)
- [x] reuse จริง: llm_call (thinking disabled+cost) · build_snapshot · resolve_price_key · price_service

### หมายเหตุ
- `trade_turns.cost_usd` ยังเป็น 0 — นับต้นทุนจริงจาก usage (tokens) ไว้ในตารางแล้ว — แสดงเป็น $ บน UI ได้จาก tokens×rate (ทำใน ticket 07) — หรือขยับคำนวณใส่ cost_usd ตอน commit (เล็กน้อย — รอ 07 ตัดสิน)
- frontend ยังไม่มี (ticket 07) · spec (ticket 08)

---

## ⚠️ ผลการตรวจอิสระ (2026-08-10) — พบบั๊กจริง แก้แล้ว

**บั๊ก: ตลาดกลุ่ม bp (yield/spread) เปิดไม้ไม่ได้เลย + macro pack ของทีม B ว่างเปล่า**

`current_price()` และ `_macro_values()` อ่าน `build_dashboard()["values"]` — **คีย์นั้นไม่มีอยู่จริง** ของจริงคืน `{yield_curve, gold_cme, sections, updated_at, data_sources}` ค่าซีรีส์อยู่ใน `sections[].items[].{series_id,value}` ต้องเดินเก็บเอง

พิสูจน์ด้วยการรันจริงกับข้อมูลสด:
```
dashboard top-level keys : ['data_sources','gold_cme','sections','updated_at','yield_curve']
has 'values' key         : False
_macro_values()          : {}
current_price('us10y','bp') = None   (us2y, us_hy_spread เหมือนกัน)
```

ผลกระทบ: `_execute_order` ได้ `entry=None` → `skipped: no_current_price` ทุกครั้ง แปลว่า**ตลาด yield/spread เปิดไม้ไม่ได้เลย** ไม่เข้า `team_equity` และไม่ถูก `check_sl_tp` — เงียบสนิท ไม่มี error · และ **ทีม B (สายมหภาค/กลับค่า) ได้ macro pack ว่าง** ทั้งที่ข้อมูล FRED คือสิ่งที่ทำให้มันต่างจากทีม A ตาม decision ของ ticket 02

**ทำไมเทสต์ 15 ตัวไม่จับ:** `tests/test_trade_desk.py` stub `build_dashboard` ให้คืน `{"values": {...}}` — **รูปร่างที่ของจริงไม่เคยคืน** เทสต์จึงรับรองความผิดพลาดไว้แทนที่จะจับมัน

**แก้แล้ว:**
1. `_macro_values()` + `current_price(..., "bp")` → ใช้ `boardroom_stance_service._macro_data()` ที่เดิน `sections[].items[]` ถูกต้องอยู่แล้ว (โมดูลนี้ import `resolve_price_key` จากที่นั่นอยู่แล้ว — มีของถูกให้ reuse แต่เขียนสำเนาที่พังขึ้นมาใหม่)
2. ลบ import `build_dashboard` ที่ไม่ได้ใช้แล้วออกจาก `trade_desk_service.py`
3. แก้ stub ในเทสต์ให้เป็นรูปร่างจริง **และย้ายไป patch ที่ `macro_service`** ต้นทาง — ของเดิม patch ที่ `td` ซึ่งดักไม่ทัน `_macro_data()` ทำให้เทสต์ยิง FRED จริง (รันชุดนี้ 7.95s → **0.31s** หลังแก้)
4. เพิ่มเทสต์ `test_bp_market_price_reads_the_real_dashboard_contract` ผูกกับสัญญาจริงของ `build_dashboard`

backend **522 passed** (จาก 521 + เทสต์ใหม่) · frontend 611 passed | 16 skipped · tsc สะอาด · `portfolio.db` จริงไม่ถูกแตะ (เทียบจำนวนแถวทุกตารางก่อน/หลัง)
