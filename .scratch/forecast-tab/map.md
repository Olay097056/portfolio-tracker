# Map — จำลองสถานการณ์ (Scenario simulation tab) สำหรับ Bond-crisis

## Destination

เดินแผนที่นี้จนตัดสินครบทุกข้อ แล้วสรุปเป็น **spec ไฟล์เดียวใน `docs/specs/`** สำหรับ sub-tab ที่ 7 ของ Bond-crisis ชื่อ **"จำลองสถานการณ์"** — มิเรอร์หน้า `/forecast` ของ bond-crisis-dashboard-v2 100% เท่าที่ทำได้, เป็น **what-if ไม่มีแกนเวลา** (ปรับตัวแปรมหภาค → คะแนน 6 โมเดลคำนวณใหม่ทันที เทียบกับค่าปัจจุบัน), ครอบคลุมผลกระทบต่อ **คะแนนโมเดล** และต่อ **สัญญาณเทรด**, พร้อมต่อ **news factor** ที่ตายอยู่ (hardcode 0) ให้กลับมาทำงาน

**แผนที่นี้ไม่เขียนโค้ดฟีเจอร์** — ปลายทางคือ spec ที่ตัดสินครบจนโมเดลอื่นอ่านแล้วลงมือเขียนได้เลย โดยไม่ต้องเข้าใจ wayfinder

## Notes

- **Tracker: local markdown** (repo นี้ไม่มี git remote) — ticket อยู่ที่ `issues/NN-*.md` แต่ละใบมีหัว `Type:` / `Status:` / `Blocked by:` — **frontier** = ใบที่ `Status: open` และทุกใบใน `Blocked by:` ปิดหมดแล้ว **การจอง (claim)**: เติมบรรทัด `Claimed: <session/วันที่>` ใต้ `Status:` ก่อนเริ่มงาน เพื่อไม่ให้ session อื่นหยิบซ้ำ
- Domain: full-stack feature ใน repo นี้ (FastAPI backend + React 19/Vite frontend, **ไม่มี Tailwind** — inline style ล้วน, Thai-first UI)
- ทุก session ควร consult: `backend/app/model_service.py` (เครื่องยนต์คะแนนที่จะถูกจำลอง), `frontend/src/components/tools/ModelsDashboard.tsx` (UI ของ tab โมเดลทำกำไร ที่ tab นี้ต้องกลมกลืน), `docs/specs/2026-08-08-macro-dashboard.md` (spec ที่ขยายมา 3 ครั้ง — ฟอร์แมตอ้างอิงสำหรับ ticket 08)
- แผนที่พี่น้องที่จบแล้ว: `.scratch/signals-tab/map.md` (tab สัญญาณเทรด — ticket 06 ต้องอ่าน), `.scratch/planning/map.md` (PRD เดิม)

**ข้อเท็จจริงที่ตรวจแล้วในโค้ดจริง (2026-08-09) — อย่าตรวจซ้ำ:**

- `build_models()` → `macro_service.build_dashboard()` → `_build_context_from(dash)` → **`ctx` dict 27 คีย์** → `_score_model(model, ctx)` ทีละโมเดล (`model_service.py:622`, `:674`, `:773`)
- **`_score_model(model, ctx)` เป็น pure function** — ไม่แตะ network เลย รับ ctx เข้าไปแล้วคืนคะแนน แปลว่า simulator ทำได้ด้วย `_score_model(model, {**ctx, **overrides})` **โดยไม่ต้อง refactor engine** นี่คือรอยต่อหลักของทั้งแผน
- สูตรคะแนน: `total = macro + market_structure + news + confirmation + risk_penalty` เพดาน 30/25/15/20/15 (`FACTOR_CAPS`)
  - macro = ค่าเฉลี่ยถ่วงน้ำหนักของ indicator เฉพาะโมเดลนั้น
  - market_structure ← `curve_10y2y_bps`, `move`, `gold_chg_pct`
  - confirmation ← `vix`, `curve_10y2y_bps`, `move`
  - risk_penalty ← `cot_gold_mm_net > 200000`, `bank_reserves_b < 3000`
  - **news = 0.0 hardcode** (`model_service.py:721`) คอมเมนต์บอก "ยังไม่มี news feed ในแอป" ซึ่งล้าสมัยแล้ว
