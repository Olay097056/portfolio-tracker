# Research — Bond Crisis 16-Tab Parity Checklist (2026-08-12)

> ใบ 01 แผน reference-parity — checklist สำหรับ user ติ๊กในใบ 04

## Scope

16 แท็บของ Bond-crisis เทียบกับ reference `bond-crisis-dashboard-v2.vercel.app`:
ทุกแถวมี **หลักฐานดิบ** (i18n key + ข้อความไทยจริง) และอ้าง **ไฟล์+บรรทัดของเรา**
หรือเขียน **"ไม่พบในโค้ด"** · ห้ามตัดสินว่าควรทำ/ไม่ควรทำ — user ตัดสินในใบ 04

**แหล่งที่มาของข้อมูลต่อหน้า**:
- 👁️ **ดูจากหน้าจริง** = user login ใน preview จริง — เชื่อถือได้สูง
- 📄 **research doc เก่า** = เทียบแล้วในแผนก่อนหน้า — มีหลักฐาน
- 📦 **อนุมานจาก chunk** = วิเคราะห์จาก JS bundle + i18n key เท่านั้น — ต้อง verify ด้วยตาจริงในใบ 04

## วิธีสร้าง

- ใช้ research docs เก่า 12 ฉบับ + `td-i18n.txt` (622 คีย์) + chunk `3474` (98KB copy ไทย) + preview read (user login)
- **Source code ของเรา**: grep จริงทุกครั้ง ไม่ใช้ความจำ · รายงาน hash commit ล่าสุด: `65fcd97` (ticket 02)
- **เส้นฐาน**: pytest 538 · vitest 563 · tsc clean · prod `portfolio-tracker-taupe-two.vercel.app`

---

## คำเตือนความเสี่ยง / Disclaimer (จากใบ 02 — user สั่งเพิ่ม)

| # | สถานะ | หลักฐาน | คำตัดสิน |
|---|---|---|:---:|
| D1 | ✅ มี | **TradeDeskDashboard.tsx:55-62** — `🚫 พอร์ตจำลอง — ไม่ใช่การเทรดจริง ไม่มีการส่งคำสั่งไปตลาดใดๆ และไม่ใช่คำแนะนำการลงทุน`   ✅ |
| D2 | ✅ มี | **TeamDetailPage.tsx:61** — ข้อความเดียวกัน (sed -n 61p ยืนยัน)   ✅ |
| D3 | ✅ มี | **MacroDashboard.tsx:464** — `ข้อมูลเพื่อการศึกษาเท่านั้น ไม่ใช่คำแนะนำการลงทุน`   ✅ |
| D4 | ✅ มี | **ForecastDashboard.tsx:242** — `⚠️ ตัวเลขทั้งหมดในหน้านี้เป็นสถานการณ์สมมติ...ไม่ใช่คำแนะนำการลงทุน`   ✅ |
| D5 | ✅ มี | **ForecastDashboard.tsx:293** — `การจำลองเป็นค่าประมาณทิศทาง...ไม่ใช่คำแนะนำการลงทุน`   ✅ |
| D6 | ✅ มี | **BoardroomDashboard.tsx:65** — `disclaimer: 'ข้อมูลเพื่อการศึกษาเท่านั้น ไม่ใช่คำแนะนำการลงทุน'`   ✅ |
| D7 | ✅ มี | **BoardroomSignalsDashboard.tsx:66** — `มุมมอง (ไม่เข้าบัญชี) — ข้อมูลเพื่อการศึกษาเท่านั้น ไม่ใช่คำแนะนำการลงทุน`   ✅ |
| D8 | ✅ มี | **SignalsDashboard.tsx** — grep `disclaimer\|ไม่ใช่คำ\|คำเตือน` = **0 hits** · สัญญาณเทรดเป็นหน้าที่ชี้นำการลงทุนตรงที่สุด ควรมีคำเตือนความแม่นยำ   เสร็จ (8e60611) |
| D9 | ✅ มี | **ModelsDashboard.tsx** — grep = **0 hits** · หน้าแสดงคะแนนโมเดลทำกำไร ไม่มีคำเตือนใดๆ   เสร็จ (8e60611) |
| D10 | ✅ มี | **OverviewDashboard.tsx** — grep = **0 hits**   เสร็จ (8e60611) |
| D11 | ✅ มี | **SentimentDashboard.tsx** — grep = **0 hits** · `FearGreedIndex.tsx:362` มีแต่ `SentimentDashboard` ไม่ดึงเข้ามา   เสร็จ (8e60611) |
| D12 | ✅ มี | **CmeDashboard.tsx** — grep = **0 hits**   เสร็จ (8e60611) |
| D13 | ✅ มี | **BankingDashboard.tsx** — grep = **0 hits**   เสร็จ (8e60611) |
| D14 | ✅ มี | **CountriesDashboard.tsx** — grep = **0 hits**   เสร็จ (8e60611) |
| D15 | ✅ มี | **NewsDashboard.tsx** — grep = **0 hits**   เสร็จ (8e60611) |
| D16 | ✅ มี | **LearnDashboard.tsx:58** — `ข้อควรจำ:` — **ไม่ใช่ disclaimer** (เป็นบทเรียน)   เสร็จ (8e60611) |
| D17 | ✅ มี | **OfficeDashboard.tsx** — grep = **0 hits**   เสร็จ (8e60611) |
| D18 | ✅ มี | **SettingsDashboard.tsx** — grep = **0 hits**   เสร็จ (8e60611) |
| D19 | ✅ มี | **SignalsDashboard.tsx** — คำเตือน "แม่นยำในอดีตประมาณ 62-63%" · user อนุมัติแล้วในแผน ai-signal-investor-upgrades (2026-08-06) · **หายระหว่างการเขียนใหม่** — grep ทั้งไฟล์ = 0 hits   เสร็จ (8e60611) |
| **สรุป** | | **19 มี · 0 ขาด · 0 ต่าง** | |

