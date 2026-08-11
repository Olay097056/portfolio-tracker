# 02 - Task: ย้าย ai_narrative_service จาก Ollama → OpenRouter

Type: task
Status: closed
Claimed: hermes/2026-08-10
Blocked by: 01

## Answer

ย้ายเสร็จ 2026-08-10 — `_call_ollama()` → `_call_llm()` (DeepSeek ผ่าน OpenRouter) ตามผัง 01

### สิ่งที่เปลี่ยน (`backend/app/ai_narrative_service.py`)
- ลบ `requests`/Ollama → ใช้ `httpx.post(DEEPSEEK_URL)` + Bearer `_deepseek_key()` (reuse `news_service.DEEPSEEK_*`)
- `model=DEEPSEEK_MODEL` · `response_format: {"type":"json_object"}` · `reasoning: {"enabled": False}` · `timeout=300` · อ่าน `choices[0].message.content` (กัน `reasoning` ปน)
- error handling ใหม่: TimeoutException→"OpenRouter call timed out after 300s" · HTTPError→"Could not reach OpenRouter: {type}" · non-2xx→"OpenRouter returned HTTP {code}" · ไม่มี content→"no content/empty"
- prompt/parse/`_is_degenerate_response`/`_detect_conflicts`/cache — ไม่แตะ (contract `AiNarrativeOut` เดิม)

### เทสต์ (อัปเดตให้ตรง migration)
- 2 เทสต์เก่า Ollama (`..._on_ollama_timeout`/`..._unreachable`) → patch `httpx.post` + error ใหม่ → เปลี่ยนชื่อเป็น `..._on_openrouter_timeout`/`..._on_openrouter_unreachable`
- ต้นทุน/เวลา (จาก prototype 01): ~11.2s · $0.00027/คอล — คอมเมนต์ในโค้ดแล้ว

### Verify
- backend full suite: **528 passed** (38/38 ai_narrative) · frontend `useAiNarrative.test.tsx` **5/5** (contract หน้าเดิม ไม่พัง) · `tsc --noEmit` **0 error**
- ห้ามยิง DeepSeek จริง — stub 100% (patch httpx.post)

### ไฟล์ของ ticket 02 (รอ "ลุย" commit)
- `backend/app/ai_narrative_service.py` (M) · `backend/tests/test_ai_narrative.py` (M — รวม 2 เทสต์ที่ผมแก้)

1. เปลี่ยน `_call_ollama()` → `_call_llm()`: `httpx.post(DEEPSEEK_URL)` + Bearer `_deepseek_key()`
   + `model=DEEPSEEK_MODEL` + messages[sytem+user] + `max_tokens` + `response_format: json_object`
   + `reasoning: {"enabled": False}` — อ่าน `choices[0].message.content` (กัน `reasoning` ต่างจาก content)
2. ลบ `OLLAMA_URL` + `MODEL` local (typhoon2) — reuse `news_service.DEEPSEEK_URL/MODEL`
3. prompt/parse/`_is_degenerate_response`/`_detect_conflicts`/cache — ใช้ต่อ (ไม่แตะ contract)
4. error handling เปลี่ยนเป็น OpenRouter/network (fallback หน้าเดิม "AI วิเคราะห์ไม่สำเร็จ + retry")
5. เทสต์ stub API 100% (patch `httpx.post`) + ตรวจ frontend AiAnalystPanel ไม่พัง (contract เดิม)
6. หยุดรอ user ตรวจก่อน commit

## Notes

- reuse config ที่พิสูจน์แล้ว (memory: OpenRouter + reasoning:enabled:false ทำงานจริง)
- ค่าที่ 01 วัดได้ (ต้นทุน/เวลา) ไปใส่คอมเมนต์/คำเตือน
