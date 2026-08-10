# Trade-desk page — ทีมเทรด (reverse-engineered)

Date: 2026-08-10 · แผน `.scratch/trade-desk/` ticket 01 (research)
ที่มา: `https://bond-crisis-dashboard-v2.vercel.app/trade-desk` (+ /meetings, /settings) — chunk:
- main: `/_next/static/chunks/app/trade-desk/page-d3de5400d9825f64.js` (19,551 B — module 87039 = หน้า, module 50726 = สูตร equity)
- meetings: `/_next/static/chunks/app/trade-desk/meetings/page-4ec1e10e404216e5.js`
- settings: `/_next/static/chunks/app/trade-desk/settings/page-e2dc68afe696bc8d.js`
- i18n: `/_next/static/chunks/3474-e1aec38ee927d485.js` — คีย์ `td*` **622 คีย์** → `dig/td-i18n.txt`

## 1. ภาพรวมหน้า /trade-desk

ห้องเทรดจำลอง — 9 ทีม AI (ของเรา: 2 ทีมตาม map) แข่งกันด้วยพอร์ตกระดาษ $10,000/ทีม ราคาจริง (ต้นฉบับ Hyperliquid — ของเราต้องใช้ราคาที่มี: yfinance/FRED ตามแผน boardroom-signals) · สถานะทีม: ทำงาน/ภาคทัณฑ์/พัก/**ถูกไล่ออก** · มีรุ่น (generation) `-g\d+` ต่อท้าย team_id (เช่น `algo-g3`)

## 2. State + RPC (ทุกอย่างผ่าน `call({action})` ตัวเดียว)

| action | ใช้ตอน | คืนอะไร |
|---|---|---|
| `get_state` | เปิดหน้า + polling | state ทั้งหมด (ด้านล่าง) |
| `get_snapshots` | เลือก range 30d/all | `{snapshots: [{team_id, equity, snapped_at}]}` — `days` param |
| `get_closed_pnl` | metric = pnl | `{closed_pnl: [{team_id, realized_pnl}]}` — sum ต่อทีม |
| `get_closed_positions` | ปุ่ม CSV/ตาราง | `{closed: [...]}` + `marks` + `ta` (ตารางปิดสถานะ + สัญญาณเทคนิค) |
| `get_signals` | /meetings | สัญญาณสุขภาพทีม (ผลเทิร์น) |

**state shape (จากโค้ด):**
- `teams[]`: id, name_th, name_en, family (หมวดสี h.FQ), status, capital, balance, mtd_pct, wtd_pct, weekly_target_pct + weekly_target_week, next_turn_at, directive_md
- `positions[]`: team_id, market, side (long/short), size, entry_px, margin_usd
- `marks[]`: market, mark_px · `orders[]`: status (pending → reserved += margin_usd, count)
- `snapshots[]`: team_id, equity, snapped_at · `signals[]`: team_id, status (ok/err), substituted
- `reviews[]`: kind="monthly" → scores.ranking [{rank, team_id, pnl_pct}]
- `settings`: monthly_target_floor_pct (default **5**), monthly_target_stretch_pct (default **20**), per_team_daily_cap (default 0)
- `turns_today`: {team_id: n} — โควตาเทิร์นต่อทีม/วัน

## 3. สูตร equity/P&L (module 50726 — raw):

```js
equity = balance + reserved + Σ(margin_usd) + Σ((long?1:-1) × size × (mark_px − entry_px))
pnlPct = (equity − capital) / capital × 100
margin = Σ(margin_usd ของ positions) · upnl = Σ unrealized · reserved = มาร์จินของออเดอร์ pending
```

- P&L unrealized = ทิศทาง × ขนาด × (mark − entry) — มาร์กทูมาร์เก็ตตรงๆ · equity = เงินสด + จอง + มาร์จิน + unrealized
- การ์ดทีมจัดอันดับ: fired ไปท้ายสุด (`yQ` sort — fired last, แล้วเรียง equity/pnlPct ลง)
- mini chart ใช้ snapshots ≥ 2 จุด (ถ้า < 2 → [equity, equity])

## 4. การ์ดทีม (ทีมละใบ — คลิก → /trade-desk/{team_id})

- แถวบน: อันดับ `#N` (1 = ทอง, ≤3 = หลัก) · family badge (สีตามหมวด) · ชื่อ (ไทย/อังกฤษ) · status badge (ทำงาน/ภาคทัณฑ์/พัก/ถูกไล่ออก — fired ทำให้การ์ด opacity 60%)
- ตัวเลข: **Equity $** (0 ทศนิยม) · ทุน $ · กำไร/ขาดทุน % (เขียว/แดง) · margin ใช้แล้ว $ · เงินสด $
- **MTD** กับเป้า 5–20%: `<5 amber · <20 sky · ≥20 emerald` (tooltip "เป้า MTD 5–20%") · **WTD** เทียบ weekly_target (เฉพาะสัปดาห์ที่ตั้ง — `weekly_target_week === สัปดาห์ปัจจุบัน` ไม่งั้น "· ไม่มีเป้ารายสัปดาห์") — WTD ≥ เป้า เขียว · ≥0 ฟ้า · <0 เหลือง
- mini equity chart · แถวสุขภาพ: `✓n ✗n 🔁n` (signals ok/err/substituted) · `⏳n` pending orders · `📌` directive (directive_md ไม่ว่าง) · `⏸ หมดโควตาเทิร์น n/วัน` (turns_today ≥ per_team_daily_cap) · "เทิร์นถัดไป: <เวลา>" · "ดูทีม →"

## 5. กราฟ equity (EquityChart — async chunk 9763/4776/1161)

- **metric 4 แบบ**: usd · pct (pnlPct) · rebase · pnl (เฉพาะ closed_pnl — ดึง on-demand) — ปุ่มสลับ
- **range**: 24h (snapshots ≥ now−1d) · 7d · 30d/all (ดึง get_snapshots เพิ่ม แล้ว merge ต่อท้ายตาม snapped_at — กันซ้ำ)
- **scale**: focus (ซูมช่วงที่ทีมอยู่ในกราฟ) / full · **team chips**: คลิกซ่อน/แสดงทีม · checkbox "แสดงทีมที่ถูกไล่ออก"
- ช่วงเวลา: `range 24h/7d/30d/all` · ปุ่ม metric/range/scale เป็น segmented control

## 6. Monthly digest (banner เหลือง)

`reviews[]` ที่ kind="monthly" (ไม่มี team_id) → `scores.ranking` เรียง rank → `🥇🥈🥉 #n team (pnl%)` — หัวข้อ "🏆 สรุปรายเดือน · YYYY-MM" (window_start.slice(0,7)) — pnl บวกเขียว/ลบแดง

## 7. หน้า /trade-desk/meetings

**ไม่ใช่การประชุมแบบ boardroom!** — `get_signals` = รายงานผลเทิร์น/สัญญาณสุขภาพของทีม (ok/err/substituted — ตัวเดียวกับแถวสุขภาพบนการ์ด) + `user_profiles` (สิทธิ์ — ระบบ login ของต้นฉบับ เราไม่มี) — **ไม่มีการประชุม AI ในหน้านี้** (ต่างจากสมมติฐานใน map — "ทีมเทรดก็มีการประชุมของตัวเอง" — ยังต้องดู ticket 02 ว่าทีมตัดสินใจแบบไหน แต่หน้า /meetings ไม่ใช่ห้องประชุม)

## 8. หน้า /trade-desk/settings

- `get_state` (โหลด settings ปัจจุบัน) · `list_models` (รายการโมเดล — ต้นฉบับหลายค่าย) · `set_settings` (master switch + monthly targets + daily cap + อื่น) · `set_team_models` (**assign โมเดลต่อทีม** — ต้นฉบับแข่งข้ามค่ายโมเดล)
- ของเรา (2 ทีม DeepSeek ตัวเดียว): set_team_models ไม่จำเป็น (หรือใช้เป็น "ตั้งบุคลิก") — เหลือ master switch + targets + cap

## 9. Master switch (หลัก)

i18n raw: `tdMasterOff = "สวิตช์หลักปิดอยู่ — ทีมจะไม่เปิดเทิร์นเทรด (ราคา/ข้อมูลยังอัปเดต และ SL/TP/liq ของไม้ที่เปิดอยู่ยังทำงานปกติ)"` — ปิดแล้วทีมหยุดเปิดเทิร์นใหม่ แต่ราคายังไหล + SL/TP/liq ยังทำงาน

## 10. Copy ไทย td* (622 คีย์ — ตัวอย่างสำคัญ)

tdTitle "ทีมเทรด" · tdSubtitle "ห้องเทรดจำลอง 9 ทีม AI โครงสร้างเหมือนกัน แข่งข้ามค่ายโมเดล — พอร์ตเริ่ม $10,000/ทีม ราคาจริง Hyperliquid" · tdTeams "ทีมทั้งหมด" · tdEquity/tdCapital "ทุน"/tdBalance "เงินสด"/tdPnl "กำไร/ขาดทุน" · tdGen "รุ่น" · tdLead "หัวหน้าทีม" · tdAnalystsShort "ลูกทีม ×6" · tdStatusActive "ทำงาน"/tdStatusProbation "ภาคทัณฑ์"/tdStatusPaused "พัก"/tdStatusFired "ถูกไล่ออก" · tdMarkets "ตลาดที่เปิดให้เทรด" · tdPrice/tdChange24h "24 ชม."/tdFunding "Funding/ชม."/tdOiNtl "OI"/tdVlm24h "ปริมาณ 24 ชม."/tdTier · tdCatCrypto "คริปโต" · tdMtd "MTD"/tdWtd "WTD"/tdMtdTarget/tdWeeklyTarget "เป้ารายสัปดาห์"/tdWeeklyNoTarget "ไม่มีเป้ารายสัปดาห์" · tdMarginUsed "มาร์จินที่ใช้" · tdOrders "ออเดอร์" · tdDirectiveActive · tdTurnQuotaReset "โควตาเทิร์นจะรีเซ็ต"/tdTurnQuotaFull "หมดโควตาเทิร์น"/tdNextTurn "เทิร์นถัดไป" · tdChartTitle/tdChartUsd "USD"/tdChartPct "P&L %"/tdChartRebase "Rebase"/tdChartPnl "P&L สะสม" · tdRange24h "24 ชม."/tdRange7d "7 วัน"/tdRange30d "30 วัน"/tdRangeAll "ทั้งหมด" · tdScaleFocus "โฟกัส"/tdScaleFull "เต็ม" · tdShowFired "แสดงทีมที่ถูกไล่ออก" · tdChartEmpty/tdChartClipped · tdMonthlyDigest "สรุปรายเดือน" · tdViewTeam "ดูทีม" · tdHealthTitle — (ทั้งชุดใน dig/td-i18n.txt)

## 11. หาไม่เจอ (ต้องออกแบบเอง — ticket 02/04)

1. **กลไกตัดสินใจของทีม** — หน้าเป็นแค่แสดงผล (RPC อ่านอย่างเดียว) — ฝั่งเซิร์ฟเวอร์ (วิธีเทิร์น, entry/SL/TP, การไล่ออก, generation ใหม่) หาไม่เจอ — งาน ticket 04 (ออกแบบเอง + reuse เครื่องยนต์ boardroom?)
2. **กลไก "รุ่น"/ไล่ออก** — เห็นแค่ field (gen suffix, status fired) — กติกา server-side หาไม่เจอ — map ตั้งข้อสังเกต: ด้วย 2 ทีม กลไกนี้อาจไม่มีความหมาย (ไล่ออกหนึ่ง = เหลือทีมเดียว) — ticket 02 ตัดสิน
3. **ตลาด/ราคา** — ต้นฉบับใช้ Hyperliquid (perpetual — funding/OI/24h vol มีในหน้า) — เรามี yfinance/FRED ไม่มี funding/OI → ตารางตลาด (tdMarkets) ต้องปรับ: แสดงราคา/24 ชม. เท่านั้น (ไม่มี funding/OI — หรือหาแหล่ง)
4. **SL/TP/liq** — master switch ว่า "SL/TP/liq ยังทำงาน" — กลไกจริง server-side หาไม่เจอ — ticket 04 ออกแบบ

## 12. สรุปสิ่งที่ต้องทำต่อ (ป้อน ticket 02)

- 2 ทีม + บุคลิกต่างกัน (วิธีคิด — ไม่ใช่โมเดลต่างค่าย) · พอร์ต $10,000/ทีม · equity formula ใช้ของต้นฉบับได้ตรงๆ (module 50726) · targets MTD 5–20% + WTD ต่อสัปดาห์ · โควตาเทิร์น/วัน · master switch (SL/TP/liq ยังทำงาน) · snapshots equity (ติดตาม) · monthly digest · status machine (ทำงาน/ภาคทัณฑ์/พัก/fired — ตัดสินว่าทำไหมกับ 2 ทีม) · ราคา: yfinance/FRED (ไม่มี funding/OI — ปรับตารางตลาด) · /meetings = สัญญาณสุขภาพ ไม่ใช่ประชุม AI · settings = master + targets + cap

## 13. ข้อมูลจริงจากหน้า /trade-desk (login ของ user — 2026-08-10, user อนุญาต)

เปิดหน้าใน Chrome ของ user (session `oxyggn2@gmail.com`) — 9 ทีมรุ่น g1 (ทีม = ค่ายโมเดลล้วน):

| # | ทีม | Equity | P&L% | margin | MTD /5–20% | WTD/เป้า | สุขภาพ | เทิร์นถัดไป |
|---|---|---|---|---|---|---|---|---|
| 1 | DeepSeek | $10,868 | +8.68 | $625 | +5.40 ✅ | -0.70/+1.50 | ✓5✗0🔁1 | 1h 5m |
| 2 | Kimi | $10,479 | +4.79 | $4,033 | +3.50 | -1.30/+1.20 | ✓3✗0 | 40m |
| 3 | Mistral | $10,421 | +4.21 | $2,095 | +5.30 ✅ | -0.40/+1.50 | ✓1✗0📌 | 55m |
| 4 | Claude | $10,147 | +1.47 | $1,800 | +0.30 | -0.60/+1.30 | ✓3✗2🔁3 | 0m |
| 5 | GPT | $9,557 | -4.43 | $500 | -4.90 | 0.00/+1.00 | ✓4✗0🔁3📌 | 3h 54m |
| 6 | Gemini | $9,174 | -8.26 | $600 | -1.10 | -0.40/+2.00 | ✓5✗0🔁1📌 | 3h 4m |
| 7 | Qwen | $9,140 | -8.60 | $200 | -4.20 | -2.50/+1.20 | ✓1✗0📌 | 34m |
| 8 | GLM | $9,095 | -9.05 | $300 | -5.20 | -0.10/+1.30 | ✓3✗0🔁2📌 | 1h 9m |
| 9 | Grok | $8,814 | -11.86 | $1,700 | -6.00 | -2.20/+1.50 | ✓3✗0📌 | 5h 25m |

- **ตลาดที่เปิดให้เทรด: 88 ตลาด** — คริปโต 20/40 · หุ้นรายตัว 20/37 · MACRO (ดัชนี/ทอง/น้ำมัน) 10 · FX 1 · "ราคาอัปเดตล่าสุด 1 นาที"
- **เป้ารายสัปดาห์ต่างกันต่อทีม** (หัวหน้าตั้ง: +1.0–2.0%) · ทุกทีมมี "เทิร์นถัดไป" (auto-schedule — มี worker จริง)
- **Monthly digest (2026-07)**: 🥇 kimi +1.83 🥈 gpt +0.51 🥉 claude +1.18 #4 deepseek +3.42 — **อันดับ ≠ เรียง pnl** (จัดอันดับด้วย score — ไม่ใช่ pnl ล้วน)
- ข้อสรุป: ทีม = ค่ายโมเดล · โครงสร้าง/บทบาทเหมือนกัน (6 บทบาท) · ต่างที่โมเดล + เป้า/ตัวตนที่หัวหน้าตั้ง — **เรา 1 โมเดล → ต่างที่กลยุทธ์ (ticket 02)**
