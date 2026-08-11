# AI Analyst → OpenRouter (DeepSeek)

## Destination

เปลี่ยน LLM ของ **AI Technical Signal narrative (AiAnalystPanel)** จาก **Ollama local**
(`host.docker.internal:11434` · `scb10x/llama3.2-typhoon2-3b-instruct` · ~39–70s/คอล CPU)
เป็น **DeepSeek ผ่าน OpenRouter** (`deepseek/deepseek-v4-flash-0731` + reasoning off —
config เดียวกับ boardroom/news ที่ย้ายไปแล้ว) · ลบพึ่งพา Ollama ออก (ไม่มี fallback) ·
เอาต์พุตคงเดิม (AiNarrativeOut: sentiment/narrative/caveats → การ์ด) · prompt/parse/
วินิจฉัยความขัดแย้ง (model-agnostic) ใช้ต่อ · วัดต้นทุน/เวลา/คุณภาพ Thai จริงก่อนตัดสินใจขั้นสุดท้าย

## Notes

- โดเมน: portfolio-tracker; ดู `free-market-data-fetching` · `hermes-agent` ตามที่ใช้
- **reuse config OpenRouter ที่มี**: `news_service.DEEPSEEK_URL/MODEL/_deepseek_key` +
  `reasoning: {"enabled": False}` (พิสูจน์แล้วว่าได้ผลจริงบน OR — ดู memory) · `httpx` + `json_object`
- พื้นที่ย้ายแคบ: `ai_narrative_service.py` จุด `_call_ollama()` → `_call_llm()` (OpenRouter
  chat/completions) · `OLLAMA_URL`/`MODEL` local ลบ · prompt/parse/`_is_degenerate_response`/
  `_detect_conflicts`/cache (ticker,date) ใช้ต่อไม่ต้องแตะ
- AI Analyst = on-demand เท่านั้น (ไม่ auto) — ค่าใช้จ่าย = ต่อการกดผู้ใช้
- กติกาแผน (เหมือน 3 แผนก่อน): เขียน → เทสต์จริง(stub API 100%) → รายงาน → หยุดรอตรวจก่อน commit

## Decisions so far

**แผนปิดแล้ว 2026-08-10** — ทุก ticket resolve · shipped ใน commit `b5d4538` (migrate backend) · spec as-built: `docs/specs/2026-08-10-ai-analyst-openrouter.md`

- [01 กำหนดทิศทาง (chart)](https://c/p) — user เห็นด้วย ย้ายเป็น OpenRouter ตัวเดียวกับที่เหลือ +
  ตัด Ollama ออก (ไม่เก็บ fallback) · ต้อง prototype วัดต้นทุน/เวลา/คุณภาพ Thai ก่อนย้ายจริง
- [Prototype DeepSeek AiAnalyst](issue 01) — วัดจริงด้วย prompt ของ ai_narrative: NVDA bull+overbought
  · **OK 11.2s · $0.00027/คอล** (vs Ollama 39–70s/free) · ไทย natural 4 ย่อหน้า · conflicts รองรับได้ ·
  user เห็นด้วย → ปลด 02 (ย้าย backend)
- [02 ย้าย backend](issue 02) — `_call_ollama()` → `_call_llm()` (OpenRouter) · reuse `news_service.DEEPSEEK_*`
  · `reasoning:{enabled:false}` · อ่าน `choices[0].message.content` · error ใหม่ · 2 เทสต์ Ollama อัปเดต→OpenRouter
  · backend 528 passed / frontend hook 5/5 / tsc 0 / hermes verify ok · commit `b5d4538`
- [03 spec + ปิด](issue 03) — spec as-built เขียนแล้ว → ปิดแผน

## Not yet specified

- ต้นทุน/เวลาจริงต่อคอล (prototype 01 จะวัด — ยังเป็นตัวเลขไม่ได้จนกว่า)
- คุณภาพภาษาไทย DeepSeek-v4-flash vs typhoon2-3b (prototype 01 — ต้อง user ตัดสิน)
- ถ้าคุณภาพ DeepSeek ไม่พอ → ทางเลือก model slug อื่นบน OpenRouter (deepseek-chat/อื่น) — ยังไม่ ticket
  จนกว่าวัด 01 จะรู้ผล
- frontend AiAnalystPanel ต้องแก้ไหม (คาดว่าไม่ — contract เหมือนเดิม; ตรวจใน 02)

## Out of scope

(ยังไม่มี)