---

## 1. ข้อมูลมหภาค (MacroDashboard.tsx — 470 lines)

| # | สถานะ | รายการ | หลักฐาน (อ้างอิง) |
|---|---|---|---|
| 1.1 | ❌ ขาด | CME กรอบ ±1σ 11 ผลิตภัณฑ์ + "0/11 นอกกรอบ" + ลิงก์ CME | research: `bond-crisis-existing-pages-gaps` #1 · ref มี `tdCtxCme` i18n · เรา: **CmeDashboard.tsx** แยกหน้า — MacroDashboard ไม่แสดง CME  | เอา (แบบ D: GVZCLS/OVXCLS ผ่าน FRED — ติดป้าย ETF IV, พันธบัตร "—") |
| 1.2 | ❌ ขาด | ทองคำ CME โฟลว์ (OI 400,331 · Δ+2,629 · วอลุ่ม 142,327) | ref: `tdCme`, i18n `tdGoldOITitle` · เรา: ไม่พบใน MacroDashboard  | เอา (ซ้ำกับ 5.3 — ทำที่เดียว: gold flow มีแล้ว CFTC fallback) |
| 1.3 | ❌ ขาด | FedWatch 5 การ์ด | ref: i18n `tdFedWatch` · เรา: CmeDashboard.tsx มี `/api/cme` → ไม่แสดงใน MacroDashboard  | เอา (ซ้ำกับ 5.1 — FedWatch ZQ=F มีแล้ว 52% hike) |
| 1.4 | ❌ ขาด | CME IV (ทอง/เงิน/เบรนต์/TTF + บอนด์ 2-30Y/SOFR) | เรา: ไม่พบในโค้ด  | เอา (แบบ D: เพิ่ม GVZCLS/OVXCLS เข้า _SERIES + คริปโต IV เดิม) |
| 1.5 | ❌ ขาด | EIA สต็อก 5 ตัว | เรา: series มีแล้วใน macro_service (crude/gasoline/distillate) + API คืนจริง — แต่ไม่แสดงบน UI | เอา (backend พร้อม, เพิ่ม UI) |
| 1.6 | ✅ มี | เงินฝาก $19,362.7B (FRED DPSACBW027SBOG) | **MacroDashboard.tsx** — ผ่าน `/api/macro` · แก้หน่วยแล้ว (scale=1) |
| 1.7 | ❌ ขาด | CDS proxy / หางประมูล 10Y / ดีลเลอร์รับ / SRF / หนี้ธุรกิจ | เรา: ไม่พบในโค้ด (บางตัวมี proxy ได้: auction btc มีแล้ว / WRESBAL คล้าย SRF) | เอา (ต้องหาแหล่ง — หางประมูลจาก auction ที่มี) |
| 1.8 | ✅ มี | Bid-to-Cover แยก tenor | **MacroDashboard.tsx** — ผ่าน `/api/macro` · แก้จาก 2.59x ซ้ำแล้ว |
| 1.9 | ✅ มี | CPI/PCE | **MacroDashboard.tsx** — ผ่าน FRED series |
| **สรุป** | | **3 มี · 6 ขาด · 0 ต่าง** | |

