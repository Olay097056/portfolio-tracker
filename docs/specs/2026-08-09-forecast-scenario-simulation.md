# จำลองสถานการณ์ (Scenario Simulation tab) — Bond-crisis sub-tab #7

Date: 2026-08-09
Status: Spec (wayfinder map `.scratch/forecast-tab/map.md` — all 8 tickets resolved, user decisions captured 2026-08-09)

## 1. ขอบเขต (Scope)

**ทำ:** Sub-tab ที่ 7 ของ Bond-crisis ชื่อ "จำลองสถานการณ์" — what-if slider panel (ไม่มีแกนเวลา): ผู้ใช้ปรับตัวแปรมหภาค → คำนวณคะแนน 6 โมเดลใหม่ทันที (เทียบกับค่าจริงปัจจุบัน) + ผลต่อสัญญาณเทรด + news factor ที่กลับมาทำงาน

**ไม่ทำ (Out of scope — คัดจาก map):**
- บันทึก/แชร์ฉากทัศน์ (ไม่มีตาราง DB + endpoint + UI สำหรับเก็บ scenario)
- แจ้งเตือน Telegram เมื่อฉากทัศน์เกิดจริง
- แกนเวลา/การพยากรณ์ไปข้างหน้า ("ถ้า Fed ลด ก.ย. อีก 3 เดือนคะแนนเป็นเท่าไหร่") — what-if ณ ขณะนี้เท่านั้น
- หน้าอื่นของต้นฉบับที่ยังไม่ทำ (ห้องประชุม, ออฟฟิศ 3D)

**ที่มา:** หน้า `/forecast` ของ bond-crisis-dashboard-v2.vercel.app (JS bundle `app/forecast/page-13d84abe72938506.js`, 10,641 bytes — reverse-engineered 2026-08-09, evidence ใน `docs/research/forecast-page-2026-08-09.md`). ต้นฉบับคำนวณ client-side ด้วยสูตร "แบบย่อ" h() — **เราใช้ backend ของเราเอง (scorer จริง) ไม่ใช่สูตรย่อของเขา**

## 2. ชุดตัวแปรที่ปรับได้ (11 ตัว + 6 ตัวข่าว)

Slider ล้วน (ตามต้นฉบับ): **ค่าส่วนต่าง (signed)** ทุกตัวเริ่มที่ 0 = ปัจจุบัน ยกเว้น `auctionBtc` เป็นค่าสัมบูรณ์ default 2.5

| key | ชื่อไทย (จาก i18n ต้นฉบับ) | หน่วย | ช่วง | ขั้น | default | map ไป ctx | กติกาพันกัน |
|---|---|---|---|---|---|---|---|
| `fedBps` | Fed ขึ้น/ลดดอกเบี้ย | bps | −200..200 | 25 | 0 | `us10y` += fedBps/100×0.5, `us2y` += fedBps/100, `curve_10y2y_bps` = us10y−us2y | ต่อเนื่อง (3 คีย์พร้อมกัน) |
| `oilPct` | ราคาน้ำมันเปลี่ยน | % | −40..60 | 5 | 0 | `wti_chg_pct` = oilPct | — |
| `goldPct` | ราคาทองคำเปลี่ยน | % | −20..40 | 5 | 0 | `gold_chg_pct` = goldPct, `xauusd` = base×(1+goldPct/100) | ต่อเนื่อง (2 คีย์) |
| `vixPts` | VIX เปลี่ยน | pts | −10..30 | 1 | 0 | `vix` = base + vixPts | — |
| `hyBps` | HY Spread เปลี่ยน | bps | −100..400 | 25 | 0 | `us_hy_spread` = base + hyBps/100 | — |
| `cpiPts` | เงินเฟ้อ CPI เปลี่ยน | pt | −2..3 | 0.25 | 0 | `us_cpi_yoy` = base + cpiPts | — |
| `depositPct` | เงินฝากแบงก์ (2 สัปดาห์) | % | −3..1 | 0.25 | 0 | `deposits_chg_pct` (WoW) = depositPct | — |
| `dwBillion` | Fed Discount Window พุ่ง | $B | 0..100 | 5 | 0 | `discount_window_b` = base + dwBillion | — |
| `sofrSpreadBps` | SOFR-EFFR spread (repo ตึง) | bps | 0..100 | 5 | 0 | `sofr_effr_spread_bps` = sofrSpreadBps | — |
| `debtPts` | หนี้สหรัฐต่อ GDP เพิ่ม | pt | 0..20 | 1 | 0 | `us_debt_gdp` = base + debtPts | — |
| `auctionBtc` | ประมูล 10Y Bid-to-Cover | x | 1.8..3.2 | 0.1 | **2.5** | `us10y_auction_btc` = auctionBtc | ค่าสัมบูรณ์ (ตัวเดียว) |

