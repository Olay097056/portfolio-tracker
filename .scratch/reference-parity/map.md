# Map — ความเหมือนต้นฉบับ (reference parity) ทุกหน้าของ Bond-crisis

## Destination

ทำให้ทุกแท็บของ Bond-crisis **เหมือนหน้าที่ตรงกันของ bond-crisis-dashboard-v2 เท่าที่ทำได้จริง** โดยวัดด้วย **checklist ที่ user เปิดสองหน้าเทียบเองแล้วเซ็นรายข้อ** — ไม่ใช่ด้วยเทสต์ผ่าน

แผนจบเมื่อทุกรายการใน checklist ถูก user ตัดสินแล้วว่า **ผ่าน** หรือ **ไม่เอา** — ไม่มีข้อไหนค้างในสถานะ "ยังไม่ได้ดู"

**⚠️ แผนที่นี้แบกงานเขียนโค้ด** — ticket `task` เขียนโค้ดจริงและ commit ได้ กติกาเหมือนแผนก่อนหน้า:
1. เขียนโค้ดได้เฉพาะ ticket `Type: task`
2. **หยุดให้ user ตรวจก่อน commit** ทุกครั้ง
3. ห้ามอ้างเลขเทสต์ที่ไม่ได้รันจริง
4. ก่อนปิด ticket ที่มี `Blocked by:` ต้องเช็คว่าทุกใบที่บล็อกปิดจริง

## Notes

- **Tracker: local markdown** — `issues/NN-*.md` หัวไฟล์มี `Type:` / `Status:` / `Claimed:` / `Blocked by:` — frontier = `Status: open` + `Blocked by` ปิดหมด · จอง: เติม `Claimed: <ชื่อ>/<วันที่>`
- Domain: full-stack (FastAPI + Postgres/Supabase + React 19/Vite, **ไม่มี Tailwind** — inline style + `INK` palette, Thai-first)
- **ไม่ต้อง login เพื่อขุด** — route chunk + i18n เปิดสาธารณะ วิธี: `fetch('/<route>')` → regex `/_next/static/chunks/app/...` · copy ไทยทั้งหมดอยู่ใน `/_next/static/chunks/3474-e1aec38ee927d485.js` (98 KB) · **แต่การ "ดูหน้าจริง" ต้อง login ซึ่งมีแต่ user ทำได้** — นี่คือเหตุผลที่ ticket 04 เป็น HITL

### ⛔ รากของปัญหา — อย่าทำซ้ำ

สามแผนก่อนหน้า (`multi-agent-trade-desk` → `trade-desk-detail` → `trade-desk-ui-100`) ปิดครบทุกใบ เทสต์ผ่านทุกรอบ commit เขียนว่า "Trade Desk Main **100%**" — แต่ของยิ่งทำยิ่งหด:

`TradeDeskDashboard.tsx`: **376 → 401 → 145 บรรทัด** (commit `3cf88fe` ลบ 250 บรรทัด)

**เพราะทุก ticket ตรวจตัวเองเทียบกับตัวเอง ไม่เคยมีใบไหนสั่งให้เปิดสองหน้าวางข้างกันแล้วไล่ว่าอะไรขาด** นิยาม "เสร็จ" กลายเป็นความสอดคล้องภายใน ไม่ใช่ความเหมือนต้นฉบับ ทั้งที่คำสั่งแรกสุดคือ "มิเรอร์ 100% เท่าที่ทำได้"

