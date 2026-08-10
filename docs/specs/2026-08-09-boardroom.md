# ห้องประชุม AI (Boardroom tab) — Bond-crisis sub-tab #8

Date: 2026-08-09
Status: **Shipped** — commits `5bb06d5` (backend engine), `1f6b93c` (frontend tab), `0e70232` (auto-trigger engine) implement this spec in full (wayfinder map `.scratch/boardroom/map.md` — tickets 01–08, 10 resolved; ticket 09 = this document). **As-built**: every formula/key/endpoint below was re-read from the shipped code, not copied from design decisions.

**ที่มา:** หน้า `/boardroom` + `/boardroom/[id]` ของ bond-crisis-dashboard-v2.vercel.app (reverse-engineered 2026-08-09 — 10 JS chunks + 590 i18n keys ไทย, evidence ใน `docs/research/boardroom-page-2026-08-09.md`)

## 1. ขอบเขต (Scope)

**ทำ:** Sub-tab ใบที่ 8 ของ Bond-crisis ชื่อ "ห้องประชุม" — ประชุม AI 7 ที่นั่งบน DeepSeek (deepseek-v4-flash) ถกวาระจากข้อมูลจริงของแอป (FRED/yfinance/โมเดล 6 ตัว/ข่าว RSS) → ตรวจข้อกล่าวอ้างด้วยโค้ด → มติ + ความจำระยะยาว + เปิดประชุมอัตโนมัติจากข่าวแรง/โมเดลขยับ

**ไม่ทำ (Out of scope — คัดจาก map):**
- trigger "ข่าวแดง" (ปฏิทินเศรษฐกิจ) — ยังไม่มีแหล่งฟรีที่ใช้ได้จริง (ทดสอบสด 2026-08-09: Finnhub 403, FMP 402, TradingView 403 — ต้นฉบับจ่าย TE) → backlog
- หน้าสมองส่วนกลาง/สถิติรวมเป็นหน้าแยก (memory/knowledge/seat_stats มีตาราง+กลไกครบ แต่ UI หน้าแยกยังไม่มี endpoint — backlog)
- หลายโมเดลต่อที่นั่ง (โมเดลเดียว = correlated bias — ชดเชยด้วย prompt/ข้อมูล/การตรวจซ้ำ 3 ชั้น ดู §10)
- แถบ "ชนเพดาน" ใน UI (ข้อมูล `trigger_log_today` พร้อม — UI ยังไม่ทำ)
- web search จริงในเฟสวิจัย (แมวมองใช้ข้อมูลในระบบ = ข่าว RSS + macro + history)

## 2. ที่นั่ง 7 (จาก `SEATS` ใน boardroom_service.py)

| seat_id | position_key | ชื่อไทย | บทบาท (prompt) |
|---|---|---|---|
| `ceo` | ceo | เจมส์ (CEO) | ประธาน — เปิดวาระ ตั้งคำถาม สรุปมติจากข้อสรุปที่ผ่านการพิสูจน์เท่านั้น |
| `scout` | research | แมวมอง (วิจัยภายนอก) | ค้นข้อเท็จจริง/ตัวเลขพร้อมแหล่ง — ไม่แสดงความเห็นตลาด |
| `macro` | macro | นักเศรษฐศาสตร์มหภาค | อัตราดอกเบี้ย/เงินเฟ้อ/นโยบาย/วัฏจักร — เจ้าภาพ yield/rate |
| `credit` | credit | นักวิเคราะห์เครดิต/บอนด์ | สเปรด HY/IG/ผิดนัด/สภาพคล่อง — เจ้าภาพ spread |
| `technical` | technical | นักวิเคราะห์เทคนิคอล | แนวโน้ม/โมเมนตัม/ระดับราคา — เจ้าภาพราคา (ทอง น้ำมัน ETF FX) |
| `challenger_a` | challenger | ผู้ท้าทาย A | ค้านมุมข้อมูล/ตัวเลข — ตรวจข้อกล่าวอ้างเทียบข้อมูลจริง (ค้านได้เฉพาะมีหลักฐาน หรือพูดตรงๆ ว่าไม่มีจุดอ่อน) |
| `challenger_b` | challenger | ผู้ท้าทาย B | ค้านมุมตรรกะ/สมมติฐานที่ A ยังไม่แตะ — ตรวจซ้ำมุมอิสระ |

