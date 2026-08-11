# 04 - Grilling: คำนวณที่ไหน + สัญญา API

Type: grilling
Status: closed
Claimed: hermes/2026-08-09
Blocked by: 02

## Answer (user-confirmed 2026-08-09)

1. **ที่คำนวณ: (a) Backend** — `POST /api/models/simulate` รับ overrides คืนคะแนนใหม่; แหล่งความจริงเดียว (scorer Python อยู่แล้ว) + debounce แก้ latency
2. **จังหวะ: debounce 250ms** + แสดง spinner/"กำลังคำนวณ..." ขณะรอ — ลากจบแล้วยิง 1 ครั้ง
3. **baseline ctx: Freeze ตอนเปิดหน้า** — หน้าโหลดครั้งแรกดึง baseline ครั้งเดียว เก็บใน state ตลอดการใช้งาน ค่าฐานคงที่
4. **สัญญา response: คืน baseline + simulated คู่กัน** (ทั้ง 6 โมเดล: score ปัจจุบัน + simulated + delta) — UI วาดได้ครบ
5. **confidence: ไม่นับค่าสมมติ** — confidence คงเป็นสัดส่วนข้อมูลจริงเสมอ (ค่าจำลองไม่เพิ่มความน่าเชื่อถือ)
6. **Input validation: Validate ฝั่ง backend** — clamp/ปฏิเสธค่านอกช่วงตาม min/max ของแต่ละตัวแปร

## Question

การจำลองคำนวณที่ backend หรือ frontend และ endpoint หน้าตาเป็นยังไง?

นี่คือจุดที่ UX ชนสถาปัตยกรรม: slider ที่ดีต้องตอบสนองทันตา แต่เครื่องยนต์คะแนนเป็น Python อยู่ฝั่ง backend

## ข้อเท็จจริงตั้งต้น (ตรวจแล้ว — ไม่ต้องตรวจซ้ำ)

- `_score_model(model, ctx)` เป็น pure function ไม่แตะ network — เรียกซ้ำถูกและเร็ว
- ตัวที่ช้าคือ `macro_service.build_dashboard()` ที่ประกอบ ctx (ยิง FRED/yfinance/CFTC) ซึ่ง**ทำครั้งเดียวก็พอ** แล้ว override ทับ
- router ที่มีอยู่ใช้ pattern cache 10 นาทีในหน่วยความจำ (`_cache` ใน `routers/models.py`, `macro.py`, `signals.py`)

## ตัวเลือกที่ต้องตัดสินใจ (ถาม user ทีละข้อ)

1. **ที่คำนวณ** —
   - (a) **backend**: `POST /api/models/simulate` รับ overrides คืนคะแนนใหม่ — แหล่งความจริงเดียว แต่ทุกครั้งที่ลาก slider = HTTP round-trip
   - (b) **frontend**: port scorer ทั้งหมดไป TypeScript — ตอบสนองทันที แต่ต้องดูแลสูตรสองที่ และมีโอกาสคลาดจากกัน (~40 ฟังก์ชัน scorer)
   - (c) **ผสม**: backend คืน baseline ctx + ตารางคะแนนที่คำนวณล่วงหน้าเป็นกริด ให้ frontend interpolate
   - ความเห็นตั้งต้น: (a) — ซื่อสัตย์ต่อหลัก "แหล่งความจริงเดียว" ของโปรเจค และแก้ latency ได้ด้วย debounce แทน แต่ให้ user ตัดสิน
2. **ถ้าเลือก (a) แล้วลื่นพอไหม** — debounce กี่ ms? แสดงสถานะกำลังคำนวณยังไง? ยอมให้ค้าง 200-300ms ต่อการลากไหม
3. **baseline ctx เก็บยังไง** — ใช้ cache 10 นาทีร่วมกับ `/api/models` หรือแยก? ถ้า cache หมดอายุกลางการจำลอง ค่าฐานขยับใต้เท้าผู้ใช้ — ยอมรับได้ไหม หรือต้อง freeze ctx ตอนเปิดหน้า
4. **สัญญา request/response** — ส่ง `{overrides: {vix: 40, us10y: 5.2}}` แล้วคืนอะไร: คะแนนใหม่อย่างเดียว, หรือคืน baseline + simulated คู่กัน, หรือคืน delta ต่อ factor ด้วย (มหภาค/โครงสร้าง/ข่าว/ยืนยัน/บทลงโทษ) เพื่อให้ UI แตกดูได้
5. **`confidence` กับค่าสมมติ** (ยกมาจากหมอกในแผนที่) — indicator ที่ถูก override ควรนับเป็น "มีข้อมูล" ใน `confidence` ไหม ถ้านับ ค่าจำลองจะดูน่าเชื่อเกินจริง ถ้าไม่นับ คะแนนจำลองเทียบ baseline ไม่ตรง มีทางที่สามไหม (เช่น คืน `confidence` สองค่า: จริง กับ จำลอง)
6. **การตรวจค่าที่รับเข้า** — จำกัดช่วงที่ฝั่ง backend ด้วยไหม หรือเชื่อ UI? (ค่านอกช่วงอาจทำให้ `_score_linear` ให้ผลแปลก)

## เป้าหมาย

ได้สถาปัตยกรรม + สัญญา endpoint ที่เขียนลง spec ได้ตรงๆ → บันทึกเป็น ## Answer → ปลดบล็อก ticket 07
