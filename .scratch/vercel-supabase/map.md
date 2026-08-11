# Map — ย้ายสถาปัตยกรรม portfolio-tracker ไป Vercel + Supabase

## Status: ✅ CLOSED (2026-08-11) — ทุกใบ 01–10 ปิดครบ · prod LIVE https://portfolio-tracker-taupe-two.vercel.app · Docker = dev only · as-built spec: docs/specs/2026-08-11-vercel-supabase-as-built.md

## Destination

ย้ายทั้งสถาปัตยกรรม (FastAPI + React · SQLite · Docker บนเครื่อง) ไป **Vercel (frontend static + serverless API) + Supabase Cloud (Postgres + pg_cron worker)** ในแผนเดียว งบ **$0** (Vercel Hobby + Supabase Free) · deploy สาธารณะ · worker 24/7 แบบ best-effort ผ่าน pg_cron ฝั่ง Supabase · ตัดบทบาท production ของ Docker เดิมหลัง cutover (dev env บนเครื่องคงอยู่ตลอด)

## Notes

**กติกาแผน (carries execution):**
1. เขียนโค้ดได้เฉพาะ ticket `Type: task` — research/grilling/prototype ห้ามแตะโค้ด production
2. ทุก task หยุดให้ user ตรวจก่อน commit
3. ก่อนปิด ticket ที่มี `Blocked by:` ต้องเช็คว่าทุกใบที่บล็อกปิดจริงแล้ว — ถ้ายังเปิดค้าง ให้หยุดรายงาน ห้ามปิดข้าม ห้ามตัดสิน decision ในใบที่ยังไม่ได้รันแทน user
4. ทุกตัวเลขที่รายงานต้องมาจากการวัดจริง (คอลจริง ไม่ใช่จับเวลา · "commit แล้ว" ตรงกับ git log)
5. Tracker: local markdown — `issues/NN-*.md`, หัวไฟล์ `Type:` / `Status:` / `Claimed:` / `Blocked by:` — frontier = `Status: open` + `Blocked by` ปิดหมด
6. เก็บงานที่ `.scratch/vercel-supabase/`; research/asset → `docs/research/`; spec → `docs/specs/`

**ข้อเท็จจริงที่ตรวจแล้ว (2026-08-10) — อย่าขุดซ้ำ อย่าเดา:**

1. **ใน-memory cache 21 โมดูล** — `_cache` dict ของตัวเอง (macro_service, model_service, price_service, news_service, signals_service, routers/models, routers/macro, routers/signals, routers/countries, ...) pattern "compute-on-call + cache 10 นาที" · **serverless = cold ทุก invocation → cache หายทุกครั้ง → ทุก request จ่ายราคาเต็ม** — สมมติฐานแกนกลางของแอปที่ Vercel ทำลาย
2. **fire-and-forget thread 6 จุด** (`threading.Thread(daemon=True)`): boardroom_service.py:1232 · routers/news.py:99 · screener_refresh_manager.py:84 · trade_desk_service.py:555 + อีก 2 — ⚠️ screener_refresh_manager ถูกลบแล้วใน commit `3b2f098` (2026-08-10) → **จำนวน/ตำแหน่งจริงให้ตรวจซ้ำในใบ port** · Vercel ฆ่า function ทันทีที่ response จบ → งานพื้นหลังตายกลางคัน
3. **FRED หลัง Akamai ที่คัด User-Agent** — UA แบบ Mozilla → timeout 12 วิ · UA เปล่าของ python-httpx → 200 ใน 0.6 วิ (จากเครื่อง) · **ยังไม่มีใครรู้ว่ามันจะทำตัวยังไงกับ egress IP ของ Vercel (datacenter IP มักโดนคัดหนักกว่า)** — ถ้าโดนบล็อก แอป 90% ใช้ไม่ได้เพราะข้อมูลมหภาคมาจาก FRED หมด
4. **scraping 3 จุด** — countries_service (worldgovernmentbonds) · routers/investors.py (konbalongtun) · routers/compare.py — เสี่ยงโดนบล็อกจาก serverless เหมือนกัน
5. **dependency หนัก: numpy + scikit-learn** — Vercel Python function มีเพดานขนาด bundle → ต้องวัดว่าเกินไหม ถ้าเกิน = deploy ไม่ได้เลย
6. **SQLite-specific ที่ต้องแปลง**: main.py lifespan ใช้ `PRAGMA table_info` + `ALTER TABLE ADD COLUMN` (migration มือ) · database.py `check_same_thread=False` · country_ai_service.py เปิด engine แยกไป `data/bondcrisis.db` (**DB ไฟล์ที่สอง — ต้องรวมหรือย้ายด้วย**)
7. **ข้อมูลจริงน้อยมาก**: model_score_history 1,848 · screener_stocks 986 · news_items 545 · technical_signals 509 · ที่เหลือหลักหน่วย → **การย้ายข้อมูลไม่ใช่ส่วนยาก ส่วนยากคือ runtime model**
8. **single-user** — ไม่มีระบบผู้ใช้ ไม่ต้องทำ Auth/RLS (ต้นฉบับต้องมีเพราะเปิดสาธารณะ เราไม่ใช่)
9. **เทสต์แยกฐานข้อมูลจริง** ผ่าน `PORTFOLIO_DB_URL` (conftest ชี้ temp) — ถ้าย้ายไป Postgres ต้องรักษาคุณสมบัตินี้

