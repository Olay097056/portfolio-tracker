# 08 - Task: Pending orders (แบบ B — settle ตาม tick 10 นาที)

Type: task
Status: open
Claimed:
Blocked by: 05

## Question

จากใบ 05 — user เลือก **แบบ B**: settle ตาม tick 10 นาทีเดิม **ไม่แตะ cadence cron**

**ข้อเท็จจริงที่ตรวจแล้ว**:
- `TradePendingOrder` ORM class มี (status: pending|filled|cancelled) แต่ **ไม่มีตารางจริงใน DB** — ต้อง migrate
- **ไม่มี logic เติม/settle เลย** — ต้องสร้างทั้งหมด
- AI เปิดไม้ที่ราคาตลาดทันที — ต้องให้สั่ง limit/stop ได้

## สิ่งที่ต้องทำ

1. **Migrate**: สร้าง `trade_pending_orders` จริง (create_all / ALTER — ถาม user วิธีบน Supabase prod)
2. **AI สั่งได้**: lead prompt บอกว่าเลือกได้ 3 แบบ:
   - market (เปิดทันที) — เดิม
   - limit (รอราคาแตะ target แล้ว fill)
   - stop (รอราคาแตะ trigger แล้ว fill)
   → ต้อง parse `lead_decision` รูปแบบใหม่ (เพิ่ม field `order_type`/`trigger_price`)
3. **Settle loop** ใน `run_due_turns` (tick 10 นาทีเดิม):
   - ดึง pending orders ทั้งหมด
   - เทียบราคา Hyperliquid ปัจจุบัน
   - ราคาแตะ limit/stop → fill (เปิด TradePosition) หรือ expire (เกิน expires_at)
   - ไม่แตะ → ปล่อยไว้
4. **UI**: ตาราง pending orders ในหน้า main + detail (status badge: รอเข้า/เข้าแล้ว/ยกเลิก/หมดอายุ)
5. **เทสต์**: unit test fill/expire/ไม่แตะ + migration test

## กติกา

- หยุดให้ user ตรวจก่อน commit · รันเทสต์จริงรายงานเลขจริง · ห้ามลบเทสต์เพื่อให้ผ่าน
- การ migrate บน Supabase prod ต้องถาม user ก่อน (drop/recreate หรือ ALTER)

## เกณฑ์ว่าเสร็จ

- limit order: AI สั่ง → ราคาแตะ → fill จริง (เทสต์ + user เห็นบน prod)
- หมดอายุ/ยกเลิกทำงาน · checklist 11.7 → เสร็จ
