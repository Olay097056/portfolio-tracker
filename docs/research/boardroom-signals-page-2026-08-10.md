# Boardroom Signals page — สัญญาณจากที่ประชุม (reverse-engineered)

Date: 2026-08-10 · แผน `.scratch/boardroom-signals/` ticket 01 (research)
ที่มา: `https://bond-crisis-dashboard-v2.vercel.app/boardroom/signals` — chunk `/_next/static/chunks/app/boardroom/signals/page-74bc82dedeac55aa.js` (28,633 B — ใหญ่กว่าหน้าห้องประชุมเกือบ 4 เท่า ตรรกะหลักของฟีเจอร์อยู่ที่นี่) + shared `/_next/static/chunks/7317-9c94f4234f11962d.js` (module 18551) + `/_next/static/chunks/9704-a48e6f90bb9a6b53.js` (module 26079) + i18n `/_next/static/chunks/3474-e1aec38ee927d485.js` (คีย์ brSig*)

chunk เดิมเคยโหลดไว้แล้วใน dig ของแผน boardroom (`br-page-74bc82dedeac55aa.js`) — ใช้ต่อ ไม่ขุดซ้ำ · โหลดเพิ่ม 3 chunk ที่ขาด (8356/9704/44530001) หา module 26079 (DD)

## 1. โครงสร้างจุดยืน (stance) ที่หน้าอ่านจาก resolution_json

โค้ดดิบ (page-74bc82…, บรรทัด 43–49):

```js
let o = d.resolution_json?.stances ?? []
let u = d.resolution_json?.outcome?.h?.results ?? []
o.forEach((s, l) => { ... if (!s.asset || "insufficient_evidence"===s.stance || "neutral"===s.stance) return
  let b = String(s.asset).toUpperCase(), f = s.price_at ?? null, k = priceBy.get(b) ?? null
  ... C = s.due_at ? Date.parse(s.due_at) : NaN
  ... {asset, stance, confidence, horizon, horizon_days, price_at, due_at, consensus, reason, qualified}
  ... key = `${d.id}:${l}`   // meetingId:index ใน stances array
```

**field ที่ใช้:** `asset` · `stance` (long/short/neutral/insufficient_evidence — สองหลังถูกกรองออก) · `confidence` · `horizon` · `horizon_days` · `price_at` (ราคาเข้า) · `due_at` (กำหนดครบ — ISO string) · `consensus` (unanimous/contested → ไอคอน 🤝/⚔️) · `reason` · `qualified` (boolean — `!1!==s.qualified`)

**ผลตรวจสอบที่ผูกกับจุดยืนรายตัว:** `outcome.h.results[l]` = ผลสรุปขั้นสุดท้าย และ `outcome.d1/d3/d7.results[l]` = จุดตรวจ — **array ขนานกับ stances** (index l เดียวกัน) — ตรงกับโครงสร้างที่แผน boardroom ขุดไว้แล้ว

**⚠️ ช่องว่างของเครื่องยนต์เรา (สำคัญสำหรับ ticket 04):** หน้า needs `due_at` + `qualified` ต่อ stance — resolution prompt ของเรา (boardroom_service.py:1005) มีแค่ `asset/stance/confidence/horizon/horizon_days/price_at/reason` — **ต้องเพิ่ม due_at + qualified** (และ outcome.d1/d3/d7/h สำหรับ settlement — งาน ticket 04)

## 2. สูตร P&L สองกลุ่ม (module 18551 — `m$`, raw):

```js
function m$(e,t,s){ // (current, price_at, unit)
  return Number.isFinite(e)&&Number.isFinite(t)
    ? "yield_pct"===s ? (e-t)*100          // ยีลด์: (ราคาปัจจุบัน−เข้า)×100 → "pct points" (4.69→4.75 = +6)
    : "spread_bps"===s ? e-t               // สเปรด: ต่างตรงๆ เป็น bps (271→260 = −11)
    : 0===t ? null : (e-t)/Math.abs(t)*100 // ราคา: % จากราคาเข้า
    : null }
```