**ตัดสินโดย user (grilling 2026-08-10):**
- ย้าย runtime จริง + deploy สาธารณะ (ไม่ใช่แค่ worker)
- cache → ตาราง Postgres cache table (TTL 10 นาที เดิม) — ปฏิเสธ Redis
- ย้ายทั้งหมดทีเดียวในแผนเดียว (spike ยังกั้นประตู)
- งบ $0 (Vercel Hobby + Supabase Free) — worker = pg_cron ฝั่ง Supabase best-effort; ต้องวัดว่า cron ป้องกัน pause 7 วันได้ไหม (ถ้าไม่ได้ worker จะตื่นเมื่อมีคนเปิดแอป = คล้าย piggyback เดิมแต่ย้ายฝั่ง DB)
- Docker เดิม: cutover ชั่วคราว (รันคู่) แล้วเลิก prod · dev env คงอยู่

## Decisions so far

- [Research: Supabase Free tier รองรับ worker 24/7 best-effort แค่ไหน](issues/02-research-supabase-free-worker-capability.md) — pg_cron/pg_net/Edge Function **ใช้ได้บน Free** (ไม่มี paid-gate) · **pause 7 วันเป็นคอขวด** และ docs ไม่รับรองว่า cron กัน pause ได้ (activity = "user" activity — ต้องมีจราจรจริง/รับมืออีเมลเตือน) · **แก้: Vercel Hobby มี cron** แต่ daily-only+แม่น±59 นาที → งาน sub-daily ต้องใช้ Supabase pg_cron · pg_net (beta) = HTTP ออกจาก cron · Vercel duration 300s/bundle 250MB(Py 500MB)/2GB · → `docs/research/supabase-free-worker-2026-08-10.md`
- [Prototype: Deployability spike — วัด 5 อย่างจาก Vercel จริง (ประตูแผน)](issues/01-prototype-deployability-spike.md) — **ผ่านครบ** → ย้าย runtime ไป Vercel+Supabase $0 เป็นไปได้จริง · FRED **200** จาก Vercel egress (~145ms) · yfinance gold 4390 · scrape wgb 200 · bundle numpy+sklearn 290.61MB → optimize สำเร็จ · cold ~0.6s · Supabase token ทำงาน · ⚠️ pause 7 วัน วัดได้แค่ระยะยาว → ไม่มี auto-ล้มเลิก — `https://spike-sandy.vercel.app`
- [Grilling: งาน background (threads เดิม) บน serverless งบ $0 ทำงานยังไง](issues/03-grilling-background-jobs-serverless.md) — **ทุกงานผ่าน cron ตัวเดียว**: pg_cron → pg_net → POST `/api/jobs/run-due-turns` ทุก 10 นาที (ไม่มี piggyback) · thread จริงเหลือ 3 (boardroom:1232 / news:99 / trade_desk:555 → ย้ายเข้า job) · tick = pre-warm macro cache + `job_runs` lock กัน overlap + per-tick cap (≤3 เทิร์น LLM + news 40 + maxDuration 300) · signals settlement = on-read ไม่ต้อง cron

## Not yet specified

- **3 scrapers บน serverless** — ปัญหาจริงชัดหลัง spike (โดนบล็อก? ต้องลบ/แทนที่/ย้าย? — ยังบอกเป็น ticket ไม่ได้จนกว่าจะรู้ผล spike)
- **cold start > เกณฑ์ → ทางลด** — หลัง spike วัดได้ (แต่ขีดที่ยอมรับต้องถาม user)
- **secrets/env บน Vercel** (DEEPSEEK_API_KEY, FINNHUB_API_KEY, FMP_API_KEY, DEEPSEEK_MODEL/URL) — ต้องย้าย แต่รายละเอียดตามใบ deploy
- **คิว/rate-limit ของงาน cron ที่ยิงเข้า Vercel function** (ถ้าใช้ pg_net) — หลัง grilling 03
- **ตารางที่พึ่งคุณสมบัติ SQLite เฉพาะ** — ตรวจเจอตอน grilling 04

## Out of scope

- **Auth/RLS** — single-user (ข้อเท็จจริง 8) — ต้นฉบับต้องมีเพราะเปิดสาธารณะ เราไม่ใช่
- **Redis/Upstash** — user ปฏิเสธใน grilling (cache → Postgres)
- **Vercel Pro / Supabase Pro ใดๆ** — งบ $0 (อัปเกรดทีหลังได้ถ้าจำเป็น ไม่ใช่ส่วนของแผนนี้)
- **ขยายฟีเจอร์ (คริปโตพื้นเมือง ฯลฯ)** — แผนนี้เป็นสถาปัตยกรรม ไม่ใช่ฟีเจอร์
- **ทางสายกลาง "Supabase local"** — ไม่ใช่ out of scope แต่เป็นทางล้มเลิกที่เขียนไว้ในใบ spike (เกณฑ์ล้มเลิก)