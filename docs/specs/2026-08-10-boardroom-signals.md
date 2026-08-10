# สัญญาณจากที่ประชุม (Boardroom Signals sub-tab) — Bond-crisis sub-tab #9

Date: 2026-08-10
Status: **Shipped** — commits `44f0b2b` (backend) + `a0d0848` (frontend sub-tab)
แผน: `.scratch/boardroom-signals/` (tickets 01–06) · Spec เขียนจากโค้ดที่ ship จริง (อ่านไฟล์ทีละบรรทัด — บทเรียน forecast-tab)

## 1. ขอบเขต

**ทำ:** อ่านจุดยืน (stances) จากมติห้องประชุม (`boardroom_meetings.resolution_json`) → resolve แหล่งราคาจริง → ติดตาม P&L สด + จุดตรวจ +1/+3/+7 + ผลสรุป win/loss/push → สถิติ (อัตราถูกทาง/P&L เฉลี่ย/track record) — UI sub-tab "สัญญาณที่ประชุม" ใน Bond-crisis

**ไม่ทำ:** คริปโตผ่านแหล่งอื่น (ได้ผ่าน yfinance อยู่แล้ว) · ระบบ scheduler (settlement คำนวณ on-read) · filter "มติล่าสุดต่อสินทรัพย์" (เก็บทั้งคู่ — ตาม ticket 02) · ป้ายความสดระดับ quote_at ของกลุ่ม pct (v1 แสดงแค่ป้าย "ราคารายวัน" ของกลุ่ม bp — ตาม ticket 05 Answer)

**ห้ามละเมิด:** เขียนลง `trading_signals` เด็ดขาด — สัญญาณจากที่ประชุมอยู่ในตาราง `boardroom_stances` ของตัวเอง (เทสต์ยืนยันด้วยการนับแถว)

## 2. โครงสร้างจุดยืน + schema

จุดยืนมาจาก `resolution_json.stances[]` ของประชุม (engine boardroom — แต่ละตัว):

```json
{"asset": "<ตัวย่อ/ชื่อตลาด + หมวด เช่น US10Y ยีลด์, TLT ETF, XAUUSD สินค้าโภคภัณฑ์, BTC-USD คริปโต>",
 "stance": "long|short|neutral|insufficient_evidence",
 "confidence": 0, "horizon": "short|medium|long", "horizon_days": 0,
 "unit": "bp|pct", "due_at": "<ISO = วันประชุมจบ + horizon_days>",
 "qualified": true, "price_at": 4.66, "reason": "..."}
```

- `neutral`/`insufficient_evidence` ถูกกรองออกตอน materialize
- `unit` ที่ AI เขียนจะถูก **validate กับ unit ที่ derive จากชื่อ** (`classify_unit`) — ต่างกัน → ใช้ derived + flag `unit_mismatch=True` (กันกลับทิศ)
- `qualified` — ถ้าไม่ระบุ → default = `confidence >= 60` (semantics "มุมมอง" จาก brSigViewsDesc)
- `due_at` ไม่มา → `ended_at + horizon_days` · `horizon_days` **clamp 1–90** (เกิน 90 → 90 — `clamp_horizon`)

**ตาราง `boardroom_stances`** (แยกจาก trading_signals):

| คอลัมน์ | หมายเหตุ |
|---|---|
| id / meeting_id / stance_index | key = meeting:index |
| asset | ชื่อที่ AI เขียน (≤60) |
| price_key | ticker/series_id ที่ resolve จริง |
| source | alias / yfinance / system |
| unit | bp / pct (หลัง validate) |
| direction | long / short |
| price_at / started_at / due_at | ราคาเข้า · เริ่มนับ (meeting ended) · ครบกำหนด |
| horizon_days / confidence / consensus / qualified / reason / unit_mismatch / created_at | |

**ตาราง `boardroom_unresolved_assets`**: สินทรัพย์ที่หาแหล่งไม่เจอ (asset, meeting_id, attempts, last_tried_at) — re-resolve ทุกครั้งที่เปิดหน้า (แคป 10/ครั้ง — `_re_resolve`)

## 3. การ resolve ราคา (ladder 5 ชั้น — `resolve_price_key`)