**ตัวแปรข่าว (ของเราเพิ่ม — ต้นฉบับไม่มี):** 6 slider "ระดับข่าวแรง" 0-100/step 5/start 0 ต่อโมเดล: `news-{recovery-reflation, inflation-oil, fed-pivot, yield-shock, credit-panic, bank-run}` — จำลอง "ถ้ามีข่าวแรงระดับ X เกี่ยวกับโมเดล Y"

**กติกา available=false:** ตัวแปรใดที่ค่าฐานสดไม่มี → เปิดให้ลากได้ + ใช้ค่ากลาง (fallback) ของต้นฉบับ: us10y 4.2, us2y 3.8, vix 18, usoil 70, us_hy_spread 300, us_cpi_yoy 3 + แสดง warning เหลือง "⚠️ ไม่มีค่าฐานสดของ <id> — ใช้ค่ากลางแทน — ความไวของผลจำลองส่วนนั้นเป็นค่าประมาณ" (list ตัวที่ใช้ค่ากลางต่อท้าย)

**Preset scenarios (5 อัน, ออกแบบเอง):** น้ำมันช็อก / เฟดช็อก / วิกฤตเครดิต / เงินฝากไหลออก / รีเฟลชัน — ตั้งค่าหลาย slider พร้อมกัน ค่าที่แน่นอนกำหนดตอน implement (อ้างอิง prototype-07)

## 3. สัญญา API

### `POST /api/models/simulate`

**Request:**
```json
{
  "overrides": {
    "fedBps": 150,
    "vixPts": 12,
    "news-bank-run": 90
  }
}
```
- key ทั้งหมดเป็น optional — ตัวที่ไม่ส่ง = 0/ค่าเริ่มต้น
- **Validation (backend):** ค่าแต่ละ key ต้องอยู่ในช่วงตารางข้อ 2 (min/max) — นอกช่วง → `422` พร้อมรายการ key ที่ผิด ("overrides.fedBps: 250 is outside [-200, 200]")

**Response:**
```json
{
  "baseline": [
    {"model_id": "yield-shock", "score": 56.9, "status": "active", "confidence": 0.82, "factors": {"market_structure": 17.6, "macro": 27.3, "news": 0.0, "confirmation": 12.1, "risk_penalty": 0.0}},
    {"model_id": "bank-run", "score": 11.7, "status": "inactive", "confidence": 0.91, "factors": {}},
    "... 6 models, ranked by score desc"
  ],
  "simulated": [
    {"model_id": "bank-run", "score": 44.2, "status": "building", "confidence": 0.91, "delta": 32.5, "factors": {...}},
    "... 6 models, ranked by simulated desc"
  ],
  "missing_base": ["us_hy_spread", "us_cpi_yoy"],
  "simulated_at": "2026-08-09T15:30:00Z",
  "us10": 4.47
}
```
- **baseline** = คะแนนจริงปัจจุบัน (จาก `build_models()` + shared macro cache 10 นาที)
- **simulated** = `_score_model(model, {**ctx, **overrides})` — เหมือน baseline ทุกอย่าง แต่ ctx ถูก override ตามกติกาพันกันข้อ 2
- `delta` = simulated.score − baseline.score (ต่อโมเดล)
- **confidence: ไม่นับค่าสมมติ** — indicator ที่ถูก override ยังนับเป็น "ไม่มีข้อมูลจริง" (สัดส่วนข้อมูลจริงเสมอ)
- `missing_base` = list series ที่ใช้ค่ากลาง (สำหรับ warning เหลือง)

