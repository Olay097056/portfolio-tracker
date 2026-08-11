# 11 - Task: Frontend Learn + Settings + Office 3D (ตามใบ 09)

Type: task
Status: closed
Claimed: hermes/2026-08-11
Blocked by: 09

## Answer

3 หน้าสุดท้ายเสร็จ — commit `59bb4bd`

- **Office 3D**: Three.js (three 0.185) — 11 แผนก BoxGeometry + sprite labels + OrbitControls + `GET /api/jobs/status` ใหม่ (job_runs จริง 10 รอบ) + pulse เมื่อ running — prod: WebGL canvas 1180×440, ไม่มี JS error
- **Learn**: 7 บท เนื้อหาเขียนเองทั้งหมด (เข็มทิศ/สินทรัพย์/เกจ์/เครือข่าย/กราฟ/ปฏิทิน/ธง) + progress localStorage + reset
- **Settings**: บัญชี + รูปแบบการแจ้งเตือน 6 รายการ (localStorage) — ไม่มี Telegram
- tests 3 ใหม่ (three mocked ใน jsdom — WebGL no-op) — vitest **564 passed** · pytest 542 · verify ok

## Question

3 หน้าสุดท้ายตามการตัดสินใบ 09:

1. **/learn บทเรียน** — เขียนเนื้อหาใหม่เอง 7 บท (โครงสร้าง+ไอคอนเหมือน reference: Compass/Coins/Gauge/Network/BarChart3/CalendarClock/Flag) — ใช้ DeepSeek ช่วยร่างเนื้อหาไทย + ตรวจเอง — progress เก็บ localStorage (ไม่มี auth) + ปุ่ม reset
2. **/settings ตั้งค่า** — บัญชี (ชื่อ/อีเมล/บทบาทจาก profile) + รูปแบบการแจ้งเตือน (เลือกเมตริกที่จะเตือน: JGB 10Y/หางประมูล/แบงก์รัน ฯลฯ — เก็บ localStorage) — **ไม่มี Telegram** (ตัดสินแล้ว)
3. **/office ออฟฟิศ 3D** — **Three.js เต็มรูปแบบ**: 11 แผนก (ทีม AI 1 ทีมจริง = deepseek + ห้องประชุมบอร์ด + ศูนย์โมเดล/ข้อมูล/สัญญาณ + ฝ่ายข่าว + ควอนต์ CME + ตู้ Exchange + ต้อนรับ + ฝ่ายสื่อสาร + บัญชี AI) + งานระบบล่าสุด (จาก job system จริง) + คิวงานถัดไป — เพิ่ม dependency three (Vite) — กล้องบิน/หมุนได้

## วิธีทำ

- ติดตั้ง `three` + `@types/three` (npm) — ตรวจว่า build ผ่าน Vite
- Learn: เขียนเนื้อหาเอง (ไม่คัดลอก reference — ห้ามละเมิดลิขสิทธิ์) — DeepSeek ร่าง + human ตรวจ
- Office: ข้อมูลจริงจาก job system (jobs.py — tick ที่ผ่านมา/คิวถัดไป) — 3D เป็น visual layer
- Settings: UI + localStorage (ไม่มี backend — auth ยังไม่มี)
- tests stub → vitest เขียว → วัด → verify → หยุดรอตรวจ
