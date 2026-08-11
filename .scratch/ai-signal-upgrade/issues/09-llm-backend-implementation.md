Type: task
Blocked by: 04
Status: resolved

## Question

Implement the backend half of the LLM integration, exactly per the contract in [ออกแบบ LLM integration contract](04-llm-integration-contract.md):

1. **Fix Ollama networking**: set `OLLAMA_HOST=0.0.0.0` (persistent, not a one-off env var for a single terminal session — needs to survive reboots/service restarts) and restart the Ollama service. Verify `docker exec portfolio-tracker-backend-1 curl http://host.docker.internal:11434/api/version` succeeds before moving on.
2. **New router** `backend/app/routers/ai_narrative.py`: `POST /ai-narrative/analyze`, request `{ ticker: string, metrics: AiSignalMetrics }` (mirror the TS shape from `frontend/src/utils/aiTechnicalSignal.ts` on the Python/Pydantic side), response `{ sentiment: "bullish"|"bearish"|"neutral", narrative: string, conflictingSignals: string[] | null, caveats: string[] }` on success, or a distinct error shape the frontend can render as "AI วิเคราะห์ไม่สำเร็จ" + retry.
3. **Ollama call**: prompt the model (`llama3.2:3b`, per ticket 02's default) with the full metrics, formatted similarly to ticket 02's test prompt, instructing it to respond in the structured JSON shape above, in Thai. Handle: timeout (Ollama can take ~39s+ — set a generous timeout, e.g. 90s, not the default), unparseable JSON (attempt to extract/repair, but genuinely fail rather than fabricate fields if it can't), and connection failure (Ollama not running/unreachable).
4. **Cache**: in-memory `(ticker, date)` keyed cache, following `history_service.py`'s existing pattern (TTL or exact-date-match, your call — but note in the Answer which you picked and why).
5. **Wire the frontend**: new hook or extend `useAiTechnicalSignal.ts` to call this endpoint on-demand (button click, not automatic), handle loading/error/retry states per ticket 04's fallback decision. This can be minimal/unstyled — ticket 05 (UI prototype) owns making it look right; this ticket just needs it functionally wired.
6. Tests: backend route tests (mock the Ollama call — don't require a real model download in CI), frontend hook tests for the loading/success/error states.

## Answer

All 6 steps done and verified live, not just unit-tested:

1. **Ollama networking fixed**: `OLLAMA_HOST=0.0.0.0` set persistently (`setx`, User scope) + Ollama restarted. Confirmed via `netstat` (now listening on `0.0.0.0:11434`) and a real `docker exec` call from `portfolio-tracker-backend-1` to `http://host.docker.internal:11434/api/version` — succeeded. (Along the way: Docker Desktop itself was found in an unhealthy state — duplicate `com.docker.backend` processes, `docker ps` hanging — and needed a restart; unrelated to Ollama itself but blocked verifying it.)
2. **Router**: `backend/app/routers/ai_narrative.py`, `POST /ai-narrative/analyze`, registered in `main.py`. Request/response Pydantic models in `app/schemas.py` (`AiNarrativeRequest`/`AiNarrativeOut` + nested `AiSignalMetricsIn` etc.), snake_case wire format matching this repo's older API convention.
3. **Ollama call**: `app/ai_narrative_service.py` — builds the Thai prompt from the full metrics (ticket 04's decision), calls Ollama with `format: "json"`, 90s timeout, raises `AiNarrativeError` (→ HTTP 503) on timeout/connection failure/malformed JSON/schema mismatch — never fabricates a result.
4. **Cache**: in-memory `dict[(ticker, date), AiNarrativeOut]`, matching `history_service.py`'s pattern.
5. **Frontend wiring**: `frontend/src/hooks/useAiNarrative.ts` (idle/loading/error/success state machine, in-flight guard against double-clicks) + `analyzeAiNarrative()` in `api/client.ts` (camelCase→snake_case conversion) + minimal button/result UI in `DashboardPage.tsx` (ticket 05 owns the real design). Ticker-change resets the state so switching stocks doesn't show a stale result.
6. **Tests**: `backend/tests/test_ai_narrative.py` (8 tests: parsing, caching, all 4 failure modes, both route outcomes) and `frontend/src/hooks/useAiNarrative.test.tsx` (5 tests: idle/loading/success/error/in-flight-guard/reset). Full suites after adding both: backend 263/263 passing, frontend 462/462 passing (462 = the 457 confirmed after ticket 08 + these 5 new hook tests).

**Live end-to-end verification** (not just mocks): called the real endpoint through the real running app in the browser, twice —
- Once with the ticket 02 synthetic NVDA conflict scenario (RSI 78.3 overbought vs. bullish MACD): got back `sentiment: neutral` with the conflict correctly named in `conflicting_signals`, in 34.9s.
- Once with NVDA's actual live data (RSI 58.9, no conflict, fitted score 70): got back `sentiment: bullish`, coherent narrative referencing the real numbers, no conflict flagged — correctly, since there wasn't one.

**Caveat found during verification, not a bug to fix now, just disclosed**: the (ticker, date) cache is keyed only by ticker+date, not by the metrics values themselves — so if a ticker's indicators legitimately move within the same trading day (or, as happened during testing, a different metrics payload is sent for the same ticker/day), the cache serves the *first* result of the day regardless. This matches ticket 04's literal decision ("per (ticker, date)"), but is worth knowing: a user watching a fast-moving stock intraday won't get a fresh AI read until the next calendar day, only a fresh rule-based score. Not raised as a problem to fix in this ticket since it's exactly what was decided — flagging in case it surprises someone later.