**Gating/cache:**
- baseline ใช้ cache 10 นาทีร่วมกับ `/api/models` — **แต่ freeze ตอนเปิดหน้า**: frontend ดึง baseline ครั้งเดียวตอนโหลด เก็บใน state ตลอดการใช้งาน (ค่าฐานไม่ขยับใต้มือผู้ใช้)
- simulate ไม่ cache (คำนวณสดในหน่วยความจำ — `_score_model` เป็น pure function เร็ว ไม่แตะ network)

### ปลุก news factor (ผลข้างเคียงของงานนี้)

`model_service.py:721` `news = 0.0` (comment "no news feed in this app yet" — ล้าสมัย) → เปลี่ยนเป็นคำนวณจริง:

- **สูตรรวม:** ข่าวใน `news_items` ที่ `related_models` มี model นี้ → impact_score ถ่วงน้ำหนักความสด: 0-2 วัน ×1.0, 3-5 วัน ×0.5, 6-7 วัน ×0.25 → รวม cap 100 → news factor = (น้ำหนัก × cap 15 คะแนนเต็ม)
- **หน้าต่าง:** 7 วัน (ข่าวเก่ากว่า 7 วันไม่นับ)
- **ทิศทาง:** บวกเท่ากันทุกโมเดลที่เกี่ยว (ใช้ impact_score เดียว — ไม่มี field ทิศทาง)
- **ไม่มีข่าวเลย:** factor **drop** (ไม่นับใน denominator — เหมือน indicator ที่ไม่มีข้อมูล) — คะแนนรวมยังถึง 100 ได้
- **ผลต่อประวัติ:** `model_score_history` เดิม (1794 แถว) เป็นคนละมาตรวัด → **เส้นแบ่งในกราฟประวัติ** ("คะแนนก่อน/หลังรวม news factor") — date = deploy date

## 4. ผลต่อสัญญาณเทรด (ในหน้าจำลองเอง)

- **ขอบเขตที่กล้าอ้าง: "สัญญาณที่มีสิทธิ์เกิด"** — โมเดลที่ simulated ≥ 40 (building) → แสดงว่า "มีสิทธิ์เกิด" + **ระบุชัดเสมอว่า "ยังต้องรอ TA ยืนยัน (ta_score ≥ 50)"** — ไม่ดึง TA จริง ไม่พยากรณ์ว่าเกิดแน่
- **บอกทั้งสองทาง:** สัญญาณที่ simulated ≥ 40 แต่ baseline < 40 → "🟢 มีสิทธิ์เกิดใหม่" · สัญญาณที่ baseline ≥ 40 แต่ simulated < 40 → "🔴 อ่อนแรง/หาย" (หลุดเกณฑ์ก่อตัว)
- **model_conviction:** คำนวณใหม่ตาม simulated score (แสดงในสัญญาณจำลอง)
- **🚫 ข้อห้ามเด็ดขาด (spec):** สัญญาณจำลอง **ห้ามเขียนลงตาราง `trading_signals`** เด็ดขาด — คำนวณสดในหน่วยความจำแล้วทิ้ง (จะปนกับสถิติ win rate จริง)

## 5. UI (ตาม prototype-07 ที่ user อนุมัติ "ลุยเลย")

อ้างอิง: `.scratch/forecast-tab/prototype-07/index.html` — ดีไซน์ระบบของแอป (inline style, ink palette, **ไม่มี Tailwind**)

