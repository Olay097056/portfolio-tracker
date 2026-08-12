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
| D8 | ❌ ขาด | **SignalsDashboard.tsx** — grep `disclaimer\|ไม่ใช่คำ\|คำเตือน` = **0 hits** · สัญญาณเทรดเป็นหน้าที่ชี้นำการลงทุนตรงที่สุด ควรมีคำเตือนความแม่นยำ   เสร็จ (8e60611) |
| D9 | ❌ ขาด | **ModelsDashboard.tsx** — grep = **0 hits** · หน้าแสดงคะแนนโมเดลทำกำไร ไม่มีคำเตือนใดๆ   เสร็จ (8e60611) |
| D10 | ❌ ขาด | **OverviewDashboard.tsx** — grep = **0 hits**   เสร็จ (8e60611) |
| D11 | ❌ ขาด | **SentimentDashboard.tsx** — grep = **0 hits** · `FearGreedIndex.tsx:362` มีแต่ `SentimentDashboard` ไม่ดึงเข้ามา   เสร็จ (8e60611) |
| D12 | ❌ ขาด | **CmeDashboard.tsx** — grep = **0 hits**   เสร็จ (8e60611) |
| D13 | ❌ ขาด | **BankingDashboard.tsx** — grep = **0 hits**   เสร็จ (8e60611) |
| D14 | ❌ ขาด | **CountriesDashboard.tsx** — grep = **0 hits**   เสร็จ (8e60611) |
| D15 | ❌ ขาด | **NewsDashboard.tsx** — grep = **0 hits**   เสร็จ (8e60611) |
| D16 | ❌ ขาด | **LearnDashboard.tsx:58** — `ข้อควรจำ:` — **ไม่ใช่ disclaimer** (เป็นบทเรียน)   เสร็จ (8e60611) |
| D17 | ❌ ขาด | **OfficeDashboard.tsx** — grep = **0 hits**   เสร็จ (8e60611) |
| D18 | ❌ ขาด | **SettingsDashboard.tsx** — grep = **0 hits**   เสร็จ (8e60611) |
| D19 | ❌ ขาด | **SignalsDashboard.tsx** — คำเตือน "แม่นยำในอดีตประมาณ 62-63%" · user อนุมัติแล้วในแผน ai-signal-investor-upgrades (2026-08-06) · **หายระหว่างการเขียนใหม่** — grep ทั้งไฟล์ = 0 hits   เสร็จ (8e60611) |
| **สรุป** | | **7 มี · 12 ขาด** (นับ D3+D4+D5 เป็นรายการ 5/16 แท็บ) |

---

## 1. ข้อมูลมหภาค (MacroDashboard.tsx — 470 lines)

| # | สถานะ | รายการ | หลักฐาน (อ้างอิง) |
|---|---|---|---|
| 1.1 | ❌ ขาด | CME กรอบ ±1σ 11 ผลิตภัณฑ์ + "0/11 นอกกรอบ" + ลิงก์ CME | research: `bond-crisis-existing-pages-gaps` #1 · ref มี `tdCtxCme` i18n · เรา: **CmeDashboard.tsx** แยกหน้า — MacroDashboard ไม่แสดง CME |
| 1.2 | ❌ ขาด | ทองคำ CME โฟลว์ (OI 400,331 · Δ+2,629 · วอลุ่ม 142,327) | ref: `tdCme`, i18n `tdGoldOITitle` · เรา: ไม่พบใน MacroDashboard |
| 1.3 | ❌ ขาด | FedWatch 5 การ์ด | ref: i18n `tdFedWatch` · เรา: CmeDashboard.tsx มี `/api/cme` → ไม่แสดงใน MacroDashboard |
| 1.4 | ❌ ขาด | CME IV (ทอง/เงิน/เบรนต์/TTF + บอนด์ 2-30Y/SOFR) | เรา: ไม่พบในโค้ด |
| 1.5 | ❌ ขาด | EIA สต็อก 5 ตัว | เรา: ไม่พบในโค้ด |
| 1.6 | ✅ มี | เงินฝาก $19,362.7B (FRED DPSACBW027SBOG) | **MacroDashboard.tsx** — ผ่าน `/api/macro` · แก้หน่วยแล้ว (scale=1) |
| 1.7 | ❌ ขาด | CDS proxy / หางประมูล 10Y / ดีลเลอร์รับ / SRF / หนี้ธุรกิจ | เรา: ไม่พบในโค้ด |
| 1.8 | ✅ มี | Bid-to-Cover แยก tenor | **MacroDashboard.tsx** — ผ่าน `/api/macro` · แก้จาก 2.59x ซ้ำแล้ว |
| 1.9 | ✅ มี | CPI/PCE | **MacroDashboard.tsx** — ผ่าน FRED series |
| **สรุป** | | **3 มี · 6 ขาด** (ไม่นับ CME ที่แยกหน้า) | |

