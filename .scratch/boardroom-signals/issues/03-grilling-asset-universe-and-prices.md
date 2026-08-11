# 03 - Grilling: สินทรัพย์ที่รองรับ + แหล่งราคาของสองกลุ่ม

Type: grilling
Status: closed
Claimed: hermes/2026-08-10
Blocked by: 01

## Question

AI พูดถึงสินทรัพย์อะไรได้บ้าง และเราดึงราคามาติดตามผลได้จริงทุกตัวไหม?

ถ้า AI ออกจุดยืนกับสินทรัพย์ที่เราดึงราคาไม่ได้ สัญญาณนั้นจะค้างเป็น "—" ตลอดกาล — วัดผลไม่ได้ ตัดสินไม่ได้ กินที่บนหน้าจอเปล่าๆ

## ข้อเท็จจริงตั้งต้น (ตรวจแล้ว — แหล่งราคาที่เรามีจริง)

| กลุ่ม | แหล่ง | ความสด | หมายเหตุ |
|---|---|---|---|
| หุ้น/ETF/ดัชนี | yfinance | ระหว่างวัน | มีอยู่แล้วใน `price_service` / `signals_service._yf_candles` |
| ทอง/น้ำมัน/FX | yfinance | ระหว่างวัน | `XAUUSD`, `USOIL`, `JPY=X` ใช้อยู่แล้วใน `model_service._yf_extras` |
| ยีลด์พันธบัตร US | FRED ผ่าน `macro_service` | **รายวัน** | `us10y`, `us2y`, `us30y` |
| สเปรดเครดิต | FRED ผ่าน `macro_service` | **รายวัน** | `us_hy_spread`, `us_ig_spread` |
| ยีลด์ต่างประเทศ | `countries_service` (scrape worldgovernmentbonds) | รายวัน | 27 ประเทศ |
| คริปโต | **ไม่มี** | — | ต้องเพิ่มแหล่งใหม่ถ้าจะรองรับ |

**ข้อจำกัดที่ต้องยอมรับ**: กลุ่ม yield/สเปรด สดแค่ระดับ**รายวัน** ในขณะที่กลุ่มราคาสดระดับ**ระหว่างวัน** — คำว่า "P&L สด" ของสองกลุ่มจึงไม่เท่ากันจริง ต้นฉบับก็น่าจะเจอปัญหาเดียวกัน (ticket 01 ให้ดูว่าเขาจัดการยังไง)

## ตัวเลือกที่ต้องตัดสินใจ (ถาม user ทีละข้อ)

1. **รายการสินทรัพย์ตายตัว หรือเปิดอิสระ** — (ก) กำหนดรายการที่รองรับไว้ล่วงหน้าแล้ว**บังคับ AI ให้เลือกจากรายการนั้นเท่านั้น** (ข) ปล่อยอิสระแล้วค่อยพยายามหาราคา — ความเห็นตั้งต้น: **(ก)** เพราะรับประกันว่าทุกสัญญาณวัดผลได้ และป้องกัน AI แต่งชื่อสินทรัพย์ขึ้นมาเอง
2. **ถ้าเลือก (ก) รายการนั้นมีอะไรบ้าง** — เสนอชุดที่ครอบคลุมโมเดลทั้ง 6 ตัวของเรา (NAS100, ทอง, น้ำมัน, DXY, US10Y, US2Y, HY spread, KRE, ...) ให้ user คัด
3. **แสดงความสดของราคาให้เห็นไหม** — กลุ่ม yield ราคา "สด" อาจเก่าถึง 1 วัน ควรติดป้ายบอกไหม (ตรงหลัก "ไม่แต่งตัวเลข" — ถ้าไม่บอก ผู้ใช้จะเข้าใจว่าเป็นราคาปัจจุบัน)
4. **คริปโต** — ต้นฉบับมีในทีมเทรด (Hyperliquid) หน้านี้มีไหม (ticket 01 ตอบ) ถ้ามีและเราอยากรองรับ ต้องเพิ่มแหล่งราคา = ขยาย scope — ความเห็นตั้งต้น: **ตัดออกไปก่อน**
5. **ทิศทาง "ยีลด์" กับ "สเปรด" ต่างกันยังไงในทางคำนวณ** — ยีลด์ขึ้น = ราคาพันธบัตรลง สัญญาณ "long ยีลด์" หมายถึงอะไรกันแน่ ต้องนิยามให้ชัดไม่งั้นเครื่องหมาย P&L กลับทิศ
6. **หน่วยที่แสดง** — กลุ่ม bp แสดงเป็น bp ล้วน หรือแปลงเป็น % เทียบเท่าเพื่อรวมกับอีกกลุ่มได้

## Answer

Grilling ครบ 6 ข้อ (2026-08-10) — user ตัดสิน: **โหมดเปิดอิสระ (soft-open)** + ตรวจข้อมูลจริงของ reference (user อนุญาตยกเลิกกฎ never scrape ชั่วคราว — query Supabase reference: 333 stances / 100 ประชุม / 24 สินทรัพย์ / market_prices 46 symbols)

