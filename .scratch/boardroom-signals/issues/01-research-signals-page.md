# 01 - Research: ขุดหน้า /boardroom/signals ของต้นฉบับ

Type: research
Status: closed
Claimed: hermes/2026-08-10
Blocked by: —

## Question

หน้า `/boardroom/signals` คำนวณและแสดงอะไรบ้าง — ต้องละเอียดพอที่ ticket 02/03 ตัดสินได้และ ticket 04/05 เขียนโค้ดได้

chunk นี้ **28,633 B** ใหญ่กว่าหน้าห้องประชุมเองเกือบ 4 เท่า — ตรรกะส่วนใหญ่ของฟีเจอร์อยู่ที่นี่ ไม่ใช่ที่หน้าประชุม

## วิธีทำ — ไม่ต้อง login

ยืนยันแล้วว่าเปิดสาธารณะ **ห้ามสมัครบัญชีหรือกรอกรหัสผ่าน**

- **route chunk**: `/_next/static/chunks/app/boardroom/signals/page-74bc82dedeac55aa.js`
- **copy ไทย**: `/_next/static/chunks/3474-e1aec38ee927d485.js` ค้น `brSig` (คีย์ `brSigActive`, `brSigWinRate`, `brSigGroupPct`, `brSigChecks`, ...)

**กติกาบังคับ:** แนบข้อความดิบคัดลอกตรง + URL ทุกข้อ · หาไม่เจอเขียน "หาไม่เจอ" ห้ามเดา

## สิ่งที่ต้องได้กลับมา

1. **โครงสร้างจุดยืน (stance) ที่อ่านออกมาจาก `resolution_json`** — field อะไรบ้าง (asset, ทิศทาง, ราคาเข้า, กำหนดครบ, น้ำหนัก, เหตุผล, ที่นั่งที่เสนอ?) **นี่คือสิ่งที่แผน `boardroom` ก็ต้องรู้เหมือนกัน — ประสานกันไม่ให้ขุดซ้ำ**
2. **สูตร P&L ทั้งสองกลุ่ม** — กลุ่มราคา (%) คิดยังไง กลุ่ม yield/สเปรด (bp) คิดยังไง ทิศทาง "ยีลด์" กับ "สเปรด" ต่างกันตรงไหน ตัวเลขดิบของสูตร
3. **จุดตรวจ +1/+3/+7 วัน** — นับจากวันไหน (วันประชุม? วันที่จุดยืนเริ่ม?) วันหยุดตลาดนับด้วยไหม เก็บผลจุดตรวจไว้หรือคำนวณสดทุกครั้ง เกณฑ์ "ผ่าน" ของจุดตรวจคืออะไร
4. **นิยาม "อัตราถูกทาง"** — ตัวหารคืออะไร (เฉพาะที่สรุปแล้ว? รวมที่ยังไม่ปิด?) เกณฑ์ถูกทางคือกำไร > 0 หรือมีเกณฑ์อื่น
5. **"รวมแบบน้ำหนักเท่ากันทุกสัญญาณ"** — เฉลี่ยยังไงข้ามสองกลุ่มที่หน่วยต่างกัน (% กับ bp) หรือไม่เฉลี่ยข้ามกลุ่มเลย
6. **การครบกำหนด** — ใครตัดสิน ตัดสินตอนไหน เกิดอะไรถ้าเลยกำหนดแล้วไม่มีใครมาปิด
7. **ราคามาจากไหน** — `market_prices` / `macro_series` เก็บอะไร อัปเดตบ่อยแค่ไหน กลุ่ม yield ใช้แหล่งเดียวกับกลุ่มราคาไหม (ป้อนเข้าหมอกข้อ "ราคาสำหรับกลุ่ม yield มาจากไหน")
8. **จุดยืนขัดกันข้ามมติ** — โค้ดจัดการยังไงเมื่อสองมติให้จุดยืนตรงข้ามในสินทรัพย์เดียวกัน
9. **layout + copy ไทยคีย์ `brSig*` ทั้งหมด** — การ์ดหน้าตายังไง สถิติวางตรงไหน สองแท็บสลับยังไง
10. **สินทรัพย์ที่รองรับ** — มีรายการตายตัวไหม หรือรับอะไรก็ได้ที่ AI พูดถึง (สำคัญ: ของเราต้องดึงราคาได้จริงถึงจะติดตามผลได้)