---

## 2. โมเดลทำกำไร (ModelsDashboard.tsx — 573 lines)

| # | สถานะ | รายการ | หลักฐาน (อ้างอิง) |
|---|---|---|---|
| 2.1 | ⚠️ ต่าง | องค์ประกอบ 5 ตัว (โครงสร้าง/มหภาค/ข่าว/ยืนยัน/บทลงโทษ) | ref: `/api/models` ส่ง 5 components · เรา: `/api/models` ส่ง scores (6 โมเดล) — ตรวจสอบ component breakdown |
| 2.2 | ⚠️ ต่าง | ความมั่นใจต่อโมเดล (%) | ref: แสดง % รายโมเดล (90/89/88/95/92) · เรา: ModelScore ไม่มี confidence_pct — ต้องตรวจ API |
| 2.3 | ✅ มี | เกณฑ์ก่อตัว 40 / ทำงาน 60 (เส้นบนกราฟ) | **ModelsDashboard.tsx** — factorCaps + progress bar |
| 2.4 | ❌ ขาด | คำเตือนความเสี่ยง / disclaimer | ดู D9 |
| **สรุป** | | **1 มี · 1 ขาด · 2 ต่าง** | |

---

## 3. สัญญาณเทรด (SignalsDashboard.tsx — 788 lines)

| # | สถานะ | รายการ | หลักฐาน (อ้างอิง) |
|---|---|---|---|
| 3.1 | ✅ มี | 39 สัญญาณ · API `/api/signals` | **SignalsDashboard.tsx** — 200 บน prod (แก้แล้ว: prepare_threshold) |
| 3.2 | ⚠️ ต่าง | สถิติ P&L ลอยตัว/ปิดแล้ว/อัตราชนะ/PF/DD | ref: `tdStatPF`, `tdStatWinRate` · เรา: มี stats แต่ฟิลด์ละเอียดน้อยกว่า — ตรวจ `AiSignalMetrics` |
| 3.3 | ❌ ขาด | ค่าคาดหวัง/payoff/ถือเฉลี่ย/R:R | เรา: **AiSignalMetrics** interface — ตรวจ field coverage |
| 3.4 | ❌ ขาด | แยกหมวด STOCKS/CRYPTO/MACRO/FOREX + WR | เรา: `SignalsDashboard.tsx` — มี filter แต่ต่างจาก ref? |
| 3.5 | ❌ ขาด | คำเตือนความแม่นยำ | ดู D8 |
| **สรุป** | | **1 มี · 3 ขาด · 1 ต่าง** | |

---

## 4. อารมณ์ตลาด (SentimentDashboard.tsx — 205 lines)

| # | สถานะ | รายการ | หลักฐาน (อ้างอิง) |
|---|---|---|---|
| 4.1 | ✅ มี | CNN Fear & Greed 65 (Greed) | **SentimentDashboard.tsx** — ผ่าน `/api/fear-greed` |
| 4.2 | ✅ มี | Crypto FG 29 (Fear) | **SentimentDashboard.tsx** — `crypto_fear_greed` field |
| 4.3 | ✅ มี | MOVE/VIX/DXY/HY spread indicators | **SentimentDashboard.tsx** — 4 indicators |
| 4.4 | ❌ ขาด | คำเตือนความเสี่ยง / disclaimer | ดู D11 |
| **สรุป** | | **3 มี · 1 ขาด** | |

---

## 5. โซน CME (CmeDashboard.tsx — 201 lines)

| # | สถานะ | รายการ | หลักฐาน (อ้างอิง) |
|---|---|---|---|
| 5.1 | ✅ มี | FedWatch 52% ขึ้น | **CmeDashboard.tsx** — `/api/cme` |
| 5.2 | ✅ มี | Crypto IV (Deribit — BTC 58.11%) | **CmeDashboard.tsx** — `/api/cme` |
| 5.3 | ✅ มี | Gold OI (CFTC fallback 371,551) | **CmeDashboard.tsx** — CME 403 → CFTC fallback |
| 5.4 | ✅ มี | COT (Commitment of Traders) | **CmeDashboard.tsx** |
| 5.5 | ❌ ขาด | CME กรอบ ±σ (บอกให้ไปดูที่ Macro?) | ref: อยู่หน้า CME zone · เรา: มีบางส่วน — ตรวจ coverage |
| 5.6 | ❌ ขาด | คำเตือน / disclaimer | ดู D12 |
| **สรุป** | | **4 มี · 2 ขาด** | |

