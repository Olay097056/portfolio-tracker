# 07 - Task: sub-tab "ทีมเทรด" (เขียนโค้ดจริง)

Type: task
Status: closed
Claimed: hermes/2026-08-10
Blocked by: 01, 06

## Question

ไม่มีอะไรให้ตัดสิน — สร้าง UI ตาม layout ที่ ticket 01 ขุดมา

## ⚠️ ticket นี้เขียนโค้ดจริง

หยุดให้ user ตรวจก่อน commit · รันเทสต์จริงรายงานเลขจริง · ติดขัดให้หยุดถาม

## สิ่งที่ต้องสร้าง

`frontend/src/components/tools/TradeDeskDashboard.tsx` + ต่อเป็น sub-tab ใน `BondCrisisPage.tsx`

**ข้อจำกัดดีไซน์:** ไม่มี Tailwind — inline style + `INK` palette แบบเดียวกับ `ModelsDashboard.tsx` / `SignalsDashboard.tsx`

**กราฟ:** โปรเจคนี้ไม่มี recharts — กราฟ equity ต้องเป็น **SVG ที่วาดเอง** แบบเดียวกับ equity curve ใน `SignalsDashboard.tsx` และกราฟใน `CountryDetailPage.tsx` (ดูสองไฟล์นั้นเป็นแบบ อย่าเพิ่ม dependency ใหม่)

ส่วนที่ต้องมี (copy ไทยเป๊ะๆ จากผลของ ticket 01):
1. **การ์ดสองทีม** — ชื่อ · กลยุทธ์ · รุ่น · สถานะ (ทำงาน/ภาคทัณฑ์/พัก — ตามที่ ticket 04 ตัดสินว่าเอาอะไรบ้าง) · Equity · ทุน · เงินสด · กำไร/ขาดทุน
2. **กราฟ equity เทียบสองทีม** — มุมมองตามที่ ticket 01 พบ (%/USD/rebase/PnL) เอาเท่าที่จำเป็น ไม่ต้องครบทุกโหมดถ้าไม่ได้ใช้
3. **ไม้ที่เปิดอยู่** — สินทรัพย์ · ทิศทาง · ขนาด · ราคาเข้า → ปัจจุบัน · P&L · SL/TP
4. **ไม้ที่ปิดแล้ว** + สถิติรวม (reuse รูปแบบจาก `SignalsDashboard` ได้)
5. **สวิตช์หลัก** — พร้อมข้อความต้นฉบับ: *"สวิตช์หลักปิดอยู่ — ทีมจะไม่เปิดเทิร์นเทรด (ราคา/ข้อมูลยังอัปเดต และ SL/TP/liq ของไม้ที่เปิดอยู่ยังทำงานปกติ)"*
6. **โควตาเทิร์น** — เหลือกี่เทิร์น รีเซ็ตเมื่อไหร่ (`tdTurnQuotaReset` / `tdNextTurn`)
7. **ตัวนับต้นทุน LLM** — แสดงจำนวนคอล + tokens ให้ user เห็น (user จ่ายเอง ควรเห็นตลอด)
8. **เหตุผลของแต่ละไม้** — กดดูได้ว่าทีมคิดยังไงตอนเปิด (นี่คือคุณค่าหลักของฟีเจอร์ ไม่ใช่ตัวเลข P&L)
9. **🚫 disclaimer เด่นชัด** — *"พอร์ตจำลอง ไม่ใช่การเทรดจริง ไม่มีการส่งคำสั่งไปตลาดใดๆ และไม่ใช่คำแนะนำการลงทุน"* (หลักห้ามละเมิดข้อ 1 + 3)
10. **ความสดของราคา** — ตามที่ ticket 05 ตัดสิน

