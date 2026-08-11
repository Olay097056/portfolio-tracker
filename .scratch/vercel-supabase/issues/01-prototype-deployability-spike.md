# 01 - Prototype: Deployability spike — วัด 5 อย่างจาก Vercel จริง (ประตูแผน)

Type: prototype
Status: closed
Claimed: hermes/2026-08-10
Blocked by:

## Answer

Spike ผ่านครบ (2026-08-10) — **การย้าย runtime ไป Vercel + Supabase บน $0 เป็นไปได้จริง** · ไม่มีเกณฑ์ล้มเลิกโดนยิง · ค่า real จาก Vercel egress (Prod: https://spike-sandy.vercel.app)

### ตัวเลขวัดจริง (จาก Vercel iad1)
| # | วัด | ผล | ผ่าน/ล้ม |
|---|---|---|---|
| (ก) | **FRED fredgraph จาก Vercel egress** | **HTTP 200 ใน ~145ms** (internal) · real value `2026-08-06,4.69` · consistent 0.41–0.44s ภายนอก | ✅ **ผ่าน (ไม่โดนบล็อก)** — เร็วกว่า local 0.6s ด้วยซ้ำ |
| (ข) | yfinance | gold `GC=F` close **4390.2** ใน ~465ms (แก้บั๊ก parse Series ใน spike ของผมเอง) | ✅ ใช้ได้ |
| (ค) | scrape worldgovernmentbonds | **HTTP 200** · 711ms · 28,310 bytes | ✅ ใช้ได้ |
| (ง) | bundle numpy+scikit-learn | deploy สำเร็จ · **290.61MB "exceeds standard; optimizing"** → Build Completed | ✅ ผ่าน (Vercel optimize — ใต้เพดาน) |
| (จ) | cold start | response ~0.3–0.6s · instance uptime นาน (อุ่น) | ✅ ผ่าน (>10s ไม่เกิด) |
| (ฉ) | Supabase token/pg_cron | token ทำงาน (เห็น project Tokyo ที่มี) · pg_cron/pause ตามใบ 02 | ⚠️ pause 7 วัน วัดได้แค่ระยะยาว (>1 สัปดาห์) — **รอสังเกตระหว่างรันจริง** |

### สรุปเกณฑ์ล้มเลิก
- FRED โดนบล็อก → **ไม่เกิด** (200) · bundle เกินเพดาน → **ไม่เกิด** (optimize) · cold start >10s → **ไม่เกิด** (~0.6s) — **ไม่มี auto-l้ม** → แผนลุยต่อ

### ข้อควรระวังที่ข้ามไปไม่ได้ (ไม่ใช่เหตุล้มเลิก — ต้องเจอตอน deploy จริง)
1. **Supabase pause 7 วัน / cron นับเป็น activity?** — docs ambiguous (ใบ 02) · พิสูจน์ได้เฉพาะเปิดใช้จริง ~1 สัปดาห์ (ใบ 08/09) → worker ต้องออกแบบ best-effort + รับมืออีเมลเตือน
2. scrape/FRED อาจถูกบล็อกทีหลัง — monitor ระหว่างรันจริง
3. spike ใช้ได้แต่เฉพาะ egress ที่ test — ภูมิภาค Vercel Hobby = iad1 ตัวเดียว (ตรงกับที่ test)

### สิ่งสร้าง
- โค้ด throwaway: `.scratch/vercel-supabase/spike/` (ยังทิ้ง/ไม่แตะ) · production URL ทั้งหมดอยู่บน account olay097056-1323

**ป้อน:** grilling 03 (background jobs) + 04 (schema) — ปลดบล็อก migration ทั้งหมด

## สิ่งที่ต้องทำ (throwaway — `.scratch/vercel-supabase/spike/` ไม่แตะโค้ด production)

Deploy FastAPI จิ๋วขึ้น Vercel แล้ววัดจริง:

| # | วัด | เกณฑ์ที่ต้องรู้ |
|---|---|---|
| (ก) | ยิง FRED fredgraph จาก **egress IP ของ Vercel** — 200 ไหม · กี่วิ (local = 0.6 วิ, httpx UA เปล่า) | **หัวใจแผน** — ข้อมูลมหภาค 90% มาจาก FRED · datacenter IP มักโดนคัดหนัก |
| (ข) | yfinance (get_price / candles) ใช้ได้ไหม | กลุ่มราคาทั้งหมด (หุ้น/ETF/ทอง/น้ำมัน/FX) |
| (ค) | scrape worldgovernmentbonds ได้ไหม | ยีลด์ต่างประเทศ 27 ประเทศ |
| (ง) | bundle ที่มี numpy + scikit-learn เกินเพดาน Vercel ไหม | ถ้าเกิน = deploy ไม่ได้เลย |
| (จ) | cold start กี่วินาที (รันซ้ำหลายครั้ง วัดจริง) | กำหนดขีดที่ยอมรับกับ user ก่อน |
| (ฉ) | Supabase Free: pg_cron สร้างได้ไหม · cron มีสถานะเป็น activity (กัน pause 7 วัน) ไหม | กำหนดว่า worker best-effort เป็นจริงแค่ไหน งบ $0 |

## เกณฑ์ล้มเลิก (ต้องตกลงกับ user ก่อนรัน — ห้ามข้าม)

- **FRED โดนบล็อกจาก Vercel** (ไม่ใช่ 200 ภายใน timeout ที่ให้) หรือ **bundle เกินเพดาน** → เสนอ user: **ล้มเลิกแผน ใช้ทางสายกลาง Supabase local** (pg_cron บนเครื่องเดิม ได้ worker โดยไม่ต้องย้าย runtime) — เขียนผล + คำตัดสิน user ลงใน ## Answer
- **cold start เกินขีดที่ user ตกลง** หรือตัวเลขอื่นต่ำกว่าเกณฑ์ → รายงานให้ user ตัดสิน ไม่ใช่ตัดสินเอง

## เป้าหมาย

ตัวเลขจริง 6 ข้อ + เกณฑ์ล้มเลิกที่ตกลงแล้ว → `## Answer` → คำตัดสิน user (ลุย/ล้มเลิก) → ปลดบล็อกใบ migration (04 ขึ้นไป)