# 07 - Task: Runtime port — ย้ายส่วนที่ serverless ทำลาย

Type: task
Status: closed
Claimed: hermes/2026-08-11
Blocked by: 01, 03, 05

## Question

ย้ายส่วน runtime ที่ Vercel/serverless ทำลาย ให้อยู่รอดบน Vercel Hobby + Supabase Free — ตามผล spike (01) + สถาปัตยกรรม background (03)

## ขอบเขต (แต่ละชิ้นมีเงื่อนไขจากใบก่อนหน้า)

- **fire-and-forget threads (6 จุดตามข้อเท็จจริง 2 — ตรวจซ้ำจริง) → งาน background ตามใบ 03** (pg_cron/piggyback ที่ตัดสิน) — ถอด thread ออกทั้งหมด
- **FRED**: ตามผล spike (01) — ถ้า httpx UA เปล่าใช้ได้ → รักษา pattern ไว้; ถ้าโดนบล็อก → ทางแก้ตามที่ spike/เกณฑ์ล้มเลิกระบุ
- **scrapers (3 จุด)**: ตามผล spike — อยู่รอด/ต้องปรับ/ตัด
- **numpy + scikit-learn**: ตามผล spike (ง) — ถ้าเกินเพดาน → ทางลดขนาด bundle ตามที่ spike ทดลอง
- **SQLite-specific**: `PRAGMA`/`ALTER` migration มือ → เครื่องมือของใบ 04/05 · `check_same_thread` → normal · engine การ์ด → รวมตาม 04
- error handling/network serverless (timeout/retry ตามขีดของ Vercel function)
- เทสต์ทุกชิ้น — ⚠️ หยุดรอตรวจก่อน commit

## Answer

ย้ายครบ — commit `1a269cb` (2026-08-11) · 14 ไฟล์ (+364/−285) · suite เขียว SQLite 530 ✓ + Postgres 530 ✓ (วัดจริง)

### 1. threads → central job loop (grilling 03)
- **ตรวจซ้ำจริง: เหลือ 3 threads** — boardroom_service:1232 · routers/news:101 · trade_desk_service:555 (screener_refresh_manager ถูกลบแล้วจริง) — **ถอดหมด** (`grep threading app/` = 0 จุด)
- **`app/jobs.py`** — 1 tick = pre-warm macro/market cache (ใบ 06) → boardroom trigger + advance (≤3 LLM เทิร์น/tick) → trade-desk due turns → news enrich (≤40/tick) — แต่ละ subsystem แยก try/except (ตัวนึงล้ม tick ไม่ตาย)
- **`job_runs` ตาราง = overlap lock** — tick แรก INSERT running row; tick ซ้อน → skipped (`job_already_running`) · crash กลางคัน → row ค้าง running → cadence 10 นาทีรอรอบหน้า (heal เอง) · migration `9f8e7d6c5b4a`
- **request paths เรียกผ่าน lock เดียว** — `start_meeting_background`/`run_due_turns_background`/`_kick_off_enrichment` กลายเป็น shim เรียก `jobs.run_due_turns(db)` (สร้างประชุม advance ทันที ไม่รอ cron แต่ไม่ race กับ tick) · **piggyback trigger 3 จุด (boardroom GET /models refresh /news refresh) ถอดออก** ตาม grilling 03 "ไม่มี piggyback"
- ⚠️ จับ recursion bug ระหว่างเขียน: check_triggers เคยเรียก start_meeting_background → ถ้า shim วนกลับเข้า run_due_turns จะ deadlock กับ lock ตัวเอง → check_triggers ภายใน advance ตรง (อยู่ใน tick แล้ว)

### 2. FRED — spike ผ่านอยู่แล้ว (httpx UA เปล่า 200) → รักษา pattern ไว้ ไม่แตะ

### 3. scrapers — **เจอ gap ใหญ่ที่ spike พลาด: wgb ใช้ Playwright+Chromium จริง**
- spike (01) วัดแค่ HTTP 200 ของหน้า HTML (28KB) — ไม่ได้วัด path จริง `_wgb_yields()` ซึ่งใช้ **Playwright+Chromium headless** — Vercel ไม่มี browser → `_CHROME=None` → 14/27 ประเทศ (ไม่มี FRED) คืนคะแนน 0
- **แก้: ย้ายไป API ทางการของ wgb** — POST `wp-json/country/v1/main` (payload `GLOBALVAR.COUNTRY1.SYMBOL` + header Origin/Referer — 403 "invalid origin" ไม่มี) → คืน `mainTable` HTML พร้อม yield ครบ tenor · สัญลักษณ์ 24 ประเทศเก็บเป็น constant (LA/SA/AE = manual/sparse tier เดิมก็ไม่มีอยู่แล้ว) · **พิสูจน์จริง: TH 10Y = 2.028% ตรงหน้าเว็บเป๊ะ · US 10Y = 4.709%** · playwright ออกจาก requirements ด้วย
- investors (konbalongtun) = urllib ตรง (serverless-safe) · compare = httpx + yfinance (spike ผ่าน)

### 4. numpy/sklearn — spike ผ่านแล้ว (bundle optimize) ไม่แตะ

### 5. SQLite-specific — ใบ 05 ทำหมดแล้ว (Alembic / check_same_thread conditional / engine รวม)

### 6. error handling — timeout มีครบทุก httpx call · retry มี (boardroom/banking) · subsystem isolation ใน tick กันจุดเดียวล้มพังทั้งรอบ

### 7. เทสต์
- `test_jobs.py` 4 ตัว: tick รันครบทุก subsystem (นับ call) / overlap lock ข้าม tick ซ้อน / finished row ไม่บล็อกรอบหน้า / subsystem ล้ม tick ยังจบ
- `test_boardroom_triggers` อัปเดต: stub `advance_running_meetings` (เดิม patch start_meeting_background ที่ไม่มีแล้ว) + trigger test เรียก POST /triggers/check ตรง (ไม่มี piggyback บน GET)
- **suite เขียว: SQLite 530 ✓ · Postgres 530 ✓ (pt-pg-test local PG16, alembic upgrade head จริง)**

ตัวเลขวัดจริง · อนุมัติ "ลุย" → commit แยกตามวินัย
