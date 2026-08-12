# 10 - Task: ข้อมูลมหภาค — GVZCLS/OVXCLS + EIA UI + CDS/SRF (ticket 04 รอบสอง)

Type: task
Status: open
Claimed:
Blocked by: 04

## Question

จากใบ 04 รอบสอง — user ตัดสิน "เอา" 6 แถวหมวดมหภาค:

1. **1.1 + 1.4 — IV ทอง/น้ำมัน (แบบ D ที่ user เลือก)**:
   - เพิ่ม `GVZCLS` (Gold ETF IV — FRED, ตรวจแล้ว 275 rows, ล่าสุด 27.90) + `OVXCLS` (Crude Oil IV — 56.06) เข้า `_SERIES` ใน macro_service.py — แค่ 2 series id ใช้ท่อ FRED + cache เดิม
   - **ติดป้ายชัดว่าเป็น ETF IV (CBOE) ไม่ใช่ futures CME** — ตัวเลขไม่ตรงต้นฉบับ (ต้นฉบับใช้ vol2vol futures IV)
   - พันธบัตร (VXTLT) ยังเป็น "—"
   - คริปโต IV (BTC/ETH) มีแล้วจาก Deribit
2. **1.5 — EIA สต็อกขึ้น UI**: series มีแล้วใน macro_service (crude/gasoline/distillate) + API คืนจริง — เหลือแสดงบน MacroDashboard (กริดการ์ด)
3. **1.7 — CDS proxy / หางประมูล 10Y / ดีลเลอร์รับ / SRF / หนี้ธุรกิจ**: ต้องหาแหล่ง
   - หางประมูล = คำนวณจาก `us_auction_btc_2y/5y/30y` ที่มีอยู่แล้ว
   - SRF ≈ WRESBAL (มี `us_bank_reserves` อยู่แล้ว — ตรวจว่าตรงกันไหม)
   - CDS proxy + ดีลเลอร์รับ + หนี้ธุรกิจ = หาแหล่งใหม่ — **ถ้าหาไม่ได้ให้รายงาน "วัดไม่ได้" ไม่ใช่แต่งตัวเลข**
4. **1.2/1.3/5.1/5.3/5.5 — แถวซ้ำ**: gold flow + FedWatch มีแล้วบน CmeDashboard — ยืนยันว่าแสดงบนหน้า macro ด้วยหรือแยกหน้า (ตรวจว่า ref แสดงทั้ง 2 หน้าไหม — ถ้าซ้ำจริง ข้าม)

## กติกา

- หยุดให้ user ตรวจก่อน commit · รันเทสต์จริงรายงานเลขจริง · ห้ามลบเทสต์เพื่อให้ผ่าน
- ห้ามแต่งตัวเลข — แหล่งไม่มี → "—" + ป้ายเหตุผล
- ทุกการ์ดใหม่มีเทสต์เฝ้า

## เกณฑ์ว่าเสร็จ

- prod `/api/macro` คืน GVZCLS/OVXCLS + EIA แสดงบน UI
- ป้าย "ETF IV (CBOE) — ไม่ใช่ futures CME" ชัดเจน
- checklist 1.1/1.4/1.5/1.7 → เสร็จ
