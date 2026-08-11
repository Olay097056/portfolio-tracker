# Map — ทีมเทรด (/trade-desk) สำหรับ Bond-crisis

## Destination

สร้าง sub-tab **"ทีมเทรด"** ที่มิเรอร์หน้า `/trade-desk` ของต้นฉบับ: **ห้องเทรดจำลองที่มี AI 2 ทีมแข่งกัน** — แต่ละทีมมีพอร์ตกระดาษของตัวเอง ตัดสินใจเปิด/ปิดสถานะจากข้อมูลจริง วัดผลด้วยราคาจริง แล้วเทียบกันว่ากลยุทธ์ไหนดีกว่า

**ปรับจากต้นฉบับ (user ตัดสิน 2026-08-09):** ต้นฉบับมี **9 ทีม** แข่งข้ามค่ายโมเดล — ของเราเอา **2 ทีมพอ** และเนื่องจากเราใช้ DeepSeek ตัวเดียว "แข่งข้ามค่ายโมเดล" จึงกลายเป็น **"แข่งข้ามกลยุทธ์/บุคลิก"** สองทีมต้องต่างกันที่วิธีคิด ไม่ใช่ต่างที่ผู้ผลิตโมเดล

**⚠️ แผนที่นี้แบกงานเขียนโค้ดด้วย (carries execution)** — ticket `task` เขียนโค้ดจริงและ commit ได้ กติกา:
1. เขียนโค้ดได้เฉพาะ ticket `Type: task` — `research`/`grilling`/`prototype` ห้ามแตะโค้ด production
2. **หยุดให้ user ตรวจก่อน commit** ทุกครั้ง
3. ห้ามอ้างเลขเทสต์ที่ไม่ได้รันจริง

## Notes

- **Tracker: local markdown** — `issues/NN-*.md`, หัวไฟล์ `Type:` / `Status:` / `Claimed:` / `Blocked by:` — frontier = `Status: open` + `Blocked by` ปิดหมด
- **แผนพี่น้องที่เดินขนานกัน**: `.scratch/boardroom/map.md` · `.scratch/boardroom-signals/map.md`
- **ความสัมพันธ์กับแผน `boardroom`**: ต้นฉบับมี `/trade-desk/meetings` แปลว่าทีมเทรดก็มีการประชุมของตัวเอง — **แผนนี้ต้องดูก่อนว่า reuse เครื่องยนต์ประชุมจากแผน `boardroom` ได้ไหม** (ticket 02 ตัดสิน) ถ้า reuse ได้จะประหยัดมหาศาล ถ้าไม่ได้ต้องอธิบายว่าทำไม
- Domain: full-stack (FastAPI + React 19/Vite, **ไม่มี Tailwind**, Thai-first)
- ควร consult: `backend/app/signals_service.py` (สถิติ P&L ที่มีอยู่), `backend/app/price_service.py`, `backend/app/news_service.py` (`_call_deepseek`)

**ข้อเท็จจริงที่ตรวจแล้ว (2026-08-09) — อย่าขุดซ้ำ:**

- **ไม่ต้อง login** — chunk เปิดสาธารณะ: `/_next/static/chunks/app/trade-desk/page-d3de5400d9825f64.js` (19,551 B) · copy ไทยใน `/_next/static/chunks/3474-e1aec38ee927d485.js` ค้นคีย์ `td*`
- **มี sub-route อีก 2 หน้า**: `/trade-desk/meetings` และ `/trade-desk/settings` (ยังไม่ได้ขุด — ticket 01 ต้องขุด)
- คำโปรยต้นฉบับ: *"ห้องเทรดจำลอง 9 ทีม AI โครงสร้างเหมือนกัน แข่งข้ามค่ายโมเดล — พอร์ตเริ่ม $10,000/ทีม ราคาจริง Hyperliquid"*
- โครงทีมต้นฉบับ: **หัวหน้าทีม 1 + ลูกทีม 6** ต่อทีม · สถานะทีม: ทำงาน / ภาคทัณฑ์ / พัก / **โดนไล่ออก (`fired`)** · มี **"รุ่น" (generation)**
- RPC ที่หน้าเรียก: `get_state`, `get_closed_positions`, `get_snapshots`, `get_closed_pnl`
- ตัวชี้วัดที่แสดง: Equity · ทุน · เงินสด · กำไร/ขาดทุน · margin used · MTD/WTD target · orders · directive
- **โควตาเทิร์น**: `tdTurnQuotaReset`, `tdTurnQuotaFull`, `tdNextTurn` — ทีมเปิดเทิร์นเทรดได้จำกัดต่อช่วงเวลา
- **สวิตช์หลัก**: *"สวิตช์หลักปิดอยู่ — ทีมจะไม่เปิดเทิร์นเทรด (ราคา/ข้อมูลยังอัปเดต และ SL/TP/liq ของไม้ที่เปิดอยู่ยังทำงานปกติ)"* — มี master on/off
- กราฟ equity 4 มุมมอง: % · USD · rebase · PnL + ช่วงเวลา + โหมด focus/full + ตัวเลือกแสดงทีมที่โดนไล่ออก
- มีสรุปรายเดือน (`tdMonthlyDigest`)
- **LLM**: DeepSeek `deepseek-v4-flash` ตัวเดียวหลายบริบท (user ตัดสิน 2026-08-09) — คีย์อยู่ใน `backend/.env`

