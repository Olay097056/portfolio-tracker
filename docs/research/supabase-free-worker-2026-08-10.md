# Supabase Free tier — ความสามารถของ background worker (2026-08-10)

Date: 2026-08-10
แผน: `.scratch/vercel-supabase/` (ticket 02 research) · ทุกข้อเท็จจริงจาก docs ทางการ + URL · ระดับความชัดกำกับทุกข้อ

## สรุปสั้น

- **pg_cron + pg_net + Edge Function ใช้ได้ทั้งหมดบน Free tier** (ไม่มี paid-gate) — งาน background/Scheduler **ไม่ต้องจ่าย**
- **free-tier pause 7 วันเป็นจุดคอขวดจริง** — และ **docs ไม่รับรองว่า cron เองกัน pause ได้** (นิยาม activity = "**user** database activity") → worker 24/7 แบบ best-effort ต้องมี activity จริง/จัดการเมื่อได้อีเมลเตือน
- **แก้ความเข้าใจเดิม**: Vercel Hobby **มี cron** (100 jobs) แต่ **interval ≥ 1/วัน + แม่น ±59 นาที** เท่านั้น — งานรายนาที/ชั่วโมงต้องพึ่ง **Supabase pg_cron** (แม่น 1 วินาที)

## 1. Free tier pause 7 วัน

**URL:** https://supabase.com/docs/guides/platform/free-project-pausing

- Free plan pause อัตโนมัติเมื่อ "activity ต่ำ" ในช่วง 7 วัน (เพื่อประหยัดทรัพยากร) — *"Supabase pauses Free Plan projects that show low activity over a 7-day period"*
- นิยาม activity = **"user database activity"** — โปรเจคถือว่า inactive ถ้าไม่มี "user queries" พอใน 1 สัปดาห์ — *"does not receive sufficient **user database activity** ... too few **user queries**"*
- เกณฑ์โดยประมาณ: **"a few user requests to the database each day over the previous week is enough"** — มี request จริงไม่กี่ครั้ง/วันก็พอ
- กัน pause: ① เยี่ยมโปรเจคบน Dashboard ② **สร้าง activity ผ่าน API calls / requests จากแอปที่เชื่อม**
- มีอีเมลเตือน ~1 สัปดาห์ก่อน pause · กู้คืนได้ ≤ **1 ปี** หลัง pause · **อัปเกรด Pro = ไม่ pause เลย**

## 2. ⚠️ cron ที่รันเองกัน pause ได้ไหม — "ไม่ชัดเจน/อย่าพึ่ง"

**URL เดียวกับข้อ 1**

- docs เน้นคำว่า **"user"** ซ้ำๆ (user database activity, user queries, user requests) + วิธีกัน pause ที่ระบุคือ "API calls / requests via connected app / เยี่ยม Dashboard"
- **docs ไม่เคยระบุ** ว่ากิจกรรมที่ cron/pg_net สร้างเองภายใน DB นับเป็น activity → **ไม่มีเอกสารรับรองว่าการพึ่ง cron กัน pause ได้**
- → ระดับความชัด: ⚠️ ไม่ชัดเจน/เสี่ยง — ทางปลอดภัย: มี real user traffic จริง หรือรับมืออีเมลเตือน (เยี่ยม Dashboard/API call) หรือจ่าย Pro
- **ผลต่อแผน**: worker "24/7 best-effort" → ทำงานเมื่อโปรเจค active (หรือหลังกู้); ถ้าเกิด >7 วันไร้ user activity → pause → worker หยุดจนกว่าจะ resume — นี้คือข้อจำกัดจริงของ design $0 ต้องเขียนลงในใบ grilling 03

## 3. pg_cron บน Free — ✅ ใช้ได้

**URL:** https://supabase.com/docs/guides/cron · /guides/cron/install · /guides/cron/quickstart · /guides/database/extensions/pg_cron

- **Supabase Cron = wrapper รอบ extension `pg_cron`** — เป็น scheduling engine ของ DB
- เปิดได้ผ่าน Dashboard (Integrations → Cron) หรือ SQL — **docs ไม่มี paid-gate** → ใช้ได้บน Free (ระดับความชัด: ✅ inference จากไม่มีข้อจำกัด — ไม่ใช่ statement ตรงๆ "free plan")
- รันได้ **ทุก 1 วินาที ถึง ปีละครั้ง** · รัน SQL/database function (latency 0 ภายใน DB) และ/หรือ HTTP request
- ตั้งเวลารองรับวินาทีได้ (Postgres ≥15.1.1.61)

