# 05 - Task: Backend ภาพรวม — AI สรุป + REGIME + โมเดลอันดับ 1 + ตัวเลขสำคัญ

Type: task
Status: closed
Claimed: hermes/2026-08-11
Blocked by: 01

## Answer

Backend overview เสร็จ — commit `323c0a9`

- `overview_service.py`: build_overview() ประกอบจาก service ที่มี (macro dashboard sections → 8 key figures + 7 tenor yield curve · build_models → regime/6 การ์ด/triggers · build_countries → top 7) + generate_brief() (DeepSeek ผ่าน llm_call → brief_md + 3 recommendations + 3 scenarios + 3 key_events, cache 24h)
- `routers/overview.py`: GET /api/overview + POST /api/overview/brief (force) — register main.py
- tests: 5 ใหม่ (test_overview.py) — suite **536 passed** · verify ok (test 26.7s, readiness 200)
- AI brief วัดจริง: **16.8s · 1,111 tokens** (332 prompt + 779 completion) — deepseek-v4-flash
- หยุดรอตรวจ → user "ลุย" → commit

## Question

สร้าง backend หน้า ภาพรวม: รวมข้อมูลจาก service ที่มี (macro dashboard, model scores, country risk) + AI สรุปสถานการณ์ (DeepSeek) + REGIME + เหตุการณ์ข้างหน้า (ForexFactory — ตรวจแหล่งฟรี) + การแจ้งเตือน (risk_warnings)

## ขอบเขต

- endpoint `/api/overview` (GET + POST /refresh) — รวม payload จากของที่มี (ไม่ fetch ซ้ำ ใช้ cache ใบ 06)
- AI สรุป: prompt จากข้อมูลจริง (คล้าย ai_briefs ของ reference) + ปุ่ม "สร้างสรุปใหม่" = POST สร้างใหม่
- REGIME/โมเดลอันดับ 1: ตามผล research 01 + grilling สูตรกับ user (HITL — prototype ก่อน)
- เหตุการณ์: ForexFactory ฟรี? (research 01 บอกแหล่ง) — ถ้าไม่มี → "—"
- เทสต์ stub fetch 100% · ⚠️ หยุดรอตรวจก่อน commit

## เป้าหมาย

`/api/overview` คืน payload ครบทุกส่วน → ต่อใบ frontend
