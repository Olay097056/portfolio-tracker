# 08 - Task: Pending orders (แบบ B) + สวิตช์หลัก — งานที่แตะฐานข้อมูล

Type: task
Status: closed
Claimed: hermes/2026-08-12
Blocked by: 05

> **ใบนี้เป็นใบเดียวที่ได้รับอนุญาตให้ migrate ฐานข้อมูล** — สวิตช์หลัก (11.5) ย้ายมาจากใบ 07
> (user ตัดสิน 2026-08-12) เพื่อรวม migration ไว้ที่เดียว ไม่แตะ Supabase prod สองรอบ

## Question

จากใบ 05 — user เลือก **แบบ B**: settle ตาม tick 10 นาทีเดิม **ไม่แตะ cadence cron**

**ข้อเท็จจริงที่ตรวจแล้ว**:
- `TradePendingOrder` ORM class มี (status: pending|filled|cancelled) แต่ **ไม่มีตารางจริงใน DB** — ต้อง migrate
- **ไม่มี logic เติม/settle เลย** — ต้องสร้างทั้งหมด
- AI เปิดไม้ที่ราคาตลาดทันที — ต้องให้สั่ง limit/stop ได้
- **สวิตช์หลัก**: `grep master_on` = 0 ทั้ง backend และ frontend — ต้องเพิ่มคอลัมน์ใหม่

## สิ่งที่ต้องทำ

0. **สวิตช์หลัก (11.5)** — ย้ายมาจากใบ 07 เพราะต้อง migrate เหมือนกัน
   - เพิ่มคอลัมน์ `master_on` (default true) ในตารางทีม
   - เช็คใน `run_due_turns` / `run_turn` — ปิดแล้วต้องไม่เปิดเทิร์นใหม่
   - **แต่ SL/TP และ settle ของไม้ที่เปิดอยู่ต้องทำงานต่อ** (ตรงต้นฉบับ `tdMasterOff`)
   - toggle ใน UI หน้า main + แสดงสถานะ
   - เทสต์: ปิดสวิตช์ → ไม่มีเทิร์นใหม่ · แต่ settle/SL/TP ยังทำงาน
1. **Migrate**: สร้าง `trade_pending_orders` จริง + คอลัมน์ `master_on`
   - **prod เป็น Postgres (Supabase) ไม่ใช่ SQLite แล้ว** — `create_all` สร้างตารางใหม่ได้ แต่ **ไม่ alter ตารางที่มีอยู่** (บทเรียนเดิมจาก `trading_signals.sparkline` ที่ต้องเขียน migration เอง)
   - `master_on` เป็นการเพิ่มคอลัมน์ในตารางที่มีข้อมูลจริงอยู่ → ต้อง `ALTER TABLE`
   - **ถาม user ก่อนรันอะไรกับ prod** — เสนอวิธีพร้อมความเสี่ยง ห้าม drop/recreate ตารางที่มีข้อมูลโดยไม่ถาม
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

## ⚠️ จุดที่พลาดแล้วแพง

**settle ต้องเป็นงานเบา — ห้ามลากเทิร์น AI มาด้วย** · tick ปัจจุบันคือ 10 นาที ถ้า settle เผลอเรียก `run_turn` ทุก tick จะได้ 144 เทิร์น/วัน แทนที่จะเป็น 4 ตามโควตา ค่า LLM บานทันที
→ settle ต้องทำแค่: ดึง pending → เทียบราคา → fill/expire → จบ · ไม่เรียก LLM เลยสักคอล
→ **เทสต์บังคับ**: settle 100 รอบแล้ว `llm_call` ต้องไม่ถูกเรียกเลย (stub แล้วนับ)

**ราคาที่ใช้ fill ต้องเป็นราคาที่แตะจริง ไม่ใช่ราคาปัจจุบัน** — ถ้าราคาวิ่งผ่าน limit ไปแล้วตอนมา settle ต้อง fill ที่ราคา limit ที่สั่งไว้ ไม่ใช่ราคาที่เห็นตอนนั้น (ไม่งั้นผลจะดีเกินจริงหรือแย่เกินจริงแบบสุ่ม)
→ ถ้าเช็คได้แค่ราคาปัจจุบัน ให้บอก user ตรงๆ ว่าเป็นการประมาณ และเขียนไว้ใน spec

## เกณฑ์ว่าเสร็จ

- limit order: AI สั่ง → ราคาแตะ → fill จริง (เทสต์ + user เห็นบน prod)
- หมดอายุ/ยกเลิกทำงาน · settle ไม่เรียก LLM (พิสูจน์ด้วยเทสต์)
- สวิตช์หลัก: ปิดแล้วหยุดเทิร์นใหม่ แต่ SL/TP ของไม้เดิมยังทำงาน
- checklist **11.5 + 11.7** → เสร็จ
