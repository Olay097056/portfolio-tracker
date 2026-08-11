# 02 - Research: Sensitivity audit — ctx คีย์ไหนขยับคะแนนโมเดลจริง

Type: research
Status: closed
Claimed: hermes/2026-08-09
Blocked by: —

## Answer

สคริปต์ `.scratch/forecast-tab/sensitivity_audit.py` — ดึง ctx จริง 27 คีย์แล้ว pickle ไว้ (`ctx_snapshot.pkl` — ไม่ยิง network ซ้ำ), กวาดทุกคีย์ด้วย `_score_model(m, ctx)` (pure function) ช่วงค่าสมเหตุสมผลในโลกจริง → ตาราง sensitivity 27×6 เต็มใน asset

**Dead keys 3 ตัว (ขยับ 0 จุดทุกโมเดล):**
1. **`us2y`** — ไม่มี indicator ไหนอ่าน 2Y level; "US2Y Collapse" (bank-run) map ไป `us2y_collapse` ซึ่งอ่าน **`us2y_chg`** (ขยับ bank-run 3.9) — ไม่ใช่บั๊ก, level ไม่ถูกใช้จริง
2. **`xauusd`** — `_score_gold_rising` อ่าน `gold_chg_pct` ก่อน (มีค่าสดเสมอ → xauusd level ถูก shadow) — simulator ต้อง expose **gold_chg_pct** ไม่ใช่ xauusd
3. **`sofr_effr_spread_bps`** — **orphan scorer**: `sofr_effr_funding` อยู่ใน `INDICATOR_SCORERS` แต่ไม่มี indicator ของ 6 โมเดลไหน map ไปหา (`_INDICATOR_NAME_MAP` ไม่มี entry) → key ตายเพราะไม่มีใครใช้ (ไม่ใช่บั๊ก chain ขาด — registry สมบูรณ์)

**จัดอันดับอิทธิพลรวม:** move (96.7) > curve_10y2y_bps (95.3) > gold_chg_pct (55.4) > vix (54.7) > bank_reserves_b (36.0 — ผ่าน risk_penalty ทุกโมเดล) > us10y (26.2) > dxy (22.7) > hy_spread_bps (16.5) > us_cpi_yoy (12.3) > cot_gold_mm_net (8.8) ... ท้ายสุด: us2y/xauusd/sofr_effr_spread_bps = 0

**สำคัญป้อน ticket 03:** ตัวแปร 11 ตัวของต้นฉบับ ตัวที่ map ไปคีย์ตายใน engine เรา: **sofrSpreadBps → sofr_effr_spread_bps (DEAD)** — ถ้าเปิด slider นี้ในแบบเรา จะลากแล้วคะแนนนิ่ง (เหมือนแอปพัง) — ต้องตัดสินใจ: เปิดไว้เฉยๆ (ตาม 100% mirror) หรือ wire orphan scorer เข้าโมเดล (งานแยก) / **debtPts → ไม่มีคีย์ ctx ตรงๆ** (หนี้/GDP ไม่มีใน 27 คีย์) / **fedBps → ต้อง map ไป us10y+us2y+us2y_chg พร้อมกัน** (ไม่ใช่คีย์เดียว)

**คู่คีย์พันกัน (ป้อนหมอก):** curve = us10y−us2y (bps); gold_chg_pct มาจาก xauusd history; reserves_chg_pct มาจาก bank_reserves_b; us2y_chg มาจาก us2y (และ us2y เองตาย)

**คีย์ available=false บ่อย:** ดูค่า None ใน snapshot (`ctx_snapshot.pkl` + output สคริปต์) — simulator ใช้ fallback ค่ากลาง + warning เหลืองแบบต้นฉบับ ไม่แต่งตัวเลข

Asset: `docs/research/ctx-sensitivity-audit-2026-08-09.md`

## Question

ใน `ctx` 27 คีย์ที่ `_build_context_from()` ประกอบขึ้น (`model_service.py:639-667`) คีย์ไหน**ขยับคะแนน 6 โมเดลจริง และขยับเท่าไหร่**? คีย์ไหนไม่มีผลเลย?