---

## 6. วิกฤตแบงก์รัน (BankingDashboard.tsx — 447 lines)

| # | สถานะ | รายการ | หลักฐาน (อ้างอิง) |
|---|---|---|---|
| 6.1 | ✅ มี | Gauge + funding + model + stat cards | **BankingDashboard.tsx** |
| 6.2 | ✅ มี | bank_stocks 11 ตัว (BKX/FITB/HBAN/KBE/KEY/KRE/RF/TFC/USB/WAL/ZION) | **BankingDashboard.tsx** — Pydantic drop แก้แล้ว · prod 200 |
| 6.3 | ✅ มี | Deposit flow chart | **BankingDashboard.tsx** — ผ่าน `/api/banking` |
| 6.4 | ✅ มี | SOFR-EFFR spread | **BankingDashboard.tsx** |
| 6.5 | ❌ ขาด | %1D change ต่อหุ้น | ref: ตารางมี % change · เรา: ไม่พบใน BankingDashboard |
| 6.6 | ❌ ขาด | คำเตือน / disclaimer | ดู D13 |
| **สรุป** | | **4 มี · 2 ขาด** | |

---

## 7. รายประเทศ (CountriesDashboard.tsx — 320 lines)

| # | สถานะ | รายการ | หลักฐาน (อ้างอิง) |
|---|---|---|---|
| 7.1 | ✅ มี | 27 ประเทศ + score + 10Y + sort | **CountriesDashboard.tsx** — mirror ครบ |
| 7.2 | ⚠️ ต่าง | "ข้อมูลจำกัด/รายวัน/เรียลไทม์" badge ต่อประเทศ | เรา: ไม่พบ badge |
| 7.3 | ⚠️ ต่าง | "±bps vs US" | เรา: มี yield spread — ตรวจ format |
| 7.4 | ❌ ขาด | คำเตือน / disclaimer | ดู D14 |
| **สรุป** | | **1 มี · 1 ขาด · 2 ต่าง** | |

---

## 8. จำลองสถานการณ์ (ForecastDashboard.tsx — 450 lines)

| # | สถานะ | รายการ | หลักฐาน (อ้างอิง) |
|---|---|---|---|
| 8.1 | ✅ มี | Sliders 10 ตัว + Reset | **ForecastDashboard.tsx** |
| 8.2 | ✅ มี | ผลต่อ 6 โมเดล (scoring engine) | **ForecastDashboard.tsx** |
| 8.3 | ✅ มี | Banner ค่าสมมติ + disclaimer | **ForecastDashboard.tsx:242** |
| 8.4 | ✅ มี | การจำลองเป็นค่าประมาณทิศทาง | **ForecastDashboard.tsx:293** |
| **สรุป** | | **4 มี · 0 ขาด** | ✅ ใกล้เคียง reference มากที่สุด |

---

## 9. ห้องประชุม (BoardroomDashboard.tsx — 804 lines)

| # | สถานะ | รายการ | หลักฐาน (อ้างอิง) |
|---|---|---|---|
| 9.1 | ✅ มี | สร้าง/เปิดจากข่าว/โมเดลขยับ/ล้มเหลว | **BoardroomDashboard.tsx** |
| 9.2 | ✅ มี | ประวัติการประชุม + stances (ท่าที) | **BoardroomDashboard.tsx** |
| 9.3 | ✅ มี | Disclaimer: "ข้อมูลเพื่อการศึกษาเท่านั้น" | **BoardroomDashboard.tsx:65,622** |
| 9.4 | ⚠️ ต่าง | UX details — ref มี filter ประชุมล้มเหลว/แยก type · เรา: ตรวจ | research: `boardroom-page-2026-08-09.md` |
| **สรุป** | | **3 มี · 0 ขาด · 1 ต่าง** | |

---

## 10. สัญญาณที่ประชุม (BoardroomSignalsDashboard.tsx — 561 lines)

| # | สถานะ | รายการ | หลักฐาน (อ้างอิง) |
|---|---|---|---|
| 10.1 | ✅ มี | Signals จากการประชุม + match positions | **BoardroomSignalsDashboard.tsx** |
| 10.2 | ✅ มี | "มุมมอง (ไม่เข้าบัญชี)" | **BoardroomSignalsDashboard.tsx:49,66** |
| 10.3 | ✅ มี | goMeetingFromSignals flow | **BoardroomSignalsDashboard.tsx** |
| **สรุป** | | **3 มี · 0 ขาด** | ✅ |

