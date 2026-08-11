# Research — หน้า ภาพรวม (/) ของ reference bond-crisis-dashboard-v2 (2026-08-11)

> ใบ 01 ของแผน `.scratch/bond-crisis-100/` — ทุกหลักฐาน raw (chunk URL + quote จริง)

## 1. แหล่ง dig

| ไฟล์ | URL | bytes |
|---|---|---|
| `page.js` (module 89547 = หน้า /) | `/_next/static/chunks/app/page-a8a4c2ec736b803c.js` | 16,503 |
| `chunk-7362` (module 57362 = 6 โมเดล + maps) | `/_next/static/chunks/7362-4aa258e42d947c01.js` | 15,395 |
| `layout.js` (nav paths) | `/_next/static/chunks/app/layout-5d0f7e068c531837.js` | 25,757 |
| i18n | `boardroom/dig/i18n-3474.js` (แผนพี่น้อง) | 98,337 |
| Supabase tables | REST vovprwjjauwqqiowwgqd (anon key จาก bundle — user อนุญาตอ่าน) | — |

## 2. โครงสร้างหน้า (จาก module 89547)

**Data fetch — 6 queries พร้อมกัน** (`Promise.all`):
```js
r.ND.from("crisis_phase_current").select("*").single()
r.ND.from("model_scores").select("*").order("rank")
r.ND.from("macro_series").select("*").in("series_id", [...g, ...k])   // g=13W..30Y, k=8 key figures
r.ND.from("risk_warnings").select("*").eq("active", true).order("triggered_at", {ascending: false})
r.ND.from("country_risk_scores").select("*")
r.ND.from("ai_briefs").select("*").order("generated_at", {ascending: false}).limit(1)
```
- `g` = `["us13w","us1y","us2y","us5y","us10y","us20y","us30y"]` (yield tenors)
- `k` = `["us10y","us2y","vix","dxy","xauusd","usoil","us_hy_spread","us_banking_stress_index"]` (ตัวเลขสำคัญ)
- refreshMs = 60000 (auto-refresh 1 นาที)

**ปุ่ม "สร้างสรุปใหม่"** → `POST /functions/v1/ai-brief` (Supabase Edge Function) + header `Authorization: Bearer <anon>`, body `{}` → แล้ว reload ข้อมูล

**UI sections (i18n keys ใช้จริง):**
- AI สรุป: `b.aiBrief` + `H.generated_at` (relative) + ปุ่ม `b.refreshBrief` (disabled ขณะ `S`, error → `b.actionFailed` + `b.analyzing`)
- คำแนะนำ: `b.aiRecommendations` · จินตนาการ: `b.aiScenarios` · เหตุการณ์: `b.upcomingEvents` + footer `b.calendarSource` ("ข้อมูลปฏิทินจาก ForexFactory")
- การแจ้งเตือน: `b.activeWarnings` + count
- REGIME: `b.regime` + `b.confidence` + `b.transitionZone` (badge ถ้า is_transition_zone) + `Z.triggers.slice(0,3)` (name + strength)
- โมเดลอันดับ 1: `b.topModel` — `V = T[0]` (rank 1) → `o.L6[V.model_id]` (nameTh/nameEn) + score (1 ทศนิยม) + `o.Zt[V.status]` (badge) + `Y.tradeDirection` + link `b.models` → /models
- คะแนนประเทศ: `b.countryRisk` + `b.viewAll` — `[...K].sort((e,t)=>t.score-e.score)` (top 7 + "ดูเพิ่มเติม (20)")
- (ตัวเลขสำคัญ + Yield Curve + 6 โมเดล: component แยกในหน้า — ดูใบ 01 ต่อ / หน้าจริง)

## 3. Maps (module 57362 — chunk-7362)

**L6 = 6 โมเดล** (`i = ["recovery-reflation","inflation-oil","fed-pivot","yield-shock","credit-panic","bank-run"]`) — แต่ละตัว:
```js
{id, nameEn, nameTh, shortEn, shortTh, conceptEn, conceptTh, tradeDirection, regimeEn, regimeTh,
 phase, indicators:[{name, weight, logic}], signalMap:[{asset, category, direction, reason}]}
```
ตัวอย่าง recovery-reflation: `tradeDirection: "Long NAS100/US500, Long Oil, Short Gold, Short JPY"`,
indicators: Credit Spread Narrowing 20 / VIX Falling 15 / DXY 15 / US10Y 15 / Yield Curve 15 / MOVE 6

**Qw = phase map** (REGIME): `normal/ปกติ emerald · recovery/ฟื้นตัว sky · inflation-pressure/แรงกดดันเงินเฟ้อ amber · policy-pivot/นโยบายเปลี่ยนทิศ violet · yield-shock/Yield ช็อก orange · credit-stress/วิกฤตสินเชื่อ red · banking-stress/วิกฤตแบงก์รัน rose` (color = text-*)

