# 01 - Research: ขุดหน้า /forecast ของต้นฉบับ

Type: research
Status: closed
Claimed: hermes/2026-08-09
Blocked by: —

## Answer

ขุดจาก JS bundle สาธารณะ `https://bond-crisis-dashboard-v2.vercel.app/_next/static/chunks/app/forecast/page-13d84abe72938506.js` สำเร็จ — โหลดสด HTTP 200, **10,641 bytes** (หน้า /forecast เอง login-gated แต่ route chunk สาธารณะ) — ข้อความดิบคัดลอกตรงจาก chunk อยู่ใน asset

**ตัวแปร 11 ตัว (slider ล้วน — หลักฐานดิบ `{key:"fedBps",label:"th"===t?"Fed ขึ้น/ลดดอกเบี้ย":"Fed rate change",min:-200,max:200,step:25,unit:"bps",signed:!0},...`):** fedBps (Fed ขึ้น/ลดดอกเบี้ย, −200..200/25, bps), oilPct (ราคาน้ำมันเปลี่ยน, −40..60/5, %), goldPct (ราคาทองคำเปลี่ยน, −20..40/5, %), vixPts (VIX เปลี่ยน, −10..30/1, pts), hyBps (HY Spread เปลี่ยน, −100..400/25, bps), cpiPts (เงินเฟ้อ CPI เปลี่ยน, −2..3/.25, pt), depositPct (เงินฝากแบงก์ 2 สัปดาห์, −3..1/.25, %), dwBillion (Fed Discount Window พุ่ง, 0..100/5, $B), sofrSpreadBps (SOFR-EFFR spread, 0..100/5, bps), debtPts (หนี้สหรัฐ/GDP เพิ่ม, 0..20/1, pt), auctionBtc (ประมูล 10Y Bid-to-Cover, 1.8..3.2/.1, x — default 2.5, ตัวเดียวที่ default ไม่ใช่ 0) — state default ดิบ: `let o={fedBps:0,oilPct:0,vixPts:0,hyBps:0,cpiPts:0,goldPct:0,depositPct:0,dwBillion:0,sofrSpreadBps:0,debtPts:0,auctionBtc:2.5}`

**Base series 7 ตัว** (fallback ค่ากลาง — ดิบ `let p=["us10y","us2y","vix","usoil","us_hy_spread","us_cpi_yoy","dxy"]`): us10y 4.2, us2y 3.8, vix 18, usoil 70, us_hy_spread 300, us_cpi_yoy 3 (+ dxy ประกาศแต่ไม่ใช้ใน h()) — ถ้าตัวไหนไม่มีค่าสด แสดง warning เหลือง (ดิบ `"⚠️ ",e.forecastMissingBase,...," — ",e.forecastMissingBaseDesc`)

**สูตร:** `simulated = clamp(0,100, scoreปัจจุบัน + h(state) − h(default))` — ดิบ `simulated:Math.min(100,Math.max(0,Number(e.score)+((a[e.model_id]??0)-(n[e.model_id]??0))))` — 6 โมเดลมีสูตร h() เต็มใน bundle (ดิบใน asset หัวข้อ 4) — เป็นเวอร์ชัน "แบบย่อ" (หน้าแจ้งเอง: "การจำลองเป็นค่าประมาณทิศทางจากตรรกะเดียวกับ scoring engine (แบบย่อ) — ไม่ใช่ผลการคำนวณเต็มรูปแบบ")

**UI:** header + warning + grid 5 คอลัมน์ (ซ้าย 2: sliders + Reset + disclaimer / ขวา 3: ผลกระทบต่อคะแนนโมเดล) — แต่ละโมเดล: `#rank + shortTh (ฟื้นตัว/เงินเฟ้อ-น้ำมัน/Fed เปลี่ยนท่าที/Yield ช็อก/วิกฤตสินเชื่อ/แบงก์รัน — จาก registry 7362) + score → simulated + delta` (สี: `l>.5?"text-emerald-400":l<-.5?"text-red-400":"text-ink-faint"`) + **double progress bar** (base `bg-slate-600/60` width=score% + overlay `bg-accent`/`bg-orange-400` ตาม delta≥0/<0, opacity .85, width=simulated%) — คลิกขยาย: ข้ามเกณฑ์ 40 แสดง "ถ้าเกิดสถานการณ์นี้ โมเดลจะเริ่มพิจารณาสัญญาณเหล่านี้" / ต่ำกว่า "ถ้าเกิดสถานการณ์นี้ โมเดลจะต่ำกว่าเกณฑ์ก่อตัวและหยุดพิจารณาสัญญาณใหม่" + ตารางสินทรัพย์ที่เกี่ยวข้อง (signalMap)

**คำตอบครบ 8 ข้อ (หลักฐานดิบทุกข้อใน asset):**
1. ตัวแปร 11 ตัว — ตารางครบ (key/ไทย/unit/min/max/step/default)
2. วิธีป้อนค่า — slider ล้วน (ดิบ `(0,a.jsx)("input",{type:"range",min:n,max:i,step:l,...})`) — ค่าส่วนต่าง signed ยกเว้น auctionBtc (ค่าสัมบูรณ์) + ปุ่ม Reset
3. **Preset scenarios: หาไม่เจอ** — คำว่า preset 0 hits ใน bundle — ไม่มีฉากทัศน์สำเร็จรูป
4. การแสดงผล — ก่อน/หลังคู่กัน + delta + sort simulated มาก→น้อย + rank + double bar + expand (signalMap) — ไม่มีการแตกเป็นราย factor
5. **ตัวแปรข่าว: หาไม่เจอ** — คำว่า news 0 hits ใน bundle — หน้า /forecast ไม่มีตัวแปรข่าว — news factor เป็นการออกแบบของเราเอง (ticket 05)
6. สัญญาณเทรด — ไม่มี ta_score ตรงๆ แต่มี activate/deactivate text + signalMap table (threshold 60/40: `o=e=>e>=60?2:+(e>=40)`)
7. การเตือนค่าสมมติ — disclaimer ใต้ Reset + warning เหลืองเมื่อใช้ค่ากลาง (ดิบทั้งคู่ใน asset)
8. copy ไทยทั้งหน้า — ครบจาก chunk i18n 3474 (จำลองสถานการณ์ / ปรับสถานการณ์สมมติ / ผลกระทบต่อคะแนนโมเดล / ไม่มีค่าฐานสดของ / scenarioActivates-Deactivates / สินทรัพย์ที่เกี่ยวข้อง / เกณฑ์ทำงาน (60))