- **Layout:** grid 2 คอลัมน์ (380px + 1fr), มือถือ (<900px) ยุบ 1 คอลัมน์
- **แผงซ้าย:** 5 preset pills (น้ำมันช็อก/เฟดช็อก/วิกฤตเครดิต/เงินฝากไหลออก/รีเฟลชัน) → slider จัดกลุ่ม 4 หมวด (อัตราดอกเบี้ย / ความผันผวน-สินค้าโภคภัณฑ์ / เครดิต-เงินเฟ้อ / สภาพคล่องธนาคาร) + กลุ่มข่าว 6 slider → แถว "↺ รีเซ็ตค่าทั้งหมด" + ค่าจริงปัจจุบันของตัวแปรหลัก (US10Y/VIX/WTI/HY) → disclaimer
- **แผงขวา:** การ์ด 6 โมเดล ranked #1-#6 ตาม simulated: badge สถานะ (ไม่ทำงาน/กำลังก่อตัว/ทำงาน) + score → simulated + delta สี (เขียว >0.5 / แดง <−0.5 / เทา) + **double progress bar** (base slate = score%, overlay accent ถ้า delta≥0 / orange ถ้า delta<0, opacity .85) + **เส้นขอบประสีเหลือง** เมื่อ simulated ≠ score + ข้อความ ▲ "ถ้าเกิดสถานการณ์นี้ โมเดลจะเริ่มพิจารณาสัญญาณเหล่านี้" / ▼ "ถ้าเกิดสถานการณ์นี้ โมเดลจะต่ำกว่าเกณฑ์ก่อตัวและหยุดพิจารณาสัญญาณใหม่" + expand: ตาราง factor (มหภาค/โครงสร้างตลาด/ข่าว/ยืนยัน/บทลงโทษ × ปัจจุบัน/จำลอง/Δ) + ตารางสินทรัพย์ที่เกี่ยวข้อง (signalMap)
- **Section "ผลต่อสัญญาณเทรด"** ใต้รายการโมเดล (เฉพาะเมื่อมีสัญญาณเกิดใหม่/อ่อนแรง) + หมายเหตุ "ยังต้องรอ TA ยืนยัน (ta_score ≥ 50) — สัญญาณจำลองไม่ถูกบันทึกลงประวัติ"
- **การแยกค่าสมมติจากค่าจริง (หลักห้ามละเมิด):** banner ใต้ header "⚠️ ตัวเลขทั้งหมดในหน้านี้เป็นสถานการณ์สมมติ (what-if) ที่ผู้ใช้ตั้งค่าเอง — คะแนน สัญญาณ และผลกระทบไม่ใช่ข้อมูลจริงและไม่ใช่คำแนะนำการลงทุน" + ขอบประเหลืองบนการ์ด + disclaimer ใต้ปุ่มรีเซ็ต: "การจำลองเป็นค่าประมาณทิศทางจากตรรกะเดียวกับ scoring engine (แบบย่อ) — ไม่ใช่ผลการคำนวณเต็มรูปแบบ · ไม่ใช่คำแนะนำการลงทุน และไม่ใช่สัญญาณจริง"
- **สถานะกำลังคำนวณ:** badge ลอยมุมขวาบน "⏳ กำลังคำนวณ..." — debounce 250ms หลัง slider change (backend round-trip)
- **Copy ไทย (i18n ต้นฉบับ):** จำลองสถานการณ์ / ปรับสถานการณ์สมมติ / ผลกระทบต่อคะแนนโมเดล / ไม่มีค่าฐานสดของ / scenarioActivates / scenarioDeactivates / สินทรัพย์ที่เกี่ยวข้อง / เกณฑ์ทำงาน (60)

## 6. กลยุทธ์การเทสต์

