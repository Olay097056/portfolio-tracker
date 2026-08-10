# ทีมเทรด (Trade Desk sub-tab) — Bond-crisis sub-tab #10

Date: 2026-08-10
Status: **Shipped** — commits `e371fd3` (backend engine) + `fb2eb03` (frontend sub-tab)
แผน: `.scratch/trade-desk/` — tickets 01–03, 06–08 (03/04/05 รวมเข้า 06 — แผน consolidate)

## 1. ขอบเขต (รวมที่ตัดจากต้นฉบับ)

| ต้นฉบับ (9 ทีม) | ของเรา (2 ทีม) | เหตุผล |
|---|---|---|
| 9 ทีม = ค่ายโมเดล (DeepSeek/Kimi/Claude/GPT/Gemini/Qwen/GLM/Mistral/Grok — ข้อมูลจริง 2026-08-10) | **2 ทีม = กลยุทธ์** (A สายเทรนด์ / B สายกลับค่า) | เราใช้ DeepSeek ค่ายเดียว — ต่างที่ฟังก์ชันตัดสินใจ ไม่ใช่โมเดล |
| leverage/funding/OI (Hyperliquid) | **leverage = 1** (ไม่ใช้) · ไม่มี funding/OI | ไม่มีแหล่ง data — ราคาจริง yfinance/FRED |
| สถานะทีม: ทำงาน/ภาคทัณฑ์/พัก/ไล่ออก + รุ่น (generation) | สถานะ active อย่างเดียว (probation/paused เก็บ field ไว้) · **รุ่น/ไล่ออก ตัดทิ้ง** | 2 ทีม ไล่ออกหนึ่ง = แข่งไม่ได้ (ตัดสิน 02) |
| monthly digest อันดับด้วย score (อันดับ ≠ pnl — เห็นจริง) | ใช้ pnl_pct ตรง (MTD) | ไม่ทำ score เพิ่ม |
| หัวหน้าตั้ง "ตัวตน" ลูกทีม (persona + log) | ตัด (backlog) | 2 ทีมยังไม่จำเป็น |
| worker 24/7 (next_turn_at จองล่วงหน้า) | **piggyback** (เทิร์นรันตอนเปิดหน้า/API — `run_due_turns_background`) | ไม่มี scheduler (มติทั้งระบบ) — ย้ายขึ้น pg_cron ได้ทีหลัง |
| 88 ตลาด (คริปโต/หุ้น/ETF/ดัชนี/FX/MACRO) | เปิดผ่าน price resolver (yfinance/FRED — ladder จาก boardroom_stance_service) | สินทรัพย์ใดที่ resolve ได้ = เทรดได้ |

## 2. ผังสองทีม + บุคลิก + กลไกตัดสินใจ (ticket 02 + พิสูจน์จริงใน 03)

**ทีม A — สายเทรนด์** (Team Trend Rider): ลูกทีม `เทรนด์` + `เทคนิคอล` · กรอบ 1–7 วัน · risk 5–10% · interval 4 ชม. · weekly target +1.5%
**ทีม B — สายกลับค่า** (Team Mean Reverter): ลูกทีม `มหภาค` + `สวนฝูง` · กรอบ 7–30 วัน · risk 2–5% · interval 12 ชม. · weekly target +1.0%

- เทิร์น = **3 คอล**: ลูกทีม 2 เสนอ → **หัวหน้าเคาะเด็ดขาด** (สวนลูกทีมได้ — เห็นจริงใน prototype S1/A hold)
- **ลูกทีมเห็นคนละ pack**: A ได้ technical pack (ราคา/คะแนนโมเดล/ข่าว) · B ได้ macro pack (FRED/macro_history/ข่าว) — `build_team_context(db, team)`
- **ทีมไม่เห็นผลกัน**: context กรองเฉพาะพอร์ตตัวเอง (ไม่มีชื่อ/ผลของอีกทีมใน prompt)
- **พิสูจน์ต่างจริง (prototype 03 — ยิง DeepSeek จริง 4 เทิร์น)**: S0 (น้ำมันช็อก) A=long BTC-USD vs B=short CL · S1 (CPI+แรงงาน) A=hold vs B=long US10Y — **คนละสินทรัพย์ทั้ง 2 scenario** + risk bands ทำงาน (A size 7–8% · B size 3–4%)

