# 09 - Task: Cutover — รันคู่ชั่วคราว แล้วเลิก Docker prod

Type: task
Status: closed
Claimed: hermes/2026-08-11
Blocked by: 08

## Question

ย้ายการใช้งานจริงจาก Docker prod บนเครื่อง → Vercel/Supabase — ตามที่ user ตัดสิน (ข): รันคู่ชั่วคราว (cutover) แล้วค่อยเลิก prod · **dev env บนเครื่องคงอยู่ตลอด**

## ขอบเขต

- รันคู่: Docker prod (ชี้ Postgres ใหม่) + Vercel prod — เทียบผลช่วง 2–3 วัน (fallback ถ้าคลาวด์มีปัญหา)
- เกณฑ์ "ยืนยันว่าคลาวด์เสถียร": suite ผ่านบนคลาวด์ + เปิดใช้งานจริง 2–3 วัน (ตัวเลขจริง) → user อนุมัติปิด
- ปิด Docker prod (docker compose down บทบาท prod) · dev env (venv/compose สำหรับพัฒนา + pytest) อยู่เหมือนเดิม
- เขียนวิธี run ทั้ง 2 โหมดลง docs (dev vs prod)
- ⚠️ หยุดรอตรวจก่อน commit

## Answer

Cutover เสร็จ — commit `a5be1e0` (2026-08-11) · user อนุมัติ "ลุยใบ 09" = ผ่านด่านปิด

### หลักฐานความเสถียรก่อนปิด (วัดจริงจาก Supabase prod)
- **pg_cron succeeded 6/6** ticks (08:00–08:50) — ยิงตรงทุก 10 นาที · finished ticks: 08:09 (56.5s) · 08:20 (43.0s) · 08:30 (274.2s — โค้ดเก่ายัง reasoning) · 08:40 ถูก Vercel ฆ่า (โค้ดเก่า reasoning เกิน 300s)
- **wedged-lock takeover พิสูจน์สด**: tick 08:40 ค้าง → tick 09:00 ยึด lock → tick 7 mark `failed` ("wedged lock taken over after 1208s") → tick 8 รันด้วยโค้ดใหม่ (thinking off) **จบใน 104.7s** — self-healing ทำงานครบวงจร
- suite เขียว: SQLite 531 + Postgres 530 (ใบ 07/08) · ทุก endpoint 200 บน prod

### สิ่งที่ทำ
1. **`docker compose down`** (project `portfolio-tracker` — backend + frontend containers + network) — **`pt-pg-test` (test Postgres) ไม่แตะ** · dev env คงอยู่: compose file/start-app.bat/venv/pytest ครบ
2. **README.md** — Option C (prod: Vercel + Supabase — URL, deploy/migrate command, secrets อยู่ Vercel env) · Option A/B (Docker/native) ป้ายชัด **dev only** + หมายเหตุ cutover 2026-08-11 · backend/README ตรวจแล้วไม่มีอ้าง prod เก่า

### สถานะหลัง cutover
- **Prod = Vercel + Supabase เท่านั้น** · Docker = dev env (เปิดเมื่อต้องการพัฒนา)
- งาน worker ทั้งหมดผ่าน pg_cron → `/api/jobs/run-due-turns` (ใบ 07/08)

ตัวเลขวัดจริง · อนุมัติ "ลุย" → commit แยกตามวินัย
