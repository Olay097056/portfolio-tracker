*[English](README.md) · ภาษาไทย*

# Portfolio Tracker

Backend เป็น FastAPI + SQLAlchemy, frontend เป็น React + TypeScript + Vite
ดูรายละเอียดเฉพาะฝั่ง backend (environment variables, การรันเทส) ได้ที่
`backend/README.md`

## วิธีรัน

### ตัวเลือก C — Production (Vercel + Supabase) — *ตัวที่รันอยู่จริงตอนนี้*

แอปตัวจริง deploy อยู่บน Vercel (frontend แบบ static + API แบบ serverless)
ใช้ฐานข้อมูล Supabase Postgres และ background worker รันบน Supabase pg_cron
**นี่คือ environment ของ production** — เส้นทาง Docker/start-app ด้านล่าง
มีไว้สำหรับการพัฒนาเท่านั้น

- **App + API**: https://portfolio-tracker-taupe-two.vercel.app
- **Database**: Supabase Postgres
- **Worker**: pg_cron ทุก 10 นาที → `POST /api/jobs/run-due-turns`
  (ตาราง job_runs = ตัวล็อกกันซ้อน; งานที่ค้างเกิน 20 นาทีจะถูกยึดไปรันต่อ
  โดยอัตโนมัติ)

การ deploy (ต้องมี `~/.scratch/vercel-supabase/secrets.env` ที่มี
`VERCEL_TOKEN`/`SUPABASE_ACCESS_TOKEN` — ถูก gitignore ไว้):

```bash
# 1. build frontend ให้ชี้ไปที่ API ของ prod
cd frontend && VITE_API_BASE_URL=<prod URL> npm run build && cd ..

# 2. deploy ทั้งหมด (vercel.json route /api/* + prefix เปล่า -> api/index.py)
vercel deploy --prod --yes --token "$VERCEL_TOKEN"
```

การ migrate schema ไปยัง Supabase (รันจาก `backend/`):

```bash
PORTFOLIO_DB_URL=<supabase pooler URL> python -m alembic upgrade head
```

ข้อมูลลับอยู่ใน environment ของ Vercel (DEEPSEEK_API_KEY / FINNHUB_API_KEY /
FMP_API_KEY / PORTFOLIO_DB_URL) — ไม่เคยถูก commit ดูแผนและ ticket ของการย้าย
ระบบทั้งหมดได้ที่ `.scratch/vercel-supabase/` และดูงานวิจัยกับสเปกได้ที่ `docs/`

### ตัวเลือก A — Docker (สำหรับ dev เท่านั้น; bind-mount ซอร์ส, hot reload)

ต้องมี [Docker Desktop](https://www.docker.com/products/docker-desktop/)

```bash
docker compose up
```

- App: http://localhost:5173
- API: http://localhost:8000

ชุดนี้เป็น **โหมด dev**: ซอร์สโค้ดถูก bind-mount จากเครื่องคุณเข้าไปในคอนเทนเนอร์
การแก้โค้ดจึง hot-reload เหมือนรันบนเครื่องตรงๆ ทุกประการ (`uvicorn --reload`
และ dev server ของ Vite) ส่วน `backend/portfolio.db` และ `backend/.env`
ยังอยู่บนเครื่องคุณตามปกติ — คอนเทนเนอร์แค่อ่านและเขียนผ่าน mount เท่านั้น
ข้อมูลจึงไม่หายระหว่างการรันแต่ละครั้ง

การรันครั้งแรกจะ build image (ใช้เวลาสองสามนาที) หลังจากแก้
`backend/requirements.txt` หรือ `frontend/package.json` ให้ build ใหม่ด้วย:

```bash
docker compose up --build
```

หยุดด้วย `docker compose down` (หรือ Ctrl+C แล้วค่อย `docker compose down`
เพื่อลบคอนเทนเนอร์ทิ้ง)

> **หมายเหตุ (2026-08-11):** Docker ไม่ได้รัน production แล้ว มันถูกปลดระวาง
> หลังย้ายไป Vercel+Supabase (ticket 09 ของแผน) และเก็บไว้เป็น environment
> สำหรับการพัฒนาล้วนๆ

### ตัวเลือก B — รันบนเครื่องตรงๆ (สคริปต์อำนวยความสะดวกบน Windows, dev เท่านั้น)

ดับเบิลคลิก [`start-app.bat`](start-app.bat) ที่ root ของ repo — มันจะ activate
`.venv` ของ backend, สตาร์ท `uvicorn`, สตาร์ท `npm run dev` แล้วเปิดแอปใน
เบราว์เซอร์ให้ ถ้าอยากรันทีละส่วนเอง ดูขั้นตอนติดตั้งแบบ manual ได้ที่
`backend/README.md`
