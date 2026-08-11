# 06 - Task: Frontend ภาพรวม — การ์ดทุกส่วนเหมือน reference

Type: task
Status: closed
Claimed: hermes/2026-08-11
Blocked by: 05

## Answer

Frontend overview เสร็จ — commit `5e7fd64`

- `OverviewDashboard.tsx`: AI สรุป + คำแนะนำ + จินตนาการ + เหตุการณ์ (ForexFactory) + REGIME (confidence/โซนเปลี่ยนผ่าน/triggers) + โมเดลอันดับ 1 + คะแนนประเทศ (top 7 + bar) + 8 ตัวเลขสำคัญ (bps delta สำหรับ %) + Yield Curve SVG + 6 โมเดลการ์ด — ink palette
- BondCrisisPage: tab "ภาพรวม" ตัวแรก + default (เหมือน reference หน้าแรก)
- tests 5 ใหม่ — vitest **554 passed** · tsc สะอาด · prod verified: /api/overview 200 + brief POST 200 (DeepSeek ไทย)
- หยุดรอตรวจ → user "ลุย" → commit

## Question

สร้างหน้า ภาพรวม (sub-tab แรกของ Bond-crisis) ให้เหมือน reference 100% — AI สรุป + คำแนะนำ + จินตนาการ + เหตุการณ์ข้างหน้า + การแจ้งเตือน + REGIME + โมเดลอันดับ 1 + คะแนนประเทศ + ตัวเลขสำคัญ + Yield Curve + 6 โมเดล

## ขอบเขต

- `OverviewDashboard.tsx` ใน BondCrisisPage — ป้ายไทย verbatim จาก i18n (research 01)
- การ์ด/สี/threshold ตาม reference เป๊ะ (prototype HTML ก่อน — HITL)
- ปุ่ม "สร้างสรุปใหม่" + รีเฟรช + auto-refresh 5 นาที (pattern เดิม)
- "—" สำหรับไม่มีข้อมูล · เทสต์ component

## เป้าหมาย

หน้า ภาพรวม เหมือน reference → ต่อใบ CME/sentiment
