# 01 - Research: ถอดหน้า /signals ของต้นฉบับให้ครบ (UI + stats + TA scoring)

Type: research
Status: resolved
Blocked by:

## Question

หน้า /signals ของ bond-crisis-dashboard-v2 มี UI/UX และ logic อะไรบ้างที่ต้องจำลอง? ขุดจาก JS bundle (`/_next/static/chunks/app/signals/page-ae693b9187d442a6.js`) และ i18n chunk (`3474-e1aec38ee927d485.js`) ให้ครบ แล้วสรุปเป็น markdown asset

## Answer

Research เสร็จสมบูรณ์ — สรุปฉบับเต็ม: `.scratch/signals-tab/research-signals-page.md`

**สาระสำคัญ (สำหรับ ticket ถัดไป):**

1. **หน้าเป็น trade desk**: stats panels (2 ชั้น) + category breakdown + filters (category/sort/view) + ตาราง 12 คอลัมน์ (expand ได้) / compact cards / mobile cards + equity curve
2. **Stats formulas ครบ** (จาก module 26079): winRate = wins/closed×100, realizedPnl = Σ pnl_pct closed, unrealizedPnl = Σ pnl_pct active, profitFactor = Σwin/Σ|loss| (∞ ถ้าไม่มี loss), expectancy = realizedPnl/closedCount, avgRR = avg(|tp-entry|/|entry-sl|), maxDrawdown จาก equity curve, per-signal DD = max adverse excursion จาก candles
3. **TA snapshot = 6 conditions** (สำคัญ — มี stoch_confirm 7.5/15 ด้วย, ไม่ใช่ 5 อย่างที่คิดตอนแรก): price_vs_ema20 15 + ema20_vs_sma50 10 + rsi_zone 20 + macd_state 20 + bb_room 20 + stoch_confirm 15 = 100; **ta_score = Σ ตรง** (verify: US30 82.5→83 ✓, NAS100 72.5→73 ✓, USDJPY 62.5→63 ✓); threshold 50; indicators ที่ต้องคำนวณ: ema20, sma50, rsi14, macd{line,signal,hist,hist_prev}, bb{mid,lower,upper}, atr14, stoch{k,d}
4. **signal_strength = Σ 5 factors** (confluence+rr_quality+ta_quality+atr_quality+model_conviction) — verify: US30 73 ✓, NAS100 67 ✓
5. **Status**: active/tp_hit/sl_hit/expired (expired = เกิน 14 วันไม่ชน TP/SL, ปิดที่ราคาปัจจุบัน P54)
6. **Actions**: "สร้างสัญญาณจาก Regime" (POST scoring-engine) + "ปิดออเดอร์" (POST close-signal) — ต้นฉบับใช้ Supabase edge functions; เราจะ implement เป็น endpoints ของเราเองใน ticket 04
7. **i18n labels ไทยครบ** (ใน research doc section 6)
8. **ข้อสังเกตสำหรับ ticket 02**: สัญญาณเกิดจาก model ≥40 (building) + TA ≥ threshold 50; expires_at = created + 14 วัน

**Graduated fog**: strength factors formula (เป็นที่รู้แล้ว — ส่งต่อให้ 03/04) และ bb_room 3 ระดับ (20/10/0) — เคลียร์จาก Not yet specified ใน map

## Scope

- โครงสร้างหน้า: stats panel, tabs (active/closed), การ์ดสัญญาณ, filters, sorting
- Stats formula (จาก module 26079): activeCount, closedCount, winCount, winRate, realizedPnl, unrealizedPnl, avgHoldHours, avgRR, profitFactor, expectancy, avgWin, avgLoss, payoffRatio, bestTrade, worstTrade — สูตรคำนวณแต่ละตัวจาก signals array
- TA snapshot: 5 conditions (price_vs_ema20, ema20_vs_sma50, rsi_zone, macd_state, bb_room) + max score ต่อ condition + levels (support/resistance, sl_basis, tp_basis, rr)
- Status badges: active / tp_hit / sl_hit / expired (สี + label ไทย)
- i18n labels ไทยทั้งหมดที่หน้าใช้ (มีบางส่วนแล้ว: สัญญาณเทรด, อัตราชนะ, P&L ที่ปิดแล้ว, R:R เฉลี่ย, Profit Factor, ค่าคาดหวังต่อออเดอร์, ออเดอร์ดีที่สุด/แย่ที่สุด)
- Signal strength factors: confluence, rr_quality, ta_quality, atr_quality, model_conviction — รวมเป็น signal_strength ยังไง (ถ้าเห็นจาก code)

## Deliverable

ไฟล์ markdown สรุปทุกอย่างข้างต้น (ลิงก์เป็น asset ใน ticket) — ใช้เป็น reference สำหรับทุก ticket ถัดไป

## ข้อมูลที่มีแล้ว (จากรอบสำรวจ)

- ตาราง `trading_signals`: asset, category, direction, entry_price, tp, sl, current_price, pnl_pct, signal_strength, strength_factors{5 ตัว}, status, model_id, rationale_th/en, ta_snapshot{ta_score, threshold, conditions[5], levels{support, resistance, sl_basis, tp_basis, rr}}, created_at, closed_at, expires_at
- ตาราง `market_prices`: symbol, sparkline (20 จุด), candles (60 แท่ง {o,h,l,c,t})
- สถิติต้นฉบับ: 41 สัญญาณ (8 active, 15 tp_hit, 16 sl_hit, 2 expired)
- stats labels ไทยเจอบ้างแล้ว: winRate="อัตราชนะ", realizedPnl="P&L ที่ปิดแล้ว", unrealizedPnl="P&L ลอยตัว", avgRR="R:R เฉลี่ย", profitFactor="Profit Factor", expectancy="ค่าคาดหวังต่อออเดอร์", bestTrade="ออเดอร์ดีที่สุด", worstTrade="ออเดอร์แย่ที่สุด", activeSignals="สัญญาณที่ทำงาน"
