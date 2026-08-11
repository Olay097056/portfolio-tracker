# 02 - Research: Supabase Free tier รองรับ worker 24/7 best-effort แค่ไหน

Type: research
Status: closed
Claimed: hermes/2026-08-10
Blocked by:

## Answer

Research เสร็จ 2026-08-10 — doc: `docs/research/supabase-free-worker-2026-08-10.md` (ทุกข้อมี URL ทางการ)

### สรุป (ระดับความชัดกำกับ)
- **pg_cron / pg_net / Edge Function ใช้ได้ทั้งหมดบน Free tier** (ไม่มี paid-gate — inference จากไม่มีข้อจำกัด) — Scheduler ไม่ต้องจ่าย
- **free-tier pause 7 วัน = คอขวดจริง** — docs นิยาม activity = "**user** database activity"; **docs ไม่รับรองว่า cron/pg_net ที่รันเองกัน pause ได้** → worker best-effort ต้องมี user activity จริง/รับมืออีเมลเตือน (เยี่ยม Dashboard/API call)
- **แก้ความเข้าใจเดิม**: Vercel Hobby **มี cron** (100 jobs, all plans) แต่ **interval ≥ 1/วัน + แม่น ±59 นาที** → งาน sub-daily ต้องใช้ **Supabase pg_cron** (แม่น 1 วิ)
- pg_net (API beta) = แพทเทิร์นรองรับโดยตรง (Supabase cron quickstart ใช้เรียก Edge Function)
- Compute Nano: ≤0.5GB RAM · max DB 500MB — ข้อมูลเราน้อย ฟิต
- Vercel Hobby: duration 300s max · bundle 250MB (Python 500MB — numpy+sklearn น่าจะพอ ต้องวัด spike) · 2GB/1vCPU · quota 4 CPU-hrs/360GB-hrs/1M invoc/100GB · single region

### ผลต่อแผน
1. Scheduler sub-daily = **Supabase pg_cron** (Vercel cron แค่วันละครั้ง)
2. worker 24/7 best-effort → ไม่พึ่ง cron กัน pause แต่ต้องมี activity/รับมือเตือน
3. pg_net (beta) = ทางยิง HTTP ออกจาก cron
4. bundle น่าจะพอ แต่ spike (01 ง) ยืนยัน

**ป้อน grilling 03** (background jobs) + **spike 01** (วัด bundle/pause จริง)

## สิ่งที่ต้องหาคำตอบ (อ่าน docs ทางการ — ไม่เดา)

1. **Free tier pause 7 วัน**: เงื่อนไขเป๊ะ — อะไรนับเป็น "activity" (เรียก API? DB connection? scheduled job เอง?) · cron ที่ทำงานทุกวันช่วยกัน pause ไหม
2. **pg_cron บน Free tier**: เปิดใช้ได้ไหม (extension บังคับ?) · มีข้อจำกัดไหม
3. **pg_net**: HTTP ออกจาก cron (extension) ได้ไหมบน Free — ใช้ยิงเข้า Vercel function ได้ไหม
4. **Supabase Edge Function schedule** — schedule/trigger ของ Edge Function ต้อง paid tier ไหม
5. **Vercel Hobby ข้อจำกัดที่กระทบ personal app**: function (duration/ขนาด bundle/bandwidth/GB-hrs) · ภูมิภาค · ไม่มี cron (ต้องรู้ไว้ เพราะ worker ต้องอยู่ฝั่ง Supabase)

## เป้าหมาย

`docs/research/supabase-free-worker-2026-08-10.md` (สรุป + URL) → `## Answer` → ป้อน grilling 03 (สถาปัตยกรรมงาน background) — AFK รันได้ขนานกับ spike (01) — ไม่ต้องรอ