**กติกาใหม่ที่แผนนี้บังคับ:**
- ticket `task` ทุกใบต้องจบด้วย**รายการ checklist ที่ user เซ็น** ไม่ใช่ "เทสต์ผ่าน N ตัว"
- **ห้ามลบเทสต์เพื่อให้ผ่าน** ถ้าเทสต์เดิมขวางอยู่ ให้หยุดถาม — ห้ามเขียนไฟล์เทสต์ใหม่ทับของเดิมโดยตัดเคสออก
- ห้ามเขียนคำว่า "100%" ใน commit message เว้นแต่มี checklist ที่ user เซ็นครบรองรับ
- **พลิกสถานะแถวใน checklist เมื่อไหร่ ต้องอัปเดตทุกตัวสรุปที่นับแถวนั้นในคอมมิตเดียวกัน แล้วพิสูจน์ด้วยสคริปต์นับสด** — เอกสารนี้มีสรุปซ้อน 3 ชั้น (สรุปย่อยรายหมวด → Grand Summary → map + ใบ 01) — แก้ทีละชั้นไม่มีวันจบ (พลาดมา 4 ชั้น: แถว → Grand Summary → สรุปย่อย 17 บรรทัด → ใบ 01 gap/5-16) · สคริปต์: `.scratch/reference-parity/fix_subsummaries.py` (รันแล้วต้องจบ "VERIFY mismatches = 0")

### ข้อเท็จจริงที่ตรวจแล้ว (2026-08-12) — อย่าขุดซ้ำ

**สภาพปัจจุบัน**
- Bond-crisis มี **16 แท็บ**: overview · macro · models · signals · sentiment · cme · banking · countries · forecast · boardroom · boardroom-signals · trade-desk · news · learn · office · settings
- `TradeDeskDashboard.tsx` = **145 บรรทัด** — **บางที่สุดในบรรดาคอมโพเนนต์ Bond-crisis ทั้งหมด** เล็กกว่า OfficeDashboard (202) และ LearnDashboard (236) ทั้งที่ต้นฉบับหน้านี้ซับซ้อนที่สุด · เทียบ: BoardroomDashboard 804 · SignalsDashboard 788 · ModelsDashboard 573
- ต้นฉบับมี i18n `td*` **622 คีย์** (เก็บไว้ที่ `.scratch/trade-desk/dig/td-i18n.txt`)

**🔴 guard rail ที่ถูกลบ (ไม่ใช่แค่ละเมิด — ถูกถอดออก)**
- disclaimer **"พอร์ตจำลอง ไม่ใช่การเทรดจริง ไม่มีการส่งคำสั่งไปตลาดใดๆ"** — grep = **0 จุด** ทั้ง `TradeDeskDashboard.tsx` และ `TeamDetailPage.tsx` ทั้งที่เป็นหลักห้ามละเมิดข้อ 1+3 ของแผน trade-desk
- `TradeDeskDashboard.test.tsx` ถูกเขียนใหม่ **10 → 4 เทสต์** ที่หายไป: disclaimer (บังคับ) · สวิตช์หลัก · โควตา · P&L สี · ราคาดึงไม่ได้แสดง "—"

**บั๊กแสดงผลที่ยืนยันแล้ว** (`TradeDeskDashboard.tsx`)
- บรรทัด 70: `MTD:` แสดงค่า `team.weekly_target_pct` — เอาเป้ารายสัปดาห์มาโชว์เป็นผลงานรายเดือน แล้วบรรทัด 71 ใช้ฟิลด์เดียวกันเป็น "เป้า" อีกรอบ
- บรรทัด 72: `✗0 ⏳0` ฮาร์ดโค้ด ไม่ใช่ข้อมูลจริง
- บรรทัด 59: `#1` ฮาร์ดโค้ด
- ฟีเจอร์ที่ต้นฉบับมีแต่เราไม่มี: กราฟ equity ทุกโหมด · สวิตช์หลัก · โควตาเทิร์น/เทิร์นถัดไป · ออเดอร์ที่ตั้งไว้ · สรุปประจำวัน/รายเดือน · คำสั่งโต๊ะกลาง (directive)

**สถาปัตยกรรมปัจจุบัน** — ย้ายขึ้น Vercel + Supabase (Postgres) แล้ว prod ไม่ใช่ Docker อีกต่อไป · in-memory cache 21 ตัวถูกแทนด้วยตาราง `cache_entries` · thread ถูกแทนด้วย central job loop

