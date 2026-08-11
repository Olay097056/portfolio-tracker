# Map — สัญญาณเทรด (Trading Signals tab) สำหรับ Bond-crisis

## Destination

เพิ่มหน้า "สัญญาณเทรด" ใน tab Bond-crisis ของ portfolio-tracker ให้เหมือนหน้า `/signals` ของ bond-crisis-dashboard-v2 100%: stats panel (win rate, P&L ที่ปิด/ลอยตัว, R:R เฉลี่ย, profit factor, expectancy, ออเดอร์ดีที่สุด/แย่ที่สุด), การ์ดสัญญาณ (entry/TP/SL, signal strength + 5 strength factors, TA snapshot, model conviction, sparkline), และการกรอง active/closed — ข้อมูลจาก public sources (yfinance/FRED/CFTC เหมือน macro tab) ไม่ scrape เว็บต้นฉบับ

## Notes

- Domain: full-stack feature ใน repo นี้ (FastAPI backend + React/Vite frontend, Thai-first UI)
- ทุก session ควร consult: `docs/specs/2026-08-08-macro-dashboard.md` (spec เดิมที่ขยายมาแล้ว 3 ครั้ง), `backend/app/model_service.py` (model scoring ที่ signals จะอ้างอิง), `frontend/src/components/tools/ModelsDashboard.tsx` (pattern UI เหมือนต้นฉบับที่ทำไปแล้ว)
- ข้อมูลอ้างอิงที่ขุดไว้แล้วจาก bundle ต้นฉบับ (2026-08-08): ตาราง `trading_signals` (asset, category, direction, entry_price, tp, sl, current_price, pnl_pct, signal_strength, strength_factors{confluence, rr_quality, ta_quality, atr_quality, model_conviction}, status{active/tp_hit/sl_hit/expired}, model_id, rationale_th/en, ta_snapshot{ta_score, threshold, conditions[], levels{support, resistance, sl_basis, tp_basis, rr}}, created_at, closed_at, expires_at) และ `market_prices` (sparkline 20 จุด, candles 60 แท่ง {o,h,l,c,t}) — มี 41 สัญญาณใน Supabase เขา (8 active, 31 closed)
- หลักการยืนยัน: ไม่แต่งตัวเลข ถ้าแหล่งข้อมูลไม่มี → แสดง "—" (ตาม spec macro เดิม)
- Reference site: `bond-crisis-dashboard-v2.vercel.app/signals` (ต้อง login ดูหน้าได้ แต่ JS bundle + Supabase anon key อ่านได้)

## Decisions so far

- [01-research-signals-page](issues/01-research-signals-page.md) — หน้าต้นฉบับเป็น trade desk: stats 2 ชั้น (win rate, P&L, profit factor, expectancy, max drawdown, avg RR...) + category breakdown + filters + ตาราง 12 คอลัมน์ expandable + equity curve; TA snapshot = 6 conditions (รวม 100, ta_score = ผลรวมตรง, threshold 50); signal_strength = ผลรวม 5 factors; ข้อมูลเต็ม: `research-signals-page.md`
- [03-prototype-ta-engine](issues/03-prototype-ta-engine.md) — TA engine พิสูจน์แล้ว: formula ถูก (ta_score = Σ 6 conditions ตรงเป๊ะกับ 31 snapshots จริง), 4/6 conditions ทำงานถูก (price_vs_ema20, ema20_vs_sma50, rsi_zone, macd_state); bb_room วัด room ถึง swing level (ไม่ใช่ band edge) และ stoch_confirm ยังต้องปรับระหว่าง implement; Δ ~15 ส่วนใหญ่จาก data source ต่างกัน — prototype: `backend/scratch_ta_prototype.py`
- [02-grilling-signal-generation](issues/02-grilling-signal-generation.md) — สัญญาณคำนวณเองทั้งหมด (model ≥40 + ta_score ≥50), เก็บใน SQLite `trading_signals`, history เริ่มจากศูนย์ (stats แสดง "—" จนกว่าจะมี closed จริง), trigger = on-demand ตอน cache หมดอายุ (10 นาที), expires 14 วัน (P54)
- [04-task-backend-signals](issues/04-task-backend-signals.md) — backend `/api/signals` เสร็จ: TA engine + generate_signals + stats (formula ต้นฉบับครบ) + SQLite `trading_signals` + GET/refresh/close; 434 tests ผ่าน — ไฟล์: `backend/app/signals_service.py`, `backend/app/routers/signals.py`, `backend/tests/test_signals_router.py`
- [05-task-frontend-signals](issues/05-task-frontend-signals.md) — frontend `SignalsDashboard.tsx` เสร็จ: stats 2 ชั้น + category breakdown + filters + ตาราง 12 คอลัมน์ expandable (sparkline, strength bar, ปิดออเดอร์) + equity curve; sub-tab ที่ 3 ใน BondCrisisPage; commit `17e8b0d`; backend 434 + frontend 559 tests ผ่าน

## Not yet specified

- **Strength factors calibration** — ใช้ค่า calibrated เบื้องต้นแล้ว (confluence ตาม model score, ta_quality = ta/100×25, atr_quality คงที่ 13, model_conviction = score/100×20) — ปรับละเอียดได้ทีหลังเมื่อมีข้อมูลจริง (ยังอยู่ใน fog)

## Out of scope

- หน้า /models (โมเดลทำกำไร) — ทำเสร็จแล้วใน commit `af7b7a3`
- หน้า /macro (ข้อมูลมหภาค) — ทำเสร็จแล้วใน commit `c2beca7` + `d5c042b`
- หน้าอื่นๆ ของต้นฉบับ (อารมณ์ตลาด, ข่าวสาร, วิกฤตแบงก์รัน, รายประเทศ, จำลองสถานการณ์, ห้องประชุม, ออฟฟิศ 3D) — user เลือกทำ signals ก่อน
- การส่งสัญญาณผ่าน Telegram/notification ของต้นฉบับ — ต้องเชื่อมบัญชี ไม่อยู่ใน scope นี้
