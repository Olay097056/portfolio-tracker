# Research: หน้า /signals ของ bond-crisis-dashboard-v2 — ถอดโครงสร้างครบ

วันที่: 2026-08-08 | แหล่ง: JS bundle `app/signals/page-ae693b9187d442a6.js` (chunk 7764, module 26079) + i18n chunk `3474-e1aec38ee927d485.js` + ตาราง Supabase `trading_signals` / `market_prices`

## 1. ภาพรวมหน้า

หน้า "สัญญาณเทรด" (Signals) = trade desk: stats panels + ตารางสัญญาณ + equity curve สัญญาณเกิดจาก model (โมเดลทำกำไร) แตะ ≥40 (building) + TA pass ผ่านเกณฑ์ 50

**Layout (บนลงล่าง):**
1. Header: title "สัญญาณเทรด" + ปุ่ม **"สร้างสัญญาณจาก Regime"** (POST `scoring-engine` edge fn) + "ดึงข้อมูลล่าสุด HH:MM (วันที่)"
2. **Stats panel** (grid 6 ช่อง): activeSignals, unrealizedPnl, realizedPnl, winRate, profitFactor, maxDrawdown
3. **Detailed stats panel** (grid 5): expectancy, avgWin, avgLoss, payoffRatio, bestTrade, worstTrade, avgHold, avgRR, closed
4. **Category breakdown** (grid 4): stocks/crypto/macro/forex — แต่ละ: active count + W/L + WR%
5. **Filters**: category (all/macro/crypto/forex/stocks) + sort (strength/P&L/date/asset) + view toggle (full/compact)
6. **Signal table** (full view) หรือ **card grid** (compact) หรือ **mobile cards** (md:hidden)
7. **Equity curve** (area chart, closed trades cumulative pnl) — แสดงเมื่อมี closed ≥2

## 2. Stats formulas (module 26079 — ใช้กับ signals array)

```
active   = status == 'active'
closed   = status != 'active'            (tp_hit/sl_hit/expired)
win      = closed && pnl_pct > 0
loss     = closed && pnl_pct < 0
activeCount   = active.length
closedCount   = closed.length
winCount      = win.length
winRate       = win.length / closed.length * 100        (null ถ้าไม่มี closed)
realizedPnl   = Σ pnl_pct (closed)                      (P&L ที่ปิดแล้ว)
unrealizedPnl = Σ pnl_pct (active)                      (P&L ลอยตัว)
avgHoldHours  = avg(closed_at - created_at ในชั่วโมง)   (null ถ้าไม่มี)
avgRR         = avg(|tp-entry| / |entry-sl|) ทุกสัญญาณ  (แสดง "1:2.0")
profitFactor  = Σ win pnl / Σ |loss pnl|  (∞ ถ้าไม่มี loss แต่มี win; null ถ้าไม่มี closed)
expectancy    = realizedPnl / closed.length             (ค่าคาดหวังต่อออเดอร์)
avgWin        = Σ win pnl / win.length                  (กำไรเฉลี่ย)
avgLoss       = -Σ |loss pnl| / loss.length             (ขาดทุนเฉลี่ย, ติดลบ)
payoffRatio   = avgWin / |avgLoss|                      (null ถ้าอย่างใดอย่างหนึ่ง null)
bestTrade     = max(pnl_pct ของ closed)
worstTrade    = min(pnl_pct ของ closed)
```

**Category breakdown** (`w3`): ต่อ category — active count, wins, losses, winRate จาก closed ในหมวดนั้น

**Equity curve** (`Xf`): closed signals เรียงตาม closed_at → cumulative pnl_pct ทีละตัว → [{t, equity}] (ปัด 2 ตำแหน่ง)

**Max drawdown** (`tP`): จาก equity curve — ลดสูงสุดของ peak-to-trough

**Per-signal drawdown** (`IQ` = function l): max adverse excursion จาก candles — หา min(low)/max(high) ของแท่งระหว่าง created_at..closed_at (เทียบ entry) → %; แสดง "—" ถ้าไม่มี candles

