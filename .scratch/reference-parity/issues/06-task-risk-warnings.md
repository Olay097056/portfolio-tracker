# 06 - Task: เพิ่มคำเตือนความเสี่ยง 12 จุด (D8–D19)

Type: task
Status: closed
Claimed: hermes/2026-08-12
Blocked by: —

## Question

ไม่มีอะไรให้ตัดสินเรื่อง "ทำหรือไม่ทำ" — **user ตัดสินแล้วว่า เอา ทั้ง 12 ข้อ** ในใบ 04 (2026-08-12)

แต่ยังมีเรื่องที่ต้องให้ user เคาะก่อนลงมือ: **ข้อความของแต่ละแท็บควรเขียนว่าอะไร** — ดูหัวข้อ "จุดที่ต้องให้ user เคาะก่อนเขียนโค้ด" ด้านล่าง

## ⚠️ ticket นี้เขียนโค้ดจริง

หยุดให้ user ตรวจก่อน commit · รันเทสต์จริงรายงานเลขจริง · ติดขัดให้หยุดถาม
**ห้ามลบเทสต์เพื่อให้ผ่าน** · ทุกตัวเลขต้องมาจากคำสั่งที่เพิ่งรัน วางผลดิบ

## รายการ (จาก checklist ใบ 01 · คำตัดสินใบ 04)

| # | แท็บ | ไฟล์ |
|---|---|---|
| D8 | สัญญาณเทรด | `SignalsDashboard.tsx` |
| D9 | โมเดลทำกำไร | `ModelsDashboard.tsx` |
| D10 | ภาพรวม | `OverviewDashboard.tsx` |
| D11 | อารมณ์ตลาด | `SentimentDashboard.tsx` |
| D12 | โซน CME | `CmeDashboard.tsx` |
| D13 | วิกฤตแบงก์รัน | `BankingDashboard.tsx` |
| D14 | รายประเทศ | `CountriesDashboard.tsx` |
| D15 | ข่าวสาร | `NewsDashboard.tsx` |
| D16 | บทเรียน | `LearnDashboard.tsx` |
| D17 | ออฟฟิศ 3D | `OfficeDashboard.tsx` |
| D18 | ตั้งค่า | `SettingsDashboard.tsx` |
| D19 | สัญญาณเทรด — **คำเตือนความแม่นยำ** | `SignalsDashboard.tsx` |

**D19 พิเศษ**: แผน `ai-signal-investor-upgrades` เคยใส่ *"แม่นยำในอดีตประมาณ 62-63%..."* ไว้ตั้งใจ (user อนุมัติ 2026-08-06) แล้ว**หายไประหว่างการเขียนใหม่รอบหลัง** — grep `frontend/src` ไม่เจอแล้ว · ต้องกู้กลับ **พร้อมตัวเลขที่ตรงกับความจริงปัจจุบัน** ไม่ใช่ลอก 62-63% มาใช้ถ้าวัดใหม่แล้วไม่ตรง

## จุดที่ต้องให้ user เคาะก่อนเขียนโค้ด

**อย่าวางข้อความเดียวกัน 12 ที่** — แต่ละแท็บชี้นำการลงทุนคนละระดับ ข้อความควรสมกับสิ่งที่หน้านั้นแสดงจริง:

- **D8 สัญญาณเทรด** — แสดง Entry / TP / SL เป็นตัวเลขจริง + ปุ่ม "ปิดออเดอร์" + อัตราชนะ · ชี้นำตรงที่สุดในแอป ควรแรงที่สุด
- **D9 โมเดลทำกำไร** — คะแนน 0-100 + สถานะ ทำงาน/ก่อตัว · ชี้นำทางอ้อม
- **D17 ออฟฟิศ 3D / D18 ตั้งค่า** — ไม่ได้แสดงข้อมูลการลงทุนเลย ข้อความเดียวกับหน้าสัญญาณจะกลายเป็นเสียงรบกวน · **เสนอ user ว่าจะใช้ข้อความสั้นกว่า หรือวางไว้ที่เดียวระดับ layout แทน**