"ตัวแปรสำคัญ" ในคำสั่งของ user ต้องมีนิยามที่วัดได้ ไม่ใช่ความรู้สึก — ticket นี้ทำให้มันวัดได้

## ทำไมถึงต้องรู้

ticket 03 ต้องเลือกว่าจะเปิดตัวแปรไหนให้ผู้ใช้ปรับ ถ้าเปิดตัวที่ไม่มี scorer ผูกอยู่ ผู้ใช้จะลากแล้วคะแนนนิ่งสนิท — ดูเหมือนแอปพัง ทั้งที่โค้ดถูก

มีเหตุให้สงสัยว่าบางคีย์ตายจริง: `_score_model` แมป indicator → scorer ผ่าน `_INDICATOR_NAME_MAP` + `_INDICATOR_OVERRIDES` แล้วค่อยหยิบจาก `INDICATOR_SCORERS` — ถ้า chain นี้ขาดตรงไหน `scorer` เป็น `None` และ score ถูกทิ้งเงียบๆ (`model_service.py:681-694`)

## วิธีทำ (AFK — เป็นงานวัดผล ไม่ใช่ถาม user)

เขียนสคริปต์ชั่วคราว (แนว `backend/scratch_ta_prototype.py` ที่เคยใช้ในแผน signals-tab):

1. ดึง `ctx` จริงหนึ่งชุด **แล้ว pickle/JSON เก็บไว้** — อย่ายิง network ซ้ำทุกรอบ ไม่งั้นช้าและผลไม่นิ่ง
2. คำนวณ baseline: `_score_model(m, ctx)` ครบ 6 โมเดล
3. ทีละคีย์: กวาดค่าตั้งแต่ต่ำสุดถึงสูงสุดที่สมเหตุสมผลในโลกจริง (เช่น VIX 10→80, us10y 1→8, hy_spread_bps 250→1200) แล้วบันทึกว่าคะแนนแต่ละโมเดลขยับกี่จุด
4. สรุปเป็นตาราง: **คีย์ × โมเดล → ช่วงคะแนนที่ขยับได้ (max − min)**

## สิ่งที่ต้องได้กลับมา

1. ตาราง sensitivity เต็ม (27 คีย์ × 6 โมเดล)
2. **รายชื่อคีย์ที่ขยับคะแนน 0 จุดในทุกโมเดล** พร้อมสาเหตุ — ไม่มี scorer? scorer มีแต่ไม่มีโมเดลไหนใช้ indicator นั้น? หรือ scorer อ่านคีย์ชื่ออื่น (บั๊ก)?
3. **จัดอันดับคีย์ตามอิทธิพลรวม** — คีย์ไหนคือ "ตัวแปรสำคัญ" ที่แท้จริง
4. **คู่คีย์ที่พันกันทางคณิตศาสตร์** — `curve_10y2y_bps` = us10y − us2y (หน่วย bps) หรือเปล่า? มีคู่อื่นอีกไหม (`xauusd` กับ `gold_chg_pct`, `bank_reserves_b` กับ `reserves_chg_pct`) → ป้อนเข้าหมอกข้อ "ตัวแปรที่พันกันเอง"
5. คีย์ที่ `available=false` บ่อยในการใช้งานจริง (ข้อมูลขาดประจำ)

## เป้าหมาย

ได้ตาราง sensitivity + รายชื่อคีย์ตาย บันทึกเป็นไฟล์ใน `docs/research/` และลิงก์จาก ticket นี้ → ปลดบล็อก ticket 03, 04, 06

**ถ้าเจอคีย์ตายเพราะบั๊ก** (scorer อ่านชื่อไม่ตรง) ให้บันทึกไว้ชัดๆ ใน ## Answer — เป็นข้อมูลที่ spec ต้องพูดถึง แต่**อย่าแก้โค้ดในแผนที่นี้** (แผนนี้ไม่เขียนโค้ดฟีเจอร์) ถ้ามันเป็นบั๊กที่ต้องแก้ ให้เสนอ user แยกเป็นงานต่างหาก
