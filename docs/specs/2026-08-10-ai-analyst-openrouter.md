# AI Technical Signal narrative ผ่าน OpenRouter (AiAnalyst)

Date: 2026-08-10
Status: **Shipped** — commit `b5d4538`
แผน: `.scratch/ai-analyst-openrouter/` (tickets 01–03) · Spec เขียนจากโค้ดที่ ship จริง (อ่านไฟล์ทีละบรรทัด — บทเรียน forecast-tab)

## 1. ขอบเขต

**ทำ:** เปลี่ยน LLM ของ AI Technical Signal narrative (`AiAnalystPanel`) จาก **Ollama local** (`host.docker.internal:11434` · `scb10x/llama3.2-typhoon2-3b-instruct` · ~39–70s/คอล CPU) เป็น **DeepSeek ผ่าน OpenRouter** (`deepseek/deepseek-v4-flash-0731` + reasoning off — config เดียวกับ boardroom/news ที่ย้ายไปแล้ว) · ลบพึ่งพา Ollama ออก (ไม่มี fallback) · เอาต์พุตคงเดิม

**ไม่ทำ:** เปลี่ยน prompt/parse/วินิจฉัยความขัดแย้ง (model-agnostic — ใช้ต่อ) · fallback กลับ Ollama (ตัดสินแล้วไม่เก็บ) · เปลี่ยนสัญญาส่วนหน้า (frontend ไม่แตะ)

**ห้ามละเมิด:** ห้ามยิง DeepSeek จริงในเทสต์ — stub 100% (patch `httpx.post`)

## 2. Config (reuse จาก news_service — ไม่มีค่าใหม่)

- `DEEPSEEK_URL = https://openrouter.ai/api/v1/chat/completions` (news_service:61)
- `DEEPSEEK_MODEL = deepseek/deepseek-v4-flash-0731` (news_service:62)
- `_deepseek_key()` = `os.environ.get("DEEPSEEK_API_KEY")` (env var เดียวกับ boardroom/news)
- `TIMEOUT_SECONDS = 300` (DeepSeek long-form Thai narrative — OpenRouter cloud)

## 3. `_call_llm` (ai_narrative_service.py:352 — เดิม `_call_ollama`)

```python
key = _deepseek_key()
if not key: raise AiNarrativeError("DEEPSEEK_API_KEY not set (OpenRouter)")
try:
    r = httpx.post(
        DEEPSEEK_URL,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={
            "model": DEEPSEEK_MODEL,
            "messages": [
                {"role": "system", "content": "คุณคือนักวิเคราะห์เทคนิคอลหุ้นที่ตอบเป็นภาษาไทย"},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 8000,
            "stream": False,
            "response_format": {"type": "json_object"},
            "reasoning": {"enabled": False},   # OpenRouter-native; `thinking` didn't stick
        },
        timeout=TIMEOUT_SECONDS,
    )
except httpx.TimeoutException: raise AiNarrativeError(f"OpenRouter call timed out after {TIMEOUT_SECONDS}s")
except httpx.HTTPError:        raise AiNarrativeError(f"Could not reach OpenRouter: {type(e).__name__}")
if r.status_code != 200:       raise AiNarrativeError(f"OpenRouter returned HTTP {r.status_code}: {r.text[:200]}")
content = r.json()["choices"][0]["message"]["content"]   # กัน `reasoning` ปน — อ่าน .content เท่านั้น
if not content:                raise AiNarrativeError("OpenRouter returned empty content")
return content
```

- อ่าน `choices[0].message.content` **ไม่ใช่** `message.reasoning` — หลัง reasoning:false โมเดลคืน JSON ใน content ตรงๆ
- Error handling เปลี่ยนเป็น OpenRouter/network — หน้าเดิม (fallback `AiNarrativeError` → /ai-narrative/analyze คืน 503 + "AI วิเคราะห์ไม่สำเร็จ + retry")

## 4. ส่วนที่ไม่แตะ (ใช้ต่อ)

- `_parse_model_output` — `json.loads` + `AiNarrativeOut(**parsed)` · `_is_degenerate_response` (`MIN_NARRATIVE_LENGTH = 80` — กัน template echo) · `_detect_conflicts` (rules A/B/C) · cache (ticker, date) — ทั้งหมด model-agnostic
- **สัญญาส่วนหน้า (contract `AiNarrativeOut`) เดิม**: `{sentiment: bullish|bearish|neutral, narrative, conflicting_signals: list[str]|null, caveats: list[str]}` (schemas.py:370) — frontend `AiAnalystPanel` + hook `useAiNarrative` ไม่แตะ
- AI Analyst = **on-demand เท่านั้น** (กดเรียก — ไม่ auto-refresh)

## 5. ต้นทุน / เวลา (prototype 01 วัดจริง)

| | Ollama local (เดิม) | DeepSeek OpenRouter (ใหม่) |
|---|---|---|
| เวลา | ~39–70s/คอล (CPU) | **~11.2s/คอล** |
| ราคา | ฟรี (CPU) | **~$0.00027/คอล** |
| ภาษาไทย | typhoon2-3b | DeepSeek-v4-flash — ธรรมชาติ 4 ย่อหน้า (user ตรวจแล้วเห็นด้วย) |

## 6. เทสต์ (test_ai_narrative.py — 38 เทสต์)

- stub 100% — patch `app.ai_narrative_service.httpx.post` (ไม่ยิง network)
- **2 เทสต์เก่าอัปเดตตาม migration** (เปลี่ยนจาก Ollama → OpenRouter):
  - `test_get_ai_narrative_raises_on_openrouter_timeout` — patch `httpx.TimeoutException` → expect "timed out"
  - `test_get_ai_narrative_raises_on_openrouter_unreachable` — patch `httpx.ConnectError` → expect "Could not reach OpenRouter"
- `test_analyze_route_returns_503_on_failure` / `..._200_on_success` — ยังผ่าน (contract เดิม)

## 7. ตัวเลขจริง (รันสด 2026-08-10)

- backend pytest: **528 passed** (38/38 ai_narrative) · frontend vitest `useAiNarrative.test.tsx` **5/5** (contract หน้าเดิม ไม่พัง) · `tsc --noEmit` **0 error** · `hermes verify --json` **ok:true** (docker build + readiness ready)

## 8. Git history

- `b5d4538` — AI Analyst: migrate ollama → DeepSeek via OpenRouter (reasoning off) — `backend/app/ai_narrative_service.py` + `backend/tests/test_ai_narrative.py` (94 insert / 81 delete)