ทุกที่นั่งใช้กติกา `RULES` (ห้ามแต่งตัวเลข / "หาไม่เจอ" / ฉากทัศน์ต้องเขียน "(สมมติ)" / ไทยล้วน / ห้ามอ้างข้อความที่ไม่มีจริง)

## 3. เฟส + Turn plan (จาก `build_turn_plan` + plan surgery ใน engine)

**Turn plan ตั้งต้น (mode=full):** `opening(ceo) → research(scout) → briefing(macro,credit,technical,challenger_a,challenger_b) → debate_r1(5 ที่นั่ง) → [conditional] → verification(challenger_a, challenger_b) → resolution(ceo)` = 15 เทิร์น · mode=short ตัด `research` = 14 เทิร์น

**Plan surgery (วิ่งตอนรันจริง):**
- หลัง briefing: ถ้าทุกที่นั่งชี้ทิศเดียวกัน (`จุดยืน:` parse — ไม่มี neutral) → แทรก `debate_r2(seat=_skip_, kind=skip)` (ข้ามเงียบ) — ไม่เหมือนกัน → แทรก `debate_r2 ×5` (kind=attack) ก่อน verification
- หลัง debate_r1: ถ้ามี `ขอข้อมูล:` ในบท → แทรก `evidence(scout, research2)` + `external_data(challenger_a, verify)` + `external_data(challenger_b, verify)` ก่อน verification

**ประชุมเต็ม = 15–23 คอล · สั้น = 14–22 คอล** (ขึ้นกับ contested + data requests) — ตัวเลขจริงจาก ticket 03: เต็ม 20 คอล (มี r2, ไม่มี data request) · เต็ม 23 คอล (มีทั้ง r2 + requests)

## 4. Schema — 8 ตาราง (SQLAlchemy, portfolio.db — create_all สร้างอัตโนมัติ)

| ตาราง | คอลัมน์หลัก |
|---|---|
| `boardroom_meetings` | id, status(running/completed/failed/cancelled), phase, current_turn, turn_plan(JSON), agenda, trigger_type(manual/news/model/calendar), mode(full/short), **trigger_key**(dedupe), resolution_md, resolution_json, snapshot(JSON), claim_until, llm_calls, tokens_in, tokens_out, error, created_at, updated_at, ended_at |
| `boardroom_messages` | id, meeting_id, turn, phase, seat_id, kind(opening/research/brief/rebuttal/attack/review/resolution/skip/error), content_md, evidence(JSON), status(ok/skipped/error), error, model_used, tokens_in, tokens_out, created_at |
| `boardroom_claims` | id, meeting_id, message_id, seat_id, phase, claim_text, metric, expected(JSON {value,unit,window_days,direction}), verdict(verified/partial/failed/unverifiable), sub_reason(no_data/opinion/wrong_value/wrong_direction/magnitude), reason, checks(JSON), created_at |
| `boardroom_seats` | seat_id, position_key, provider, model, name_th, name_en, enabled, sort (seed 7 ที่นั่ง) |
| `boardroom_memory` | id, statement_md, tags, confidence(conf0), status(active/challenged/retired), source_meeting_id, category, last_checked_meeting_id, created_at, expires_at, updated_at |
| `boardroom_knowledge` | id, title, statement, status(active/challenged/superseded/retired), source_type, source_ref, as_of, category, votes, supersedes, superseded_by, created_at |
| `boardroom_seat_stats` | seat_id(PK), meetings, claims_total, claims_verified, claims_partial, claims_failed, stances_total, stances_correct |
| `boardroom_trigger_log` | id, checked_at, trigger_type, reason, skipped, skip_reason(no_candidate/daily_cap/cooldown/duplicate), meeting_id |

