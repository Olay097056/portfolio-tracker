# Research — หน้า CME (โซน CME) ของ reference bond-crisis-dashboard-v2 (2026-08-11)

> ใบ 02 ของแผน `.scratch/bond-crisis-100/` — ทุกหลักฐาน raw (chunk URL + quote)

## 1. แหล่ง dig

| ไฟล์ | URL | bytes |
|---|---|---|
| `cme-page.js` (module 82816 = หน้า /cme เต็ม 42.6KB) | `/_next/static/chunks/app/cme/page-af55db0b4c202c41.js` | 44,231 |
| `cme.html` (หน้า /cme — gated แต่ chunk โหลด) | `https://bond-crisis-dashboard-v2.vercel.app/cme` | 29,612 |
| i18n cme* keys | `boardroom/dig/i18n-3474.js` | 162 คีย์ |
| เนื้อหาจริง (preview login) | 14,670 chars — 50 ผลิตภัณฑ์ + FedWatch + AI | — |

## 2. สถาปัตยกรรมข้อมูล (จาก module 82816)

**3 Supabase edge functions** (ทั้งหมด POST + Bearer token):
```js
// 1) ข้อมูลโซน CME ทั้งหมด (50 ผลิตภัณฑ์ — vol2vol)
fetch(m.VI + "/functions/v1/cme-read", {method:"POST",
  headers:{Authorization:"Bearer " + access_token, "Content-Type":"application/json"},
  body: JSON.stringify({action:"get_zone"})})          // refreshMs 300s (admin 60s)
// 2) AI บทวิเคราะห์ภาพรวม/รายผลิตภัณฑ์
fetch(m.VI + "/functions/v1/cme-brief?force=" + encodeURIComponent(c), {method:"POST", ...})
// 3) งานดึงข้อมูล (cron) — mode=probe / mode=ingest
"/functions/v1/fetch-cme-vol?mode=probe"  ·  "/functions/v1/fetch-cme-vol?mode=ingest"
```
- `cme-read` ต้อง **access_token (login)** — "rate_limited" error มี `retry_after_s` (rate limit ฝั่ง vol2vol)
- `cme-brief` คืน `{generated: ["<product>:..."], model_used, fact_expiration}` — ปุ่ม "วิเคราะห์ใหม่" (b.cmeBriefRefresh)

**2 Supabase tables (anon อ่านได้ — เหมือนหน้า overview):**
```js
m.ND.from("macro_series").select("series_id, value, recorded_at").in("series_id", [...cotIds])
m.ND.from("macro_series_history").select("series_id, value, recorded_at")
   .in("series_id", [...cotBasis, ...fwIds])
   .gte("recorded_at", new Date(Date.now() - 3456e7).toISOString())   // 30 วัน (3456e7 ms)
   .order("recorded_at", {ascending:true})
```

**series ids (จาก module — ตรงกับที่ใช้ในหน้า):**
- COT managed money (MM): `cot_gold_mm_net` `cot_silver_mm_net` `cot_copper_mm_net` `cot_wti_mm_net` `cot_wheat_mm_net` `cot_corn_mm_net`
- COT leveraged (TFF): `cot_jpy_lev_net` `cot_dx_lev_net`
- COT basis trade (AM + lev): `cot_ust10y_am_net` `cot_ust10y_lev_net` `cot_ust30y_am_net` `cot_ust30y_lev_net`
- FedWatch (history 30d): `us_fedwatch_prob` `us_fedwatch_move_bp`

## 3. หน้า CME — sections (i18n keys ใช้จริง)

1. **อีเวนต์ข้างหน้า** (`cmeEventTitle`) — จากออปชันรายสัปดาห์คร่อมวันงาน: "CPI m/m · 12 ส.ค. พันธบัตร 10 ปี ±0.42% (WY2Q6) · ทองคำ ±1.84% (G2WQ6)" — ±% = ครึ่งกรอบ ±1σ
2. **AI วิเคราะห์ภาพรวม** (`cmeBriefZoneTitle` + `cmeBriefBullets` ประเด็นสำคัญ + `cmeBriefWatch` จับตา) — model_used badge
3. **FEDWATCH** (`cmeFwTitle`) — โอกาส/ขนาดที่ประชุม: 56% ขึ้น 25bp · `cmeFwImplied` ดอกเบี้ยเฉลี่ยเดือนสัญญา · `cmeFwEffr` EFFR ปัจจุบัน · `cmeFwContract` อ่านจากสัญญา 96.305 OZQU6 · `cmeFwSource`: "คำนวณในระบบจากราคาสัญญา Fed Funds (ZQ) ของ CME เทียบ EFFR — วิธีเดียวกับ CME FedWatch"
4. **FedWatch ย้อนหลัง** (`cmeFwChartTitle` + `cmeFwChartDesc`) — เส้นขาดตรงรอยต่อสัญญา/ประชุม
5. **กรอบ ±σ เทียบทุกผลิตภัณฑ์** — แถวละ 1 ผลิตภัณฑ์ บนแกน σ ร่วม (-3σ..+3σ) — หมุดหยุดที่ ±3.2σ
6. **เจาะรายผลิตภัณฑ์** (`cmeDetailTitle`) — สัญญา/หมดอายุ/กรอบตามระยะ (±1σ 4ชม/24ชม/72ชม) + กำแพงรวม (`cmeAggWall` C/P ปริมาณวันนี้) + IV รายราคา (`cmeVolSettle`) + IV ย้อนหลัง (`cmeIvTrend`) + P/C ย้อนหลัง (`cmePcChartTitle`) + AI วิเคราะห์ผลิตภัณฑ์ (`cmeBriefProductTitle`)
7. **อันดับความผันผวนแฝง** (`cmeIvRank`) — โลหะ/พลังงาน/คริปโต/อัตราดอกเบี้ย พร้อม DTE
8. **ตารางรวม** — ผลิตภัณฑ์/หมวด/สัญญา/ราคาสด/IV/P-C/กรอบ ±1σ/กรอบต่อวัน/หมดอายุ (50 แถว)
9. **กระแสเงินทองคำ CME** (`cmeFlowTitle` + `cmeFlowHelp`) — OI/ΔOI/วอลุ่ม/OI ออปชัน/วอลุ่มออปชัน (gold-volume · CME public report รายวัน T+1)
10. **COT** (`cmeCotTitle`) — MM bar chart + TFF (ค่าเงิน) + **basis trade** (`cmeCotBasis` — ช่องว่าง AM vs Lev, 12 เดือน history)
11. **ตารางแหล่งข้อมูล/ข้อจำกัด** — vol2vol/CFTC Socrata/TreasuryDirect/Hyperliquid + `cmeGap*` keys

