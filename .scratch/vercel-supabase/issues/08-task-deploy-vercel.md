# 08 - Task: Deploy จริงขึ้น Vercel + Supabase

Type: task
Status: closed
Claimed: hermes/2026-08-11
Blocked by: 06, 07

## Question

แอปทั้งระบบทำงานบนคลาวด์จริง — frontend static + backend functions บน Vercel · Postgres + worker บน Supabase

## ขอบเขต

- **backend**: FastAPI เป็น Vercel Python functions (ตามโครงสร้างที่ spike (01) พิสูจน์) — ทุก router รันได้
- **frontend**: Vite build → static บน Vercel + API base URL ชี้ prod (env การ์ด)
- **env/secrets** บน Vercel: DEEPSEEK_API_KEY, FINNHUB_API_KEY, FMP_API_KEY, DEEPSEEK_MODEL/URL, DATABASE_URL ฯลฯ (ข้อเท็จจริง: ไม่มี credentials เปิดเผยใน repo — ใช้ Vercel env ไม่ใช่ไฟล์)
- **Supabase**: Postgres project + ตั้ง worker ตามใบ 03 (pg_cron ฯลฯ)
- เทสต์ suite ผ่านบนคลาวด์ config · ⚠️ หยุดรอตรวจก่อน commit
- URL prod จริง (ไม่ใช่ localhost)

## Answer

**LIVE: `https://portfolio-tracker-taupe-two.vercel.app`** — commit `adf0376` + `cb4ec5e` (2026-08-11)

### Vercel
- **`api/index.py`** — entry ASGI: `sys.path` → backend/, yfinance cache → /tmp (serverless home อ่านไม่ได้ — ไม่งั้น TzCache/CookieCache fail)
- **`vercel.json`** — `/api/*` + path แบบไม่มี /api (ai-narrative/fx/market-data/market/portfolios/prices/watchlist — prefix เดิมของ router ไม่ได้ขึ้น /api) → function · ที่เหลือ → static SPA · maxDuration 300
- **env 4 ตัว** ผ่าน Vercel env (Sensitive): DEEPSEEK_API_KEY / FINNHUB_API_KEY / FMP_API_KEY / PORTFOLIO_DB_URL (DEEPSEEK_URL/MODEL hardcode ในโค้ดแล้ว ไม่ต้อง env)
- frontend: `VITE_API_BASE_URL` = prod URL ตอน build
- **วัดจริง (ทุก endpoint 200 จาก prod):** macro ✓ fear-greed ✓ models ✓ news ✓ signals ✓ countries (27 ประเทศ, TH 10Y = 2.028% ผ่าน wgb API ใหม่) ✓ compare ✓ trade-desk ✓ fx ✓ portfolios ✓ watchlist ✓ market ✓ prices ✓ ai-narrative ✓ frontend root = HTML ✓
- cold start: ติดตั้ง deps ใหญ่ (numpy/sklearn/pandas ~30-60s) → ครั้งแรกช้า แต่ instance อุ่นแล้วปกติ

### Supabase (user เลือกใช้ mujxregicbbabemlwgrs ต่อ — ข้อมูลย้ายแล้ว)
- `alembic upgrade head` → schema ครบ (cache_entries + job_runs) · **verify_data.py: ALL MATCHED** ทุกตาราง (ข้อมูลใบ 05 ยังครบ: model_score_history 1848 · screener_stocks 986 · news_items 545→786 หลัง refresh)
- **pg_cron + pg_net ติดตั้ง** · cron job `portfolio-tracker-due-turns` ทุก 10 นาที → `net.http_post` → `/api/jobs/run-due-turns` — **พิสูจน์ยิงเองจริง**: cron.job_run_details succeeded (08:00/08:10/08:20) · job_runs id=5 (cron-fired) finished ใน 43s

### บั๊กที่จับได้ระหว่าง deploy (แก้ + เทสต์)
1. `ModuleNotFoundError: app` — sys.path ชี้ api/backend ผิด → `..` (อยู่ /var/task/api → ต้อง ../backend)
2. `country data unavailable` 503 — Supabase ยังไม่มี schema → alembic + copy (ข้อมูลอยู่แล้ว ALL MATCHED)
3. **tick ค้าง running ตลอดกาล** — Vercel ฆ่า function กลาง tick (40 news × DeepSeek ~8s = เกิน 300s) → row running ค้าง → ทุก tick ต่อมา skip (worker ตายเงียบ) → **`WEDGED_LOCK_TTL_SECONDS` (20 นาที)** — running row เก่าเกิน → ยึด lock (mark failed + note) + **news cap 40 → 15/tick** (วัดจริง: 40 ตัว tick ถูกฆ่า ~250s · 15 ตัวจบใน 43-57s) — เทสต์ `test_wedged_lock_taken_over_after_ttl`
4. prewarm ยิง internal keys (`us10y`) ตรงๆ ให้ FRED → 404 เกลื่อน → ส่งแต่ `fred` id จาก `_SERIES` meta (DGS10 ฯลฯ) → **31 ซีรีส์สำเร็จ** (dashboard warm หลัง tick)

### เทสต์
- suite เขียว SQLite **531** ✓ (530 + wedged-lock test) — ใบนี้แก้เฉพาะ jobs.py + test · Postgres suite ผ่านแล้วจากใบ 07 (530) — โค้ด runtime ไม่แตะ schema

ตัวเลขวัดจริง · อนุมัติ "ลุย" → commit แยกตามวินัย
