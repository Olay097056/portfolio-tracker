# 10 - Task: ข้อมูลมหภาค — GVZCLS/OVXCLS + EIA UI + CDS/SRF (ticket 04 รอบสอง)

Type: task
Status: closed
Claimed: claude/2026-08-12
Blocked by: 04

## Answer

**ทำได้ 5 จาก 7 แถว · อีก 2 พิสูจน์แล้วว่าไม่มีแหล่งฟรี — ต้องให้ user ตัดสิน**

| แถว | ผล |
|---|---|
| 1.1 CME กรอบ ±1σ | ❌ **ไม่มีแหล่งฟรี** — `/api/cme` ไม่มีคีย์ `zones` · `iv_products` = 0 รายการ · ปิดด้วยงานไม่ได้ |
| 1.2 ทองคำ CME โฟลว์ | ✅ **ซ้ำ** — มีบน CmeDashboard แล้ว (`future_oi` 400,030 · `option_oi` 807,107) ref ก็แยกหน้า CME เหมือนกัน |
| 1.3 FedWatch | ✅ **ซ้ำ** — `FedWatchCards` CmeDashboard.tsx:50 จาก ZQ=F |
| 1.4 CME IV | ⚠️ **บางส่วน** — ทอง GVZCLS 27.90 · น้ำมัน OVXCLS 56.06 ติดป้าย "ETF IV (CBOE) ไม่ใช่ futures CME" บนการ์ด · แร่เงิน VXSLVCLS **หยุดเผยแพร่ 2022-02-11** ห้ามใช้ · เบรนต์/TTF/VXTLTCLS ไม่มีบน FRED |
| 1.5 EIA สต็อก | ✅ การ์ดแสดงอยู่แล้ว 5 ใบ — ที่ขาดคือ**เหตุผล** เพิ่ม `unavailable_reason_th` บอกว่าต้องตั้ง `EIA_API_KEY` แทน "ไม่มีข้อมูล" ลอยๆ |
| 1.7 CDS/หาง/ดีลเลอร์/SRF/หนี้ | ⚠️ **3 ได้ 2 ไม่ได้** — SRF proxy `RPONTSYD` 0.1$B · หนี้ธุรกิจ `BCNSDODNS` 14,453.8$B · ดีลเลอร์รับ 7.03% · **CDS สหรัฐไม่มีแหล่งฟรี · หางประมูลจริงต้องใช้ when-issued yield ซึ่ง TreasuryDirect ไม่เผยแพร่** |
| 5.5 CME ±σ | ❌ ซ้ำกับ 1.1 |

**🔴 เจอบั๊กเดิมในโปรดักชันระหว่างทาง**

`_build_card` route ด้วย `meta["td"]` อย่างเดียว → series ที่มี term ทุกตัวได้ค่า **bid-to-cover** สาขา `td_indirect` เป็นโค้ดตายมาตั้งแต่แรก

`us_auction_indirect_10y` แสดง **2.59 %** (ค่า cover ratio) ใต้ป้าย "สัดส่วน Indirect Bidder" มาตลอด — ค่าจริงคือ **73.67 %**

แก้โดยเพิ่มเงื่อนไข `kind == "plain"` · มี stub `_fetch_auction_indirect_share` อยู่แล้วแต่**ไม่เคยมีเทสต์ assert ค่า** บั๊กเลยรอด — เทสต์ใหม่ใช้ค่า stub ต่างกัน 3 ตัว ถ้าถอยหลังจะยุบเป็น 2.59 เหมือนกันหมด

**เลขจริง**: backend `566 passed` (562→+4) · frontend `599 passed` (597→+2) · `tsc` clean

**พิสูจน์เทสต์ล้มได้**: ย้อน `kind == "plain"` ออก → `assert 2.59 == 65.2` FAILED

**ตรวจบนหน้าเว็บจริง** (`/api/macro` + แท็บข้อมูลมหภาค ไม่มี error ใน console):
```
gold_iv               27.9 index  2026-08-10
oil_iv               56.06 index  2026-08-10
us_auction_btc        2.59 x      2026-07-08
us_auction_indirect  73.67 %      2026-07-08
us_auction_dealer     7.03 %      2026-07-08
us_business_debt   14453.8 $B     2026-01-01
us_srf_repo            0.1 $B     2026-08-11
us_crude_inventory    None M bbl  → "ต้องตั้งค่า EIA_API_KEY (ขอฟรีที่ api.eia.gov)"
```

**อุดช่องโหว่เครื่องมือ** — `fix_subsummaries.py` โหมดแก้ตอนนี้ซ่อม Grand Summary ด้วย (เดิมตรวจเจอแล้วปล่อย ต้องแก้มือ เจอซ้ำ 2 รอบ) และ `--check` เพิ่มการตรวจว่า**คอลัมน์ของตาราง Grand Summary บวกแล้วตรงยอด** — จับแถวรายหมวดที่ค้างได้ (พิสูจน์แล้ว: จับแถวมหภาค 3/6/0 ที่ควรเป็น 6/1/2)

**เจอบั๊กเทสต์เก่า (ยังไม่แก้)** — `frontend/src/App.test.tsx` ผ่านเฉพาะตอน**ไม่มีอะไรฟังพอร์ต 8000** มันยิง fetch จริงแล้วคาดว่าต้องล้ม เปิด dev server ไว้เมื่อไหร่เทสต์แดงทันที (ตระกูลเดียวกับบั๊ก DB isolation เมื่อเช้า)

**ค้างที่ user**: 1.1 + 5.5 — CME ±1σ ไม่มีแหล่งฟรี รับสภาพ (ปิดเป็น "นอกขอบเขต") หรือหาแหล่งเสียเงิน

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