---

## 2. โมเดลทำกำไร (ModelsDashboard.tsx — 573 lines)

| # | สถานะ | รายการ | หลักฐาน (อ้างอิง) |
|---|---|---|---|
| 2.1 | ✅ มี | องค์ประกอบ 5 ตัว (โครงสร้าง/มหภาค/ข่าว/ยืนยัน/บทลงโทษ) | FACTOR_CAPS ตรงเป๊ะ (model_service.py:15-16): 25/30/15/20/15 — checklist เก่าเขียน /25 ทุกตัว ผิด |
| 2.2 | ⚠️ ต่าง | ความมั่นใจต่อโมเดล (%) | คำนวณจริง = % indicators มีข้อมูลสด (model_service.py:889) แต่ตอนนี้ 100 ทุกตัว | เอา (เปลี่ยนป้ายเป็น "ความครบของข้อมูล" — ค่าถูกแต่ชื่อผิด แบบ MTD ใบ 03) |
| 2.3 | ✅ มี | เกณฑ์ก่อตัว 40 / ทำงาน 60 (เส้นบนกราฟ) | **ModelsDashboard.tsx** — factorCaps + progress bar |
| 2.4 | ✅ มี | คำเตือนความเสี่ยง / disclaimer | RiskBanner id="models" — ใบ 06 ทำ |
| **สรุป** | | **3 มี · 0 ขาด · 1 ต่าง** | |

---

## 3. สัญญาณเทรด (SignalsDashboard.tsx — 788 lines)

| # | สถานะ | รายการ | หลักฐาน (อ้างอิง) |
|---|---|---|---|
| 3.1 | ✅ มี | 39 สัญญาณ · API `/api/signals` | **SignalsDashboard.tsx** — 200 บน prod (แก้แล้ว: prepare_threshold) |
| 3.2 | ✅ มี | สถิติ P&L ลอยตัว/ปิดแล้ว/อัตราชนะ/PF/DD | SignalsDashboard.tsx:470-483 ครบ (unrealized/realized/win_rate/profit_factor/DD) |
| 3.3 | ✅ มี | ค่าคาดหวัง/payoff/ถือเฉลี่ย/R:R | SignalsDashboard.tsx:506-510 (expectancy/payoff/avg_hold/avg_rr) |
| 3.4 | ✅ มี | แยกหมวด STOCKS/CRYPTO/MACRO/FOREX + WR | SignalsDashboard.tsx:335-343,542 (byCat + WR ต่อหมวด) |
| 3.5 | ✅ มี | คำเตือนความแม่นยำ | RiskBanner id="signals" (รวม D8+D19) — ใบ 06 ทำ |
| **สรุป** | | **5 มี · 0 ขาด · 0 ต่าง** | |

---

## 4. อารมณ์ตลาด (SentimentDashboard.tsx — 205 lines)