- เกณฑ์สถานะ: `BUILDING_THRESHOLD = 40.0`, `ACTIVE_THRESHOLD = 60.0` (`model_service.py:45`)
- หกโมเดล: recovery-reflation, inflation-oil, fed-pivot, yield-shock, credit-panic, bank-run
- `confidence` = สัดส่วน indicator ที่มีข้อมูลจริง (`model_service.py:753`)
- ตาราง `news_items` มี `impact_score` (0-100) **และ `related_models` (JSON list)** อยู่แล้ว (`news_service.py:81`, `:85`) — วัตถุดิบสำหรับ news factor มีครบ ไม่ต้องเก็บข้อมูลใหม่
- BondCrisisPage มี 6 sub-tab แล้ว: macro / models / signals / banking / countries / news (`BondCrisisPage.tsx:17`) — tab นี้เป็นใบที่ 7
- สัญญาณเทรดเกิดเมื่อ **model score ≥ 40 และ ta_score ≥ 50** — ta_score มาจากแท่งเทียน yfinance ไม่ได้อยู่ใน ctx
- หน้า `/forecast` ต้นฉบับ **login-gated** (เปิดดูแล้วขึ้น "เข้าสู่ระบบเพื่อดูหน้านี้") — agent ล็อกอินแทน user ไม่ได้ ต้องพึ่ง JS bundle สาธารณะเหมือน tab ก่อนๆ

**หลักการที่ห้ามละเมิด (ทั้งโปรเจค):** ไม่แต่งตัวเลข ถ้าแหล่งข้อมูลไม่มี → แสดง "—" และในแผนนี้เพิ่มอีกข้อ: **ค่าที่มาจากการจำลองต้องแยกออกจากค่าจริงอย่างชัดเจนเสมอ** ผู้ใช้ต้องไม่มีทางเข้าใจผิดว่าตัวเลขสมมติคือตัวเลขตลาด

## Decisions so far

<!-- ยังไม่มี ticket ไหนถูกปิด -->