**Backend (`test_models_router.py` หรือ `test_forecast_router.py` ใหม่):**
- simulate รับ overrides → simulated ต่างจาก baseline ตามที่คาด (snapshot test กับ scenario เงินฝากไหลออก: bank-run เด่นสุด)
- override ค่านอกช่วง → 422 พร้อม key ที่ผิด
- override ตัวแปรพันกัน → curve = us10y−us2y หลัง override (fedBps เปลี่ยน 3 คีย์)
- ตัวแปรที่ไม่มีข้อมูลจริง (missing_base) → warning list ถูก + confidence ไม่เปลี่ยน (ไม่นับค่าสมมติ)
- news factor: ข่าวใน 7 วัน impact 60 → news factor ตามสูตร; ไม่มีข่าว → factor drop (total ถึง 100 ได้); ข่าวเก่า 8 วันไม่นับ
- simulated ไม่ถูก persist ลง trading_signals (หลังเรียก simulate จำนวนแถวตารางไม่เปลี่ยน)
- baseline freeze: simulate เรียกซ้ำค่าคงที่ (ไม่มี cache หมดอายุกลางทาง)

**Frontend (`ForecastDashboard.test.tsx` ใหม่):**
- render 11+6 sliders ครบ, preset คลิก → slider เปลี่ยน + recalc
- การ์ดแสดง score→simulated + delta สีถูก (เขียว/แดง/เทา)
- ขอบประเหลืองเฉพาะการ์ดที่ simulated ≠ score
- "กำลังคำนวณ..." แสดงระหว่างรอ (fake timers + debounce 250ms)
- สัญญาณ section: แสดงเมื่อมีเกิดใหม่/อ่อนแรง, ซ่อนเมื่อไม่มี
- มือถือ breakpoint (ไม่ใช่ test หลัก — ตรวจด้วย screenshot)

**เคสขอบ:** ทุกโมเดลหลุดเกณฑ์พร้อมกัน (simulated < 40 หมด — สัญญาณ section ซ่อน, ไม่มี ▲/▼), slider ทุกตัว default (simulated == baseline ทุกการ์ด, ไม่มีขอบประ), ข้อมูลจริงทั้งหมด missing (ทุกตัวใช้ค่ากลาง — warning เต็ม list)

## 7. หลักการที่ห้ามละเมิด

1. **ไม่แต่งตัวเลข** — ข้อมูลไม่มี → "—" (เหมือนทั้งโปรเจค)
2. **ค่าจำลองต้องแยกจากค่าจริงเสมอ** — ขอบประเหลือง + banner + disclaimer (ผู้ใช้ต้องไม่มีทางเข้าใจผิด)
3. **🚫 ห้ามเขียนสัญญาณจำลองลง `trading_signals`** — เด็ดขาด (ปน win rate จริง)
4. **confidence ไม่นับค่าสมมติ** — สัดส่วนข้อมูลจริงเสมอ
5. **ไม่เพิ่ม dependency** — SVG/สไตล์ inline ล้วน (โปรเจคไม่มี Tailwind/recharts)

## 8. ลำดับการลงมือ

1. `backend/app/model_service.py` — ปลุก news factor (สูตรข้อ 3) + เพิ่ม scorer ให้ dead keys (sofr_effr_spread_bps, us_debt_gdp, us2y level) — อันนี้ทำก่อนเพราะ affect baseline ของทุกโมเดล
2. `backend/app/routers/models.py` — `POST /api/models/simulate` (overrides → ctx override → `_score_model`) + validation
3. Backend tests (ข้อ 6) → pytest ผ่าน
4. `frontend/src/components/tools/ForecastDashboard.tsx` — UI ตาม prototype-07 (debounce 250ms + freeze baseline ตอนเปิดหน้า)
5. Frontend tests → vitest ผ่าน
6. ต่อ sub-tab ที่ 7 ใน `BondCrisisPage.tsx` ("จำลองสถานการณ์")
7. เส้นแบ่ง "ก่อน/หลังรวม news factor" ในกราฟประวัติ ModelsDashboard
8. smoke จริง + commit (user rule: อัปเดต spec ก่อน commit)