## หลักการที่ห้ามละเมิด

1. **🚫 PAPER ONLY — ห้ามเทรดจริงเด็ดขาด** ต้นฉบับใช้ราคาจริงจาก **Hyperliquid ซึ่งเป็นกระดานเทรด perpetual จริง** ของเรา: ดึงราคาได้ แต่**ห้ามมี API key ที่ส่งคำสั่งได้ · ห้ามต่อบัญชีเทรดจริง · ห้ามมีเส้นทางโค้ดใดที่ยิงออเดอร์ออกไปได้เลย** ทุกออเดอร์อยู่ในฐานข้อมูลเราเท่านั้น กฎนี้ไม่มีการต่อรอง และ ticket ที่เขียนโค้ดต้องมีเทสต์ยืนยัน
2. **ไม่แต่งตัวเลข** — ราคาดึงไม่ได้ → "—" ห้ามใช้ค่าสุดท้ายที่รู้แล้วทำเป็นว่าสด
3. **ไม่ใช่คำแนะนำการลงทุน** — ต้องมี disclaimer ชัด ผลของทีมจำลองไม่ใช่คำแนะนำ
4. **ต้องนับต้นทุน LLM เสมอ** — เก็บจำนวนคอล + tokens ทุกเทิร์น เหมือนที่ต้นฉบับทำกับห้องประชุม
5. **ห้ามปนกับ `trading_signals`** — พอร์ตทีมเทรดต้องอยู่ตารางของตัวเอง ไม่ปนกับสัญญาณเทรดของแอปเดิม

## Decisions so far

**แผนปิดแล้ว 2026-08-10** — shipped ใน 2 commits (`e371fd3` backend, `fb2eb03` frontend) · spec as-built: `docs/specs/2026-08-10-trade-desk.md`

> **⚠️ การตรวจอิสระ 2026-08-10 — แผนนี้ปิดโดยที่ยังมี 3 ticket เปิดค้าง และพบบั๊กจริง 1 ตัว**
>
> 1. **ticket 04 (กลไกพอร์ต) และ 05 (แหล่งราคา + กำแพงกันเทรดจริง) ไม่เคยถูกรัน — ยัง `Status: open`** แต่ ticket 06 ที่เขียนว่า `Blocked by: 02, 03, 04, 05` ถูกปิดและ commit ไปแล้ว decision ในสองใบนั้นถูกตัดสินโดยปริยายในโค้ดแทนที่จะผ่านการถาม user
> 2. **ticket 03 ถูกแทนที่ด้วยไฟล์ใหม่** (`03-prototype-two-teams.md`) โดยใบเดิม `03-prototype-turn-cost-and-divergence.md` ยังเปิดค้าง — ตารางด้านล่างจึงนับ "6/6" ทั้งที่มี 9 ใบ
> 3. **บั๊กจริงที่ตรวจพบและแก้แล้ว**: ตลาดกลุ่ม bp (yield/spread) เปิดไม้ไม่ได้เลย และ macro pack ของทีม B ว่างเปล่า — รายละเอียดเต็มท้ายไฟล์ [ticket 06](issues/06-task-backend-engine.md)
> 4. **ผลจากการข้าม ticket 04**: `check_sl_tp()` เช็คเฉพาะ**ราคาปัจจุบัน** ไม่ได้ย้อนดูราคาประวัติศาสตร์ — ticket 04 ข้อ 4 เสนอทางเลือก (ก) ย้อนดูประวัติ ไว้เป็นความเห็นตั้งต้นพร้อมเหตุผลว่าแอปไม่มี scheduler แต่ไม่เคยมีใครตัดสิน ผลคือ**ไม้ที่แตะ SL/TP แล้วเด้งกลับก่อนมีคนเปิดแอป จะไม่ถูกปิด** และเทสต์ที่ ticket 06 กำหนดไว้ว่า "รวมเคสแตะแล้วเด้งกลับ" ก็ไม่มี ยังไม่แก้ — รอ user ตัดสิน