---

## 11. ทีมเทรด (TradeDeskDashboard.tsx — 153 lines + TeamDetailPage.tsx — 233 lines)

สถานะจากการตรวจสอบจริง (ticket 02 + map `รากของปัญหา`):

| # | สถานะ | รายการ | หลักฐาน |
|---|---|---|---|
| 11.1 | ⚠️ ต่าง | อันดับ `#1` ฮาร์ดโค้ด | **TradeDeskDashboard.tsx:59** — `#1` เขียนตาย ไม่ใช่จาก data  เสร็จ (023ff08) |
| 11.2 | ⚠️ ต่าง | `✗0 ⏳0` ฮาร์ดโค้ด | **TradeDeskDashboard.tsx:72** — `✗0` `⏳0` คงที่ ไม่ใช่จาก turn stats จริง  เสร็จ (023ff08) |
| 11.3 | ⚠️ ต่าง | `MTD` แสดงค่า `weekly_target_pct` (bug) | **TradeDeskDashboard.tsx:70** — `F.pct(team.weekly_target_pct,false)` ใช้ weekly เป็น MTD  เสร็จ (023ff08) |
| 11.4 | ❌ ขาด | กราฟ equity ทุกโหมด (24h/7d/30d/All) + time toggle | ref: `tdChart`, `tdChartEmpty` · เรา: ไม่พบใน TradeDeskDashboard — TeamDetailPage มี SVG 30d เฉพาะ detail page  เอา |
| 11.5 | ❌ ขาด | สวิตช์หลัก (master on/off) | ref: `tdPause`/`tdResume` · เรา: ไม่พบในโค้ด  เอา |
| 11.6 | ❌ ขาด | โควตาเทิร์นรายวัน + ตัวนับถัดไป | ref: `tdNextTurn`, `tdForceTurn` · เรา: ไม่พบในโค้ด (TeamDetailPage มีปุ่ม Force Turn แต่ไม่มี countdown จริง)  เอา |
| 11.7 | ❌ ขาด | ออเดอร์ที่ตั้งไว้ (pending LIMIT/STOP) ในหน้า main | เรา: `TradePendingOrder` table มีแล้ว · แต่ **ไม่แสดงใน TradeDeskDashboard** — แสดงเฉพาะ TeamDetailPage  เอา |
| 11.8 | ❌ ขาด | สรุปประจำวัน/รายเดือน (daily/weekly summary) | เรา: ไม่พบในโค้ด  เอา |
| 11.9 | ❌ ขาด | คำสั่งโต๊ะกลาง (directive) ในหน้า main | เรา: `POST /directive` API มี · แต่ **ไม่แสดงใน TradeDeskDashboard**  เอา |
| 11.10 | ✅ มี | Team card (equity/P&L/margin/cash) | **TradeDeskDashboard.tsx:56-77** |
| 11.11 | ✅ มี | ตารางไม้เปิด (open positions) | **TradeDeskDashboard.tsx:79-94** |
| 11.12 | ✅ มี | ประวัติเทิร์น (turn history) | **TradeDeskDashboard.tsx:97-113** |
| 11.13 | ✅ มี | ตลาด 200+ / TA signals + TIER | **TradeDeskDashboard.tsx:116-136** |
| 11.14 | ✅ มี | ปุ่ม "ดูรายละเอียดทีม →" + TeamDetailPage | **TradeDeskDashboard.tsx:75** → **TeamDetailPage.tsx** (233 lines, 14 sections) |
| 11.15 | ✅ มี | Disclaimer (guard rail) | **TradeDeskDashboard.tsx:55** · **TeamDetailPage.tsx:57** |
| **11.16** | ✅ มี | Team detail: 16 stat cards (4×4), equity SVG, MANDATE, constitution, 6 analysts, meeting history paginated, coach log, KB | **TeamDetailPage.tsx** |
| **สรุป** | | **8 มี · 6 ขาด · 3 ต่าง** | |

---

## 12–16. หน้าที่มี research เก่าน้อย