## 4. pg_net บน Free — ✅ ใช้ได้ (HTTP ออกจาก cron)

**URL:** https://supabase.com/docs/guides/database/extensions/pg_net

- ให้ Postgres ส่ง **HTTP/HTTPS async** จาก SQL ได้ (useful ใน blocking function/trigger) — มี `http_get`/`http_post`
- **แพทเทิร์นที่ Supabase รองรับตรงๆ**: Quickstart ของ Supabase Cron เองใช้ pg_net เรียก Edge Function ทุก 30 วินาที
- ⚠️ **API ยัง beta** — function signature อาจเปลี่ยน
- การเปิดผ่าน Dashboard/SQL เหมือน extension อื่น → ใช้ได้บน Free (inference)

## 5. Supabase Edge Function schedule — ✅ ใช้ได้บน Free

**URL:** https://supabase.com/docs/guides/cron · https://supabase.com/pricing

- Edge Functions มีทุกแผนรวม Free: **Invocations 500,000/month** (เกินแล้วจ่ายเชิงนับ)
- Scheduler = Supabase Cron (pg_cron) wrapper — ไม่มี paywall
- ⚠️ ถ้าโปรเจคถูก pause (7 วันไร้ activity) → cron/Edge Function หยุดทำงานด้วย

## 6. Compute free = "Nano"

**URL:** https://supabase.com/docs/guides/platform/compute-and-disk

- Free plan = compute **Nano**: $0 · shared CPU · ≤0.5 GB RAM · **max DB 500 MB** (ข้อมูลจริงเราน้อยมาก — ข้อเท็จจริง 7 ของแผน — ฟิตสบาย)

## 7. Vercel Hobby limits (กระทบ personal app)

**URL:** https://vercel.com/docs/functions/limitations · /docs/limits · /docs/functions/configuring-functions/duration

- **Duration**: Hobby default **300s / max 300s** (5 นาที) — งานเทิร์น/FRED ยาวๆ ต้องอยู่ใต้ 5 นาที
- **Bundle size (uncompressed)**: **250 MB** (Python 500 MB) — **numpy + scikit-learn น่าจะฟิต** แต่ต้องวัดจริงใน spike (01 ข้อ ง) · Large functions (beta) ถึง 5 GB
- **Memory**: Hobby **fixed 2 GB / 1 vCPU** (ปรับไม่ได้)
- Concurrency: auto-scale ถึง 30,000
- Usage/เดือน (Hobby): Active CPU **4 CPU-hrs** · Provisioned Memory **360 GB-hrs** · Invocations **1M** · Fast Data Transfer **100 GB**
- ภูมิภาค: Hobby = **single region** (default iad1, เปลี่ยนได้)

## 8. ⚠️ แก้ความเข้าใจเดิม — Vercel Hobby มี cron

**URL:** https://vercel.com/docs/cron-jobs · /cron-jobs/usage-and-pricing

- **"Cron Jobs are available on all plans"** — รวม Hobby · **100 jobs/โปรเจค**
- แต่ Hobby จำกัด: **minimum interval = once per day** (รายนาที deploy ไม่ผ่าน) · timing precision **±59 นาที** · ไม่รับประกันเวลาแม่น
- Cron ของ Vercel เรียกผ่าน Vercel Function → **นับใน usage/quota เดียวกัน**
- → **งาน sub-daily (รายชั่วโมง/ราย 4-12 ชม. ของ turn runner/news) ต้องใช้ Supabase pg_cron** (แม่น 1 วิ) ไม่ใช่ Vercel cron · Vercel cron ใช้ได้แค่งาน daily+ทนความคลาดเคลื่อน

## ผลกระทบต่อ design (ป้อน grilling 03)

1. **Scheduler sub-daily = Supabase pg_cron** (ไม่ใช่ Vercel — Hobby แค่วันละครั้ง+คลาดเคลื่อน)
2. **worker 24/7 best-effort**: pg_cron ไม่การันตีกัน pause — ต้องมี user activity จริง/รับมืออีเมลเตือน; หลัง pause ต้อง resume (เสียเวลา ~จนกว่ามีคนปลุก)
3. **pg_net (beta) เป็นทางยิง HTTP ออกจาก cron ไปถูก Edge Function / HTTP hook** — แพทเทิร์นรองรับโดยตรง
4. **bundle**: เทคนิคัก 500MB Python budget น่าจะพอสำหรับ numpy+sklearn — spike (01 ง) ยืนยัน