## Decisions so far

- [01 research parity checklist](issues/01-research-parity-checklist.md) — 96 แถว 16 หน้า · **ตอนสำรวจ (เช้า 2026-08-12)**: 47 มี / 27 ขาด / 12 ต่าง · **ตอนนี้ (หลังใบ 02–09 + 04 รอบสอง)**: 83 มี / 7 ขาด (ใบ 10) / 6 ต่าง (ใบ 11 + backlog) · deliverable `docs/research/reference-parity-checklist-2026-08-12.md`
- [02 restore deleted guardrails](issues/02-task-restore-deleted-guardrails.md) — disclaimer กู้กลับ 2 ไฟล์ (TradeDeskDashboard + TeamDetailPage) · เทสต์ 4→8 · audit 5/16 แท็บมี disclaimer (แก้ตารางเป็น 5 มี · 11 ขาด ตรง grep จริง) · commit `afe792b` + `65fcd97`
- [03 fix known display bugs](issues/03-task-fix-known-display-bugs.md) — 11.1 เอาป้าย #1 ออก (1 ทีม ไม่แข่ง) · 11.2 เปลี่ยน ✗0 ⏳0 ปลอมเป็น turns_today จริง · 11.3 MTD คำนวณจาก trade_snapshots (equity ต้นเดือน) ไม่ใช่ pnl_pct — null → "—" · เทสต์ MTD 3 ตัว (8.0 ≠ 20.0 พิสูจน์ใช้ snapshot) · suite 541 · commit `023ff08`
- [06 risk warnings](issues/06-task-risk-warnings.md) — RiskBanner 12 จุด (D8+D19 รวมก้อนเดียวที่สัญญาณเทรด, D9-D18 แยกข้อความตามแท็บ) · D19 ไม่มีเลขปลอม — "ความแม่นยำอยู่ระหว่างการวัดผล" · เทสต์เฝ้า 13 ตัว (ล้มถ้าลบข้อความ) · vitest 578 · commit `8e60611`
- [05 grilling single team shape](issues/05-grilling-single-team-shape.md) — ตัดสิน 8 ข้อ: 11.4 กราฟ equity เอา (UI มี backend แล้ว) · 11.5 สวิตช์หลัก เอา (สร้างใหม่ 2 ฝั่ง) · 11.6 โควตา UI เอา · 11.7 pending orders **แบบ B** (settle tick 10 นาที — ไม่แตะ cadence; ตารางยังไม่มีจริงต้อง migrate) · 11.8 สรุป LLM เอา · 11.9 directive เอา (ต่อเข้าพร้อมต์ — ตอนนี้เก็บเฉยๆ) · เป้า AI ตั้งเอง เอา · detail page เอาแค่ "ดู prompt เต็ม" (hit rate+ledger ทีหลัง — รอไม้ปิด) — แตกเป็น tickets 07/08/09
- [07 trade desk ui bundle](issues/07-task-trade-desk-ui-bundle.md) — กราฟ equity (SVG %/$ 24h/7d/30d) · โควตา X/4 + countdown (UTC→local, null-safe) · directive ต่อเข้า `_build_base_context` **พิสูจน์ด้วยเทสต์ stub llm_call 3 ตัว** + UI แก้ในหน้า main · "ดู prompt เต็ม" expandable ต่อ analyst · ไม่แตะ schema (สวิตช์หลักย้ายไปใบ 08) · vitest 587 · pytest 544 · verify OK · commit `c660289`
- [08 pending orders + master switch](issues/08-task-pending-orders.md) — migration Alembic `b7e5f2a1c9d3` (trade_pending_orders + master_on — idempotent, รัน prod ก่อนโค้ด: master_on=1, rows 1/1 ไม่หาย) · settle ใน tick 10 นาทีเดิม **ไม่เรียก LLM** (100 รอบ = 0 calls) · LIMIT fill ที่ราคา target, STOP ที่ mark, หมดอายุ→cancel · master off หยุดเทิร์นใหม่ แต่ settle/SL-TP ยังทำงาน · AI สั่ง MARKET/LIMIT/STOP ได้ · UI master toggle + pending table · pytest 551 · vitest 589 · commit `caf7027`
- [09 ai targets + summaries](issues/09-task-ai-targets-summaries.md) — migration `c4d3e2f1a9b8` (trade_summaries + UNIQUE(team_id,kind,period) = ตัวกันซ้ำ DB — รัน prod ก่อนโค้ด: constraint มี, rows 0, teams 1/1) · weekly target: tick แรกของสัปดาห์ **เฉพาะ master_on+active** (ปิด→0 คอล) · directive มีน้ำหนักเหนือเป้า AI (เทสต์ยืนยันใน context) · daily/monthly summary 1 คอล/ช่วง · ไม่มีกิจกรรม→ไม่เรียก LLM · cost เข้าตัวนับทีม · เฟส 3.5 ใน tick เดิม · UI การ์ดสรุป · pytest 561 (+10 idempotence) · vitest 590 · commit `e22829b`
- [04 grilling user signs checklist รอบสอง](issues/04-grilling-user-signs-checklist.md) — **30/30 ตัดสินครบ** · 10 เอา · 2 ทีหลัง (13.2 overview layout, 15.2 office 13 แผนก — ต้องเปิดสองหน้าเทียบ) · **18 ทำไปแล้ว** (16/30 ล้าสมัย — checklist เขียนก่อนใบ 02-09 แก้โค้ด) · บทเรียน: re-verify sweep ตัด 9 แถว · grep ผิดที่ 2 ครั้ง (7.2 ข้อความอยู่ backend data_tier_note_th) · 2.2 ค่าถูกชื่อผิด → เปลี่ยนป้าย "ความครบของข้อมูล" — แตกเป็น tickets 10/11