| # | สถานะ | รายการ | หลักฐาน (อ้างอิง) |
|---|---|---|---|
| 4.1 | ✅ มี | CNN Fear & Greed 65 (Greed) | **SentimentDashboard.tsx** — ผ่าน `/api/fear-greed` |
| 4.2 | ✅ มี | Crypto FG 29 (Fear) | **SentimentDashboard.tsx** — `crypto_fear_greed` field |
| 4.3 | ✅ มี | MOVE/VIX/DXY/HY spread indicators | **SentimentDashboard.tsx** — 4 indicators |
| 4.4 | ✅ มี | คำเตือนความเสี่ยง / disclaimer | RiskBanner id="sentiment" — ใบ 06 ทำ |
| **สรุป** | | **4 มี · 0 ขาด · 0 ต่าง** | |

---

## 5. โซน CME (CmeDashboard.tsx — 201 lines)

| # | สถานะ | รายการ | หลักฐาน (อ้างอิง) |
|---|---|---|---|
| 5.1 | ✅ มี | FedWatch 52% ขึ้น | **CmeDashboard.tsx** — `/api/cme`  | ซ้ำ 1.3 — เอาออก (ไม่ต้องทำซ้ำ) |
| 5.2 | ✅ มี | Crypto IV (Deribit — BTC 58.11%) | **CmeDashboard.tsx** — `/api/cme` |
| 5.3 | ✅ มี | Gold OI (CFTC fallback 371,551) | **CmeDashboard.tsx** — CME 403 → CFTC fallback  | ซ้ำ 1.2 — เอาออก (ไม่ต้องทำซ้ำ) |
| 5.4 | ✅ มี | COT (Commitment of Traders) | **CmeDashboard.tsx** |
| 5.5 | ❌ ขาด | CME กรอบ ±σ (บอกให้ไปดูที่ Macro?) | ref: อยู่หน้า CME zone · เรา: มีบางส่วน — ตรวจ coverage  | ซ้ำ 1.1 — เอาออก (ไม่ต้องทำซ้ำ) |
| 5.6 | ✅ มี | คำเตือน / disclaimer | RiskBanner id="cme" — ใบ 06 ทำ |
| **สรุป** | | **5 มี · 1 ขาด · 0 ต่าง** | |

---

## 6. วิกฤตแบงก์รัน (BankingDashboard.tsx — 447 lines)

| # | สถานะ | รายการ | หลักฐาน (อ้างอิง) |
|---|---|---|---|
| 6.1 | ✅ มี | Gauge + funding + model + stat cards | **BankingDashboard.tsx** |
| 6.2 | ✅ มี | bank_stocks 11 ตัว (BKX/FITB/HBAN/KBE/KEY/KRE/RF/TFC/USB/WAL/ZION) | **BankingDashboard.tsx** — Pydantic drop แก้แล้ว · prod 200 |
| 6.3 | ✅ มี | Deposit flow chart | **BankingDashboard.tsx** — ผ่าน `/api/banking` |
| 6.4 | ✅ มี | SOFR-EFFR spread | **BankingDashboard.tsx** |
| 6.5 | ✅ มี | %1D change ต่อหุ้น | BankingDashboard.tsx:413-433 ตาราง "ราคา + 1D" + change_pct สี |
| 6.6 | ✅ มี | คำเตือน / disclaimer | RiskBanner id="banking" — ใบ 06 ทำ |
| **สรุป** | | **6 มี · 0 ขาด · 0 ต่าง** | |

---

## 7. รายประเทศ (CountriesDashboard.tsx — 320 lines)

| # | สถานะ | รายการ | หลักฐาน (อ้างอิง) |
|---|---|---|---|
| 7.1 | ✅ มี | 27 ประเทศ + score + 10Y + sort | **CountriesDashboard.tsx** — mirror ครบ |
| 7.2 | ⚠️ ต่าง | "ข้อมูลจำกัด/รายวัน/เรียลไทม์" badge ต่อประเทศ | แสดงแล้ว (CountriesDashboard.tsx:167 data_tier_note_th) แต่เป็นข้อความธรรมดา · tier 4 ระดับ (sparse/daily/realtime/manual) vs ต้นฉบับ 3 | เอา (badge มีสี + map tier) |
| 7.3 | ✅ มี | "±bps vs US" | CountriesDashboard.tsx:141-143 bps_vs_us + สี amber/sky |
| 7.4 | ✅ มี | คำเตือน / disclaimer | RiskBanner id="countries" — ใบ 06 ทำ |
| **สรุป** | | **3 มี · 0 ขาด · 1 ต่าง** | |

