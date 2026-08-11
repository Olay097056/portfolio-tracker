# 02 - Research: ขุดหน้า CME (/) — 50 ผลิตภัณฑ์ + FedWatch + IV

Type: research
Status: closed
Claimed: hermes/2026-08-11
Blocked by: —

## Question

ขุดหน้า `/cme` (โซน CME) ให้ครบ — หน้าใหม่ที่ยังไม่มี และซับซ้อนสุด: 50 ผลิตภัณฑ์ออปชัน (IV/±σ/P-C/กรอบ), อีเวนต์ข้างหน้า, AI วิเคราะห์ภาพรวม + ต่อผลิตภัณฑ์, FEDWATCH (จากราคา ZQ), FedWatch ย้อนหลัง, กราฟเทียบ σ ทุกผลิตภัณฑ์, เจาะรายผลิตภัณฑ์ (กำแพงราคาใช้สิทธิ์, IV รายราคา, IV ย้อนหลัง, P/C ย้อนหลัง), อันดับ IV, ตารางรวม, กระแสเงินทองคำ (OI/วอลุ่ม), COT, basis trade

## ข้อเท็จจริง ตั้งต้น (อ่านผ่าน preview login แล้ว 2026-08-11)

- **แหล่งข้อมูลที่หน้าแจ้ง**: vol2vol (IV/±σ/P-C/eod_volume — ทุกชม.) · Hyperliquid (ราคาสด trade_marks) · CFTC Socrata + f_disagg (COT รายสัปดาห์) · CME public report (OI ทอง รายวัน T+1) · gold-volume
- ตัวเลขตัวอย่าง: ทอง OGU6 IV 23.46% ±1σ 4,211.7–4,639.3 P/C 0.75 · FedWatch: 56% ขึ้น 25bp (ZQ 96.305) · COT 10Y leverage -2,231,670
- **ประเด็นต้องตรวจ**: vol2vol ต้อง login/paywall ไหม (หน้าแจ้งข้อจำกัด "ได้เฉพาะช่วงที่ไฟล์แคชต้นทางยังไม่หมดอายุ") · Hyperliquid ฟรีใช่ไหม · 50 ผลิตภัณฑ์ = ต้อง subscribe ครบทุกตัวไหม

## วิธีทำ

1. dig bundle หน้า /cme (หา chunk จาก layout.js paths) — `.from("...")`/rpc + i18n คีย์ cme*
2. ตรวจแหล่งข้อมูลแต่ละตัว: vol2vol API (endpoint/ฟรี?) · Hyperliquid (ฟรี public API?) · CFTC (ใช้ได้อยู่แล้วจากใบอื่น)
3. อ่าน Supabase tables ที่ CME ใช้ (anon key) — โครงสร้าง
4. หลักฐาน raw ทุก claim + grep -c สำหรับหาไม่เจอ
5. deliverable: `docs/research/bond-crisis-cme-2026-08-11.md`

## Answer

ขุดหน้า CME ครบ — deliverable: `docs/research/bond-crisis-cme-2026-08-11.md` (raw evidence)

**สถาปัตยกรรม**: 3 edge functions — `cme-read` (action=get_zone, ต้อง login token, refresh 5 นาที, rate_limited + retry_after_s) = ข้อมูล 50 ผลิตภัณฑ์จาก vol2vol · `cme-brief` (AI glm) · `fetch-cme-vol` (cron probe/ingest) — + 2 tables anon: `macro_series` (COT 12 series ids cot_*_mm/lev/am_net) + `macro_series_history` (30 วัน: basis trade 4 ids + `us_fedwatch_prob`/`us_fedwatch_move_bp`)

**11 sections**: อีเวนต์ข้างหน้า (ออปชันรายสัปดาห์คร่อมวัน) · AI ภาพรวม · FedWatch (จาก ZQ เทียบ EFFR — ข้อมูลเก็บลง macro_series แล้ว) · FedWatch ย้อนหลัง · กรอบ ±σ เทียบทุกผลิตภัณฑ์ (±3.2σ หยุดหมุด) · เจาะรายผลิตภัณฑ์ (กำแพง C/P, IV รายราคา, IV/P-C ย้อนหลัง) · อันดับ IV · ตารางรวม 50 แถว · กระแสเงินทอง (OI/วอลุ่ม) · COT + basis trade · ตารางแหล่ง/ข้อจำกัด

**แหล่งข้อมูล (หน้าแจ้งเอง)**: vol2vol (IV/σ/P-C ทุกชม. — ΔIV=0 ต้องคำนวณเอง) · Hyperliquid ราคาสด (คนละเวที CME) · CFTC Socrata+f_disagg รายสัปดาห์ · CME public report รายวัน T+1

**i18n**: cme* 162 คีย์ครบ (verbatim ใน deliverable)

**เปิดคำถาม → ใบ 07**: cme-read payload shape (ต้อง login session) · vol2vol ฟรีไหม/ต้อง proxy ไหม · FedWatch สูตร ZQ ต้องเทียบค่าจริง

