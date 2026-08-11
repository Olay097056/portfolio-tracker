# 07 - Task: sub-tab "ห้องประชุม" (เขียนโค้ดจริง)

Type: task
Status: closed
Claimed: hermes/2026-08-09
Blocked by: 01, 06

## Question

ไม่มีอะไรให้ตัดสิน — สร้าง UI ตาม layout ที่ ticket 01 ขุดมา ด้วยดีไซน์ระบบของแอปเรา

## ⚠️ ticket นี้เขียนโค้ดจริง — กติกาเดียวกับ ticket 06

หยุดให้ user ตรวจก่อน commit · รันเทสต์จริงรายงานเลขจริง · ติดขัดให้หยุดถาม

## สิ่งที่ต้องสร้าง

`frontend/src/components/tools/BoardroomDashboard.tsx` + ต่อเป็น sub-tab ใบที่ 8 ใน `BondCrisisPage.tsx`

**ข้อจำกัดดีไซน์ (ตรวจแล้ว):** แอปนี้ **ไม่มี Tailwind** — ต้นฉบับใช้ Tailwind ล้วน การมิเรอร์คือการแปล ไม่ใช่ก๊อป ใช้ inline style + `INK` palette แบบเดียวกับ `ModelsDashboard.tsx` / `SignalsDashboard.tsx` / `ForecastDashboard.tsx`

ส่วนที่ต้องมี (จาก i18n ต้นฉบับ — copy ไทยเป๊ะๆ อยู่ในผลของ ticket 01):
1. **กำลังประชุมสด** / **การประชุมย้อนหลัง** — สองส่วน
2. **เปิดประชุม** — ช่องพิมพ์วาระ + ปุ่ม (placeholder: *"พิมพ์วาระ/โจทย์ให้ทีม AI ไปหาข้อมูลมาถกกัน เช่น 'ทองคำจะไปต่อไหมหลัง CPI ออก'..."*)
3. **ตัวบอกเฟส** 7 ขั้น + สถานะ (กำลังประชุม/เสร็จสิ้น/ล้มเหลว/ยกเลิก) + ปุ่ม "ประชุมต่อ"
4. **มติที่ประชุม** — ข้อสรุปที่พิสูจน์แล้ว / ข้อที่ยังฟันธงไม่ได้ / จับตา / คาดการณ์อนาคต / ฉบับวิเคราะห์เต็ม / จุดยืนรายสินทรัพย์
5. **ผลตรวจสอบข้อกล่าวอ้าง** — ป้าย 3 สี (ผ่านการพิสูจน์ / ขัดกับข้อมูลจริง / ตรวจไม่ได้)
6. **สมองส่วนกลาง** + **สถิติรายที่นั่ง** — ตามที่ ticket 05 ตัดสิน (ถ้าตัดทิ้ง ก็ไม่ต้องมี)
7. **ตัวนับต้นทุน** — แสดง `llm_calls / tokens` ของแต่ละประชุมให้ user เห็น (ต้นฉบับเก็บไว้ เราแสดงให้เห็นเลยจะดีกว่าเพราะ user จ่ายเอง)
8. **empty state**: *"ยังไม่มีการประชุม — ระบบจะเปิดวาระเองเมื่อมีข่าวแรง ตัวเลขโมเดลขยับ หรือประกาศข่าวแดง"*
9. **disclaimer** — มติไม่ใช่คำแนะนำการลงทุน (หลักห้ามละเมิดข้อ 3)

**การแสดงประชุมที่กำลังรัน**: ตามที่หมอก "การประชุมรันนานแค่ไหน" คลี่ออกจาก ticket 03 — ถ้ารันนานต้องมี polling/streaming ถ้าเร็วก็รอแล้วแสดงทีเดียว

## เทสต์ (`frontend/src/components/tools/BoardroomDashboard.test.tsx`)
- render รายการประชุม + มติจาก fixture
- ป้ายผลตรวจสอบ 3 แบบแสดงถูกสี
- empty state แสดงเมื่อไม่มีประชุม
- ปุ่มเปิดประชุมเรียก API ถูก + ปิดปุ่มระหว่างรอ
- ประชุมสถานะ `failed` แสดง error + ปุ่มประชุมต่อ

## Answer

**สร้างเสร็จ + เทสต์ผ่านจริง (2026-08-09) — ยังไม่ commit รอ user ตรวจตามกติกาแผน**