- [01 - Research: ขุดหน้า /forecast ของต้นฉบับ](issues/01-research-forecast-page.md) — หน้าเป็น what-if slider panel: 11 ตัวแปร (slider ล้วน, ค่าส่วนต่าง signed ยกเว้น auctionBtc ค่าสัมบูรณ์ default 2.5) → `simulated = clamp(0,100, score + h(state) − h(default))` คำนวณ client-side ด้วยสูตร h() ฝังเต็มใน bundle (เป็นเวอร์ชัน "แบบย่อ" — หน้าแจ้งเอง); base series 7 ตัวมี fallback ค่ากลาง (us10y 4.2, us2y 3.8, vix 18, usoil 70, hy 300, cpi 3, dxy ประกาศแต่ไม่ใช้); **ไม่มี preset scenarios** (หาไม่เจอ), **ไม่มีตัวแปรข่าว** (news 0 hits) → news factor เป็นการออกแบบของเราเอง; UI: double progress bar (base slate + overlay accent/orange ตาม delta เครื่องหมาย), delta เขียว >0.5 / แดง <−0.5, expand แสดง scenarioActivates/Deactivates (threshold 40/60) + signalMap; copy ไทยครบใน asset — หลักฐานดิบ (URL + ข้อความดิบ) ทุกข้อใน `docs/research/forecast-page-2026-08-09.md`
- [02 - Research: Sensitivity audit — ctx คีย์ไหนขยับคะแนนโมเดลจริง](issues/02-research-ctx-sensitivity.md) — ตาราง sensitivity 27×6 เต็ม (sweep จริงจาก ctx snapshot pickled); **dead keys 3 ตัว: `us2y` (ไม่มี scorer อ่าน level), `xauusd` (ถูก gold_chg_pct shadow), `sofr_effr_spread_bps` (orphan scorer — ไม่มี indicator ไหน map ไปหา)**; อันดับอิทธิพล: move > curve > gold_chg_pct > vix > bank_reserves_b; ตัวแปรต้นฉบับที่ map ไปคีย์ตาย: sofrSpreadBps (DEAD ในเรา), debtPts (ไม่มีคีย์ตรง), fedBps (ต้อง map หลายคีย์พร้อมกัน); คู่คีย์พันกัน: curve=10y−2y, gold_chg มาจาก xauusd, reserves_chg มาจาก level, us2y_chg มาจาก us2y — asset: `docs/research/ctx-sensitivity-audit-2026-08-09.md`
- [03 - Grilling: เลือกชุดตัวแปรที่ปรับได้ + วิธีป้อนค่า + preset](issues/03-grilling-variable-set.md) — user ตัดสินครบ 7 ข้อ: ครบ 11 ตัวตามต้นฉบับ (เพิ่ม scorer ให้ dead keys 3 ตัว); ค่าส่วนต่างเริ่ม 0 ยกเว้น auctionBtc สัมบูรณ์ 2.5; ช่วง/ขั้นยึดต้นฉบับเป๊ะ; พันกันคำนวณต่อเนื่อง (fedBps→us10y/us2y/curve); available=false เปิดลาก + fallback ค่ากลางต้นฉบับ + warning เหลือง; เพิ่ม preset 5 อันออกแบบเอง (น้ำมันช็อก/เฟดช็อก/วิกฤตเครดิต/เงินฝากไหลออก/รีเฟลชัน); มีปุ่มรีเซ็ต + แสดงค่าจริงใต้ slider + disclaimer
- [04 - Grilling: คำนวณที่ไหน + สัญญา API](issues/04-grilling-compute-architecture.md) — user ตัดสินครบ 6 ข้อ: **backend** `POST /api/models/simulate` (แหล่งความจริงเดียว) + **debounce 250ms** + spinner; **freeze baseline ตอนเปิดหน้า** (ค่าคงที่ตลอดการใช้งาน); คืน **baseline + simulated คู่กัน** ทั้ง 6 โมเดล; **confidence ไม่นับค่าสมมติ** (สัดส่วนข้อมูลจริงเสมอ); **validate ฝั่ง backend** (clamp ตาม min/max)
- [05 - Grilling: ปลุก news factor ที่ hardcode 0](issues/05-grilling-news-factor.md) — user ตัดสินครบ 6 ข้อ: รวมคะแนน**ถ่วงน้ำหนักความสด** (0-2 วันเต็ม/3-5 ครึ่ง/6-7 จาง, cap 100); หน้าต่าง **7 วัน**; **บวกเท่ากันทุกโมเดลที่เกี่ยว** (impact_score เดียว ไม่เพิ่ม field ทิศทาง); **ไม่มีข่าว = ทิ้ง** (drop จาก denominator ตรงหลักไม่แต่ง); simulator **ปรับได้** (slider ระดับข่าวแรง 0-100 ต่อโมเดล); **ยอมรับผลต่อประวัติ + เส้นแบ่ง** ในกราฟ ("คะแนนก่อน/หลังรวม news factor")
- [06 - Grilling: จำลองผลกระทบต่อสัญญาณเทรด](issues/06-grilling-signals-impact.md) — user ตัดสินครบ 5 ข้อ: **(b) "สัญญาณที่มีสิทธิ์เกิด"** (โมเดลผ่าน 40 + ระบุว่ารอ TA ยืนยัน ไม่ดึง TA จริง); **บอกทั้งสองทาง** (เกิดใหม่ + active อ่อนแรง) + คำนวณ model_conviction ใหม่ตามคะแนนจำลอง; แสดง **ในหน้าจำลองเอง** (section ผลต่อสัญญาณเทรด ใต้รายการโมเดล); **ห้าม persist ลง trading_signals เด็ดขาด** (ข้อห้ามใน spec); disclaimer สั้น "การจำลองเป็นค่าประมาณทิศทาง — ไม่ใช่คำแนะนำการลงทุน และไม่ใช่สัญญาณจริง"
- [07 - Prototype: หน้าตา tab จำลองสถานการณ์](issues/07-prototype-tab-ui.md) — **user อนุมัติ "ลุยเลย"** — prototype `prototype-07/index.html` ผ่าน as-is: แผงซ้าย 380px (5 preset pills + slider 4 หมวด + 6 slider ข่าว + รีเซ็ต/ค่าจริง/disclaimer) · การ์ด 6 โมเดล ranked (#1-#6 ตาม simulated) badge สถานะ + score→simulated + delta สี + double progress bar + เส้นขอบประเหลืองเมื่อจำลอง≠จริง + ▲/▼ เกณฑ์ 40/60 + expand factor table · banner + disclaimer แยกค่าสมมติชัด · badge "⏳ กำลังคำนวณ..." (debounce 250ms) · มือถือยุบ 1 คอลัมน์
- [08 - Task: เขียน spec ส่งมอบ](issues/08-task-write-spec.md) — **`docs/specs/2026-08-09-forecast-scenario-simulation.md`** ครบ 9 หัวข้อ (ขอบเขต/ตัวแปร 11+6/API simulate/news factor/สัญญาณ/UI/เทสต์/หลักห้ามละเมิด/ลำดับลงมือ) — อ่านแล้วตอบได้ทุกคำถามจาก tickets 01-07 โดยไม่ต้องเปิด ticket — **MAP CLOSED 8/8**. ⚠️ session ที่ทำ (Hermes) commit โค้ดฟีเจอร์จริงเข้า branch ด้วย (`2f89c1a`) ผิด Destination — user ยืนยันเก็บโค้ดไว้ ตรวจอิสระพบบั๊กจริง 1 ตัว (`oilPct` slider ไม่ขยับคะแนนเลย — ctx key ผิด) **แก้แล้ว** + spec เอกสารผิด 2 จุด (แก้แล้ว) รายละเอียดเต็มใน ticket 08

## Not yet specified

- **`confidence` กับค่าสมมติ** — `confidence` คือสัดส่วน indicator ที่มีข้อมูลจริง ถ้า simulator ยัดค่าสมมติเข้าไป indicator นั้นควรนับว่า "มีข้อมูล" ไหม? ถ้านับ ตัวเลขจะดูน่าเชื่อกว่าความจริง ถ้าไม่นับ คะแนนจำลองจะเทียบกับ baseline ไม่ตรง — ปลดจาก 03 แล้ว (ต้นฉบับใช้ fallback ค่ากลาง + warning) แต่ผลต่อ confidence ยังรอ ticket 04 (สัญญา API)
- **ตัวแปรที่ตอนนี้ `available=false`** — ปลดจาก 03 แล้ว: เปิดลาก + fallback ค่ากลาง + warning (ตามต้นฉบับ) — ตัดสินแล้ว ย้ายออกจาก fog
- **กลยุทธ์การเทสต์ที่ spec ต้องระบุ** — จะกำหนดหลังรู้รูปร่าง API (ticket 04) และ UI (ticket 07)

## Out of scope

- **บันทึก/แชร์ฉากทัศน์** — เก็บฉากทัศน์ที่ปรับไว้ลง DB เทียบข้ามฉาก แชร์ลิงก์ (user ตัดสิน 2026-08-09) ต้องเพิ่มตาราง + endpoint + UI อีกชุด ทำทีหลังได้ถ้าใช้จริงแล้วอยากได้
- **แจ้งเตือน Telegram เมื่อฉากทัศน์เกิดจริง** — ต้องเชื่อมบัญชี เคยกันออกนอก scope มาแล้วในแผนที่ signals-tab (user ตัดสิน 2026-08-09)
- **แกนเวลา / การพยากรณ์ไปข้างหน้า** — "ถ้า Fed ลดดอกเบี้ย ก.ย. อีก 3 เดือนคะแนนจะเป็นเท่าไหร่" ต้องมีแบบจำลองว่าตัวแปรมหภาควิวัฒน์ยังไงตามเวลา ซึ่ง engine ไม่มีและเป็นงานคนละสเกล (user ตัดสิน 2026-08-09 — เลือก what-if ณ ขณะนี้)
- **หน้าอื่นของต้นฉบับที่ยังไม่ทำ** (ห้องประชุม, ออฟฟิศ 3D) — ไม่เกี่ยวกับปลายทางนี้
