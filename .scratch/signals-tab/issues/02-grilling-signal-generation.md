# 02 - Grilling: ตัดสินใจกลยุทธ์การสร้างสัญญาณ (signal generation)

Type: grilling
Status: resolved
Blocked by: 01

## Answer

ตัดสินใจครบทั้ง 4 ข้อ (ถาม user ทีละข้อ 2026-08-08):

1. **ที่มาของสัญญาณ**: (a) คำนวณเองทั้งหมด — ใช้ model scores จาก `model_service.build_models()` + TA engine จาก prototype (ticket 03) — สร้างสัญญาณเมื่อ model building/active (≥40) และ ta_score ≥ 50 — สอดคล้องหลักการ no-scrape ของโปรเจค
2. **Storage**: ตาราง SQLite ใหม่ `trading_signals` ใน portfolio.db (pattern เดียวกับ `model_score_history`)
3. **History/closed signals**: เริ่มสะสมจากศูนย์ — stats panel แสดง "—" จนกว่าจะมีสัญญาณปิดจริง (ตรงหลักการ never fabricates) — ไม่ seed ข้อมูลใดๆ
4. **Trigger**: on-demand ตอนโหลดหน้า — generate + เก็บสัญญาณใหม่ทุกครั้งที่ cache หมดอายุ (10 นาที, pattern เดียวกับ macro/models router) — ไม่มี scheduler แยก

**ข้อกำหนดเพิ่มที่สืบเนื่องจาก decision:**
- `expires_at` = created_at + 14 วัน (P54 จาก research); สัญญาณที่เลย expires ยัง active ให้ปิดอัตโนมัติที่ราคาปัจจุบัน (สถานะ expired)
- ปิดออเดอร์ (close-signal): ตั้ง closed_at + คำนวณ pnl_pct จากราคาปิดปัจจุบันเทียบ entry ตาม direction — เป็น endpoint POST ของเราเอง (ไม่ใช่ Supabase edge fn)

## Question

สัญญาณเทรดของเราจะถูกสร้างและเก็บยังไง? ต้นฉบับมี cron สร้างสัญญาณทุกชั่วโมงจาก model scores + TA pass แล้วเก็บใน Supabase `trading_signals` — เราจะจำลองยังไงโดยไม่ scrape เว็บเขา?

## ตัวเลือกที่ต้องตัดสินใจ (ถาม user ทีละข้อ)

1. **ที่มาของสัญญาณ**: (a) คำนวณเองทั้งหมด — ใช้ model scores จาก `model_service.build_models()` (ที่ทำไปแล้ว) + TA score จาก yfinance candles → สร้างสัญญาณเมื่อ model building/active และ TA ≥ threshold (50); (b) อ่านจาก Supabase ต้นฉบับตรงๆ (ขัดหลักการ no-scrape ของโปรเจค); (c) แบบผสม
2. **Storage**: ตาราง SQLite ใหม่ `trading_signals` ใน portfolio.db (pattern เดียวกับ `model_score_history`) — เห็นด้วยไหม
3. **History/closed signals**: สัญญาณที่เราสร้างเองยังไม่มีประวัติ win/loss — stats panel จะแสดง "ยังไม่มีข้อมูล" ไปก่อนแล้วค่อยสะสม (เหมือน score history ที่ทำไป) หรือจะ seed ด้วยข้อมูลจำลอง? (หลักการโปรเจค: ไม่แต่งตัวเลข)
4. **Trigger**: generate ตอนโหลดหน้า (cache 10 นาที) เหมือน macro/models หรือต้องมี scheduler แยก?

## เป้าหมาย

ได้ decision ชัดเจนสำหรับทุกข้อข้างต้น → บันทึกเป็น ## Answer ใน ticket นี้ → ปลดบล็อก ticket 04 (backend service) และ 05 (frontend)