### ไฟล์ที่สร้าง/แก้ (frontend + 1 field backend)
| ไฟล์ | เนื้อหา |
|---|---|
| `frontend/src/components/tools/BoardroomDashboard.tsx` (ใหม่, ~800 บรรทัด) | Tab "ห้องประชุม AI" ครบ 9 ข้อ: กำลังประชุมสด/ย้อนหลัง · เปิดประชุม (textarea+ปุ่ม) · stepper เฟส · มติ (proven/unproven/watch/outlook/เต็ม/จุดยืน) · ผลตรวจสอบข้อกล่าวอ้าง 3 สี · สถิติข้อกล่าวอ้างรายที่นั่ง (ประชุมนี้ + disclosure cold-start ตาม ticket 05) · ตัวนับ llm_calls/tokens · empty state (copy แก้ตาม 08 — ตัด "ข่าวแดง") · disclaimer · polling 10s/3s · md renderer เล็กๆ (ตาราง/list/quote) |
| `frontend/src/components/tools/BoardroomDashboard.test.tsx` (ใหม่) | 5 เทสต์ (รายการ/empty/เปิดประชุม/มติ+ป้าย/ล้มเหลว+resume) — client mock 100% |
| `frontend/src/api/types.ts` + `client.ts` | + 4 ฟังก์ชัน boardroom + 7 types |
| `frontend/src/pages/BondCrisisPage.tsx` | + sub-tab ใบที่ 8 "ห้องประชุม" |
| `backend/app/routers/boardroom.py` (แก้เล็ก) | `MeetingOut` + `turn_plan` (stepper ต้องใช้ — UI contract) |

### เลขเทสต์จริง (รันสด 2026-08-09)
- `vitest run src/components/tools/BoardroomDashboard.test.tsx` → **5 passed**
- `vitest run` (ทั้ง frontend) → **72 files / 596 passed** (16 skipped เดิม)
- `pytest tests/` (backend) → **481 passed** (ไม่แตะงานเดิม)
- `npx tsc --noEmit` → สะอาด (0 error)
- `hermes verify --json` → **ok: true** (docker compose build + readiness)

### ครอบคลุมตาม ticket
1. ✅ รายการประชุม + มติจาก fixture (render มติ/จุดยืน/verification)
2. ✅ ป้ายผลตรวจสอบ 3 แบบ (ผ่าน/ขัด/ตรวจไม่ได้ — group header สี + ป้ายข้อกล่าวอ้าง)
3. ✅ empty state เมื่อไม่มีประชุม
4. ✅ ปุ่มเปิดประชุมเรียก API ถูก ({agenda, trigger_type:'manual', mode:'full'}) + ปิดปุ่มเมื่อวาระว่าง + ปิดระหว่างรอ (anyRunning)
5. ✅ failed → แสดง error + ปุ่ม "ประชุมต่อ" เรียก resume API

### หมายเหตุ design (ตัดสินเอง — อิง ticket 01/05/08)
- **สถิติรายที่นั่ง**: แสดง "สถิติข้อกล่าวอ้าง (ประชุมนี้)" คำนวณ client-side จาก claims ของประชุมที่เลือก — หน้าสถิติรวมทุกประชุมยังไม่มี endpoint (ตาราง seat_stats อยู่ใน DB แล้ว) — บันทึกเป็น backlog ไว้ต่อใน ticket 10 หรือใบใหม่
- **สมองส่วนกลาง (memory/knowledge)**: UI ยังไม่มี — ต้องมี endpoint ใหม่ (GET /api/boardroom/memory, /knowledge) — เดียวกับสถิติรวม (backlog)
- polling: list 10s (ประชุมรัน) / 30s (นิ่ง) · detail 3s ขณะดูประชุมที่รัน — ตามต้นฉบับ
- md renderer: subset ที่โมเดลเขียนจริง (หัวข้อ/ลิสต์/ตาราง/quote/bold) — ไม่พึ่ง library ใหม่

**ส่งต่อ:** ticket 10 (trigger engine) ได้ `trigger_type`/`mode` field + แถบแจ้ง "ชนเพดาน" (ยังไม่ทำ UI — รอ backend คืน `today_meetings`/`trigger_log_today`)

**⛔ ยังไม่ commit — รอ user ตรวจโค้ดก่อน (กติกาข้อ 1 ของแผน)**
