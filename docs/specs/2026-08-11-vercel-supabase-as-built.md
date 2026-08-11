# Spec as-built — ย้าย portfolio-tracker ไป Vercel + Supabase (2026-08-11)

> As-built จากโค้ดจริง + ตัวเลขวัดจริง — เขียนตอนปิดแผน (ticket 10) ตามบทเรียน forecast-tab:
> spec ต้องสะท้อนสิ่งที่รันอยู่ ไม่ใช่สิ่งที่วางแผนไว้

## 1. สถาปัตยกรรมใหม่ (prod)

```
Browser
  │  https://portfolio-tracker-taupe-two.vercel.app
  ▼
Vercel (Hobby, $0)
  ├── static frontend  (frontend/dist — Vite build, VITE_API_BASE_URL=prod)
  └── Python function  (api/index.py → backend/app/main.py, FastAPI ASGI)
        │
        ├── FRED / yfinance / wgb API / RSS — จาก egress Vercel (httpx default UA)
        └── Supabase Postgres (mujxregicbbabemlwgrs, Free)
              ├── 27 user tables (Alembic migrations)
              ├── cache_entries  — DB-backed cache แทนใน-memory (ใบ 06)
              ├── job_runs      — overlap lock ของ worker (ใบ 07)
              └── pg_cron (ทุก 10 นาที) → pg_net → POST /api/jobs/run-due-turns
                    └── 1 tick: pre-warm macro cache → boardroom trigger/advance (≤3 LLM)
                        → trade-desk due turns → news enrich (≤15)
```

- **Routing**: `/api/*` + bare prefixes (`/fx`, `/portfolios`, `/watchlist`, `/market*`,
  `/prices`, `/ai-narrative`) → function · ที่เหลือ → static SPA (vercel.json)
- **LLM**: opencode-go gateway (`https://opencode.ai/zen/go/v1/chat/completions`,
  model `deepseek-v4-flash`, key ล็อค model) — เดิม OpenRouter
  - ⚠️ ปิด reasoning ต้องใช้ `thinking.type=disabled` — `reasoning.enabled=false` โดน ignore
    (วัด: reasoning.enabled=false → 160+ reasoning tokens; thinking.type=disabled → 0)
- **Worker**: ไม่มี daemon thread บน serverless — thread 3 จุดเดิม (boardroom/news/trade-desk)
  ถอดหมด, งาน background ทั้งหมดวิ่งผ่าน cron tick · request paths เรียก `jobs.run_due_turns(db)`
  ผ่าน job_runs lock (ไม่ race tick) · wedged lock > 20 นาทีถูกยึดอัตโนมัติ (function ถูกฆ่า 300s)

## 2. อะไรเปลี่ยน / อะไรอยู่

| เดิม (Docker prod) | ใหม่ (Vercel + Supabase) |
|---|---|
| SQLite 2 ไฟล์ (portfolio.db + bondcrisis.db) | Postgres 1 DB (27 ตาราง, Alembic) — bondcrisis รวมเข้า Base |
| ใน-memory `_cache` dict 21 โมดูล | `cache_entries` ตาราง (TTL เดิม, wall-clock) |
| daemon threads 3 จุด + piggyback trigger | cron tick เดียว (job_runs lock, per-tick caps) |
| Playwright+Chromium scrape wgb | wgb JSON API (POST wp-json/country/v1/main + Origin/Referer + SYMBOL map) |
| OpenRouter | opencode-go gateway |
| Docker compose = prod | Docker = dev only |

**อยู่เหมือนเดิม**: ทุก endpoint/schema เดียว · TTL cache เดิม · สูตร/คะแนนทั้งหมด ·
LLM prompts · single-user (ไม่ทำ Auth/RLS) · FRED httpx default UA · retry/timeout เดิม

## 3. วิธีรัน dev vs prod

- **Prod**: `https://portfolio-tracker-taupe-two.vercel.app` — deploy: `VITE_API_BASE_URL=… npm run build`
  แล้ว `vercel deploy --prod --yes --token "$VERCEL_TOKEN"` (tokens ใน `.scratch/vercel-supabase/secrets.env`,
  gitignored) · migrate: `PORTFOLIO_DB_URL=… alembic upgrade head` · secrets ใน Vercel env เท่านั้น
- **Dev**: `docker compose up` หรือ `start-app.bat` (SQLite local + .env local) · pytest ใช้
  temp SQLite default / `PORTFOLIO_DB_URL` ชี้ Postgres test (`pt-pg-test` docker) — hybrid suite

## 4. ค่าใช้จ่ายจริง ($0)

- Vercel Hobby: static + serverless function + 100 cron (ไม่ได้ใช้ Vercel cron — ใช้ pg_cron) = $0
- Supabase Free: Postgres + pg_cron + pg_net + pause-7-day risk (ยังต้องสังเกตระยะยาว) = $0
- LLM: DeepSeek via opencode-go — ราคาเดิม ($0.00027/call ai-narrative วัดไว้)
- **เจอจริง**: bundle numpy+sklearn 290MB → Vercel optimize auto (deploy ผ่าน ไม่ต้องลดเอง)

## 5. Fallback / ความเสี่ยงที่เหลือ

- **Supabase pause 7 วัน** — ยังวัดไม่ได้ (ต้อง >1 สัปดาห์) → ถ้า pause: เปิดแอป = activity, cron ฟื้น
- **FRED/scrape โดนบล็อกทีหลัง** — monitor ระหว่างรันจริง (wgb API ต้อง Origin header — ถ้าเปลี่ยน,
  fallback = FRED 10Y สำหรับประเทศที่มี, ประเทศอื่น score ลด)
- **worker best-effort** — tick ที่พลาดไม่สูญหาย (idempotent ทุก subsystem) · wedged lock heal อัตโนมัติ
- **rollback**: dev env (Docker) ยังอยู่ครบ — เปิดได้ตลอด

## 6. หลักฐานปิดแผน (self-check)

- ทุกใบ `Status: closed` (01–10) — blocking chain ปิดครบตามลำดับ (01→04→05→06→07→08→09→10)
- full suite เขียว: **SQLite 531 ✓ · Postgres 530 ✓** (pt-pg-test local PG16)
- `hermes verify --json` ok:True
- prod วัดจริง: ทุก endpoint 200 · cron tick 43–105s · wedged takeover พิสูจน์สด
- commits: `5c4c005` (05) · `9714762` (06) · `1a269cb` (07) · `adf0376`+`cb4ec5e` (08) ·
  `a5be1e0` (09) · LLM gateway/thinking fixes `3b24688`+`7a49dd6`