- กลุ่มราคา (%) = หน่วย `price` → `(cur−entry)/|entry|×100` · กลุ่ม yield/สเปรด (bp) = หน่วย `yield_pct`/`spread_bps` (ต่างกัน: ยีลด์คูณ 100 เพราะหน่วยเป็น % → จุด, สเปรดเป็น bps ตรง)
- ทิศทาง: `A = long?1 : short?−1 : 0` → **pnl = pnl_raw × A** (short ได้กำไรเมื่อราคาลง) — `S = w*A`
- ราคาที่แสดง (card หลัก): live = pnl ถ้ายังไม่ settled · settled = realized (`outcome.h.results[l].change_pct × A`) — `l = "settled"===state ? realized : pnl`
- หน่วยสินทรัพย์ map (module 18551 `j$`, raw):

```js
let n = /^(US|TH|JP|VN|FR|EA)\d{1,3}[YW]$/          // ยีลด์: US10Y, TH2Y, JP30Y...
let l = new Set(["US_HY_SPREAD","US_IG_SPREAD","US_SOFR_EFFR_SPREAD","FR_OAT_BUND_SPREAD","LA_MOFL_SPREAD"])
function j$(e){ let t=e.toUpperCase(); return l.has(t) ? "spread_bps" : n.test(t) ? "yield_pct" : "price" }
function jD(e){ return "price"===e ? "pct" : "bp" }  // กลุ่มแสดงผล
```

## 3. จุดตรวจ +1/+3/+7 วัน

- เก็บใน `resolution_json.outcome.d1/d3/d7.results[l]` = `{k:"d1"|"d3"|"d7", correct: bool|null, change_pct, unit}` — หน้าอ่าน: `["d1","d3","d7"].flatMap(e => outcome[e]?.results[l] ? [{k:e, correct, change_pct, unit}] : [])`
- **ใครวัด/เก็บ:** server-side daily job — หลักฐานจาก i18n (ดิบ `brSigChecksDesc`): *"วัดจากราคา ณ +1/+3/+7 วันหลังประชุม (Telegram รายงานรอบเช้า ~07:00 น. — วันหยุดตลาดอาจเลื่อน)"* — มี background job รอบเช้า ~07:00 คำนวณราคา ณ +1/+3/+7 วันหลังประชุม แล้วเขียน `correct` เข้า outcome — **กลไกจริง (วิธีคำนวณ correct, ตาราง, cron) หาไม่เจอ — ต้องออกแบบเองใน ticket 04** (เรารู้แค่ว่า: หลังประชุม N วัน เทียบราคา, วันหยุดเลื่อน)
- ยังไม่ถึงเวลา → badge "ยังไม่ถึงเวลา" (`brSigChecksNone`)
- หน้าสรุปจุดตรวจ: `judged` = จำนวนที่มี correct ไม่ใช่ null · `%` = wins/judged — แสดงเฉพาะ d1/d3/d7 ที่มี judged > 0
- เกณฑ์ "ผ่าน" ของจุดตรวจ: ใช้ค่า `correct` ที่ job เขียนมา (boolean) — เกณฑ์เชิงลึกหาไม่เจอ

## 4. นิยาม "อัตราถูกทาง"

```js
let W = L.filter(e => "settled"===e.state)          // เฉพาะ qualified + settled
let U = e => $p(e.settled.correct, e.settled.change_pct, e.unit, e.horizonDays)
let I = W.filter(e => "win"===U(e)).length, H = ...loss..., R = ...push...
let B = I + H
let G = B ? Math.round(I/B*100) : null              // win rate = wins/(wins+losses) × 100
```

- **ตัวหาร = เฉพาะที่สรุปแล้ว (settled) และไม่นับ push** — ยังไม่ปิด/unknown ไม่นับ · push นับแยก (≈)
- **เกณฑ์ถูกทาง (module 18551 `$p`, raw):**