---

## 8. จำลองสถานการณ์ (ForecastDashboard.tsx — 450 lines)

| # | สถานะ | รายการ | หลักฐาน (อ้างอิง) |
|---|---|---|---|
| 8.1 | ✅ มี | Sliders 10 ตัว + Reset | **ForecastDashboard.tsx** |
| 8.2 | ✅ มี | ผลต่อ 6 โมเดล (scoring engine) | **ForecastDashboard.tsx** |
| 8.3 | ✅ มี | Banner ค่าสมมติ + disclaimer | **ForecastDashboard.tsx:242** |
| 8.4 | ✅ มี | การจำลองเป็นค่าประมาณทิศทาง | **ForecastDashboard.tsx:293** |
| **สรุป** | | **4 มี · 0 ขาด · 0 ต่าง** | |

---

## 9. ห้องประชุม (BoardroomDashboard.tsx — 804 lines)

| # | สถานะ | รายการ | หลักฐาน (อ้างอิง) |
|---|---|---|---|
| 9.1 | ✅ มี | สร้าง/เปิดจากข่าว/โมเดลขยับ/ล้มเหลว | **BoardroomDashboard.tsx** |
| 9.2 | ✅ มี | ประวัติการประชุม + stances (ท่าที) | **BoardroomDashboard.tsx** |
| 9.3 | ✅ มี | Disclaimer: "ข้อมูลเพื่อการศึกษาเท่านั้น" | **BoardroomDashboard.tsx:65,622** |
| 9.4 | ⚠️ ต่าง | UX details — ref มี filter ประชุมล้มเหลว/แยก type | มี StatusBadge (BoardroomDashboard.tsx:243) + list แต่ไม่มี filter · backend พร้อม (trigger_type) | เอา (เพิ่ม filter ล้มเหลว/type) |
| **สรุป** | | **3 มี · 0 ขาด · 1 ต่าง** | |

---

## 10. สัญญาณที่ประชุม (BoardroomSignalsDashboard.tsx — 561 lines)

| # | สถานะ | รายการ | หลักฐาน (อ้างอิง) |
|---|---|---|---|
| 10.1 | ✅ มี | Signals จากการประชุม + match positions | **BoardroomSignalsDashboard.tsx** |
| 10.2 | ✅ มี | "มุมมอง (ไม่เข้าบัญชี)" | **BoardroomSignalsDashboard.tsx:49,66** |
| 10.3 | ✅ มี | goMeetingFromSignals flow | **BoardroomSignalsDashboard.tsx** |
| **สรุป** | | **3 มี · 0 ขาด · 0 ต่าง** | |

---

## 11. ทีมเทรด (TradeDeskDashboard.tsx — 153 lines + TeamDetailPage.tsx — 233 lines)

สถานะจากการตรวจสอบจริง (ticket 02 + map `รากของปัญหา`):

