# Map — ห้องประชุม AI (/boardroom) สำหรับ Bond-crisis

## Destination

สร้าง sub-tab **"ห้องประชุม"** ใน Bond-crisis ที่มิเรอร์หน้า `/boardroom` ของ bond-crisis-dashboard-v2: **เครื่องยนต์ประชุมหลายเทิร์น 7 เฟส** ที่ให้ AI หลายบุคลิกโต้แย้งกันจากข้อมูลจริงของแอป แล้วออกมาเป็น **มติที่ประชุม** พร้อมจุดยืนรายสินทรัพย์ — โดยยอมรับเฉพาะข้อสรุปที่ผ่านการตรวจสอบกับข้อมูลจริงเท่านั้น

**⚠️ แผนที่นี้แบกงานเขียนโค้ดด้วย (carries execution)** — ต่างจากแผน forecast-tab ก่อนหน้า ticket ชนิด `task` ในแผนนี้**เขียนโค้ดจริงและ commit ได้** ผู้ใช้ตัดสินเมื่อ 2026-08-09 หลังจากรอบที่แล้ว session ที่ทำ ticket สุดท้ายข้ามเส้น spec-only ไปเขียนโค้ดเองอยู่ดี — คราวนี้ยอมรับความจริงข้อนั้นแล้วคุมด้วยกติกาแทน

**กติกาบังคับของ ticket ชนิด `task` ในแผนนี้:**
1. เขียนโค้ดได้ **เฉพาะ** ticket ที่เขียนว่า `Type: task` เท่านั้น — ticket `research`/`grilling`/`prototype` ห้ามแตะโค้ด production เด็ดขาด
2. ทุก ticket `task` ต้อง **หยุดให้ผู้ใช้ตรวจก่อน commit** — ห้าม commit เองแล้วค่อยบอก
3. ห้ามปิด ticket ด้วยการอ้างตัวเลขเทสต์ที่ไม่ได้รันจริง

## Notes

- **Tracker: local markdown** — ticket อยู่ที่ `issues/NN-*.md` หัวไฟล์มี `Type:` / `Status:` / `Claimed:` / `Blocked by:` — **frontier** = `Status: open` + ทุกใบใน `Blocked by:` ปิดหมด **จอง**: เติม `Claimed: <ชื่อ>/<วันที่>` ก่อนเริ่ม
- **แผนพี่น้องที่เดินขนานกัน** (user ตัดสิน 2026-08-09 ให้แยก 3 แผน): `.scratch/boardroom-signals/map.md` (หน้าสัญญาณจากที่ประชุม) และ `.scratch/trade-desk/map.md` (ทีมเทรด) — **แผนนี้เป็นเจ้าของเครื่องยนต์ประชุม** อีกสองแผนอ้างอิงผลจากที่นี่
- **Cross-map dependency**: ถ้า ticket ต้องรอผลจากแผนอื่น ใช้บรรทัด `Waiting on:` (คนละอย่างกับ `Blocked by:` ที่อ้างได้เฉพาะ ticket ในแผนเดียวกัน) — ตัวที่ค้าง `Waiting on` ยังไม่นับอยู่ใน frontier
- Domain: full-stack (FastAPI + React 19/Vite, **ไม่มี Tailwind** — inline style ล้วน, Thai-first)
- ควร consult: `backend/app/ai_narrative_service.py` (การเรียก LLM ที่มีอยู่แล้ว), `backend/app/news_service.py` (`_call_deepseek`, `DEEPSEEK_MODEL`, `DEEPSEEK_URL`), `backend/app/country_ai_service.py` (pattern เก็บผล AI ลง SQLite + TTL), `frontend/src/components/tools/ModelsDashboard.tsx` (ดีไซน์การ์ด)

**ข้อเท็จจริงที่ตรวจแล้ว (2026-08-09) — อย่าขุดซ้ำ:**

