# 01 - Prototype: DeepSeek AiAnalyst วัดต้นทุน+เวลา+คุณภาพไทย

Type: prototype
Status: closed
Claimed: hermes/2026-08-10
Blocked by: —

## Question

ยิง DeepSeek ผ่าน OpenRouter จริงด้วย **prompt ของ ai_narrative_service (ไม่ใช่ prompt ทดลอง)** —
ใช้ scenario ข้อมูลจริง (SMA/MACD/RSI/conflict อย่างน้อย 1) วัด:

1. **ต้นทุนจริง** ต่อ 1 คอล (US$ — ใช้ reasoning:enabled:false ตามที่ปิดได้จริง)
2. **เวลา** ต่อคอล (เทียบกับ Ollama 39–70s)
3. **คุณภาพภาษาไทย**: อ่าน natural/เป็นคน/ละเอียด 4-6 ย่อหน้า? ตรง JSON schema
   (sentiment/narrative/caveats)? — **ต้อง user ตัดสิน** (HITL — ผมเอาเนื้อหาให้ดูเอง)
4. ตอบ "ถ้าสองทีม...": ถ้าต้นทุนสูงเกิน/คุณภาพไทยไม่พอ → เสนอทางเลือก (model slug อื่น) ก่อนตัดสิน

**คำถามชี้ขาด:** ค่าใช้จ่าย/เวลา/คุณภาพที่วัดได้ — ยอมรับไหมที่จะเปลี่ยนไป OpenRouter?

## Answer (resolved 2026-08-10 — HITL user เห็นด้วย)

**DeepSeek ผ่าน OpenRouter ใช้ได้จริงกับ AI Analyst — ตัวเลขจากการยิง prompt จริง**
(เลียนแบบ `get_ai_narrative` เต็ม — _call_ollama→OpenRouter แต่ prompt/parse/conflicts/fact-check/degenerate-guard ครบ)

| Scenario | ผล | เวลา | ต้นทุน |
|---|---|---|---|
| NVDA bull+overbought (2 conflicts) | **OK** · sentiment=neutral (ถูก override ตาม Rule A) · conflicts 2 รายการพ่วงถูก · narrative 768 ตัวอักษร · degenerate-guard ไม่โดน | **11.2s** | **$0.00027** |

- **เทียบ Ollama:** 39–70s → 11.2s (เร็ว ~4-6 เท่า) · free → **$0.00027/คอล** (on-demand — ถูกมาก)
- **คุณภาพไทย:** user ดูแล้ว **เห็นด้วย** — ไทยธรรมชาติ 4 ย่อหน้า, รับมือ conflicts ที่ระบบคำนวณให้, ออก JSON ตรง schema
- ข้อควรรู้: prompt 8k tokens ใช้ไม่หมดใน actual (แค่พอ) · ใช้ `reasoning:enabled:false` + `response_format:json_object` เหมือนที่พิสูจน์แล้ว
- **คำถามชี้ขาดตอบแล้ว:** ต้นทุน/เวลา/คุณภาพ ยอมรับได้ → ปลด 02

asset: `.scratch/ai-analyst-openrouter/prototype-01/probe_ai_analyst.py`

## Notes

- รันจริงบน venv backend (`env -u PYTHONPATH -u VIRTUAL_ENV`) — reuse `_deepseek_key` +
  `reasoning.enabled=false` + `response_format: json_object`
- ใช้ prompt จริง `_build_prompt(...)` จาก ai_narrative_service — ไม่รับ prompt เทียม
- ต้นทุนคำนวณจาก usage ของ response + อัตรา v4-flash ใน memory