```js
function $p(correct, change_pct, unit, horizonDays) {
  return correct==null || change_pct==null ? "unknown"
    : correct ? "win"
    : Math.abs(change_pct) < ("bp"===unit ? 4 : 0.5) * Math.sqrt(Math.max(1, horizonDays ?? 1)/3) ? "push"
    : "loss" }
```

- `correct===true` → win ทันที · `correct===false` → เทียบ |change_pct| กับเส้น push: `< (bp?4:.5)×√(max(1,days)/3)` → เสมอ (เช่น days=30: bp เส้น 4×√10≈12.6bp, price เส้น 0.5×√10≈1.58%) · เกิน → loss · correct/change_pct ว่าง → unknown
- หัวการ์ด Win rate: sub แสดง `IW / HL` (+ `≈R เสมอ` ถ้ามี) — ถ้ายังไม่มี settled เลย แต่มี d3 judged → fallback `จุดตรวจ +3วัน: N% · judged` (i18n `brSigCheckFallback`)

## 5. "รวมแบบน้ำหนักเท่ากันทุกสัญญาณ"

**ไม่เฉลี่ยข้ามกลุ่ม** — แยก pct/bp คนละ panel (raw):

```js
let $ = E.filter(e => "pct"===e.unit).map(e => e.pnl).filter(v => v!=null)   // pending pct
let V = E.filter(e => "bp"===e.unit).map(e => e.pnl).filter(v => v!=null)   // pending bp
let Q = $ .length ? sum($) /$.length : null    // P&L สดเฉลี่ย pct
let J = V.length ? sum(V)/V.length : null      // P&L สดเฉลี่ย bp
// เดียวกันกับ settled: K/Z (pct/bp) → et/es (P&L สรุปแล้วเฉลี่ย)
```

- "เฉลี่ย" = ผลรวม P&L ÷ จำนวนสัญญาณ (equal weight ต่อสัญญาณ ไม่ใช่ต่อสินทรัพย์)
- แสดง 2 panels: **P&L สด (ยังไม่ปิด)** + **P&L สรุปแล้ว** — แต่ละ panel มี 2 แถว (กลุ่มราคา % + กลุ่ม yield/สเปรด bp) พร้อม "(เฉลี่ย X · n)"

## 6. การครบกำหนด (state machine, raw):

```js
if (settled && settled.correct !== null) g = "settled"          // มีผลสรุปแล้ว
else if (Number.isFinite(C) && now < C) g = "pending"           // ยังไม่ครบ: ⏳ เหลือ Xd Yh (นับถอยหลัง realtime ทุก 30s)
else { if (!Number.isFinite(C)) return; g = "awaiting" }        // ครบแล้วแต่ยังไม่มีผล: ⏳ รอสรุปผล (amber)
```

- กำหนดครบ = `stance.due_at` (ตั้งตอนทำมติ — ใครตั้ง/ตั้งยังไง หาไม่เจอ ต้องออกแบบเอง)
- เลยกำหนดแล้วไม่มีผลสรุป → `awaiting` — แสดง amber badge "รอสรุปผล" ค้างไว้ในรายการ (ไม่หาย ไม่มี fallback อัตโนมัติ)
- นับถอยหลัง: `Date.now()` state อัปเดตทุก 30s + format `Xd Yh` / `Xh Ym` / `X น.` (ไทย)

## 7. ราคามาจากไหน

```js
// 4 queries ขนาน (Supabase):
1. boardroom_meetings completed → id, agenda, ended_at, resolution_json  (limit 60)
2. boardroom_meetings completed + resolution_json->outcome->h ไม่ใช่ null  (limit 200)  // ประชุมที่มีผลสรุป
3. market_prices → symbol, price, candles, recorded_at, quote_at          // ทุกสินทรัพย์
4. macro_series → series_id, value (value not null)                        // fallback ยีลด์/สเปรด
// merge: priceBy เริ่มจาก market_prices → macro_series เติมเฉพาะที่ยังไม่มี
for (m of macro_series) { let t = series_id.toUpperCase(); if (!priceBy.has(t) && value!=null) priceBy.set(t, value) }
```