**Zt = status map**: `inactive/ไม่ทำงาน slate · building/กำลังก่อตัว amber · active/ทำงาน emerald · fading/อ่อนแรง orange`

**model colors**: `recovery-reflation:#38bdf8 · inflation-oil:#f59e0b · fed-pivot:#a78bfa · yield-shock:#f97316 · credit-panic:#f87171 · bank-run:#34d399`

## 4. Supabase tables (อ่านจริง — โครงสร้าง row)

**crisis_phase_current** (1 row):
```json
{"id":1, "phase":"recovery", "confidence":90, "is_transition_zone":true, "top_model_id":"recovery-reflation",
 "gap_to_second":3.4, "triggers":[{"name":"VIX falling < 18","strength":85},{"name":"USD weakening","strength":59},
 {"name":"Curve un-inverting","strength":71},{"name":"MOVE calm (bond vol low)","strength":82}],
 "updated_at":"2026-08-11T10:00:05.852+00:00"}
```

**model_scores** (6 rows, order rank): `{model_id, score, rank, confidence, status, factors:{news, macro, conditions:[{name,score}], confirmation, risk_penalty, market_structure}, updated_at}`

**macro_series**: `{series_id, country_code, name_en, name_th, category, tenor, value, prev_value, change_val, change_pct, unit, trend, source, recorded_at, updated_at, display_order, value_label}`

**risk_warnings**: `{id, type:"jgb_shock", severity:"medium", message_en, message_th, threshold_desc:"JP10Y > 2.5%", current_value:2.8, country_code:"JP", active:true, triggered_at, resolved_at}`

**country_risk_scores**: `{country_code, score, level:"low", components:{yield_level, data_freshness, yield_momentum, curve_inversion, fx_depreciation}, updated_at}`

**ai_briefs** (limit 1, order generated_at desc):
```json
{id:603, brief_md:"ตลาดตอนนี้เข้าสู่ช่วง 'recovery'...", recommendations:["..."x3],
 scenarios:["CPI 12 ส.ค. แรง...", "CPI ต่ำตามคาด...", "PPI 13 ส.ค. + ประมูลบอนด์ 30Y แย่..."],
 key_events:[{date, title:"Core CPI m/m", impact:"High", country:"USD", date_th:"12 ส.ค. 2026 19:30 น.", forecast:"0.2%", previous:"0.0%"}...],
 model_used:"glm/glm-5.2", generated_at:"2026-08-11T09:15:20.33485+00:00"}
```

**ข้อค้นพบสำคัญ**: เหตุการณ์สำคัญข้างหน้า = `ai_briefs.key_events` (LLM สร้างพร้อม brief — ไม่ใช่ตารางแยก) · AI ใช้ **glm/glm-5.2** (ผ่าน edge function ai-brief) · i18n มี `chatMissingKey: "ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY..."` (เคยใช้ Claude — ปัจจุบัน glm)

## 5. i18n ภาษาไทย (verbatim — ใช้ใน UI mirror)

`ภาพรวม · อัพเดตล่าสุด · AI สรุปสถานการณ์ · สร้างสรุปใหม่ · กำลังวิเคราะห์... · ทำรายการไม่สำเร็จ — ลองใหม่อีกครั้ง · คำแนะนำ · จินตนาการ · เหตุการณ์สำคัญข้างหน้า · ข้อมูลปฏิทินจาก ForexFactory · การแจ้งเตือนที่ทำงานอยู่ · Regime ปัจจุบัน · ความมั่นใจ · โซนเปลี่ยนผ่าน · โมเดลอันดับ 1 · โมเดลทำกำไร · คะแนนความเสี่ยงประเทศ · ดูทั้งหมด · อ่านต่อ · ย่อ · คาด · ก่อนหน้า`

## 6. เปิดคำถาม → ใบถัดไป

- **edge function ai-brief**: prompt/ขั้นตอน (ดึงข้อมูลอะไรส่งให้ GLM) — ต้อง dig เพิ่ม (ใบ 05 backend)
- **แหล่ง ForexFactory**: reference แจ้ง "ข้อมูลปฏิทินจาก ForexFactory" — key_events ถูกสร้างโดย LLM — ต้องตรวจว่า edge function ดึงจาก ForexFactory โดยตรงหรือจาก table (research ต่อในใบ 05)
- ตัวเลขสำคัญ/Yield Curve/6 โมเดล section: component อยู่ใน module อื่น (ต้องหาเพิ่ม — หน้าแสดงแล้วแต่ module 89547 มีแค่ส่วนบน)