- **ไม่ต้อง login** — route chunk + i18n ไทยเปิดสาธารณะทั้งหมด วิธี: `fetch('/boardroom')` เอา HTML แล้ว regex หา `/_next/static/chunks/app/...` (เทคนิคเดียวกับที่ ticket 01 ของแผน forecast-tab ใช้สำเร็จ — ดู `docs/research/forecast-page-2026-08-09.md`)
- **chunk ที่ต้องขุด**: `/_next/static/chunks/app/boardroom/page-51e536c4d27fa7dd.js` (7,749 B) — copy ไทยอยู่คนละที่: `/_next/static/chunks/3474-e1aec38ee927d485.js` (98 KB) ค้นคำว่า `boardroomTitle`
- **schema `boardroom_meetings` ของต้นฉบับ** (จาก `select()` ดิบ): `id, status, phase, current_turn, turn_plan, agenda, trigger_type, resolution_md, resolution_json, claim_until, llm_calls, tokens_in, tokens_out, error, created_at, updated_at, ended_at` — เรียงด้วย `.order("created_at", {ascending:false})`
- **7 เฟส** (จาก i18n): เปิดวาระ → วิจัยภายนอก → นำเสนอ → โต้แย้ง → ตรวจสอบ → หาหลักฐานเพิ่ม → ลงมติ
- **trigger 4 แบบ**: เปิดโดยแอดมิน / เปิดจากข่าว / เปิดจากโมเดลขยับ / เปิดจากข่าวแดง
- **สถานะ**: กำลังประชุม / เสร็จสิ้น / ล้มเหลว / ยกเลิก — มีปุ่ม "ประชุมต่อ" (resume)
- คำโปรยต้นฉบับ: *"ทีม AI หลายโมเดลหลายค่ายโต้แย้งกันเพื่อหาความจริง — ยอมรับเฉพาะข้อสรุปที่ผ่านการพิสูจน์ด้วยหลักฐาน"*
- มติสรุปโดย persona **"เจมส์ (CEO)"** — *"สรุปโดย เจมส์ (CEO) จากข้อสรุปที่ผ่านการพิสูจน์เท่านั้น"*
- ส่วนของมติ: ข้อสรุปที่พิสูจน์แล้ว / ข้อที่ยังฟันธงไม่ได้ / จับตา / คาดการณ์อนาคต / ฉบับวิเคราะห์เต็ม (มีอ้างอิง) / จุดยืนรายสินทรัพย์ / ผลตรวจสอบข้อกล่าวอ้าง
- ผลตรวจสอบ 3 ค่า: ผ่านการพิสูจน์ / ขัดกับข้อมูลจริง / ตรวจไม่ได้
- **"สมองส่วนกลาง — ความรู้ที่พิสูจน์แล้ว"**: *"จำเฉพาะข้อสรุปที่รอดจากการโจมตี ความเชื่อมั่นลดลงตามเวลาและถูกท้าทายซ้ำได้เสมอ"*
- **"สถิติความแม่นยำรายที่นั่ง"** (per-seat scoreboard)
- ต้นฉบับหน้านี้เป็น admin-only — แอปเราเป็น single-user อยู่แล้ว ไม่ต้องทำระบบสิทธิ์
- **LLM ที่ใช้ได้จริง**: DeepSeek `deepseek-v4-flash` (คีย์อยู่ใน `backend/.env` — `DEEPSEEK_API_KEY`) — user ตัดสิน 2026-08-09 ว่า **"หลายโมเดลหลายค่าย" ของต้นฉบับ → ใช้ DeepSeek ตัวเดียวแต่แบ่งหลายบริบท/หลายบุคลิก** ให้ตรงคอนเซปต์ (มี Ollama `llama3.2:3b` local ด้วยแต่ CPU-only ช้าและอ่อน — ไม่ใช่ตัวหลัก)

**หลักการที่ห้ามละเมิด:**
1. **ไม่แต่งตัวเลข** — ข้อมูลไม่มี → "—" (ทั้งโปรเจค)
2. **ห้ามให้ AI แต่งตัวเลขตลาด** — ทุกตัวเลขในบทสนทนาต้องมาจาก ctx/ข้อมูลจริงที่เราป้อนให้ ไม่ใช่จากความจำของโมเดล เฟส "ตรวจสอบ" มีไว้จับข้อนี้โดยเฉพาะ
3. **มติไม่ใช่คำแนะนำการลงทุน** — ต้องมี disclaimer ชัดเหมือนที่ tab จำลองสถานการณ์ทำไว้
4. **ต้องนับต้นทุนเสมอ** — เก็บ `llm_calls / tokens_in / tokens_out` ทุกครั้งเหมือนต้นฉบับ

## Decisions so far

**แผนปิดแล้ว 2026-08-09** — ทุก ticket resolve · shipped ใน 3 commits (`5bb06d5` engine, `1f6b93c` frontend, `0e70232` trigger) · spec as-built: `docs/specs/2026-08-09-boardroom.md`

