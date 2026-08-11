# 03 - Grilling: งาน background (threads เดิม) บน serverless งบ $0 ทำงานยังไง

Type: grilling
Status: closed
Claimed: hermes/2026-08-10
Blocked by: 02

## Answer

Grilling ครบ 3 ข้อ (2026-08-10) — user ยืนยันทั้งหมด: **ทุกงาน background ไปอยู่ Supabase pg_cron ตัวเดียว** (ไม่มี piggyback)

### 1. กลไกหลัก — (ก) ล้วน: pg_cron → pg_net → POST `/api/jobs/run-due-turns`
- thread จริงที่ตรวจซ้ำเหลือ **3 จุด**: boardroom_service.py:1232 · routers/news.py:99 · trade_desk_service.py:555 (screener_refresh_manager ถูกลบไปแล้ว — ไม่มี) — ทั้ง 3 ย้ายเข้า job endpoint
- boardroom-signals settlement = **on-read อยู่แล้ว ไม่ต้อง cron**

### 2. โครงสร้าง — (ก) Job เดียว ทุก 10 นาที
- 1 cron → 1 endpoint → ภายในตรวจ due ของทุก subsystem: boardroom trigger (news impact≥70/model Δ≥8) · run_due_turns boardroom/trade-desk · news enrich (≤40/รอบ) · daily resets
- due-based ข้างใน → งานไม่ครบกำหนดข้ามไว → ปลอดภัยใน 300s

### 3. Behavior ใน tick — รับทั้ง 3 ข้อ
- **pre-warm**: tick เติม macro/market cache (Postgres cache ใบ 06) → หน้าอุ่นเสมอ (FRED ~0.6s — ถูก)
- **guard กัน overlap**: ตาราง `job_runs` lock (FOR UPDATE SKIP LOCKED / heartbeat) — tick ซ้อนข้าม
- **per-tick cap**: ≤3 เทิร์น LLM + news 40/tick + `maxDuration=300` — `run_due_turns` idempotent ต่อ tick ถัดไป

**ป้อน:** implementation → ใบ 07 (runtime port: 3 threads → job endpoint + guards) · cron setup → ใบ 08 (deploy) · cache pre-warm เกี่ยวข้องใบ 06

## งาน background ที่ต้องมีที่อยู่ใหม่

- `run_due_turns()` ของ boardroom (trigger engine) · trade-desk · boardroom-signals (ออกแบบไว้แล้วว่าย้ายขึ้น pg_cron ได้ — แผนพี่น้อง)
- news refresh · cache pre-warm (ถ้าใช้ในการ์ดจากใบ cache)
- อื่นที่เจอตอนตรวจ thread list จริง (screener_refresh_manager ถูกลบไปแล้ว — ตรวจซ้ำ)

## ตัวเลือก (แต่ละตัวมีข้อจำกัดจากใบ 02 — นำเสนอพร้อมความเห็นตั้งต้น)

> ⚠️ ข้อเท็จจริงใหม่จากใบ 02 (2026-08-10): **Vercel Hobby มี cron ได้** (100 jobs) แต่ **interval ≥ 1/วัน + แม่น ±59 นาที** เท่านั้น → งาน sub-daily (รายชั่วโมง/ราย 4-12 ชม.) **ต้องใช้ Supabase pg_cron** (แม่น 1 วิ) · และ pg_cron ไม่การันตีกัน pause 7 วัน (activity = "user" activity)

1. **pg_cron + pg_net ยิง HTTP เข้า Vercel function** — worker อยู่ฝั่ง Supabase (แม่น 1 วิ, $0) · function ถูกเรียก on-demand · เหมาะงาน sub-daily
2. **Supabase Edge Function + schedule** — ใช้ได้บน Free (500K invoc/mo) — แต่ถ้าโปรเจค pause → หยุดด้วย
3. **piggyback (เปิดหน้าแล้วรันค้าง)** — สำหรับงานทน delay · worker ตื่นเมื่อมีการใช้แอป (ช่วยกัน pause ไปในตัว — มี activity จริง)
4. **ผสม** — งานสำคัญใช้ cron, งานทนได้ใช้ piggyback · Vercel cron ใช้ได้แค่งาน daily+ทนคลาดเคลื่อน

## เกณฑ์ที่ต้องได้จาก user (HITL — ห้ามตัดสินเอง)

- งานไหนต้อง "ตรงเวลา" จริง (cron) vs ทน delay ได้ (piggyback)
- ถ้า cron+pg_net ใช้ไม่ได้บน Free → ยอม downgrade งานไหนเป็น piggyback ก่อน

## เป้าหมาย

สถาปัตยกรรมงาน background ชัด → `## Answer` → ป้อนใบ 07 (runtime port)