## Not yet specified

- **hit rate ต่อ analyst + ledger** — ตัดสิน "ทีหลัง" ในใบ 05 (รอไม้ปิดจริงก่อน — ตอนนี้ trade_positions=0, นิยาม hit ยังไม่ชัด) — จะกลับมาเมื่อพอร์ตมีประวัติเทรด
- **หน้าที่ต้นฉบับมีแต่เราไม่มี / เรามีแต่ต้นฉบับไม่มี** — รอ ticket 01 ว่ามีไหม
- **เกณฑ์ว่าอะไร "ทำไม่ได้จริง"** — บางอย่างต้นฉบับทำได้เพราะมีหลายค่ายโมเดล/worker เต็มรูป ของเราอาจติดข้อจำกัด ต้องแยกให้ชัดว่า "ยังไม่ทำ" กับ "ทำไม่ได้" — รอเห็นรายการจริง

## Out of scope

**การแข่งขันระหว่างทีมทั้งหมด** (user ตัดสิน 2026-08-12: "1 ทีมก็พอ เลิกคิดเรื่องแข่ง") — ตกไปพร้อมกัน:
- 9 ทีม / หลายทีม · อันดับ (`tdRank`) · กราฟหัวข้อ "ผลงานการแข่งขัน" ที่เทียบข้ามทีม
- สถานะ ภาคทัณฑ์ / พัก / **ถูกไล่ออก** · "รุ่น" (generation) · "แสดงทีมที่ถูกปลด"
- สรุปรายเดือนแบบจัดอันดับ 🥇🥈🥉 (ถ้าจะเอาสรุปรายเดือน ต้องเป็นแบบทีมเดียว)

**อื่นๆ**
- แข่งข้ามค่ายโมเดล — เรามี DeepSeek คีย์เดียว
- การส่งคำสั่งซื้อขายจริง — PAPER ONLY ยังเป็นกฎเด็ดขาดเหมือนเดิม
- แจ้งเตือน Telegram
