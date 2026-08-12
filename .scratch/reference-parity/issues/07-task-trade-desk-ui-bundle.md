# 07 - Task: Trade Desk UI bundle (equity graph + quota + directive + master switch)

Type: task
Status: open
Claimed:
Blocked by: 05

## Question

จากใบ 05 (user ตัดสินแล้ว) — 4 อย่างที่เหลือแค่ UI (หรือเกือบ):

1. **กราฟ equity** (11.4) — ทีมเดียว · โหมด % กำไร + $ equity · ช่วง 24h/7d/30d
   - backend มีแล้ว: `GET /api/trade-desk/team/DEEPSEEK/equity?days=30` + `trade_snapshots` มีข้อมูล
   - เคยมีกราฟถูกลบใน commit `3cf88fe` — เอากลับเป็น UI ใหม่ใน TradeDeskDashboard
2. **โควตาเทิร์น + เทิร์นถัดไป** (11.6) — UI ล้วน
   - backend บังคับจริงแล้ว (`DAILY_CAP_DEFAULT=4` ใน run_due_turns) · `turns_today`/`next_turn_at` มีใน state
   - UI: ตัวนับ "เทิร์นวันนี้ X/4" + countdown "เทิร์นถัดไปใน HH:MM:SS" + ปุ่ม "⚡ สั่งเทิร์นเดี๋ยวนี้" (มีใน TeamDetailPage อยู่แล้ว — เอามาที่หน้า main ด้วย)
3. **คำสั่งโต๊ะกลาง directive** (11.9) — UI + ต่อสาย
   - backend: คอลัมน์ + POST + state มี · **แต่ `_build_base_context` ไม่ป้อน directive/mandate เข้า prompt** — ต่อเข้าไป (10 บรรทัด)
   - UI: ช่องแก้ directive ในหน้า main + แสดงคำสั่งปัจจุบัน
4. **สวิตช์หลัก** (11.5) — backend + frontend + migrate
   - ไม่มี `master_on` เลยทั้ง 2 ฝั่ง — เพิ่มคอลัมน์ `master_on` (default true) + เช็คใน `run_due_turns`/`run_turn` + toggle ใน UI
5. **"ดู prompt เต็ม"** ต่อ analyst (ใบ 05 ข้อ 8) — TeamDetailPage: คลิก analyst → ขยาย prompt เต็ม (ข้อมูลมีแล้วใน `analyst_prompts`) · **hit rate + ledger = ทีหลัง** (รอไม้ปิดจริง)

## กติกา

- หยุดให้ user ตรวจก่อน commit · รันเทสต์จริงรายงานเลขจริง · ห้ามลบเทสต์เพื่อให้ผ่าน
- ทุกจุดที่เพิ่ม UI ต้องมีเทสต์เฝ้า (ล้มถ้าของหาย)
- migrate: ใช้ create_all ผ่าน (ตารางยังไม่มี master_on — ALTER หรือ drop/recreate ใน Supabase prod ต้องถาม user)

## เกณฑ์ว่าเสร็จ

- 4 อย่างแสดงผลจริงบน prod · user เปิดดูยืนยัน
- เทสต์ผ่าน + รายงานเลขจริง · checklist 11.4/11.5/11.6/11.9 → เสร็จ