- `market_prices` = แหล่งหลัก (symbol/price/candles/quote_at) · `macro_series` = **fallback สำหรับ yield/spread series ที่ไม่มีใน market_prices** (เช่น US10Y, US_HY_SPREAD)
- `pricesUpdatedAt` = max recorded_at ของ market_prices → แสดง "🕐 ดึงข้อมูลล่าสุด HH:MM (X ชม.ที่แล้ว)" · refresh ปุ่ม + polling **90 วินาที**
- กลุ่ม yield ใช้ทั้งสองแหล่ง (market_prices ก่อน, macro_series เสริม) — ไม่ใช่แหล่งเดียว
- ราคาที่ใช้คำนวณ: `quoteAt` แสดง "โควตจริงล่าสุด" tooltip · `current` = ราคา snapshot ล่าสุดจาก market_prices

## 8. จุดยืนขัดกันข้ามมติ

**โค้ดไม่จัดการเลย** — ทุก stance จากทุกประชุม completed กลายเป็นสัญญาณแยก (key = meetingId:stanceIndex) — สองมติชี้ตรงข้ามสินทรัพย์เดียวกัน = การ์ด 2 ใบ แยกประชุม (ไม่มี dedupe/merge/priority) · หน้าจึงมี "สถิติรายสินทรัพย์" (track record) เป็นตัวรวมภาพแทน — สัญญาณขัดกันปรากฏเป็น W/L ที่สวนกันในตารางนั้นเอง

## 9. Layout + copy ไทย (brSig*)

**โครงสร้างหน้า (จากโค้ด):**
1. breadcrumb ← กลับห้องประชุม · header: title "สัญญาณจากที่ประชุม" + subtitle "รวมจุดยืนทุกมติ — ราคาปัจจุบัน · P&L สด · นับถอยหลังจนครบกำหนด" + ปุ่ม retry + "ดึงข้อมูลล่าสุด"
2. **แถวสถิติ 4 ช่อง** (`grid-cols-2 sm:grid-cols-4`): (ก) "กำลังนับถอยหลัง" = จำนวน pending + sub "N สรุปแล้ว" (ข) "อัตราถูกทาง" = % + sub "IW / HL (≈R เสมอ)" หรือ fallback จุดตรวจ +3วัน (ค) "P&L สด (ยังไม่ปิด)" — เฉลี่ย pct + เฉลี่ย bp (ง) "P&L สรุปแล้ว" — เฉลี่ย pct + เฉลี่ย bp — tooltip "รวมแบบน้ำหนักเท่ากันทุกสัญญาณ"
3. **แท็บ**: ทั้งหมด / กำลังนับถอยหลัง / สรุปแล้ว + สลับมุมมอง เต็ม/กระชับ (localStorage `bcd-brsig-view`)
4. **กลุ่มสัญญาณ** แยกตามหน่วย: กลุ่มราคา (%) ป้ายฟ้า · กลุ่ม Yield/สเปรด (bp) ป้ายม่วง — หน้าเว้น 10 ต่อหน้า (แยก pager ต่อกลุ่ม) — ว่าง → "ยังไม่มีการประชุม..." / "ยังไม่มีสัญญาณที่สรุปแล้ว" + "คิวแรกครบกำหนด"
5. **การ์ดสัญญาณ** (เต็ม): ขอบซ้ายเขียว=long/แดง=short · แถวบน: สินทรัพย์ + จุดยืน badge (LONG↑/SHORT↓ ตามทิศ yield/spread) + 🤝/⚔️ consensus · P&L ตัวใหญ่ + หน่วย chip · badge สถานะ (✓ถูกทาง/✗ผิดทาง/≈เสมอ + P&L สรุปแล้ว + "N วัน" · ⏳เหลือ Xd Yh · ⏳รอสรุปผล · ⏸ราคายังไม่ขยับ) · แถวจุดตรวจ `d1✓ d3✗ d7—` · mini chart (candles ระหว่าง ended→due, เส้นสีตามทิศ) · 4 ช่อง: ราคาตอนมติ / ราคาปัจจุบัน (tooltip โควตจริง) / **ขาดทุนสูงสุดระหว่างทาง (max drawdown)** / กำหนดครบ · ความมั่นใจ N% · เกิดสัญญาณ (วันที่ประชุมจบ)
6. **มุมมอง (ไม่เข้าบัญชี)** — stance ที่ `qualified=false` — ความมั่นใจ <60 หรือหนุนอิสระ <2 (i18n `brSigViewsDesc`) — แสดงการ์ดย่อสุด 12 ใบ หัว "👁️ มุมมอง (ไม่เข้าบัญชี)"
7. **สรุปผลจุดตรวจระหว่างทาง** — d1/d3/d7: % + "NW / L" (เฉพาะที่มีผลแล้ว)
8. **สถิติรายสินทรัพย์ (ไว้เรียนรู้)** — ตาราง: สินทรัพย์ / W-L (≈push) / อัตราถูกทาง / P&L เฉลี่ย — แยกกลุ่ม pct/bp