## Answer

**ขุดเสร็จ 2026-08-10 — doc: `docs/research/boardroom-signals-page-2026-08-10.md`** — ใช้ chunk เดิมจาก dig แผน boardroom (ไม่ขุดซ้ำ) + โหลดเพิ่ม 3 chunk (8356/9704/44530001 — เจอ module 26079 = DD)

**ตอบครบ 10 ข้อ (สรุปสั้น):**
1. **stance fields** ที่หน้าใช้: asset/stance/confidence/horizon/horizon_days/price_at/**due_at**/consensus/reason/**qualified** — key = meetingId:index · outcome.h & d1/d3/d7.results เป็น array **ขนานกับ stances**
2. **P&L**: price = (cur−entry)/|entry|×100% · yield_pct = (cur−entry)×100 จุด · spread_bps = cur−entry bps · คูณทิศทาง (long +1/short −1) · หน่วย map: regex yield `/^(US|TH|JP|VN|FR|EA)\d{1,3}[YW]$/` + spread set 5 ตัว
3. **จุดตรวจ +1/+3/+7**: เก็บใน outcome.d1/d3/d7.results[l]{correct, change_pct, unit} — job รอบเช้า ~07:00 วัดราคาหลังประชุม (i18n brSigChecksDesc) — กลไกจริงหาไม่เจอ ต้องออกแบบ
4. **อัตราถูกทาง** = wins/(wins+losses) เฉพาะ settled ไม่นับ push · เกณฑ์: `correct→win · |Δ| < (bp?4:.5)×√(days/3)→push · else loss` (module 18551 $p)
5. **น้ำหนักเท่ากัน** = เฉลี่ยต่อสัญญาณ **แยกกลุ่ม pct/bp ไม่เฉลี่ยข้าม**
6. **ครบกำหนด** = stance.due_at · state: pending (นับถอยหลัง) → settled (มีผล) → awaiting (เลยกำหนดไม่มีผล — แสดง amber ค้างไว้)
7. **ราคา**: market_prices หลัก + macro_series fallback (yield/spread) · polling 90s · pricesUpdatedAt = max recorded_at
8. **ขัดกันข้ามมติ**: ไม่มีกลไก — ทุก stance = สัญญาณแยก (การ์ดคนละใบ) · track record ตารางเป็นตัวรวมภาพ
9. **Layout/copy**: สถิติ 4 ช่อง (นับถอยหลัง+สรุปแล้ว / อัตราถูกทาง / P&L สดเฉลี่ย / P&L สรุปแล้ว) · แท็บ all/pending/settled + เต็ม/กระชับ · กลุ่ม pct (ฟ้า)/bp (ม่วง) หน้าเว้น 10 · การ์ดเต็มมี mini chart + DD + ราคาตอนมติ/ปัจจุบัน · มุมมอง (qualified=false) · สรุปจุดตรวจ d1/d3/d7 · track record ตาราง — copy brSig* ครบใน doc
10. **สินทรัพย์**: ไม่มีรายการตายตัว — รับทุกชื่อ แต่ต้องมีราคาใน market_prices/macro_series ถึงจะคำนวณ P&L ได้

**หาไม่เจอ (ออกแบบเอง):** settlement job (วิธีวัด correct) · สูตรตั้ง due_at · เกณฑ์ตั้ง qualified เชิงโค้ด

**ช่องว่างของเรา (→ ticket 04):** resolution prompt ต้องเพิ่ม `due_at` + `qualified` + สร้าง outcome d1/d3/d7/h (settlement) — เรามี market_prices (candles) + macro 27 คีย์ FRED พร้อมเป็น fallback

**ปลดบล็อก:** 02, 03, 05 ✅

**ห้ามแตะโค้ด production**
