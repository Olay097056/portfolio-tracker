# 03 - Research: ขุดหน้า อารมณ์ตลาด + บทเรียน + ตั้งค่า

Type: research
Status: closed
Claimed: hermes/2026-08-11
Blocked by: —

## Question

ขุด 3 หน้าเล็กที่ยังไม่มี: `/sentiment` (อารมณ์ตลาด), `/learn` (บทเรียน), `/settings` (ตั้งค่า) — ให้ครบโครงสร้าง + ข้อมูล + แหล่ง

## ข้อเท็จจริง ตั้งต้น (อ่านผ่าน preview login แล้ว 2026-08-11)

**/sentiment**: CNN Fear & Greed 65 (Greed) + Crypto Fear & Greed 29 (Fear) + ดัชนีตลาดรายชั่วโมง (MOVE 75.5 / VIX 15.48 / DXY 99.85 / HY Spread 270bps — "เทียบชั่วโมงก่อน") + 4 ตัวชี้วัดความเชื่อมั่น (ความคึกคะนอง 22 / ความเจ็บปวด 0 / ความตื่นตระหนก 0 / ความไม่เชื่อมั่น 0 — สูตร? 0-100?) + แนวโน้มย้อนหลัง 1 ปี (2 แกน: FG + crypto FG?)
**/learn**: 7 บท (บท 0-6: พันธบัตรคืออะไร/อ่านระบบให้เป็น/ถ้าวิกฤตฯ/โมเดล 6 แบบ/ตัวเลขเศรษฐกิจ/ประกอบร่าง) + อภิธานศัพท์ + ความคืบหน้า 7/7 + "ทำแบบทดสอบใหม่ทั้งหมด" — เนื้อหาการศึกษา (บทละ ~1-4 นาที)
**/settings**: บัญชี (อีเมล/ออกจากระบบ) + การแจ้งเตือน Telegram ("เชื่อมต่อ Telegram" — ต้องมี bot)

## วิธีทำ

1. dig bundle 3 หน้า (chunk จาก layout.js) — `.from()`/rpc + i18n
2. sentiment: แหล่ง FG (CNN API? crypto FG = alternative.me?) + 4 ตัวชี้วัด (สูตร? ข้อมูลจากไหน)
3. learn: เนื้อหาบทเรียนอยู่ที่ไหน (Supabase table? hardcode?) — คัดลอกเนื้อหามา หรือเขียนใหม่
4. settings: Telegram bot flow (reference ใช้ bot ตัวไหน?)
5. หลักฐาน raw ทุก claim + grep -c
6. deliverable: `docs/research/bond-crisis-sentiment-learn-settings-2026-08-11.md`

## Answer

ขุด 3 หน้าครบ — deliverable: `docs/research/bond-crisis-sentiment-learn-settings-2026-08-11.md`

**/sentiment**: 2 tables — `retail_sentiment` (indicator: fear_greed/crypto_fear_greed/euphoria/pain/panic/disbelief, value, label, recorded_at รายวัน) + `index_hourly` (move/vix/dxy/us_hy_spread, change_pct, รายชม.) · 4 ตัวชี้วัด map (th/en/color/desc) · refresh 5 นาที · กราฟ 1 ปี (Sparkline lazy module 22732)

**/learn**: บทเรียน = **hardcoded module 28440** (chunk-8440) — `l1` 7 บท (intro/bond-basics/read-dashboard/crisis-chain/six-models/key-numbers/put-together) เนื้อหา th+en เต็ม (paragraph/heading/list/callout/quiz) · progress = `lesson_progress` (chapter_slug) · reset = rpc `reset_my_lessons`

**/settings**: `user_profiles` (role/banned/onboarded_at) + `telegram_links` (401 anon — ต้อง login) · Telegram flow = edge fn `telegram-link` → deep_link + poll 3s×40 · admin = `admin-settings` (job presets)

**เปิดคำถาม → ใบ 09**: สูตร 4 ตัวชี้วัด (ฝั่ง cron reference — ออกแบบเอง HITL) · learn คัดลอก/เขียนใหม่ · telegram bot จริง/UI อย่างเดียว