**copy ไทย `brSig*` (ดิบจาก i18n):** brSignalsTitle "สัญญาณจากที่ประชุม" · brSignalsSubtitle "รวมจุดยืนทุกมติ — ราคาปัจจุบัน · P&L สด · นับถอยหลังจนครบกำหนด" · brSigActive "กำลังนับถอยหลัง" · brSigTabSettled "สรุปแล้ว" · brSigWinRate "อัตราถูกทาง" · brSigPnlLive "P&L สด (ยังไม่ปิด)" · brSigPnlRealized "P&L สรุปแล้ว" · brSigAvg "เฉลี่ย" · brSigEqualWeight "รวมแบบน้ำหนักเท่ากันทุกสัญญาณ" · brSigGroupPct "กลุ่มราคา (%)" · brSigGroupPctDesc "ETF · ดัชนี · ทอง/น้ำมัน · FX — P&L คิดเป็น % จากราคาเข้า" · brSigGroupBp "กลุ่ม Yield / สเปรด (bp)" · brSigGroupBpDesc "พันธบัตรและสเปรดเครดิต วัดเป็น basis point (1bp = 0.01 จุด)" · brSigCorrect "ถูกทาง" · brSigWrong "ผิดทาง" · brSigPush "เสมอ" · brSigRemaining "เหลือ" · brSigAwaiting "รอสรุปผล" · brSigDone "ครบแล้ว" · brSigFlat "ราคายังไม่ขยับ" · brSigFlatTip "ราคาปัจจุบันยังเท่าราคาตอนเปิดสัญญาณเป๊ะ — ตลาดอาจปิดอยู่" · brSigChecks "จุดตรวจ:" · brSigChecksSummary "สรุปผลจุดตรวจระหว่างทาง (+1/+3/+7 วัน)" · brSigChecksDesc "วัดจากราคา ณ +1/+3/+7 วันหลังประชุม (Telegram รายงานรอบเช้า ~07:00 น. — วันหยุดตลาดอาจเลื่อน)" · brSigChecksNone "ยังไม่ถึงเวลา" · brSigCheckFallback "จุดตรวจ +3วัน:" · brSigViews "มุมมอง (ไม่เข้าบัญชี)" · brSigViewsDesc "stance ที่ความมั่นใจ <60 หรือมีนักวิเคราะห์หนุนอิสระ <2 คนตอนรอบวิเคราะห์อิสระ" · brSigTrackRecord "สถิติรายสินทรัพย์ (ไว้เรียนรู้)" · brSigDDFull "ขาดทุนสูงสุดระหว่างทาง (max drawdown)" · brSigPredPriceAt "ราคาตอนมติ" · brSigQuoteAt "โควตจริงล่าสุด" · brSigPricesUpdated "ดึงข้อมูลล่าสุด" · brSigCreatedAt "เกิดสัญญาณ" · brSigToMeeting "ไปที่ประชุม" · brSigFirstDue "คิวแรกครบกำหนด" · brSigNone / brSigNoneSettled (empty states)

