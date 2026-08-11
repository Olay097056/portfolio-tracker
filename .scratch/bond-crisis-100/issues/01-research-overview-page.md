# 01 - Research: ขุดหน้า ภาพรวม (/) — โครงสร้าง + ข้อมูล + สูตร

Type: research
Status: closed
Claimed: hermes/2026-08-11
Blocked by: —

## Question

ขุดหน้า `/` (ภาพรวม) ของ reference ให้ครบ — เรายังไม่มีหน้านี้ ต้องรู้ทุกส่วนก่อนออกแบบ mirror: AI สรุปสถานการณ์ + คำแนะนำ + จินตนาการ + เหตุการณ์สำคัญข้างหน้า (ForexFactory) + การแจ้งเตือนที่ทำงานอยู่ + REGIME ปัจจุบัน + โมเดลอันดับ 1 + คะแนนความเสี่ยงประเทศ + ตัวเลขสำคัญ + Yield Curve + 6 โมเดล

## ข้อเท็จจริง ตั้งต้น (สำรวจผ่าน preview login แล้ว 2026-08-11)

- tables ใน page chunk: `ai_briefs` · `country_risk_scores` · `crisis_phase_current` · `macro_series` · `model_scores` · `risk_warnings`
- navigation login แล้วมี 15 หน้า: / /macro /models /signals /sentiment /news /banking /countries /forecast /boardroom /learn /trade-desk /office /cme /settings (+admin: backtest/members/tokens)
- layout.js (overview-dig) มี paths ครบ + i18n น่าจะมีคีย์หน้า overview (ov*?)

## วิธีทำ

1. dig ต่อจาก `.scratch/overview-dig/` — page-a8a4c2ec736b803c.js (16.5KB) + layout (25KB) — หา module จริงของหน้า (lazy wrapper) + i18n คีย์ ov*/br* ที่ใช้
2. **ทุกส่วนของหน้า**: AI สรุป (prompt? วิธีสร้าง? ปุ่ม "สร้างสรุปใหม่" เรียก rpc/อะไร) · REGIME (คำนวณจากอะไร — crisis_phase_current?) · โมเดลอันดับ 1 (จาก model_scores?) · คะแนนประเทศ (จาก country_risk_scores) · ตัวเลขสำคัญ (macro_series?) · เหตุการณ์ (ForexFactory — แหล่ง? rpc?) · การแจ้งเตือน (risk_warnings)
3. อ่าน Supabase tables ที่เกี่ยวข้อง (anon key) — โครงสร้าง row/field
4. หลักฐาน raw ทุก claim (URL chunk + quote) + `grep -c` สำหรับ "หาไม่เจอ"
5. deliverable: `docs/research/bond-crisis-overview-2026-08-11.md`

## Answer

ขุดหน้า ภาพรวม ครบ — deliverable: `docs/research/bond-crisis-overview-2026-08-11.md` (raw evidence ทุก claim)

**โครงสร้าง**: 6 queries พร้อมกัน (crisis_phase_current single + model_scores order rank + macro_series in 15 ids + risk_warnings active + country_risk_scores + ai_briefs limit 1) · auto-refresh 60s · ปุ่ม "สร้างสรุปใหม่" = POST `/functions/v1/ai-brief` (edge function) + reload

**Maps ครบ (module 57362)**: L6 = 6 โมเดล (nameEn/Th + concept + tradeDirection + indicators[weight/logic] + signalMap[asset/direction]) · Qw = 7 phase (ไทย + color) · Zt = 4 status · model colors 6 สี

**Supabase tables (อ่านจริง)**: crisis_phase_current (1 row: phase/confidence/is_transition_zone/triggers[{name,strength}]) · model_scores (score/rank/status/factors{news,macro,conditions,risk_penalty,...}) · macro_series (15 series + value/change/unit/trend) · risk_warnings (severity/active/threshold_desc) · country_risk_scores (score/level/components) · ai_briefs (brief_md + recommendations[3] + scenarios[3] + **key_events[] = เหตุการณ์ ForexFactory อยู่ในนี้** + model_used **glm/glm-5.2**)

**i18n ครบ** (ภาพรวม/AI สรุปสถานการณ์/สร้างสรุปใหม่/คำแนะนำ/จินตนาการ/เหตุการณ์สำคัญข้างหน้า/Regime ปัจจุบัน/ความมั่นใจ/โซนเปลี่ยนผ่าน/โมเดลอันดับ 1/คะแนนความเสี่ยงประเทศ ฯลฯ — verbatim ใน deliverable)

**เปิดคำถาม → ใบ 05**: edge function ai-brief (prompt/ขั้นตอน) + แหล่ง ForexFactory จริง + section ตัวเลขสำคัญ/Yield/6 โมเดล (component อยู่ใน module อื่น — dig ต่อตอนใบ backend)

backend/frontend ไม่แตะ (git status ยืนยัน) · หยุดที่ใบเดียวตามวินัย