| Ticket | สรุป |
|---|---|
| [01-research-boardroom-page](issues/01-research-boardroom-page.md) ✅ | ขุดหน้า /boardroom ครบ: schema, 7 เฟส, 4 trigger, 3 verdicts, 590 copy ไทย — doc: `docs/research/boardroom-page-2026-08-09.md` |
| [02-grilling-seats-and-phases](issues/02-grilling-seats-and-phases.md) ✅ | 7 ที่นั่ง (เจมส์/แมวมอง/มหภาค/เครดิต/เทคนิคอล/ท้าทาย A+B) · 2 โหมด (เต็ม 26 / สั้น 19 คอล) · ไทยล้วน · เพดาน 40 คอล/30 นาที |
| [03-prototype-cost-and-quality](issues/03-prototype-cost-and-quality.md) ✅ | prototype รันจริง: เต็ม 20 คอล $0.021/4.1 นาที · baseline $0.0011 · ตรวจพบ 0 ตัวเลขแต่ง · user: ไปต่อ + daily 6 + เครื่องหมาย "(สมมติ)" |
| [04-grilling-claim-verification](issues/04-grilling-claim-verification.md) ✅ | ข้อกล่าวอ้างเป็น JSON โครงสร้างตั้งแต่แรก · ตรวจด้วยโค้ด (±2%/±5%, change ±20%/±50% floor 5bp) · verdict partial (ทิศทางถูก-ขนาดเพี้ยน) · ตรวจไม่ได้แยก UI (ไม่มีข้อมูล/ความเห็น) |
| [05-grilling-memory-and-scoreboard](issues/05-grilling-memory-and-scoreboard.md) ✅ | จำเฉพาะ proven · decay ครึ่งชีวิต = TTL/2 ฉีดที่ conf≥60 retired <30 · ท้าทายซ้ำ 2 ครั้ง→retired · knowledge ≤8 + memory ≤10 · สถิติ claims ต่อที่นั่ง + cold-start n<10 |
| [06-task-backend-engine](issues/06-task-backend-engine.md) ✅ | `boardroom_service.py` 8 ตาราง + เครื่องยนต์ 7 เฟส (advance ทีละเทิร์น/resume/เพดาน/นับ tokens) + `routers/boardroom.py` 4 endpoints — 11 เทสต์ stub — commit `5bb06d5` |
| [07-task-frontend-tab](issues/07-task-frontend-tab.md) ✅ | `BoardroomDashboard.tsx` (sub-tab #8 ห้องประชุม) — มติ/ป้ายตรวจ/สถิติที่นั่ง/ต้นทุน/polling/disclaimer — 5 เทสต์ — commit `1f6b93c` |
| [08-grilling-auto-triggers](issues/08-grilling-auto-triggers.md) ✅ | ทำแบบจำกัด (ข่าว+โมเดลขยับ) · impact≥70/6 ชม. · ข้ามเกณฑ์ 40/60 หรือ Δ≥8 · ตัดข่าวแดง (3 แหล่งฟรีใช้ไม่ได้ — ทดสอบสด) · daily 6/cooldown 60/dedupe key · trigger_log ให้เห็น "ชนเพดาน" |
| [10-task-trigger-engine](issues/10-task-trigger-engine.md) ✅ | `check_triggers()` + `boardroom_trigger_log` + POST /triggers/check + piggyback (GET meetings, news/models refresh) — 13 เทสต์ — commit `0e70232` |

## Not yet specified

<!-- ทุกข้อเดิมถูกคลี่แล้ว — ย้ายออกจากที่นี่ -->

- ~~"วิจัยภายนอก" เอาข้อมูลจากไหน~~ → ตัดสินแล้ว: ใช้ข้อมูลในระบบ (ข่าว RSS + macro + history) — ไม่มี web search จริง (บันทึกใน spec §13)
- ~~ประชุมรันนานแค่ไหน~~ → วัดแล้ว (ticket 03): เต็ม ~4-5 นาที — UI ใช้ polling (list 10s/detail 3s) ไม่ต้อง streaming
- ~~กู้คืนประชุมล้มกลางคัน~~ → ตัดสินแล้ว: resume เดินต่อจาก current_turn (ticket 02) + `claim_until` กัน worker ชน (ticket 06)

**Backlog (ทำทีหลัง — ไม่ใช่ blocker ของแผน):**
- "ข่าวแดง" trigger — รอแหล่งปฏิทินฟรี/TE subscription (ทดสอบสด 3 แหล่งใช้ไม่ได้ 2026-08-09)
- หน้าสมองส่วนกลาง/สถิติรวมเป็นหน้าแยก — ตาราง/กลไกพร้อม ยังไม่มี endpoint + UI
- แถบ "ชนเพดาน" ใน UI — ข้อมูล `trigger_log_today` พร้อม ยังไม่ทำ frontend
- knowledge proposals (ลงมติรับ K1..K8) — ตารางพร้อม ยังไม่ populated โดย engine
- APScheduler 24/7 (เฝ้าตลาดแม้ไม่เปิดแอป) — piggyback พอสำหรับ single-user ตอนนี้

## Out of scope

- **หน้า `/boardroom/signals`** — แยกเป็นแผน `.scratch/boardroom-signals/map.md` (user ตัดสิน 2026-08-09 ให้แยก 3 แผนขนานกัน) — `Waiting on` ของแผนนั้น: มติ/จุดยืนจากที่นี่
- **หน้า `/trade-desk`** — แยกเป็นแผน `.scratch/trade-desk/map.md`
- หลายโมเดลหลายค่าย (ต้นฉบับ) — ใช้ DeepSeek ตัวเดียว หลายบุคลิก (user ตัดสิน) — ชดเชย correlated bias 3 ชั้น (spec §13)
- **ระบบสิทธิ์ admin/login** — แอปเราเป็น single-user ไม่มีผู้ใช้หลายคน
- **แจ้งเตือน Telegram** — เคยกันออกมาแล้วสองแผนก่อนหน้า