### 1. โหมดเปิดอิสระ — soft-open + Ladder 5 ชั้น + Re-resolve
- AI เขียน asset เป็น **"ticker/ตัวย่อ + หมวด"** (TLT ETF / XAUUSD สินค้าโภคภัณฑ์ / ^TNX ยีลด์) — หน่วย map จากหมวด
- **Resolution ladder** (ณ เวลาทำมติ): alias map (~68 ตัว) → yfinance search → ticker ตรง (quote check) → FRED series_id → ในระบบ (macro 27 คีย์ + ยีลด์ต่างประเทศ) → ไม่เจอ = `qualified=false` → "มุมมอง"
- **Re-resolve อัตโนมัติ**: unresolved เก็บตาราง → ลองใหม่ทุกเปิดหน้า (alias โต → กลืนทีหลัง)
- เก็บ `price_key` + unit + source ลง stance — UI โชว์ ticker ที่ resolve ("ติดตาม: GC=F")

### 2. ชุด alias map เริ่มต้น (~75 ตัว — เพิ่มหุ้นรายตัว US + ไทยตาม user 2026-08-10)
ทอง/น้ำมัน (2) · ดัชนี US (4) · ETF (11) · FX (5) · คริปโต (2) · ยีลด์ FRED (4) · สเปรด FRED (2) · VIX (1) · หุ้น US 19 (AAPL/MSFT/NVDA/GOOGL/AMZN/META/TSLA/NFLX/AMD/TSM/BABA/JPM/BAC/XOM/V/WMT/KO/JNJ/INTC) · **หุ้นไทย 7 (PTT.BK/KBANK.BK/SCB.BK/ADVANC.BK/CPALL.BK/AOT.BK) + ดัชนี ^SET.BK** (user ย้อนตัดสินใจ — เดิมตัดหุ้นไทย กลับมาเพิ่มรายตัวยอดนิยม) — หุ้นอื่นนอกลิสต์หาเจอผ่าน search ได้ไม่ block

### 3. ป้ายความสดของราคา (ตรงหลักไม่แต่งตัวเลข)
- yield/สเปรด: ป้ายเทา "ราคารายวัน" (FRED — อาจเก่า 1 วันทำการ) · ราคา: quote_at เก่า >15 นาที → "ราคาเมื่อ HH:MM" · header "ดึงข้อมูลล่าสุด" ตามต้นฉบับ

### 4. คริปโต — รวม (ได้ฟรีผ่าน yfinance ชั้น 2)
- BTC-USD/ETH-USD ผ่าน ladder (ไม่ต้องแหล่งใหม่) · settlement ใช้ daily candle (24/7 ไม่เลื่อนวันหยุด) · push line เดิม

### 5. ทิศทาง yield/spread — เดิมพันทิศทาง series ตรงๆ (ตามต้นฉบับ)
- `long US10Y` = คาด**ยีลด์ขึ้น** (ราคาบอนด์ลง) · `long HY spread` = คาด**กว้างขึ้น** — P&L = (cur−entry)×100×dir (yield จุด) / (cur−entry)×dir (bps)
- **เพิ่ม field `unit` (bp/pct) ใน stance — CEO เขียนเอง (ตามที่ reference ทำจริง — เห็นในข้อมูลจริง: `{"unit":"bp","asset":"US10Y",...}`) + validate ตรงกับ unit ที่ derive จากชื่อ (กันกลับทิศ)** — เขียนใน prompt resolution 3 จุด (prompt/UI badge/doc)

### 6. หน่วยที่แสดง — แยกกลุ่ม ไม่แปลงข้าม (ตามต้นฉบับ)
- ราคา → % · ยีลด์ → bp (จุด pct ×100) · สเปรด → bp ตรง · chip ฟ้า (pct)/ม่วง (bp) · push line แยกต่อกลุ่ม · สถิติแยกกลุ่ม · tooltip "1bp = 0.01 จุด"

### ข้อมูลจริงจาก reference (หลักฐานอ้างอิง — user อนุญาต 2026-08-10)
- **24 สินทรัพย์ / 333 stances**: US10Y 83 · USOIL 44 · XLE 31 · US30Y 29 · USDJPY 21 · XAUUSD 20 · KRE 15 · US500 15 · XLF 13 · SMH 12 · VIX 12 · NAS100 11 · DXY 8 · US2Y 6 + tail (ITA/BTC/NVDA/EURUSD/MSFT/GBPUSD/HY SPREAD/HYG/KBE/HBAN)
- market_prices 46 symbols: mega-cap + regional banks (HBAN/KEY/RF/TFC/WAL/ZION/FITB) + ETFs (ARKX/IBIT/ITA/KBE/KRE/SMH/XLE/XLF) + indices (NAS100/US500) + FX 8 + คริปโต (BTC/ETH/SOL) + commodities (COPPER/NATGAS/WHEAT/XAGUSD/XAUUSD/USOIL) + yields (US10Y/US30) + VIX/DXY/BKX — **เปิดอิสระจริงแต่ใช้ชุดเดิมซ้ำๆ**
- **stance schema จริง** (→ ticket 04 mirror): `{unit, asset, due_at, reason, stance, horizon, price_at, consensus, qualified, confidence, horizon_days}` · outcome: `h.results[l] = {unit, asset, stance, correct, change_pct, horizon, scored_at, horizon_days}` · d1/d3/d7: `{unit, asset, stance, correct, change_pct} + scored_at`
- สังเกต: h.results อาจเป็น [] (มี outcome.h แต่ยังไม่สรุป) · d1/d3/d7 เก็บ scored_at แยกวัน · stance ตัวจริงมี confidence 50-55 + qualified=false บ่อย (มุมมองเยอะ)

**ส่งต่อ:** ticket 04 ได้ schema จริง + เกณฑ์ครบ (ladder/unit/due_at/qualified/win-loss-push/on-read settlement/cold-start)

**ห้ามแตะโค้ด production**