## 5. Endpoints (routers/boardroom.py — prefix `/api/boardroom`)

| Method/Path | Request | Response | หมายเหตุ |
|---|---|---|---|
| `POST /meetings` | `{agenda (10–2000), trigger_type=manual, mode=full}` | `MeetingOut` (201) | เปิดประชุม → background thread รัน advance() จนจบ — 409 เมื่อสถานะไม่ใช่ failed ถูกจัดการที่ resume |
| `GET /meetings` | — | `{meetings: MeetingOut[50], today_meetings, trigger_log_today[20]}` | **piggyback `check_triggers`** (guard 10 นาที) |
| `GET /meetings/{id}` | — | `MeetingDetailOut` (meeting + messages + claims + seats + turn_plan) | 404 เมื่อไม่เจอ |
| `POST /meetings/{id}/resume` | — | `MeetingOut` | failed → running เดินต่อจาก current_turn เดิม · 409 ถ้าไม่ใช่ failed · 500 ถ้า resume เองล้ม |
| `POST /triggers/check` | — | `{checked_at, triggered, meeting_id?, reason?, skipped, skip_reason?}` | ปุ่ม "ตรวจตอนนี้" |

**Piggyback เพิ่ม:** หลัง `POST /api/news/refresh` และ `POST /api/models/refresh` → `check_triggers(db)` (try/except — ไม่ทำให้หน้าเดิมพัง)

## 6. กลไกตรวจสอบข้อกล่าวอ้าง (จาก `verify_claim` — โค้ดล้วน ไม่ใช้ LLM)

ที่นั่ง output ข้อกล่าวอ้างเป็น JSON block ต่อท้ายข้อความ (`{"claims":[{claim, metric, expected}]}`) — ระบบตัด block ทิ้งก่อนแสดง + ตรวจด้วยโค้ดเทียบ snapshot ณ เปิดประชุม:

| ประเภท | ผ่าน (verified) | ขัด (failed) | ระหว่าง = partial |
|---|---|---|---|
| คะแนนโมเดล | \|diff\| ≤ 1.0 จุด | > 1.0 | — |
| ทิศทางอย่างเดียว | ตรง trend จริง | สวน | — |
| เปลี่ยนแปลงใน window (`window_days>0`) | อยู่ใน ±max(20% ของค่าอ้าง, floor 5bp/0.05) | นอก ±max(50%, 2×floor) | ระหว่าง → `partial/magnitude` |
| ระดับ (level) | ≤ max(2% ของค่าจริง, 0.02) | > max(5%, 0.05) | ระหว่าง → `partial/magnitude` |
| metric ไม่มีในระบบ / ค่า null / history ไม่พอ | — | — | `unverifiable` (sub: no_data / opinion) |

**ผล:** ทุกข้ออ้างได้ verdict + checks เก็บใน `boardroom_claims` — ใช้ในมติเฉพาะ verified (+ทิศทางของ partial) · failed หักสถิติที่นั่ง · transcript แสดงป้าย 3 สี

## 7. สมองส่วนกลาง + สถิติ (ticket 05 — ตามที่ ship)

**Memory** — เขียนเฉพาะ `plain.proven` จาก resolution (`_after_resolution`):
- conf0 = 85 (unanimous — ไม่มี debate_r2) / 70 (contested)
- **decay**: `conf(t) = conf0 × 0.5^(age_days / half_life)` — `half_life = TTL หมวด / 2` · TTL หมวด = `CATEGORY_TTL_DAYS`: policy 60, rates 60, flows 14, positioning 14, macro_data 45, ratings 365, liquidity 30, earnings 90, geopolitics 45, other 90
- ฉีดเข้าประชุมถัดไป: status active/challenged + `conf(t) ≥ 60` + top 10 (เรียง conf) · knowledge: active + top 8
- สถานะ: `challenged` = ถูกตรวจซ้ำแล้วขัด (conf × 0.5) — ตรวจซ้ำทุกประชุมเต็มที่ verification · retired เมื่อ challenged 2 ครั้งติด — เก็บไว้ใน DB (filter ดูได้)

