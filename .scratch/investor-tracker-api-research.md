# Investor Tracker API feasibility

วันที่: 2026-08-17

## ข้อสรุป

โปรเจคสามารถใช้ API ภายนอกที่ค้นพบและตรวจสอบได้ โดยควรเรียกจาก backend เท่านั้น, cache ผล, เก็บ source/filing metadata และไม่ให้ frontend เรียก provider โดยตรง

## สภาพปัจจุบันที่ตรวจจากโค้ด

- `backend/app/routers/investors.py:10403` ฟังก์ชันชื่อ `fetch_live_investors_multi_provider()` แต่ live request จริงที่บรรทัด 10410 มีเพียง `konbalongtun.com/api-server/investors/investors-with-holdings`.
- เมื่อ request ล้มเหลว ระบบคืน cache เดิม หรือ `INVESTORS_DATABASE` static fallback ที่อยู่ในไฟล์เดียวกัน (`:114` เป็นต้น).
- `SEC_CIK_REGISTRY` มีอยู่ (`:105`) แต่จากการตรวจ function live-fetch ยังไม่ได้ถูกใช้ยิง SEC API.
- `data_provider` ระบุ SEC EDGAR แต่ implementation ปัจจุบันไม่ได้ fetch SEC ในเส้นทาง live นี้ จึงควรแก้ให้ตรงกับหลักฐานก่อนแสดงต่อผู้ใช้.

## แหล่งข้อมูลที่แนะนำ

1. **SEC EDGAR / data.sec.gov — primary source สำหรับ Form 13F**
   - API documentation: https://www.sec.gov/edgar/sec-api-documentation
   - Company submissions: `https://data.sec.gov/submissions/CIK{CIK}.json`
   - Company tickers/CIK registry: https://www.sec.gov/files/company_tickers.json
   - ใช้ submissions เพื่อหา filing accession/period จากนั้นอ่าน filing index และ information-table XML เพื่อสร้าง holdings จริง
   - SEC API ระบุให้ใส่ User-Agent ที่มีชื่อแอปและอีเมล และต้องเคารพ rate limits

2. **ราคาหุ้น/มูลค่าปัจจุบัน — ใช้ price service/yfinance ที่มีอยู่แล้ว**
   - ห้ามเอา current price จาก 13F มาเรียกว่า live price เพราะ 13F เป็น snapshot ที่ล่าช้า

3. **Konbalongtun — optional secondary/discovery source**
   - ใช้เป็น fallback หรือ UI-specific new-holdings feed ได้ต่อเมื่อยอมรับ dependency และมี source label ชัดเจน
   - ไม่ควรเป็นแหล่ง authoritative หลัก และต้องไม่ claim ว่าข้อมูลมาจาก SEC หากไม่ได้ตรวจ SEC filing

## แนวทาง implementation ที่ปลอดภัย

- เพิ่ม `sec_13f_service.py` แยกจาก router
- CIK registry ใช้เป็น input; submissions → latest 13F accession → filing document → parse information table
- normalize เป็น `investor`, `filing_period`, `filed_at`, `issuer_cusip`, `ticker`, `shares`, `value_usd`, `put_call`, `source_url`
- cache ตาม `(cik, accession_no)` และบันทึก `source_url`/`filed_at`
- ถ้า SEC/provider ล้มเหลวให้แสดง stale/cache หรือ `—` พร้อม `data_quality` ไม่ fabricate ค่า
- ให้ `data_provider` ราย investor มาจากแหล่งที่ใช้จริง
- เพิ่ม tests ด้วย mocked SEC responses และ test ว่า provider label ไม่อ้าง SEC เมื่อไม่ได้เรียก SEC

## ข้อจำกัดสำคัญ

- Form 13F รายงานล่าช้าและไม่ใช่ real-time portfolio; deadline ตามกฎคือภายใน 45 วันหลัง quarter-end
- 13F ไม่ครอบคลุมสินทรัพย์/สถานะ short ทั้งหมดของผู้จัดการ และตัวบุคคลอาจไม่ใช่ reporting manager ที่ SEC ลงทะเบียน
- การ parse ticker จาก CUSIP ต้องมี mapping; ไม่ควรเดาจากชื่อบริษัท

## แหล่งอ้างอิง

- SEC API documentation: https://www.sec.gov/edgar/sec-api-documentation
- SEC submissions endpoint (Warren Buffett CIK): https://data.sec.gov/submissions/CIK0001067983.json
- SEC ticker mapping: https://www.sec.gov/files/company_tickers.json