| # | สถานะ | รายการ | หลักฐาน |
|---|---|---|---|
| 11.1 | ✅ มี | อันดับ `#1` ฮาร์ดโค้ด | **TradeDeskDashboard.tsx:59** — `#1` เขียนตาย ไม่ใช่จาก data  เสร็จ (023ff08) |
| 11.2 | ✅ มี | `✗0 ⏳0` ฮาร์ดโค้ด | **TradeDeskDashboard.tsx:72** — `✗0` `⏳0` คงที่ ไม่ใช่จาก turn stats จริง  เสร็จ (023ff08) |
| 11.3 | ✅ มี | `MTD` แสดงค่า `weekly_target_pct` (bug) | **TradeDeskDashboard.tsx:70** — `F.pct(team.weekly_target_pct,false)` ใช้ weekly เป็น MTD  เสร็จ (023ff08) |
| 11.4 | ✅ มี | กราฟ equity ทุกโหมด (24h/7d/30d/All) + time toggle | ref: `tdChart`, `tdChartEmpty` · เรา: ไม่พบใน TradeDeskDashboard — TeamDetailPage มี SVG 30d เฉพาะ detail page  เสร็จ (c660289) |
| 11.5 | ✅ มี | สวิตช์หลัก (master on/off) | ref: `tdPause`/`tdResume` · เรา: ไม่พบในโค้ด  เสร็จ (caf7027) |
| 11.6 | ✅ มี | โควตาเทิร์นรายวัน + ตัวนับถัดไป | ref: `tdNextTurn`, `tdForceTurn` · เรา: ไม่พบในโค้ด (TeamDetailPage มีปุ่ม Force Turn แต่ไม่มี countdown จริง)  เสร็จ (c660289) |
| 11.7 | ✅ มี | ออเดอร์ที่ตั้งไว้ (pending LIMIT/STOP) ในหน้า main | เรา: `TradePendingOrder` table มีแล้ว · แต่ **ไม่แสดงใน TradeDeskDashboard** — แสดงเฉพาะ TeamDetailPage  เสร็จ (caf7027) |
| 11.8 | ✅ มี | สรุปประจำวัน/รายเดือน (daily/weekly summary) | เรา: ไม่พบในโค้ด  เสร็จ (e22829b) |
| 11.9 | ✅ มี | คำสั่งโต๊ะกลาง (directive) ในหน้า main | เรา: `POST /directive` API มี · แต่ **ไม่แสดงใน TradeDeskDashboard**  เสร็จ (c660289) |
| 11.10 | ✅ มี | Team card (equity/P&L/margin/cash) | **TradeDeskDashboard.tsx:56-77** |
| 11.11 | ✅ มี | ตารางไม้เปิด (open positions) | **TradeDeskDashboard.tsx:79-94** |
| 11.12 | ✅ มี | ประวัติเทิร์น (turn history) | **TradeDeskDashboard.tsx:97-113** |
| 11.13 | ✅ มี | ตลาด 200+ / TA signals + TIER | **TradeDeskDashboard.tsx:116-136** |
| 11.14 | ✅ มี | ปุ่ม "ดูรายละเอียดทีม →" + TeamDetailPage | **TradeDeskDashboard.tsx:75** → **TeamDetailPage.tsx** (233 lines, 14 sections) |
| 11.15 | ✅ มี | Disclaimer (guard rail) | **TradeDeskDashboard.tsx:55** · **TeamDetailPage.tsx:57** |
| **11.16** | ✅ มี | Team detail: 16 stat cards (4×4), equity SVG, MANDATE, constitution, 6 analysts, meeting history paginated, coach log, KB | **TeamDetailPage.tsx** |
| **สรุป** | | **15 มี · 0 ขาด · 0 ต่าง** | |

---

## 12–16. หน้าที่มี research เก่าน้อย

### 12. ข่าวสาร (NewsDashboard.tsx — 400 lines)
| # | สถานะ | รายการ |
|---|---|---|
| 12.1 | ✅ มี | filter สำนักข่าว · sort (ล่าสุด/ผลกระทบ) · pagination · AI วิเคราะห์ |
| 12.2 | ⚠️ ต่าง | ref: impact slider · เรา: dropdown (NewsDashboard.tsx:201,279-289 — ฟังก์ชันครบ) | เอา (เปลี่ยน dropdown → slider) |
| 12.3 | ✅ มี | disclaimer | RiskBanner id="news" — ใบ 06 ทำ |
| **สรุป** | | **2 มี · 0 ขาด · 1 ต่าง** | |