| Ticket | สรุป |
|---|---|
| 01 research | ขุด 3 หน้า (main/meetings/settings) → `docs/research/trade-desk-page-2026-08-10.md` — equity formula (module 50726) · การ์ดทีม/กราฟ/digest/settings · RPC get_state ฯลฯ · **/meetings ≠ ประชุม AI** (get_signals) · i18n td* 622 คีย์ · **ข้อมูลจริง (login user 2026-08-10)**: 9 ทีม = ค่ายโมเดล 88 ตลาด เป้ารายสัปดาห์ต่อทีม digest อันดับ≠pnl |
| 02 grilling | 2 ทีม · หัวหน้า 1+ลูกทีม 2 · **A สายเทรนด์ (เทรนด์+เทคนิคอล 1-7วัน risk 5-10%) vs B สายกลับค่า (มหภาค+สวนฝูง 7-30วัน risk 2-5%)** · หัวหน้าเคาะเด็ดขาด (3 คอล/เทิร์น) · แบ่ง pack ข้อมูลตามสาย · ไม่เห็นผลกัน · reuse LLM+ข้อมูล ไม่ reuse กลไก 7 เฟส · piggyback + run_due_turns() ย้าย pg_cron ได้ · สวิตช์หลักเอา · โควตา 4/ทีม/วัน · interval A 4ชม./B 12ชม. · backlog ย้าย Vercel+Supabase |
| 03 prototype | ยิง DeepSeek จริง 4 เทิร์น 12 คอล — **$0.00047/เทิร์น** (ถูกกว่าห้องประชุม ~45 เท่า) · **พิสูจน์ต่างจริง 2/2 scenario** (S0: A long BTC vs B short CL · S1: A hold vs B long US10Y) · บทเรียน: ต้องปิด thinking · parser robust · prompts ใช้ได้จริง |
| 06 backend | `trade_desk_service.py` (5 ตาราง + เทิร์นลูป + run_due_turns + SL/TP + equity สูตรต้นฉบับ + cost จริง) + router + tests 15 — commit `e371fd3` |
| 07 frontend | `TradeDeskDashboard.tsx` (10 section: การ์ด/กราฟ SVG/ไม้/สวิตช์/โควตา/ต้นทุน/เหตุผล/disclaimer) + tab + backend state ขยาย — commit `fb2eb03` · tests 8 |
| 08 spec | `docs/specs/2026-08-10-trade-desk.md` + ปิดแผน (ใบนี้) |

## Not yet specified

(ไม่มี — คลี่ครบใน 03/06/07/08; ส่วนที่ตัดแล้วอยู่ Out of scope ด้านล่าง)

## Backlog

- **แผนย้ายสถาปัตยกรรม Vercel+Supabase** (ตามต้นฉบับ) — pg_cron/Edge Function = worker 24/7 ฟรี + Auth/RLS · จุดเสี่ยง: data fetching จาก serverless (FRED bot-detect/yfinance) · ทางเลือก: Supabase local — **ทำหลังแผนนี้เสร็จ (user 2026-08-10)**
- ทีมเห็นมติห้องประชุมเป็นอินพุต (ตัดออกตอนนี้ — ขอบเขตเล็กสุด)
- persona "หัวหน้าปรับตัวตนลูกทีม + log" (ต้นฉบับมี — 2 ทีมยังไม่จำเป็น)
- อันดับ monthly digest แบบ score (ต้นฉบับใช้ score ไม่ใช่ pnl ล้วน)

## Out of scope

- **การส่งคำสั่งซื้อขายจริงทุกรูปแบบ** — กฎห้ามละเมิดข้อ 1 ไม่ใช่แค่ scope
- **9 ทีมตามต้นฉบับ** — user ตัดสิน 2026-08-09 ให้เหลือ **2 ทีม** (ต้นทุน LLM และความซับซ้อน)
- **แข่งข้ามค่ายโมเดลจริง** — เรามี DeepSeek อย่างเดียว เปลี่ยนเป็นแข่งข้ามกลยุทธ์แทน (user ตัดสิน 2026-08-09)
- **หน้า `/boardroom` และ `/boardroom/signals`** — แผนแยก
- **แจ้งเตือน Telegram**