## 3. Signal table (full view) — 12 คอลัมน์

| # | คอลัมน์ | รายละเอียด |
|---|---|---|
| 1 | Asset (chevron) | ชื่อ asset + sub: model shortTh (จาก L6) หรือ category · วันที่สร้าง |
| 2 | Direction | pill Long (เขียว) / Short (แดง) |
| 3 | Entry | entry_price |
| 4 | TP | tp (เขียวจาง) |
| 5 | SL | sl (แดงจาง) |
| 6 | Current | current_price + sub: "ราคา ณ <เวลา>" (active) / "ปิดเมื่อ <date>" (closed) |
| 7 | P&L | pnl_pct (เขียว/แดงตามเครื่องหมาย) |
| 8 | DD | drawdown % (จาก IQ) — "—" ถ้าไม่มี candles |
| 9 | Strength | progress bar signal_strength (component ZQ) |
| 10 | Sparkline | จาก market_prices.sparkline (20 จุด, component OW) |
| 11 | Status | badge: active=ฟ้า, tp_hit=เขียว, sl_hit=แดง, expired=เหลือง "⌛ หมดอายุ" |
| 12 | Action | ปุ่ม "ปิดออเดอร์" (active เท่านั้น, POST close-signal) |

คลิก row → ขยาย detail (colSpan=12) ด้านล่าง

**Detail (expand, grid 3 คอลัมน์):**
- **TA Score**: "คะแนนเทคนิคอล: <ta_score> / เกณฑ์ <threshold>" + รายการ 6 conditions (✓/✗ + key + score/max)
- **Indicators**: RSI14, MACD line/sig, EMA20 · SMA50, Stoch %K %D, ATR14
- **Levels · RR <rr>**: แนวต้าน (resistance join " · "), แนวรับ (support), SL basis ("จาก swing level" / "ATR fallback"), TP basis ("จากแนวรับ/ต้าน" / "RR fallback")

ถ้าไม่มี ta_snapshot: แสดง rationale_th/en หรือ "สัญญาณนำเข้า — ไม่มีข้อมูลเทคนิคอล"

## 4. TA snapshot — 6 conditions (max รวม = 100)

| condition | max | เกณฑ์ (อนุมานจาก data จริง) |
|---|---|---|
| price_vs_ema20 | 15 | ราคาเหนือ EMA20 → 15; ใต้ → 0 |
| ema20_vs_sma50 | 10 | EMA20 > SMA50 → 10; ต่ำกว่า → 0 |
| rsi_zone | 20 | RSI ในโซนดี (เช่น 40-70) → 20; อื่น 0 (USDJPY RSI 25.4 → 0) |
| macd_state | 20 | line ✓ + hist improving → 20; hist weakening → 10 (US30); ไม่ผ่าน → 0 |
| bb_room | 20 | inside band + room ≥1×ATR → 20; level near → 10; chasing → 0 |
| stoch_confirm | 15 | %K/%D เกณฑ์ → 7.5 (เห็นแต่ 7.5/15 — ผ่านครึ่งเดียว) |

**ta_score = Σ condition scores** (ตรง ไม่มีน้ำหนักซ้อน): US30 15+10+20+10+20+7.5=82.5→83 ✓, NAS100 15+0+20+20+10+7.5=72.5→73 ✓, USDJPY 15+10+0+20+10+7.5=62.5→63 ✓ — **threshold 50** = ผ่านเกณฑ์

**Indicators ที่ต้องคำนวณ** (จาก 60 daily candles): ema20, sma50, rsi14, macd{line, signal, hist, hist_prev}, bb{mid, lower, upper}, atr14, stoch{k, d}

**Levels**: support/resistance (arrays, จาก swing points), sl_basis ∈ {swing, atr_fallback}, tp_basis ∈ {level, rr_fallback}, rr (เช่น 2)

## 5. Signal strength — 5 factors (ผลรวม = signal_strength)

