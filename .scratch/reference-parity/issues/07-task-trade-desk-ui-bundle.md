# 07 - Task: Trade Desk UI bundle (equity graph + quota + directive + prompt viewer)

Type: task
Status: closed
Claimed: hermes/2026-08-12
Blocked by: 05

> **ขอบเขตของใบนี้ = ไม่แตะ schema เลย** — สวิตช์หลัก (11.5) ย้ายไปใบ 08 แล้ว (user ตัดสิน 2026-08-12)
> เพราะมันต้อง migrate ตารางบน Supabase prod ซึ่งเป็นงานคนละชนิดกับ UI และใบ 08 ต้อง migrate อยู่แล้ว
> — รวม migration ไว้ที่เดียวดีกว่าแตะ prod สองรอบ
>
> **ถ้าระหว่างทางพบว่าต้องเพิ่ม/แก้คอลัมน์ ให้หยุดถาม** อย่าแอบ migrate ในใบนี้

## Question

จากใบ 05 (user ตัดสินแล้ว) — 4 อย่างที่ทำได้โดยไม่แตะฐานข้อมูล:

1. **กราฟ equity** (11.4) — ทีมเดียว · โหมด % กำไร + $ equity · ช่วง 24h/7d/30d
   - backend มีแล้ว: `GET /api/trade-desk/team/DEEPSEEK/equity?days=30` + `trade_snapshots` มีข้อมูล
   - เคยมีกราฟถูกลบใน commit `3cf88fe` — เอากลับเป็น UI ใหม่ใน TradeDeskDashboard
2. **โควตาเทิร์น + เทิร์นถัดไป** (11.6) — UI ล้วน
   - backend บังคับจริงแล้ว (`DAILY_CAP_DEFAULT=4` ใน run_due_turns) · `turns_today`/`next_turn_at` มีใน state
   - UI: ตัวนับ "เทิร์นวันนี้ X/4" + countdown "เทิร์นถัดไปใน HH:MM:SS" + ปุ่ม "⚡ สั่งเทิร์นเดี๋ยวนี้" (มีใน TeamDetailPage อยู่แล้ว — เอามาที่หน้า main ด้วย)
3. **คำสั่งโต๊ะกลาง directive** (11.9) — UI + ต่อสาย
   - backend: คอลัมน์ + POST + state มี · **แต่ `_build_base_context` ไม่ป้อน directive/mandate เข้า prompt** — ต่อเข้าไป (10 บรรทัด)
   - UI: ช่องแก้ directive ในหน้า main + แสดงคำสั่งปัจจุบัน
4. **"ดู prompt เต็ม"** ต่อ analyst (ใบ 05 ข้อ 8) — TeamDetailPage: คลิก analyst → ขยาย prompt เต็ม (ข้อมูลมีแล้วใน `analyst_prompts`) · **hit rate + ledger = ทีหลัง** (รอไม้ปิดจริง)

## กติกา

- หยุดให้ user ตรวจก่อน commit · รันเทสต์จริงรายงานเลขจริง · ห้ามลบเทสต์เพื่อให้ผ่าน
- ทุกจุดที่เพิ่ม UI ต้องมีเทสต์เฝ้า (ล้มถ้าของหาย)
- **ห้ามแตะ schema** — ถ้าติดว่าต้องเพิ่มคอลัมน์ ให้หยุดถาม (สวิตช์หลักอยู่ใบ 08)

## จุดที่พลาดง่ายในใบนี้

- **กราฟ**: โปรเจคไม่มี recharts — ต้องวาด SVG เอง แบบเดียวกับ equity curve ใน `SignalsDashboard.tsx` และกราฟใน `CountryDetailPage.tsx` · **ห้ามเพิ่ม dependency**
- **countdown**: `next_turn_at` มาจาก server เป็น UTC — ต้องแปลงเป็นเวลาท้องถิ่นก่อนนับถอยหลัง และต้องไม่พังเมื่อค่าเป็น null หรือเลยเวลาไปแล้ว (แสดง "ถึงกำหนดแล้ว" ไม่ใช่เลขติดลบ)
- **directive ต่อเข้าพร้อมต์**: หลังแก้ `_build_base_context` แล้ว **ต้องพิสูจน์ว่ามันเข้าไปจริง** — พิมพ์ context ที่ประกอบเสร็จออกมาดู หรือเขียนเทสต์ที่ assert ว่าข้อความ directive อยู่ใน context ที่ส่งให้ `llm_call` · การเพิ่มบรรทัดในโค้ดไม่เท่ากับ AI ได้เห็น (บทเรียนวันนี้: macro pack ว่างเปล่าและ FRED history ว่างถาวรโดยไม่มีใครรู้)

## เกณฑ์ว่าเสร็จ

- 4 อย่างแสดงผลจริงบน prod · user เปิดดูยืนยันด้วยตา
- เทสต์ผ่าน + รายงานเลขจริง · checklist 11.4/11.6/11.9 → เสร็จ (11.5 อยู่ใบ 08)