**Seat stats** — อัปเดตหลังทุกประชุม: `claims_total/verified/partial/failed` ต่อที่นั่ง · `stances_*` เก็บ field ไว้ (ค่าจริงเป็นงานแผน boardroom-signals — outcome หลัง due date) · UI แสดง % เฉพาะ `claims_total ≥ 10` (cold-start disclosure — ไม่งั้น "รอข้อมูลเพิ่ม")

## 8. Trigger อัตโนมัติ (จาก `check_triggers` — เกณฑ์ ticket 08)

| เกณฑ์ | ค่า |
|---|---|
| ข่าวแรง | `impact_score ≥ 70` · ดู 24 ชม. · **batch 6 ชม. = 1 ประชุม** (ข่าวใหม่ = `published_at` ใหม่กว่า log ล่าสุด — กันเปิดซ้ำ + กันพลาดตอนแอปปิดนาน) · วาระจากข่าว top + related_models |
| โมเดลขยับ | ข้ามเกณฑ์ **40/60** (ขึ้น/ลง) หรือ **Δ ≥ 8 จุด** ใน 6 ชม. (2 แถวล่าสุดของ history) |
| dedupe | `trigger_key` ซ้ำภายใน 6 ชม. → ข้าม (`news:<title normalized>` / `model:<id>:<40|60|delta>`) |
| เพดาน | `daily_cap 6/วัน` (นับ manual+auto ตามวันท้องถิ่น) · `cooldown 60 นาที` จากประชุมล่าสุด (auto) · rate-limit ตรวจ 1 ครั้ง/10 นาที |
| ประชุม auto | mode=**short** เสมอ · ทุกการประเมิน (เปิด/ข้าม) เขียน `boardroom_trigger_log` (ยกเว้น rate-limit) |

## 9. ต้นทุนจริง (วัดจาก ticket 03 — prototype รันจริง 2026-08-09, deepseek-v4-flash non-thinking)

- **ประชุมเต็ม (7 เฟส): 20–23 คอล · ~$0.020–0.021 · ~4–5 นาที** (tokens ≈ 126–133k in / 23–26k out)
- **ประชุมสั้น (trigger): ~14–19 คอล · ~$0.012–0.016**
- **baseline เรียกครั้งเดียว: 1 คอล · $0.0011 · 20.5s** (ถูกกว่า 19 เท่า แต่ไม่ได้การค้าน/ตรวจสอบ)
- เพดาน 6 ครั้ง/วัน ≈ **$0.09–0.13/วัน ≈ $2.7–3.9/เดือน** (เรตทางการ 2026-08-09: input cache-miss $0.14/1M · cache-hit $0.0028/1M · output $0.28/1M)

## 10. UI + copy ไทย (BoardroomDashboard.tsx — inline style + INK palette, ไม่มี Tailwind)