## 3. กติกาพอร์ต (โค้ดจริง)

- **equity = balance + Σ(margin + unrealized)** — `team_equity()` · unrealized = dir × size × (mark − entry)
- เปิด: `_execute_order` — size_pct **clamp เข้ากรอบทีม** (RISK_BAND) → margin = balance × size_pct/100 → size = margin/entry (leverage 1) → balance −= margin
- ปิด: action=close (ตาม market) / **SL-TP อัตโนมัติ** (`check_sl_tp` — ทำงานแม้สวิตช์ปิด ตามต้นฉบับ tdMasterOff) — long: mark ≤ entry(1−sl/100)=sl, ≥ entry(1+tp/100)=tp (short กลับทิศ) → realized = dir×size×(close−entry) → balance += margin + realized
- โควตา: `per_team_daily_cap` (default 4/ทีม/วัน — `turns_today` นับจาก `local_midnight_utc`) · master switch `trade_settings.master_on`
- Scheduling: หลังเทิร์น → `next_turn_at = now + interval_hours` (A 4 / B 12) · piggyback `run_due_turns_background()` + ปุ่ม manual (POST /turn — นับโควตา)
- ราคา: `current_price(price_key, unit)` — pct → `price_service.get_price` (yfinance) · bp → `macro_service.build_dashboard()` (FRED daily) · resolve: `resolve_price_key` (ladder — boardroom_stance_service) — resolve ไม่ได้ → ข้าม (ไม่มี "แต่งราคา")

## 4. Schema (ตารางจริง — SQLAlchemy)

| ตาราง | คอลัมน์สำคัญ |
|---|---|
| `trade_teams` | id · code (A/B unique) · name_th/en · status (active) · capital (10,000) · balance · weekly_target_pct · monthly_floor_pct (5) · monthly_stretch_pct (20) · interval_hours · next_turn_at · directive_md · created_at |
| `trade_positions` | id · team_id · market (price_key) · unit (pct/bp) · side · size · margin_usd · entry_px · sl_pct · tp_pct · status (open/closed/sl/tp) · opened_at · closed_at · close_px · realized_pnl |
| `trade_turns` | id · team_id · started_at · ended_at · tokens_in · tokens_out · **cost_usd** (= tokens_in×$0.14/1M + tokens_out×$0.28/1M — `turn_cost()`) · lead_decision (JSON) · seat_orders (JSON) |
| `trade_snapshots` | id · team_id · equity · snapped_at (เขียนทุกเทิร์น — ไว้วาดกราฟทีหลัง) |
| `trade_settings` | id=1 (row เดียว) · master_on · per_team_daily_cap · updated_at |

## 5. Endpoints

| Endpoint | พฤติกรรม |
|---|---|
| `GET /api/trade-desk/state` | `check_sl_tp` + `run_due_turns_background()` (piggyback) → `build_state()`: master_on · per_team_daily_cap · teams[] (equity/pnl_pct/margin_used/mtd/เป้า/next_turn_at/turns_today/cost_today/cost_total/positions/closed_positions[20]/turns[10 — lead_decision]) |
| `POST /api/trade-desk/turn?team_code=A` | ปุ่ม "เปิดเทิร์นเลย" — `run_turn(manual=True)` (นับโควตา — ไม่เช็ค next_turn_at) |
| `POST /api/trade-desk/settings` `{master_on?, per_team_daily_cap?}` | ตั้งสวิตช์/โควตา |

**LLM**: reuse `boardroom_service.llm_call` (DeepSeek v4-flash · **`"thinking": {"type":"disabled"}`** — บทเรียน prototype: ไม่ปิด = content ว่าง/ช้า 6 เท่า/แพง 3 เท่า · retry · cost tracking) · parse: `parse_json_block` (กัน fence/ข้อความรอบ)

## 6. ต้นทุนจริง (prototype 03 — วัดจากการยิงจริง)

