# 09 - Task: AI ตั้งใจ + สรุปประจำวัน/เดือน (LLM)

Type: task
Status: closed
Claimed: hermes/2026-08-12
Blocked by: 05

## Question

จากใบ 05 — user เลือกแบบ A ทั้ง 2 ข้อ: AI ตั้งเป้าเอง + สรุป LLM

## สิ่งที่ต้องทำ

1. **AI ตั้งเป้ารายสัปดาห์** (ข้อ 7):
   - ตอนนี้ `WEEKLY_TARGET_PCT = 1.5` ตายตัว — lead ต้องตั้งเองรายสัปดาห์
   - กลไก: เทิร์นแรกของสัปดาห์ lead ประเมินสภาพตลาด (context จาก `_build_base_context`) แล้วเขียนเป้า → อัปเดต `weekly_target_pct` + `monthly_floor/stretch`
   - เชื่อมกับ directive (ใบ 07 จะต่อสายเข้า prompt) — directive ของ user ควรมีน้ำหนักเหนือกว่าเป้าของ AI
   - +1 คอล/สัปดาห์
2. **สรุปประจำวัน/เดือน** (ข้อ 8):
   - ตอนนี้ไม่มีเลย — สร้างตาราง `trade_summaries` (type: daily|monthly, period, summary_th, tokens)
   - กลไก: cron สรุปประจำวัน 1 คอล (เทิร์นวันนี้ + การตัดสินใจ + ผล) · สรุปเดือน 1 คอล
   - UI: การ์ดสรุปในหน้า main + detail
   - +1 คอล/วัน +1 คอล/เดือน (~$0.001/วัน)

## กติกา

- หยุดให้ user ตรวจก่อน commit · รันเทสต์จริงรายงานเลขจริง · ห้ามลบเทสต์เพื่อให้ผ่าน
- ใช้ `llm_call` เดิมจาก `boardroom_service` (deepseek — ราคาถูก)
- migrate ตารางใหม่บน Supabase prod — ถาม user วิธี

## เกณฑ์ว่าเสร็จ

- lead ตั้งเป้าสัปดาห์เอง (เห็นค่าเปลี่ยนบน prod) · directive user มีน้ำหนักกว่า
- สรุปวัน/เดือนแสดงบน UI · checklist 11.8 → เสร็จ