## 10. สินทรัพย์ที่รองรับ

**ไม่มีรายการตายตัว** — รับ asset ใดก็ได้ที่ AI เขียนใน stance (`String(s.asset).toUpperCase()`) แต่:
- หน่วย (yield/spread/price) อนุมานจากชื่อ: regex `/^(US|TH|JP|VN|FR|EA)\d{1,3}[YW]$/` → yield · set {US_HY_SPREAD, US_IG_SPREAD, US_SOFR_EFFR_SPREAD, FR_OAT_BUND_SPREAD, LA_MOFL_SPREAD} → spread_bps · ที่เหลือ → price
- ต้องมีราคาใน `market_prices` (หรือ macro_series เฉพาะ yield/spread) ถึงจะคำนวณ P&L/DD ได้ — ไม่มีราคา → pnl=null แสดง "—" แต่การ์ดยังโชว์ (ราคาเข้า + สถานะ)
- **ของเรา:** ต้องป้อนราคาให้ครอบคลุมสินทรัพย์ที่มติจะพูดถึง (ทอง น้ำมัน ดัชนี ETF FX = market_prices มีอยู่แล้ว · US10Y/US_HY_SPREAD ฯลฯ = macro_series ของเรามี 27 คีย์ FRED ครอบคลุม) — ticket 03 (asset universe) ตัดสินรายการ

## 11. หาไม่เจอ (ต้องออกแบบเอง — บันทึกให้ ticket 02/03/04)

1. **settlement job** — กลไกคำนวณ `correct` ของจุดตรวจ d1/d3/d7 (วิธีเทียบราคา เกณฑ์ เงื่อนไขวันหยุด — รู้แค่ "มี job ~07:00 + Telegram" จาก i18n) — งาน ticket 04
2. **วิธีตั้ง `due_at`** — ต้นฉบับอ่านจาก stance.due_at (ตั้งตอนทำมติ — ใคร/สูตรอะไร หาไม่เจอ) — ต้องออกแบบ (ticket 02: horizon_days → due_at = ended_at + horizon_days?)
3. **เกณฑ์ "qualified" เชิงโค้ด** — UI อ่าน `s.qualified` (field จากมติ) — คำอธิบาย "conf<60 หรือหนุนอิสระ<2" เป็น semantics — กลไกที่ CEO/engine ใช้ตั้งค่านี้ หาไม่เจอ — ต้องออกแบบ (ticket 04: เพิ่ม field กับ prompt resolution)
4. หน้าขัดกันข้ามมติ = ไม่มีกลไก (ข้อ 8) — ใช้ track record เป็นตัวรวมภาพแทน

## 12. ช่องว่างของเรา (ไป ticket 04)

| ต้นฉบับมี | เรามี | ต้องเพิ่ม |
|---|---|---|
| `stance.due_at` | ❌ ไม่มีใน prompt resolution | + field + กำหนดจาก horizon_days |
| `stance.qualified` | ❌ ไม่มี | + field + เกณฑ์ (conf≥60 + หนุน≥2 ตาม brSigViewsDesc) |
| `outcome.h/d1/d3/d7.results[]` | ❌ ไม่มี (ไม่มี settlement job) | + ตารางผลจุดตรวจ + job ~07:00 (หรือคำนวณ on-read) |
| `market_prices` candles | ✅ มี (ราคา+candles) | — |
| `macro_series` fallback | ✅ มี (macro 27 คีย์ FRED) | map series_id → หน่วย yield/spread |

**ผลต่อแผน:** ปลดบล็อก ticket 02 (scoring/settlement), 03 (asset universe + ราคา), 05 (frontend) — 04 ต้องแก้ engine (due_at/qualified) + สร้าง settlement