- **$0.00047/เทิร์น** (2 ทีม · 6 คอล · ~9s) · 4 เทิร์น/วัน ≈ **$0.002/วัน ≈ $0.06/เดือน**
- เทียบกับห้องประชุม ($0.021/ประชุม): ถูก ~45 เท่า — เพราะเทิร์นสั้น + thinking ปิด
- UI แสดงต้นทุนตลอด (ต่อทีม/วันนี้/รวม) — `cost_usd` จริงจาก tokens×rate

## 7. UI + copy ไทย (`TradeDeskDashboard.tsx`)

การ์ด 2 ทีม (equity/ทุน/เงินสด/margin/MTD/เป้าสัปดาห์/โควตา/เทิร์นถัดไป/ต้นทุน) · equity chart **SVG วาดเอง** (ไม่มี recharts) · ไม้เปิด/ปิด + P&L สี · สวิตช์หลัก (ข้อความต้นฉบับ tdMasterOff) · ปุ่ม "เปิดเทิร์นเลย" (disable เมื่อสวิตช์ปิด/โควตาหมด) · เหตุผลหัวหน้าต่อเทิร์น (คุณค่าหลัก) · 🚫 **"พอร์ตจำลอง ไม่ใช่การเทรดจริง ไม่มีการส่งคำสั่งไปตลาดใดๆ และไม่ใช่คำแนะนำการลงทุน"** · polling 90s · tab `ทีมเทรด` ใน BondCrisisPage

## 8. กลยุทธ์เทสต์ (ตัวเลขจริง)

- backend: **521 passed** (test_trade_desk 15 — stub llm_call/ราคา/build_snapshot 100%) · frontend: **611 passed | 16 skipped** (TradeDeskDashboard 8) · **tsc -b สะอาด** · hermes verify ok
- เทสต์สำคัญ: clamp size เข้ากรอบ · SL/TP ทั้ง 2 ทิศ + ตอนสวิตช์ปิด · โควตา/master/not_due · equity สูตร · cost ตรงอัตรา · **ไม่แตะ trading_signals** (นับแถว = 0)

## 9. หลักห้ามละเมิด — กำแพง PAPER ONLY (ตรวจจริง 2026-08-10)

- **grep ทั้งโปรเจค**: ไม่มี exchange client (ccxt/hyperliquid/binance/alpaca/...) — hit ทั้งหมดเป็นชื่อหุ้น/ETF (SCHD = "Schwab U.S. Dividend Equity ETF", "Robinhood Markets Inc", "Charles Schwab Corp.") · ไม่มี `place_order/create_order/send_order/market_buy/sell` ใน backend/frontend
- **.env มีแค่**: FMP_API_KEY · FINNHUB_API_KEY · DEEPSEEK_API_KEY — **ไม่มีคีย์ของ exchange ใด** (ไม่มีสิทธิ์เทรดจริง)
- ออเดอร์ทั้งหมดเขียนลงตาราง SQLite ของเรา (`trade_positions/trade_turns`) — ไม่มีเส้นทางส่งคำสั่งออกนอกระบบ
- disclaimer แสดงเสมอ (เทสต์ยืนยัน) · เทสต์ไม่แตะ `portfolio.db` จริง (12→12 · 2→2 · 0→0 วัดก่อน/หลัง)

## 10. ข้อจำกัดที่รู้ตัว

- **2 ทีมจากโมเดลเดียวกัน = อคติร่วม** — ต่างที่ strategy config (risk band/lookback/pack ข้อมูล) + พิสูจน์ใน prototype (คนละสินทรัพย์ 2/2 scenario) — ถ้าเริ่มเทรดเหมือนกัน = ต้องปรับ config
- **piggyback** — ไม่เปิดแอป = ไม่เทรด (ต้นฉบับ 24/7) — ย้ายขึ้น pg_cron (Vercel+Supabase) ได้โดยไม่แก้ engine (`run_due_turns` ฟังก์ชันเดียว) — backlog
- P&L สดต่อไม้ (mark ต่อ position) ยังไม่คืนใน state — แสดง entry+SL/TP ("ดูในทีม") — backlog
- equity chart เป็นเส้นสุดท้าย+จุด (snapshots มีในตาราง — ใช้ขยายทีหลัง) · โควตารีเซ็ตตาม `local_midnight_utc` (เที่ยงคืน local)
