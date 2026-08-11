# 05 — Prototype: Multi-agent prompt design

Type: prototype
Status: open
Claimed:
Blocked by: 01

## Question

ออกแบบ prompt structure สำหรับ multi-agent trade desk (1 ทีม deepseek — 5 persona):

1. **Lead prompt** (system): หัวหน้าทีม — ประเมินตลาด, ตั้งวาระประชุม, ฟัง analysts, เคาะออเดอร์, ปรับธรรมนูญทีม
2. **Analyst prompts** (system × 4):
   - trend: สายโมเมนตัม/เทรนด์ — ดู MA, โมเมนตัม, คะแนนโมเดล
   - technical: สายเทคนิคอล — แนวรับ/ต้าน, รูปแบบแท่ง, volume
   - macro: สายมหภาค — FRED, ยิลด์, เงินเฟ้อ, จุดเปลี่ยน
   - contrarian: สายสวนฝูง — ข่าว impact, ตำแหน่งตลาด, โอกาสกลับตัว
3. **Meeting agenda format**: lead เลือก topics + lens → สร้าง user message ให้ analysts
4. **Output format**: JSON schema (order: market/side/size_pct/sl/tp)
5. **Constitution (ธรรมนูญทีม)**: rules/constraints — e.g. "no market orders", "max 3 positions"

Deliverable: prompt templates + tested flow (อย่างน้อย 1 mock turn)