### 13. ภาพรวม (OverviewDashboard.tsx — 400 lines)
| # | สถานะ | รายการ |
|---|---|---|
| 13.1 | ✅ มี | AI brief (DeepSeek) + key indicators |
| 13.2 | ⚠️ ต่าง | ref: มี card layout ต่างจากของเรา — ตรวจ | ทีหลัง (เปิดสองหน้าเทียบ) |
| 13.3 | ✅ มี | disclaimer | RiskBanner id="overview" — ใบ 06 ทำ |
| **สรุป** | | **2 มี · 0 ขาด · 1 ต่าง** | |

### 14. บทเรียน (LearnDashboard.tsx — 236 lines)
| # | สถานะ | รายการ |
|---|---|---|
| 14.1 | ✅ มี | 7 บทเรียน (self-authored Thai+EN) |
| 14.2 | ✅ มี | disclaimer | RiskBanner id="learn" — ใบ 06 ทำ |
| **สรุป** | | **2 มี · 0 ขาด · 0 ต่าง** | |

### 15. ออฟฟิศ 3D (OfficeDashboard.tsx — 202 lines)
| # | สถานะ | รายการ |
|---|---|---|
| 15.1 | ✅ มี | R3F scene + 12 rooms + OrbitControls + job runs panel |
| 15.2 | ⚠️ ต่าง | ref: 13 แผนก · GLB characters · click detail · เรา: 12 ห้อง box+sphere (OfficeDashboard.tsx:10-22) | ทีหลัง (เปิดสองหน้าเทียบ) |
| 15.3 | ✅ มี | disclaimer | RiskBanner id="office" — ใบ 06 ทำ |
| **สรุป** | | **2 มี · 0 ขาด · 1 ต่าง** | |

### 16. ตั้งค่า (SettingsDashboard.tsx — 142 lines)
| # | สถานะ | รายการ |
|---|---|---|
| 16.1 | ✅ มี | Telegram link placeholder (UI only — user ตัดสินใจตัด) |
| 16.2 | ✅ มี | disclaimer | RiskBanner id="settings" — ใบ 06 ทำ |
| **สรุป** | | **2 มี · 0 ขาด · 0 ต่าง** | |

---

## Grand Summary

| หมวด | ✅ มี | ❌ ขาด | ⚠️ ต่าง | รวม |
|---|---|---|---|---|
| คำเตือนความเสี่ยง / Disclaimer | 19 | 0 | 0 | 19 |
| 1. ข้อมูลมหภาค | 3 | 6 | 0 | 9 |
| 2. โมเดลทำกำไร | 3 | 0 | 1 | 4 |
| 3. สัญญาณเทรด | 5 | 0 | 0 | 5 |
| 4. อารมณ์ตลาด | 4 | 0 | 0 | 4 |
| 5. โซน CME | 5 | 1 | 0 | 6 |
| 6. วิกฤตแบงก์รัน | 6 | 0 | 0 | 6 |
| 7. รายประเทศ | 3 | 0 | 1 | 4 |
| 8. จำลองสถานการณ์ | 4 | 0 | 0 | 4 |
| 9. ห้องประชุม | 3 | 0 | 1 | 4 |
| 10. สัญญาณที่ประชุม | 3 | 0 | 0 | 3 |
| 11. ทีมเทรด | 15 | 0 | 0 | 15 |
| 12–16. หน้าที่ research เก่าน้อย | 10 | 0 | 3 | 13 |
| **รวม** | **83** | **7** | **6** | **96** |

- ❌ 7 = ใบ 10 (1.1–1.5, 1.7, 5.5) · ⚠️ 6 = ใบ 11 (2.2/7.2/9.4/12.2) + backlog (13.2/15.2)

---

## นอกขอบเขต (user ตัดสินแล้ว — อย่าใส่เป็น `ขาด`)

- 9 ทีม / หลายทีม · อันดับข้ามทีม · กราฟแข่ง · 🥇🥈🥉
- ภาคทัณฑ์ / พัก / ไล่ออก · "รุ่น" (generation) · แสดงทีมที่ถูกปลด
- Telegram bot · Real order execution (PAPER ONLY)
- แข่งข้ามค่ายโมเดล (1 ทีม DeepSeek)