- กำลังประชุมสด (card + polling 10s) / การประชุมย้อนหลัง (polling 30s) · ปุ่ม "＋ เปิดประชุม" (textarea วาระ + ปุ่ม — ปิดเมื่อมีประชุมรัน)
- stepper เฟส (จาก turn_plan — 8 เฟส) · ที่นั่ง 7 (วงกลมสีต่อที่นั่ง + กำลังพูด)
- มติ: proven ✅ / unproven ⚖️ / watch 👀 / outlook 🔮 / ฉบับวิเคราะห์เต็ม (details + md renderer) / จุดยืนรายสินทรัพย์ (LONG↑/SHORT↓/NEUTRAL/ยังฟันธงไม่ได้) / verification
- ผลตรวจสอบข้อกล่าวอ้าง: group ต่อ verdict (✓ผ่าน ✗ขัด 🔶ทิศทางถูก-ขนาดเพี้ยน ?ตรวจไม่ได้)
- สถิติข้อกล่าวอ้างรายที่นั่ง (ประชุมนี้ — cold-start n<10 → "รอข้อมูลเพิ่ม")
- ตัวนับต้นทุน: `เรียก AI: N · tokens in/out` ทุกใบประชุม
- empty state: *"ยังไม่มีการประชุม — ระบบจะเปิดวาระเองเมื่อมีข่าวแรง หรือตัวเลขโมเดลขยับ"* (ตัด "ข่าวแดง" ตาม ticket 08)
- **disclaimer**: *"ข้อมูลเพื่อการศึกษาเท่านั้น ไม่ใช่คำแนะนำการลงทุน"* — หลักห้ามละเมิดข้อ 3
- copy ไทยทั้งหมดอ้างอิงจาก i18n ต้นฉบับ 590 คีย์ (`dig/i18n-br-th.txt`)

## 11. กลยุทธ์เทสต์

- **backend**: stub `llm_call` 100% (ไม่ยิง DeepSeek) — `test_boardroom.py` 11 เทสต์ (state machine ครบ/เพดาน/claims/tokens/resume/unanimous/short/endpoints) + `test_boardroom_triggers.py` 13 เทสต์ (stub FRED + thread + LLM)
- **frontend**: mock client module — `BoardroomDashboard.test.tsx` 5 เทสต์ (รายการ/empty/เปิดประชุม/มติ+ป้าย/l้มเหลว+resume)
- conftest ชี้ DB ไป temp dir — ไม่แตะ portfolio.db จริง
- เลขจริง: pytest **494 passed** · vitest **596 passed** (72 files) · `npx tsc -b` สะอาด · `hermes verify` ok

## 12. หลักห้ามละเมิด

ไม่ลงโทษ/ไม่พยายามล็อกอินสมัครบัญชีกับบริการใด · ไม่มี secrets ในโค้ด (key อ่านจาก backend/.env) · ไม่เก็บข้อมูลส่วนตัวผู้ใช้ · เนื้อหาทั้งหมดเป็นภาษาไทยตามต้นฉบับ · ไม่มีคำแนะนำการลงทุน (disclaimer ทุกหน้า)

## 13. ข้อจำกัดที่รู้ตัว

- **Correlated bias** — DeepSeek ตัวเดียวทุกที่นั่ง: ชดเชย 3 ชั้น (1) ข้อมูลคนละชุด (ผู้ท้าทายเห็นเฉพาะข้อกล่าวอ้าง+ตัวเลข ไม่เห็นบทวิเคราะห์เต็ม) (2) ค้าน 2 ทางบังคับ (อ้างหลักฐาน หรือพูดตรงๆ ว่าไม่มีจุดอ่อน) (3) มุมต่างกัน (ข้อมูล vs ตรรกะ) + ตรวจซ้ำด้วยโค้ด
- ไทยอาจอ่อนกว่าใน debate ซับซ้อน (สัญญาใน ticket 02: ถ้า 03 พบไทยแย่ → สลับ debate เป็นอังกฤษ สรุปไทย — 03 ไม่พบ)
- เฟส research ไม่มี web search จริง (ใช้ข้อมูลในระบบ)
- trigger piggyback — ไม่มี scheduler 24/7 (ไม่มีใครเปิดแอป = ไม่เปิดประชุม = ไม่เสียเงิน)
- knowledge proposals (ลงมติรับ K1..K8) ยังไม่ถูก populated โดย engine (ตารางพร้อม — การโหวตรับความรู้ยังเป็น backlog)

## 14. Git history

- `5bb06d5` — boardroom engine: 8 ตาราง + 7 เฟส + ตรวจ claims ด้วยโค้ด + memory decay (ticket 06)
- `1f6b93c` — BoardroomDashboard tab + api client + tests (ticket 07)
- `0e70232` — auto-trigger engine: check_triggers + trigger_log + piggyback (ticket 10)