## เทสต์ (`TradeDeskDashboard.test.tsx`)
- render สองทีมจาก fixture + กราฟไม่พังเมื่อข้อมูลว่าง
- สวิตช์หลักปิด → ปุ่มเปิดเทิร์นถูก disable + แสดงข้อความ
- โควตาหมด → ปุ่มถูก disable + บอกเวลารีเซ็ต
- ไม้เปิด/ปิดแสดงถูกกลุ่ม, P&L สีถูก
- ราคาดึงไม่ได้ → "—"
- **disclaimer ต้องแสดงเสมอ** (เทสต์ยืนยัน — ไม่ใช่แค่ใส่ไว้)

## Answer

**สร้างเสร็จ + เทสต์ผ่านจริง (2026-08-10) — ยังไม่ commit รอ user ตรวจตามกติกาแผน**

### ไฟล์ที่สร้าง/แก้
| ไฟล์ | เนื้อหา |
|---|---|
| `frontend/src/components/tools/TradeDeskDashboard.tsx` | 🔑 sub-tab ทีมเทรด 10 section ตาม ticket: การ์ด 2 ทีม (equity/ทุน/เงินสด/margin/MTD/เป้าสัปดาห์) · กราฟ equity SVG วาดเอง (ไม่ใช้ recharts) · ไม้เปิด/ไม้ปิด + P&L สี · สวิตช์หลัก + ข้อความต้นฉบับ tdMasterOff · โควตาเทิร์น + "หมดโควตา" · ตัวนับต้นทุน LLM (ต่อทีม + รวม + วันนี้) · เหตุผลหัวหน้าต่อเทิร์น (คุณค่าหลัก) · ปุ่ม "เปิดเทิร์นเลย" (disable เมื่อสวิตช์ปิด/โควตาหมด) · 🚫 disclaimer เด่นชัด · polling 90s |
| `frontend/src/pages/BondCrisisPage.tsx` | tab `ทีมเทรด` + union type |
| `frontend/src/api/types.ts` + `client.ts` | TradeDeskState/TradeTeamView/TradePositionView + getTradeDeskState/runTradeDeskTurn/setTradeDeskSettings |
| `backend/app/trade_desk_service.py` | ขยาย `build_state`: closed_positions (20) + turns (10 — cost/tokens/lead decision) + cost_today/total — ตาม requirement ข้อ 4/7/8 |
| `frontend/src/components/tools/TradeDeskDashboard.test.tsx` | **8 เทสต์** ตามข้อบังคับ ticket |

### ตัวเลขเทสต์จริง
- TradeDeskDashboard: **8 passed** · frontend full: **611 passed | 16 skipped** (74 files) · **tsc 0 error** · backend: **521 passed** · hermes verify **ok: true**

### ข้อบังคับ ticket ครบ
- [x] render 2 ทีม + กราฟไม่พังเมื่อว่าง · [x] สวิตช์ปิด → ปุ่ม disable + ข้อความต้นฉบับ · [x] โควตาหมด → ปุ่ม disable + ตัวเลข
- [x] ไม้เปิด/ปิดแยกกลุ่ม + P&L สีถูก (เทสต์ตรวจ rgb จริง) · [x] ราคาไม่ได้ → "—" · [x] **disclaimer แสดงเสมอ (เทสต์ยืนยัน)**
- [x] เหตุผลแต่ละไม้ (lead_decision.reason แสดงบนการ์ด) · [x] ต้นทุน LLM (คอล tokens + $) · [x] ความสดราคา: โชว์เวลาอัปเดต header

### หมายเหตุ
- ราคาปัจจุบันของไม้เปิดยังไม่แสดง P&L สดต่อไม้ (backend ไม่คืน mark/current ต่อ position — แสดง entry + SL/TP + "ดูในทีม") — เพิ่มได้ใน backlog (คืน mark ใน state) — ticket 08 ตัดสิน
- กราฟ equity เป็น "เส้นสุดท้าย + จุด" (backend ไม่มี snapshots ต่อจุดใน state — มีตาราง trade_snapshots แล้ว ใช้ขยายทีหลัง)
