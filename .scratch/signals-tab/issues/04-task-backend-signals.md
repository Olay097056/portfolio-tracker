# 04 - Task: Backend signals service + router + SQLite table

Type: task
Status: resolved
Blocked by: 02, 03

## Answer

Backend เสร็จสมบูรณ์ — 434 tests ผ่าน (ใหม่ 8):

**`backend/app/signals_service.py`:**
- TA engine (จาก prototype ticket 03): EMA20/SMA50/RSI14/MACD/BB/ATR14/Stoch + swing levels (fractal lookback 8) จาก 60 daily candles yfinance; 6 conditions (price_vs_ema20 15, ema20_vs_sma50 10, rsi_zone 20, macd_state 20, bb_room 20, stoch_confirm 15); ta_score = Σ ตรง; bb_room fallback ไป band edge เมื่อไม่มี swing level (trend แรง)
- `generate_signals()`: สร้างสัญญาณเมื่อ model ≥40 (building) + ta_score ≥ 50; signal_map จาก registry `MODELS` (asset/direction/category/reason); signal_strength = Σ 5 factors (confluence+rr_quality+ta_quality+atr_quality+model_conviction); TP/SL จาก swing level หรือ RR fallback; expires_at = +14 วัน (P54); cap 4 สัญญาณ/โมเดล
- `compute_stats()`: ครบทุก formula ของต้นฉบับ (module 26079) — win rate, P&L จริง/ลอยตัว, profit factor (∞ เมื่อไม่มี loss), expectancy, avg RR, payoff ratio, best/worst trade, equity curve, max drawdown

**`backend/app/routers/signals.py`** (prefix `/api/signals`):
- ตาราง SQLite `trading_signals` (mirror schema ต้นฉบับ) — สร้างอัตโนมัติผ่าน create_all
- `GET /api/signals`: generate (ถ้า cache หมด 10 นาที) → persist ใหม่ → expire stale (P54) → refresh ราคาปัจจุบัน → stats; notes แจ้ง "สร้างใหม่ X รายการ" / "ยังไม่มีสัญญาณปิด"
- `POST /api/signals/refresh`: force regenerate
- `POST /api/signals/close`: ปิดออเดอร์ที่ราคาปัจจุบัน → status tp_hit/sl_hit + pnl_pct + closed_at
- De-dup: ไม่ insert ซ้ำ asset+model+วันเดียวกัน

**Bug ที่เจอระหว่าง implement:** Pydantic field `pass_` ต้อง alias `pass` (JSON key ของ reference); `build_models()` payload ไม่มี signal_map (ต้องดึงจาก registry); `_score_bb_room` ต้อง fallback band เมื่อไม่มี swing level

**Smoke test จริง:** 12 สัญญาณ active สร้างจาก fed-pivot + recovery-reflation (ตลาดจริง); close flow ทำงาน (sl_hit + pnl + stats อัปเดต); cached GET 0.00s

## Question

สร้าง backend สำหรับหน้า สัญญาณเทรด: service ที่ generate/เก็บสัญญาณ (ตาม decision จาก ticket 02 และ TA engine จาก ticket 03) + router `/api/signals` + ตาราง SQLite

## Scope

- ตาราง SQLite `trading_signals` (mirror schema ของต้นฉบับ: asset, category, direction, entry/tp/sl, pnl_pct, signal_strength, strength_factors, status, model_id, rationale_th/en, ta_snapshot, created_at, closed_at, expires_at)
- Service: สร้างสัญญาณจาก model scores (model_service) + TA score (ticket 03) เมื่อ model building/active และ TA ≥ threshold 50; คำนวณ signal_strength จาก 5 factors
- Router `/api/signals` (GET + refresh, cache 10 นาที pattern เดียวกับ macro/models) + stats computation (win rate, P&L, profit factor, expectancy — สูตรจาก ticket 01)
- ค่าที่ไม่มีแหล่ง (history ยังว่าง) → แสดงอย่างตรงไปตรงมา ไม่แต่งตัวเลข
- Tests: stub TA engine + model service เหมือน test_macro_router/test_models_router

## Deliverable

backend service + router + tests ผ่าน (pytest) — ปลดบล็อก ticket 05