```
1. ALIAS_MAP (dict ~68 ตัว)          → price_key, source="alias"
2. MACRO_SERIES set                  → series_id (us10y/us2y/us30y/us5y/us_hy_spread/us_ig_spread), source="system"
3. ชื่อ yield/spread ตาม regex/set   → ถ้าไม่ใช่ series ที่รู้จัก → None (หา FRED เพิ่มไม่ได้ — ไม่มี key)
4. _yf_search (yfinance Search)      → ticker ตัวแรกที่ quoteType ∈ {EQUITY,ETF,INDEX,CURRENCY,FUTURE,CRYPTOCURRENCY}, source="yfinance"
5. ไม่เจอ → None → boardroom_unresolved_assets
```

- หน่วย: `classify_unit(asset)` — regex `/^(US|TH|JP|VN|FR|EA)\d{1,3}[YW]$/` → bp (ยิลด์) · set {US_HY_SPREAD, US_IG_SPREAD, US_SOFR_EFFR_SPREAD, FR_OAT_BUND_SPREAD, LA_MOFL_SPREAD} → bp (สเปรด) · ที่เหลือ pct
- ราคา/ประวัติ: **bp → `macro_service.build_dashboard()`** (FRED รายวัน, cache 10 นาที — values + rows/history) · **pct → `price_service.get_price`** (yfinance fast_info) + `_yf_candles` (จาก signals_service — 60 daily candles [{o,h,l,c,t}])

## 4. P&L + ผลสรุป (คำนวณสด on-read — ไม่มี storage/scheduler)

**P&L (`pnl_score`) — เดิมพันทิศทาง series ตรงๆ:**

```
bp:    (current − price_at) × 100 × dir          # ยิลด์ 4.66→4.70 long = +4.0
pct:   (current − price_at) / |price_at| × 100 × dir   # ทอง 4400→4620 long = +5.0%
dir:   long = +1, short = −1
```

**Push line (`push_line`) + ผลสรุป (`settle`):**

```
line = (unit == "bp" ? 4.0 : 0.5) × √(max(1, horizon_days) / 3)
win   = score >  line        loss = score < −line        push = |score| ≤ line
```

- ตัวอย่าง: pct 30 วัน → line = 0.5×√10 ≈ 1.58% · bp 30 วัน → 4×√10 ≈ 12.65bp
- `_price_at_date(history, target)` = close ของวันซื้อขายล่าสุด ≤ target (วันหยุดเลื่อน)

**State machine (`_settlement_for` + payload):**

```
now < due_at                        → pending (นับถอยหลัง)
due_at ผ่าน + หาราคาได้              → settled (verdict win/loss/push)
due_at ผ่าน + ราคาดึงไม่ได้            → awaiting (รอสรุปผล)
price_key เป็น None                  → unresolved (ตรวจไม่ได้ — ไม่มีราคา)
```

- จุดตรวจ `_checks_for`: d1/d3/d7 — ราคา ณ `started_at + N วัน` → score → correct = win?true : loss?false : null (ยังไม่ถึงเวลา/ข้อมูลไม่พอ = null — ไม่ใช่ 0)
- DD `_dd_for`: max adverse excursion จาก candles ระหว่าง started→due (long = min low, short = max high → % ≤ 0)

## 5. Endpoint

**`GET /api/boardroom/stances`** (routers/boardroom_signals.py) → `{stances, stats}`

- stances[]: id, meeting_id, asset, price_key, source, unit, direction, price_at, current, pnl, dd, due_at, started_at, horizon_days, confidence, consensus, qualified, reason, unit_mismatch, state, verdict, checks[]
- stats: pending_count · settled_count · win_rate (null ถ้า n<10 — cold_start) · wins/losses/pushes · n · cold_start · pnl_live{pct,bp,n} · pnl_realized{pct,bp,n} · track_record[] (asset, unit, wins, losses, pushes, win_pct null ถ้า n<10, avg) · checks_summary[] (k, judged, pct null ถ้า judged<10, wins)
- Re-resolve ทำงานก่อนตอบ (แคป 10)

## 6. UI (BoardroomSignalsDashboard) + copy ไทย