| factor | ความหมาย | ตัวอย่าง US30 / NAS100 |
|---|---|---|
| confluence | สอดคล้องหลายกรอบเวลา | 7 / 7 |
| rr_quality | คุณภาพ RR | 10 / 10 |
| ta_quality | คุณภาพ TA | 25 / 22 |
| atr_quality | คุณภาพ ATR (vol พอดี) | 13 / 12 |
| model_conviction | คะแนนโมเดล | 18 / 16 |

**signal_strength = Σ factors**: US30 7+10+25+13+18=73 ✓, NAS100 7+10+22+12+16=67 ✓ (max ~100)

## 6. Status badges + i18n labels (ไทย)

- active="ทำงาน" (bg-sky-500/15 text-sky-400), tp_hit (bg-emerald-500/15 text-emerald-400), sl_hit (bg-red-500/15 text-red-400), expired="⌛ หมดอายุ" (bg-amber-500/15 text-amber-400) — tip: "เกิน 14 วันโดยไม่ชน TP/SL — ปิดที่ราคาปัจจุบัน (P54)"
- Labels: สัญญาณเทรด, สร้างสัญญาณจาก Regime, สัญญาณที่ทำงาน, P&L ลอยตัว, P&L ที่ปิดแล้ว, อัตราชนะ, Profit Factor, Drawdown สูงสุด, สถิติละเอียด, ค่าคาดหวังต่อออเดอร์, กำไรเฉลี่ย (ออเดอร์ชนะ), ขาดทุนเฉลี่ย (ออเดอร์แพ้), Payoff Ratio, ออเดอร์ดีที่สุด, ออเดอร์แย่ที่สุด, ถือเฉลี่ย, R:R เฉลี่ย, ปิดแล้ว, แยกตามหมวด, ทั้งหมด, ราคาเข้า, ราคาปัจจุบัน, ปิดเมื่อ, ราคา ณ, ความแข็งแกร่ง, คะแนนเทคนิคอล, แนวต้าน, แนวรับ, มุมมองเต็ม, มุมมองย่อ, วันที่, สินทรัพย์, ทำงาน, ปิดออเดอร์, ยังไม่มีสัญญาณ — สัญญาณจะสร้างอัตโนมัติเมื่อโมเดลใดแตะระดับก่อตัว (≥40) และกราฟผ่านเกณฑ์เทคนิคอล

## 7. API/actions

- Fetch: `trading_signals` (limit 200, order created_at desc) + `market_prices` (symbol, sparkline, price, recorded_at, quote_at, candles)
- Generate: POST `/functions/v1/scoring-engine` (edge fn — สร้างสัญญาณจาก model + TA)
- Close: POST `/functions/v1/close-signal` (body มี signal id — ตั้ง closed_at + คำนวณ pnl_pct)
- Sort: strength (active ก่อน, เรียง strength desc, แล้ว created_at desc), pnl (active ก่อน, pnl desc), asset (A-Z), default (active ก่อน, created_at desc)
- View mode: full / compact (localStorage bcd-signals-view), sort เก็บที่ bcd-signals-sort

## 8. ข้อมูลอ้างอิง (Supabase ต้นฉบับ 2026-08-08)

- 41 สัญญาณ: 8 active, 15 tp_hit, 16 sl_hit, 2 expired
- ตาราง `trading_signals` columns: id, asset, category, direction, entry_price, tp, sl, current_price, pnl_pct, signal_strength, strength_factors{5}, status, model_id, rationale_en, rationale_th, ta_snapshot, created_at, closed_at, expires_at
- `market_prices`: sparkline (20 จุด list[float]), candles (60 แท่ง {o,h,l,c,t:"YYYY-MM-DD"})
- ตัวอย่าง ta_snapshot จริง: US30 (ta 83, RSI 63.6, EMA20 52864.98, SMA50 52056.16, ATR14 631.9, stoch k77.1 d79.3, bb mid52653 lower51049 upper54256, macd line520.6 sig346.8 hist173.8 hist_prev175.6), NAS100 (ta 73), USDJPY (ta 63, RSI 25.4 → rsi_zone 0)