## 4. i18n ภาษาไทย (สำคัญ — cme* ทั้งหมด 162 คีย์ อยู่ใน i18n-3474.js)

`โซน CME — ออปชัน ฟิวเจอร์ส และสถานะรายใหญ่ · กรอบราคาที่ตลาดออปชันคาด (±σ) ... · ข้อมูลตลาดออปชัน CME {n} ผลิตภัณฑ์ · อัปเดตล่าสุด ... · FedWatch — ตลาดคิดยังไงกับดอกเบี้ยเฟด · ความผันผวนแฝง (IV) · ราคาใช้สิทธิ์ · กำแพงรวมข้ามสัญญา (ปริมาณวันนี้ ไม่ใช่ OI) · กระแสเงินทองคำ CME (ฟิวเจอร์ส + ออปชัน) · สถานะกองทุน (COT — managed money) · ดีลส่วนต่างพันธบัตร 10 ปี (Treasury basis trade) · อันดับความผันผวนแฝง · หมวดสินทรัพย์ · กรอบ/วัน · เหลือ {n} วัน · วิเคราะห์ใหม่ · ประเด็นสำคัญ · จับตา · ยังไม่มีบทวิเคราะห์ — รอบถัดไปจะสร้างให้ ...`

## 5. ข้อค้นพบสำคัญ

- **ราคาสด = Hyperliquid** (`trade_marks` — "คนละเวทีกับ CME — ใช้ดูทิศทาง ไม่ใช่ราคาสัญญาเดียวกัน" — หน้าแจ้งเอง)
- **IV/±σ/P-C = vol2vol** (`eod_volume` + `series.put/call/vol_settle`) — หน้าแจ้งข้อจำกัด: "ต้นทางส่ง Δ IV = 0 เสมอ (คำนวณเองจากประวัติแทน)" + "ได้เฉพาะช่วงที่ไฟล์แคชต้นทางยังไม่หมดอายุ"
- **FedWatch ข้อมูลอยู่ใน macro_series/macro_series_history** (series ids: us_fedwatch_prob/move_bp) — **หมายความว่า reference คำนวณ FedWatch ฝั่ง cron แล้วเก็บลงตาราง** — เรา mirror ได้ด้วยการคำนวณเองจากราคา ZQ (วิธี CME FedWatch) แล้วเก็บลง cache
- **cme-read คืน payload รูปทรงอะไร ยังไม่รู้** (ต้อง login + เรียก edge function — เปิดคำถามใบ 07)
- 50 ผลิตภัณฑ์: ชื่อไทย + หมวด + สัญญา + หมดอายุ — ตัวอย่างจากหน้า (ทองคำ OGU6 IV 23.46% ±1σ 4,211.7–4,639.3 P/C 0.75 · เงิน SOU6 44.40% · ทองแดง HXEU6 · WTI LOU6 60.36% P/C 1.76 · เบรนต์ BZOV6 62.46% · บิตคอยน์ BTCQ6 32.60% · ETH/SOL/XRP · พันธบัตร 2/5/10/30 ปี IV 1.69–10.43% · Fed Funds OZQQ6 142.98%)

## 6. เปิดคำถาม → ใบ 07 (backend CME)

- cme-read payload shape (ต้อง login session — วิธี: user login ใน preview แล้วเรียก edge fn ผ่าน console หรือขุดฝั่ง edge function source — ถ้าไม่ได้ ใช้ vol2vol API ตรง)
- vol2vol API: ฟรี/ต้อง key/ต้อง proxy? (หน้าแจ้ง "ได้เฉพาะช่วงที่ไฟล์แคชต้นทางยังไม่หมดอายุ" = มี cache layer)
- FedWatch สูตรคำนวณจาก ZQ (วิธี CME FedWatch — รู้หลัก แต่ต้องเทียบค่าจริงกับ reference)