- แถบสถิติ 4 ช่อง: กำลังนับถอยหลัง (count + sub "N สรุปแล้ว") · อัตราถูกทาง (cold-start → "รอข้อมูลเพิ่ม") · P&L สด (ยังไม่ปิด) · P&L สรุปแล้ว — tooltip "รวมแบบน้ำหนักเท่ากันทุกสัญญาณ" — P&L เฉลี่ยแยก pct/bp พร้อม "(เฉลี่ย · n)"
- แท็บ: กำลังนับถอยหลัง / สรุปแล้ว
- กลุ่ม: "กลุ่มราคา (%)" (ฟ้า) — "ETF · ดัชนี · ทอง/น้ำมัน · FX — P&L คิดเป็น % จากราคาเข้า" · "กลุ่ม Yield / สเปรด (bp)" (ม่วง) — "พันธบัตรและสเปรดเครดิต วัดเป็น basis point (1bp = 0.01 จุด)"
- การ์ดสัญญาณ: สินทรัพย์ + ทิศทาง (LONG↑/SHORT↓ + ยิลด์/สเปรด) + 🤝/⚔️ · P&L (เขียว/แดง/เทา) + unit chip · สถานะ (⏳เหลือ Xd Yh · ✓ถูกทาง/✗ผิดทาง/≈เสมอ · ⏳รอสรุปผล · ตรวจไม่ได้ — ไม่มีราคา · ⏸ราคายังไม่ขยับ) · จุดตรวจ "จุดตรวจ: d1✓ d3✗ d7— · ยังไม่ถึงเวลา" · ราคาตอนมติ → ราคาปัจจุบัน ("—" ถ้าไม่มี) · DD · ความมั่นใจ% · เกิดสัญญาณ (วันที่) · "ไปที่ประชุม →" (โฟกัสมติในแท็บห้องประชุม) · ป้าย "ราคารายวัน" (กลุ่ม bp — FRED)
- มุมมอง (ไม่เข้าบัญชี): qualified=false — "stance ที่ความมั่นใจ <60 หรือมีนักวิเคราะห์หนุนอิสระ <2 คนตอนรอบวิเคราะห์อิสระ" — สูงสุด 12 ใบ
- สรุปผลจุดตรวจระหว่างทาง (+1/+3/+7 วัน) — judged<10 → "รอข้อมูลเพิ่ม" · สถิติรายสินทรัพย์ (ไว้เรียนรู้) — W/L/winRate/P&L avg แยกกลุ่ม pct/bp
- empty: "ยังไม่มีสัญญาณนับถอยหลัง" / "ยังไม่มีสัญญาณที่สรุปแล้ว" + "คิวแรกครบกำหนด"
- disclaimer: "มุมมอง (ไม่เข้าบัญชี) — ข้อมูลเพื่อการศึกษาเท่านั้น ไม่ใช่คำแนะนำการลงทุน ไม่ใช่ออเดอร์จริง"
- Polling 90s · นับถอยหลัง re-render 30s · cold-start: n<10 → ไม่โชว์ % (ห้าม 100% หลอกตา)

## 7. ความสัมพันธ์กับแผน boardroom

- มติ: `boardroom_meetings.resolution_json` (engine `boardroom_service.py`) — resolution prompt มี `unit/due_at/qualified` (เพิ่มใน ticket 04) · `_after_resolution` เรียก `materialize_stances` (try/except + rollback — สัญญาณล้มไม่ทำให้ประชุม fail)
- หน้า: sub-tab #9 ใน BondCrisisPage — "ไปที่ประชุม" ส่ง `focusMeetingId` → BoardroomDashboard (โหลดมติอัตโนมัติ)
- settlement ใช้อินพุตของแผน boardroom (started_at = meeting ended, price_at จากมติ) — ไม่พึ่ง outcome ใน resolution

## 8. กลยุทธ์เทสต์ (test_boardroom_stances.py — 12 เทสต์)

- ราคา/FRED/LLM **stub 100%** (monkeypatch `_yf_search`/`_yf_candles`/`_macro_data`/`price_service.get_price`) — ไม่ยิง network
- ครอบคลุม: materialize (unit/qualified/due_at/clamp/unresolved) · P&L 2 กลุ่ม + ทิศทางกลับ · checks ยังไม่ถึง → null · settlement win/loss/push · awaiting เมื่อไม่มีราคา · stats cold-start · **trading_signals count ก่อน/หลังเท่ากัน** · endpoint ผ่าน TestClient

## 9. ตัวเลขจริง (รันสด 2026-08-10)

- pytest: **506 passed** (494 boardroom เดิม + 12 สัญญาณ) · vitest: **603 passed / 73 files** · tsc -b: สะอาด · hermes verify: ok
- portfolio.db จริงไม่ถูกแตะ: trading_signals 12→12 · boardroom_stances 0→0 · boardroom_meetings 0→0 (ก่อน/หลังรัน suite เต็ม)

## 10. Git history

- `44f0b2b` — backend: boardroom_stance_service + router + engine hook + tests
- `a0d0848` — frontend: sub-tab สัญญาณที่ประชุม + focus handoff + tests