**ขั้นตอนบังคับ**: เสนอข้อความทั้ง 12 จุดให้ user ดูเป็นตารางก่อน (แท็บ · ข้อความที่เสนอ · วางตรงไหน) → **รอ user เคาะ** → ค่อยเขียนโค้ด

ห้ามเขียนโค้ดก่อน user เคาะข้อความ

## สิ่งที่ต้องทำหลัง user เคาะ

1. ใส่ข้อความตามที่ user อนุมัติ — **ต้องเห็นบนหน้าจอจริง** ไม่ใช่ซ่อนใต้ fold หรือสีจางจนอ่านไม่ออก
2. **เทสต์ต่อแท็บ**: disclaimer แสดงเสมอ — เทสต์ต้องล้มถ้ามีคนลบข้อความออก (นี่คือ guard rail — บทเรียนจากใบ 02 ที่ของหายเพราะไม่มีเทสต์เฝ้า)
3. อัปเดตคอลัมน์ `คำตัดสิน` ใน `docs/research/reference-parity-checklist-2026-08-12.md` เป็น "เสร็จ" ต่อแถว

## เกณฑ์ว่าเสร็จ

- ทั้ง 12 จุดมีข้อความตามที่ user เคาะ และ **user เปิดหน้าจอยืนยันด้วยตาว่าเห็นครบ**
- มีเทสต์เฝ้าทุกจุด รันผ่านจริง รายงานเลขจริง
- `grep -c` ยืนยันจำนวนจุดที่มี disclaimer ก่อน/หลัง วางผลดิบ

## Answer

**ข้อความที่ user เคาะ**: 11 ข้อความเฉพาะต่อแท็บ ใน `RiskBanner.tsx` (`RISK_TEXT`) — signals ข้อเดียวรวม D8 + D19 (ความแม่นยำ "อยู่ระหว่างการวัดผล สัญญาณ active 53 ตัว" — **ไม่** ลอก 62-63% ที่เก่า/วัดใหม่ไม่ตรง) · office/settings ใช้ข้อความสั้นตามข้อเสนอใบ 05 · สีแดงอ่อน bg `rgba(239,68,68,0.08)` ขอบ `rgba(239,68,68,0.35)` อ่านได้ชัด ไม่ซ่อนใต้ fold

**ไฟล์ที่แก้**:
- `frontend/src/components/tools/RiskBanner.tsx` (ใหม่ — RISK_TEXT 11 keys + component)
- `frontend/src/components/tools/RiskBanner.test.tsx` (ใหม่ — เทสต์เฝ้า 13 ตัว)
- 11 dashboards ใส่ `<RiskBanner>`: Signals, Models, Overview, Sentiment, Cme, Banking, Countries, News, Learn, Office, Settings

**เลขเทสต์จริง (รัน 2026-08-12 12:54)**:
- backend: `.venv/Scripts/python.exe -m pytest tests/` → **541 passed, 7 warnings in 38.63s**
- frontend: `npx vitest run` → **75 files passed · 578 passed | 16 skipped (594)** · Duration 29.34s
- `npx tsc --noEmit` → **exit 0**
- `npx vitest run src/components/tools/RiskBanner.test.tsx` → **13 passed (13)** · 3.08s
- ⚠️ `hermes verify` เฟสเทสต์พังจาก pydantic_core ใน Hermes global venv (known issue) — รัน project tests ตรงๆ แทนตามข้างบน

**ผล grep (หลักฐานสด)**:
- `<RiskBanner` usage = **11 จุด** (1 ต่อ dashboard × 11 — SignalsDashboard มี D8+D19 ใน banner เดียว)
- `grep -c RISK_TEXT/data-risk-banner` ใน RiskBanner.test.tsx = 19
- ก่อนแก้: checklist D8–D19 = `❌ ขาด` (grep 0 hits) · หลังแก้: 11/11 tabs มี banner

→ หยุดรอ user ตรวจหน้าจอก่อน commit (ห้าม commit เอง)
