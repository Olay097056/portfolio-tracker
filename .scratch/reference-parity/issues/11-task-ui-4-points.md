# 11 - Task: UI 4 จุด (12.2 slider · 2.2 ป้าย · 7.2 badge · 9.4 filter)

Type: task
Status: closed
Claimed: hermes/2026-08-12 (เริ่ม) → claude/2026-08-12 (ทำต่อจนจบ — hermes โควตาหมด)
Blocked by: 04

## Answer

**ครบ 4 จุด — ตรวจบนหน้าเว็บจริงแล้ว ไม่มี error ใน console**

| # | ทำอะไร | หลักฐานจากหน้าจริง |
|---|---|---|
| 2.2 | `ModelsDashboard:340` + `OverviewDashboard:274` → "ความครบของข้อมูล" | `ความครบของข้อมูล 100%` ×3 · คำว่า "ความมั่นใจ" = 0 ในหน้านี้ |
| 12.2 | `NewsDashboard` dropdown → range slider + `draftImpact`/`onPointerUp` | `range 0–100 step 5` · select เหลือแค่ "เรียงตาม"/"แหล่งข่าว" |
| 7.2 | `ui/DataTierBadge.tsx` — 4 tier มีสี | 27 badge บนหน้าจริง · realtime `rgb(52,211,153)` · daily `rgb(56,189,248)` |
| 9.4 | filter ที่ server + ชิป 8 ตัว + empty state | คลิก "ล้มเหลว" → `GET /api/boardroom/meetings?status=failed 200` |

**ตัดสินระหว่างทาง**
- **ไม่แตะ Boardroom/BoardroomSignals** ใน 2.2 — `ความมั่นใจ` ที่นั่นคือค่าที่ AI ให้ stance ตัวเอง คนละค่ากับ `model_service.py:889` · Overview ตรวจแล้วเป็นค่าเดียวกัน (`overview_service.py:99` = `top.get("confidence")`) จึงเปลี่ยนด้วย
- **กรองที่ server ก่อน `.limit(50)`** — กรองฝั่ง client จะเห็นแค่ 50 รายการล่าสุด แล้วรายงานจำนวนต่ำกว่าจริงโดยไม่มีอะไรบอก
- **แยก state `archive` ออกจาก `meetings`** — `meetings` ยังต้องเป็นรายการไม่กรอง เพราะแผงประชุมสด (บรรทัด 579) และตัวล็อกปุ่มเปิดประชุมอ่านจากมัน
- **ลบ `tools/Badges.tsx`** — ไฟล์กำพร้า ไม่มีใคร import (grep = 0) · `ui/DataTierBadge.tsx` คือตัวที่ถูกใช้จริงและป้ายตรงกับ `DATA_TIER_NOTE_TH` ใน backend
- **แก้ query ของเทสต์เดิม ไม่ลด assertion** — ชิปตัวกรองใช้ข้อความเดียวกับ badge สถานะ เทสต์เดิมเลยเจอสองตัว → เจาะจงเป็น `<span>`

**เลขจริง**: backend `562 passed` (561→+1) · frontend `597 passed` (590→+7) · `tsc` clean

**พิสูจน์ว่าเทสต์ล้มได้** (ทำโค้ดพังชั่วคราวแล้วดูแดง)
- กรองหลัง `.limit(50)` → `FAILED: filter did not run in SQL`
- `setMeetings()` แทน `setArchive()` → `FAILED: กรองแล้วแผงประชุมสดต้องไม่หาย`

**checklist**: 2.2 · 7.2 · 9.4 · 12.2 → `✅ มี` · `fix_subsummaries.py --check` = `87 มี · 7 ขาด · 2 ต่าง · 96 rows · mismatches = 0 · exit 0`

**ช่องโหว่ที่เจอในเครื่องมือ** (ยังไม่แก้ — ฝากใบถัดไป): `fix_subsummaries.py` โหมดแก้ซ่อมสรุปย่อยแต่**ไม่ซ่อม Grand Summary** มันแค่ตรวจเจอแล้วปล่อย (`REPAIR VERIFY mismatches = 1`) — รอบนี้แก้มือ

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
