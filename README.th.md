*[English](README.md) · ภาษาไทย*

# Portfolio Tracker

เว็บแอปสำหรับบริหารพอร์ตหุ้นและ ETF อเมริกา — ดูสถานะการถือครองพร้อมราคาเรียลไทม์,
สแกนหาสัญญาณจาก watchlist, เครื่องคำนวณวางแผนล่วงหน้า และชั้น AI analyst —
สร้างขึ้นบนกฎข้อเดียวคือ **ห้ามแสดงตัวเลขที่แอปอธิบายที่มาไม่ได้**

### ▶ [เปิดแอปตัวจริง](https://portfolio-tracker-taupe-two.vercel.app)

รันอยู่บน production จริงที่ Vercel + Supabase ใช้ข้อมูลตลาดจริง ไม่ใช่ข้อมูลจำลอง

## แนวคิด

เครื่องมือดูพอร์ตส่วนใหญ่ตอบคำถาม "ตอนนี้เราเป็นยังไง" ด้วยคะแนนตัวเดียวที่ดูน่าเชื่อถือ
โปรเจกต์นี้ก็เริ่มแบบนั้นเหมือนกัน — จนกระทั่งเอาคะแนนนั้นไปวัดกับผลลัพธ์จริงที่เกิดขึ้น
แล้วพบว่ามัน **ไม่มีอำนาจในการทำนายอะไรเลย** แทนที่จะปรับน้ำหนักไปเรื่อยๆ จนตัวเลขดูดีขึ้น
คะแนนนั้นถูกทิ้ง แล้วแทนที่ด้วยสองอย่างที่วางเทียบกัน:

- **logistic regression ที่ fit กับผลลัพธ์ในอดีตจริง**
  (`backend/app/backtest/model_fit.py`) ซึ่งรายงานความแม่นยำของตัวเองอย่างเปิดเผย
  รวมถึงตอนที่ความแม่นยำนั้นไม่ได้น่าประทับใจ และ
- **LLM analyst** ที่เขียนอ่านสถานการณ์เดียวกันออกมาเป็นภาษาคน

ความเห็นอิสระสองชุดที่ผู้ใช้เถียงกลับได้ ดีกว่าตัวเลขเดียวที่ฟังดูขลังแต่ไม่เคยถูกตรวจสอบ

หลักการนี้ถูกบังคับใช้ด้วยโครงสร้าง ไม่ใช่ด้วยความตั้งใจดี — หน้า scanner แสดงผลเป็น
**raw signal** คือหนึ่งการวัด หนึ่งแหล่งที่มาที่ตามรอยได้ หนึ่งคอลัมน์ที่เรียงลำดับได้
และถูกห้ามตามสัญญาไม่ให้ยุบรวมเป็นคะแนนก้อนเดียว
(`docs/adr/0005-no-composite-scores-or-subjective-tags-in-scanners.md`)
ถึงขั้นที่ glossary ของโปรเจกต์ห้ามใช้คำว่า *score* กับอะไรก็ตามที่ยังไม่มีน้ำหนักที่ผ่านการตรวจสอบ

## มีอะไรอยู่ในนั้นบ้าง

- **พอร์ตและการถือครอง** — รองรับหลายพอร์ต, ราคาเรียลไทม์, กราฟโดนัทสัดส่วนสินทรัพย์,
  กำไรขาดทุนรายตัว, กราฟ TradingView
- **Scanner บน watchlist** — momentum, pre-squeeze (ความผันผวนที่หดตัวเทียบกับ
  ประวัติ*ของตัวมันเอง* ไม่ใช่เทียบกับหุ้นตัวอื่น), จัดอันดับปันผล, market breadth,
  หุ้นที่กำลังมาแรง
- **เครื่องคำนวณวางแผน** — DCA (ทั้งแบบคำนวณต้นทุนเฉลี่ยใหม่ และแบบฉายภาพ
  ทบต้นหลายปี), position sizing, stress test, คิดเป็นเงินบาทตรงๆ ในจุดที่ผู้ใช้คิดเป็นบาท
- **ชั้น AI analyst** — บทวิเคราะห์เชิงบรรยาย, ค้นประวัติรูปแบบ ("N ครั้งล่าสุดที่เกิด
  สถานการณ์แบบนี้ ผลออกมาเป็นยังไง"), คำเตือนเมื่อใกล้วันประกาศงบ
- **บริบทมหภาคและตลาด** — fear/greed, อัตราแลกเปลี่ยน, CME, ข้อมูลระดับประเทศ
  และเศรษฐกิจมหภาค
- **Background worker** — งานตามตารางเวลา พร้อมตัวล็อกกันรันซ้อน และการยึดงาน
  ที่ค้างมารันต่อโดยอัตโนมัติ

## หมายเหตุเชิงวิศวกรรม

- **24 backend services** อยู่หลัง FastAPI app ที่ deploy เป็น serverless function
- **ไฟล์เทส 132 ไฟล์** (frontend 75, backend 57) วางไว้ข้างโค้ดที่มันทดสอบ
- **ADR 7 ฉบับ** ใน `docs/adr/` บันทึกการตัดสินใจที่การแก้ไขในอนาคตต้องไม่ย้อนกลับแบบเงียบๆ
- Deploy บน Vercel + Supabase Postgres โดย worker รันบน `pg_cron`

## เทคโนโลยีที่ใช้

ฝั่ง backend เป็น FastAPI + SQLAlchemy + Alembic; ฝั่ง frontend เป็น
React + TypeScript + Vite; ฐานข้อมูลเป็น Postgres (Supabase) บน production
และ SQLite สำหรับการพัฒนาบนเครื่อง ดูรายละเอียดเฉพาะฝั่ง backend
(environment variables, การรันเทส) ได้ที่ `backend/README.md`

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