### 12. ข่าวสาร (NewsDashboard.tsx — 400 lines)
| # | สถานะ | รายการ |
|---|---|---|
| 12.1 | ✅ มี | filter สำนักข่าว · sort (ล่าสุด/ผลกระทบ) · pagination · AI วิเคราะห์ |
| 12.2 | ⚠️ ต่าง | ref: impact slider · เรา: ตรวจ NewsDashboard |
| 12.3 | ❌ ขาด | disclaimer | ดู D15 |
| **สรุป** | | **1 มี · 1 ขาด · 1 ต่าง** |

### 13. ภาพรวม (OverviewDashboard.tsx — 400 lines)
| # | สถานะ | รายการ |
|---|---|---|
| 13.1 | ✅ มี | AI brief (DeepSeek) + key indicators |
| 13.2 | ⚠️ ต่าง | ref: มี card layout ต่างจากของเรา — ตรวจ |
| 13.3 | ❌ ขาด | disclaimer | ดู D10 |
| **สรุป** | | **1 มี · 1 ขาด · 1 ต่าง** |

### 14. บทเรียน (LearnDashboard.tsx — 236 lines)
| # | สถานะ | รายการ |
|---|---|---|
| 14.1 | ✅ มี | 7 บทเรียน (self-authored Thai+EN) |
| 14.2 | ❌ ขาด | disclaimer จริง | ดู D16 (`ข้อควรจำ` ≠ disclaimer) |
| **สรุป** | | **1 มี · 1 ขาด** |

### 15. ออฟฟิศ 3D (OfficeDashboard.tsx — 202 lines)
| # | สถานะ | รายการ |
|---|---|---|
| 15.1 | ✅ มี | R3F scene + 12 rooms + OrbitControls + job runs panel |
| 15.2 | ⚠️ ต่าง | ref: 13 แผนก · GLB characters · click detail · เรา: box geometry + spheres (primitive) |
| 15.3 | ❌ ขาด | disclaimer | ดู D17 |
| **สรุป** | | **1 มี · 1 ขาด · 1 ต่าง** |

### 16. ตั้งค่า (SettingsDashboard.tsx — 142 lines)
| # | สถานะ | รายการ |
|---|---|---|
| 16.1 | ✅ มี | Telegram link placeholder (UI only — user ตัดสินใจตัด) |
| 16.2 | ❌ ขาด | disclaimer | ดู D18 |
| **สรุป** | | **1 มี · 1 ขาด** |

---

## Grand Summary

| # | แท็บ | มี | ❌ ขาด | ⚠️ ต่าง | เกิน | หมายเหตุ |
|---|---|---|---|---|---|---|
| — | **คำเตือนความเสี่ยง** | 7 รายการ | 11 ขาด | — | — | 5/16 แท็บมี disclaimer |
| 1 | ข้อมูลมหภาค | 3 | 6 | 0 | 0 | CME แยกหน้า |
| 2 | โมเดลทำกำไร | 1 | 1 | 2 | 0 | |
| 3 | สัญญาณเทรด | 1 | 3 | 1 | 0 | |
| 4 | อารมณ์ตลาด | 3 | 1 | 0 | 0 | |
| 5 | โซน CME | 4 | 2 | 0 | 0 | |
| 6 | วิกฤตแบงก์รัน | 4 | 2 | 0 | 0 | |
| 7 | รายประเทศ | 1 | 1 | 2 | 0 | |
| 8 | จำลองฯ | 4 | 0 | 0 | 0 | ✅ ดีสุด |
| 9 | ห้องประชุม | 3 | 0 | 1 | 0 | |
| 10 | สัญญาณที่ประชุม | 3 | 0 | 0 | 0 | ✅ |
| 11 | **ทีมเทรด** | **8** | **6** | **3** | 0 | 🔴 gap มากสุด |
| 12 | ข่าวสาร | 1 | 1 | 1 | 0 | |
| 13 | ภาพรวม | 1 | 1 | 1 | 0 | |
| 14 | บทเรียน | 1 | 1 | 0 | 0 | |
| 15 | ออฟฟิศ 3D | 1 | 1 | 1 | 0 | |
| 16 | ตั้งค่า | 1 | 1 | 0 | 0 | |
| **รวม** | | **47** | **27** | **12** | **0** | |

---

## นอกขอบเขต (user ตัดสินแล้ว — อย่าใส่เป็น `ขาด`)

- 9 ทีม / หลายทีม · อันดับข้ามทีม · กราฟแข่ง · 🥇🥈🥉
- ภาคทัณฑ์ / พัก / ไล่ออก · "รุ่น" (generation) · แสดงทีมที่ถูกปลด
- Telegram bot · Real order execution (PAPER ONLY)
- แข่งข้ามค่ายโมเดล (1 ทีม DeepSeek)
