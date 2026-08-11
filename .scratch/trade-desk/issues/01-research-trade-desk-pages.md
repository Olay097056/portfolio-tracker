# 01 - Research: ขุด /trade-desk + /meetings + /settings ของต้นฉบับ

Type: research
Status: closed
Claimed: hermes/2026-08-10
Blocked by: —

## Question

ห้องเทรดจำลองของต้นฉบับทำงานยังไง — ทั้งสามหน้า

## วิธีทำ — ไม่ต้อง login

ยืนยันแล้วว่าเปิดสาธารณะ **ห้ามสมัครบัญชีหรือกรอกรหัสผ่าน**

```js
const html = await (await fetch('/trade-desk')).text();
html.match(/\/_next\/static\/chunks\/app\/[^"'\s)]+\.js/g)
```

- หน้าหลัก: `/_next/static/chunks/app/trade-desk/page-d3de5400d9825f64.js` (19,551 B) — **ขุดแล้วได้ระดับหนึ่ง ดูข้อเท็จจริงใน map ก่อน อย่าทำซ้ำ**
- **ยังไม่ได้ขุด**: `/trade-desk/meetings` และ `/trade-desk/settings` — หา chunk ด้วยวิธีเดียวกัน
- copy ไทย: `/_next/static/chunks/3474-e1aec38ee927d485.js` ค้น `td` (คีย์ `tdTitle`, `tdSubtitle`, `tdTeams`, `tdGen`, `tdStatus*`, `tdTurnQuota*`, `tdMasterOn/Off`, ...)

**กติกาบังคับ:** แนบข้อความดิบ + URL ทุกข้อ · หาไม่เจอเขียน "หาไม่เจอ" ห้ามเดา

## สิ่งที่ต้องได้กลับมา

1. **schema พอร์ต/ทีม/สถานะ** — RPC `get_state`, `get_closed_positions`, `get_snapshots`, `get_closed_pnl` คืนอะไร field อะไรบ้าง
2. **ทีมตัดสินใจยังไง** — หัวหน้าทีม + ลูกทีม 6 คนทำหน้าที่อะไรต่างกัน ใครเป็นคนเคาะออเดอร์ กี่คอล LLM ต่อหนึ่งเทิร์น
3. **`/trade-desk/meetings`** — ต่างจาก `/boardroom` ยังไง ทีมประชุมกันเองก่อนเทรดหรือเปล่า (**สำคัญ: ตัดสินว่า reuse เครื่องยนต์จากแผน `boardroom` ได้ไหม**)
4. **`/trade-desk/settings`** — ตั้งค่าอะไรได้ (สวิตช์หลัก? โควตา? ทุนตั้งต้น? กติกาไล่ออก?)
5. **โควตาเทิร์น** — กี่เทิร์นต่อช่วงเวลา รีเซ็ตเมื่อไหร่ ทำไมต้องมี
6. **กลไกพอร์ต** — leverage เท่าไหร่ margin คิดยังไง liquidation ตัดที่ไหน SL/TP ตั้งยังไง มีค่าธรรมเนียม/funding ไหม
7. **"รุ่น" + การไล่ออก** — เกณฑ์อะไรทำให้ทีมโดนภาคทัณฑ์/พัก/ไล่ออก ทีมรุ่นใหม่ต่างจากรุ่นเก่ายังไง ใครเป็นคนกำหนด
8. **MTD/WTD target + directive** — คืออะไร ใครตั้ง มีผลต่อการตัดสินใจของทีมยังไง
9. **สรุปรายเดือน** — สรุปอะไร ใครเขียน (LLM?)
10. **ราคา Hyperliquid** — endpoint สาธารณะไหม ต้องมีคีย์ไหม สินทรัพย์อะไรบ้าง (**เราจะดึงราคาอย่างเดียว ห้ามเทรด** — ดูว่า API อ่านอย่างเดียวใช้ได้ฟรีไหม)
11. **layout ทั้ง 3 หน้า + copy ไทยคีย์ `td*` ทั้งหมด**

## Answer

**ขุดเสร็จ 2026-08-10 — doc: `docs/research/trade-desk-page-2026-08-10.md`** — 3 หน้า (main/meetings/settings) + i18n td* 622 คีย์ → `dig/td-i18n.txt`

**สรุปสั้น (ครบทุกคำถามของใบ):**
1. **โครงสร้างหน้า**: ห้องเทรดจำลอง 9 ทีม (เรา 2) — พอร์ต $10,000/ทีม · สถานะ ทำงาน/ภาคทัณฑ์/พัก/ถูกไล่ออก · รุ่น (-gN) · RPC ผ่าน `call({action})` ตัวเดียว: get_state · get_snapshots (days) · get_closed_pnl · get_closed_positions · get_signals (/meetings)
2. **สูตร equity (module 50726 — ใช้ตรงได้)**: `equity = balance + reserved + Σmargin + Σ((long?1:-1)×size×(mark−entry))` · `pnlPct = (equity−capital)/capital×100`
3. **การ์ดทีม**: อันดับ/family/status · Equity/ทุน/เงินสด/กำไร% · MTD vs เป้า 5–20% (amber/sky/emerald) · WTD vs weekly_target (เฉพาะสัปดาห์ตั้ง) · mini chart (snapshots ≥2) · สุขภาพ ✓✗🔁 · orders ⏳ · directive 📌 · โควตาเทิร์น ⏸ n/วัน · เทิร์นถัดไป
4. **กราฟ**: metric usd/pct/rebase/pnl (pnl ดึง get_closed_pnl on-demand) · range 24h/7d/30d/all (30d/all merge snapshots) · scale focus/full · team chips + แสดง fired
5. **Monthly digest**: reviews kind=monthly → ranking 🥇🥈🥉 + pnl% · window = ต้นเดือน
6. **master switch**: ปิดแล้วทีมหยุดเทิร์นใหม่ แต่ราคาไหล + SL/TP/liq ยังทำงาน (i18n raw ใน doc)
7. **/meetings ≠ ประชุม AI!** — เป็น get_signals (สัญญาณสุขภาพทีม) + user_profiles — ไม่มีการประชุมในหน้านี้ (แก้สมมติฐานใน map)
8. **/settings**: get_state · list_models · set_settings (master + monthly targets + daily cap) · set_team_models (assign โมเดลต่อทีม — ต้นฉบับหลายค่าย; ของเราไม่ต้อง)
9. **i18n td* 622 คีย์** ครบใน dig/td-i18n.txt (tdTitle/tdSubtitle/tdTeams/tdEquity/tdStatus*/tdMtd/tdWtd/tdChart*/tdRange*/tdScale*/tdMonthlyDigest...)

**หาไม่เจอ (ออกแบบเองใน 02/04):** กลไกตัดสินใจของทีม (วิธีเทิร์น/entry/SL/TP) · กติการุ่น/ไล่ออก (2 ทีมอาจไม่ต้อง) · ราคา: ต้นฉบับ Hyperliquid มี funding/OI — เรามี yfinance/FRED (ไม่มี funding/OI — ปรับตารางตลาด) · SL/TP/liq กลไกจริง

**ปลดบล็อก:** 02 ✅

`docs/research/trade-desk-pages-<วันที่>.md` → ปลดบล็อก ticket 02, 04, 05

**ห้ามแตะโค้ด production**