**ข้อสรุปป้อน ticket อื่น:** 03 ได้ชุดตัวแปรครบ 11 ตัว 1:1 / **05: หน้า /forecast ไม่มีตัวแปรข่าวให้ปรับเลย** — news factor เป็นการออกแบบของเราเอง / 06: พื้นผิว signals-impact = scenario activate/deactivate + signalMap, threshold 40/60 / 07: copy ไทย + layout + double bar + expandable rows ครบ

Asset: `docs/research/forecast-page-2026-08-09.md`

## Question

หน้า `/forecast` ของ bond-crisis-dashboard-v2 มีอะไรบ้าง และทำงานยังไง? ต้องได้รายละเอียดพอที่ ticket 03/05/06/07 จะตัดสินใจได้โดยไม่ต้องเดา

## วิธีทำ

หน้านี้ **login-gated** (เปิด `https://bond-crisis-dashboard-v2.vercel.app/forecast` แล้วขึ้น "เข้าสู่ระบบเพื่อดูหน้านี้") และ **agent ล็อกอินแทน user ไม่ได้** — ห้ามพยายามสมัครบัญชีหรือกรอกรหัสผ่าน

ใช้วิธีเดียวกับที่ ticket 01 ของแผนที่ `signals-tab` เคยใช้สำเร็จมาแล้ว: **อ่าน JS bundle สาธารณะ** ของ Next.js app — route chunk มักโหลดได้แม้หน้าจะ gate ที่ระดับ render ไม่ใช่ระดับ network ดูที่ `/_next/static/chunks/` แล้วหา chunk ของ route `/forecast`

**ทางสำรองถ้า bundle ขุดไม่ได้:** พลิกเป็น HITL — ขอให้ user ล็อกอินเองแล้วแคปหน้าจอ/เล่าให้ฟัง อย่าเดาแล้วเขียนต่อ ให้หยุดถาม

## สิ่งที่ต้องได้กลับมา

1. **ตัวแปรที่ปรับได้** — ชื่อ (ทั้งไทยและ key ภายใน), หน่วย, ช่วงค่าต่ำสุด/สูงสุด, ขั้นการปรับ (step), ค่าเริ่มต้น
2. **วิธีป้อนค่า** — slider / ช่องกรอกตัวเลข / ปุ่ม +/− และปรับเป็น **ค่าสัมบูรณ์** (VIX = 40) หรือ **ส่วนต่าง** (VIX +25) หรือทั้งคู่
3. **Preset scenarios** — มีฉากทัศน์สำเร็จรูปไหม (เช่น "Fed ลด 50bp", "วิกฤตแบงก์รัน") ถ้ามี: ชื่อไทยเป๊ะๆ + ค่าที่แต่ละ preset ตั้งให้
4. **การแสดงผล** — โชว์คะแนนใหม่อย่างเดียว หรือ ก่อน/หลัง คู่กัน? มี delta (+12.3) ไหม? การจัดอันดับโมเดลเปลี่ยนแล้วแสดงยังไง? มีกราฟ/แถบ/ตารางแบบไหน? มีการแตกดูเป็นราย factor (มหภาค/โครงสร้าง/ข่าว/ยืนยัน/บทลงโทษ) ไหม?
5. **มีตัวแปรข่าว (news) ให้ปรับไหม** — สำคัญเป็นพิเศษ: engine เรา hardcode news = 0 ถ้าต้นฉบับมี ticket 05 ต้องออกแบบให้รองรับ ถ้าไม่มี ticket 05 จะเบาลงมาก
6. **แสดงผลต่อสัญญาณเทรดไหม** — จำลองแล้วบอกไหมว่าสัญญาณไหนจะเกิด/หาย (ป้อนเข้า ticket 06)
7. **การเตือนว่านี่คือค่าสมมติ** — ต้นฉบับแยกค่าจำลองออกจากค่าจริงยังไง (สี ป้าย ข้อความ)
8. **copy ภาษาไทยทั้งหน้า** — หัวข้อ ปุ่ม คำอธิบาย ข้อความ empty state (ไว้ใช้ตรงๆ ใน ticket 07)

## เป้าหมาย

สร้างไฟล์สรุปที่ `docs/research/forecast-page-<วันที่>.md` (ตามแบบ `docs/research/` ที่มีอยู่แล้ว) แล้วลิงก์จาก ticket นี้ → ปลดบล็อก ticket 03 (เลือกชุดตัวแปร) และ 05 (news factor)

**ถ้าขุดไม่ได้จริงๆ** ให้บันทึกใน ## Answer ว่าพยายามอะไรไปบ้างและติดตรงไหน แล้วเสนอ user ว่าจะเดินต่อทางไหน — อย่าปิด ticket ด้วยการเดา
