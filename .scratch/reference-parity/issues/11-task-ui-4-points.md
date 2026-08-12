# 11 - Task: UI 4 จุด (12.2 slider · 2.2 ป้าย · 7.2 badge · 9.4 filter)

Type: task
Status: open
Claimed:
Blocked by: 04

## Question

จากใบ 04 รอบสอง — user ตัดสิน "เอา" 4 จุด UI:

1. **12.2 — News impact dropdown → slider**: เปลี่ยน `minImpact` จาก `<select>` เป็น range slider (NewsDashboard.tsx:279-289) — ฟังก์ชันเดิมครบแล้ว (state + fetch + filter ทำงาน)
2. **2.2 — Models ป้ายเปลี่ยน**: "confidence" → **"ความครบของข้อมูล"** (ค่าคำนวณจริง model_service.py:889 = % indicators มีข้อมูลสด — ค่าถูกแต่ชื่อผิด แบบ MTD ใบ 03) — ตรวจจุดแสดงผลใน ModelsDashboard + แก้ป้ายทุกจุด
3. **7.2 — Country data tier badge มีสี**: `data_tier_note_th` ตอนนี้เป็นข้อความธรรมดา (CountriesDashboard.tsx:167) → ทำเป็น badge มีสีตาม tier (sparse/daily/realtime/manual — 4 ระดับของเรา vs 3 ของต้นฉบับ: map ยังไงต้องตัดสิน — เสนอ user)
4. **9.4 — Boardroom filter ประชุม**: เพิ่ม filter (ล้มเหลว/ตาม trigger_type) — backend พร้อม (`trigger_type` + status ใน API) · UI มี StatusBadge แล้ว เหลือ filter controls

## กติกา

- หยุดให้ user ตรวจก่อน commit · รันเทสต์จริงรายงานเลขจริง · ห้ามลบเทสต์เพื่อให้ผ่าน
- ทุกจุดมีเทสต์เฝ้า (ล้มถ้าของหาย)

## เกณฑ์ว่าเสร็จ

- 4 จุดแสดงผลจริงบน prod · user เปิดดูยืนยัน
- checklist 12.2/2.2/7.2/9.4 → เสร็จ
