Type: grilling
Blocked by: 02
Status: resolved

## Question

Design the contract between the backend and the chosen local LLM (from [เลือกโมเดล local LLM](02-local-model-selection.md)), and how the backend exposes it to the frontend. Resolve, with the user, one at a time:

- **Input shape**: exactly which computed fields get fed to the LLM per request (RSI14, MACD metrics, moving-average metrics, volume ratio, BB width/squeeze, nearest S/R zones, the deterministic confidence score and its pillar breakdown, the trading setup) — the full `AiSignalMetrics` shape from `aiTechnicalSignal.ts`, or a curated subset?
- **Output shape**: structured (JSON with fields like sentiment/key-points/caveats) vs. free-form Thai narrative text — structured is easier to render distinctly in the UI and to validate; free-form is closer to what the current `generateThaiNarrative` produces. Consider whether the LLM should also flag conflicting-signal cases explicitly as a field.
- **Call pattern & latency**: synchronous per dashboard ticker-view (simplest, but ticket 02's measured inference speed determines whether this is tolerable), on-demand via a button (user-triggered, no unwanted wait), or fetched once and cached per ticker/day (fastest UX, staleness risk). This decision depends directly on ticket 02's speed numbers.
- **Fallback behavior**: what the dashboard shows if Ollama is unreachable, times out, or returns something unparseable — must degrade gracefully (the deterministic score always renders regardless; the LLM panel is additive, never blocking).
- **Backend surface**: new FastAPI route(s) under `backend/app/routers/` (naming, request/response schema) that the frontend hook (`useAiTechnicalSignal.ts` or a new hook) calls.
- **Docker networking**: confirm how the backend container reaches the host-run Ollama instance (see the map's Notes re: the `localhost`/`127.0.0.1`/`host.docker.internal` quirk already hit once in this repo) — resolve this concretely, don't leave it to be rediscovered during implementation.

## Answer

Resolved via live grilling. One fact checked (not a decision): the backend container currently **cannot** reach a host-run Ollama — `netstat` confirmed Ollama binds to `127.0.0.1:11434` only, and a `docker exec` connectivity test to `host.docker.internal:11434` timed out. Fix (mechanical, not a decision): set `OLLAMA_HOST=0.0.0.0` and restart the Ollama service before implementation starts.

**1. Call pattern**: on-demand (user clicks a button, e.g. "วิเคราะห์ด้วย AI"), not automatic per ticker-view — `llama3.2:3b` takes ~39s per call (ticket 02), far too slow for a silent auto-trigger. Paired with an **in-memory cache keyed by (ticker, date)** — same-day re-requests for the same ticker return instantly rather than re-running inference.

**2. Output shape**: structured JSON — `{ sentiment: "bullish"|"bearish"|"neutral", narrative: string, conflictingSignals: string[] | null, caveats: string[] }` — not free-form text. Chosen specifically because ticket 02 found the LLM's main value is catching conflicting signals (e.g. RSI-overbought vs. bullish-MACD); a dedicated `conflictingSignals` field lets the UI foreground that instead of burying it in a paragraph.

**3. Fallback behavior**: on Ollama timeout, unreachable, or unparseable output — show a short error message with a retry button. Rejected silently hiding the section (confusing — looks like the feature is missing) and rejected falling back to the old template narrative (would misrepresent a canned string as the LLM's opinion).

**4. Input shape**: the full `AiSignalMetrics` object (RSI, MACD, moving averages, volume ratio, BB width/squeeze, S/R zones, the **new fitted confidence score + its pillar breakdown from ticket 08**, and the trading setup) — not a curated subset. The 3B model has no meaningful context-length pressure, and more input gives it more chance to catch nuance, which is the entire point of this map.

**5. Docker networking**: once Ollama is reconfigured per the fact above, the backend calls `http://host.docker.internal:11434`.

**6. Backend surface**: new router `backend/app/routers/ai_narrative.py`, `POST /ai-narrative/analyze` (`{ ticker, metrics: AiSignalMetrics }` → the structured JSON from #2, or an error the frontend renders per #3). In-memory `(ticker, date)` cache, matching the existing `history_service.py`/`chart_service.py` cache convention — no new persistent storage.

Graduated the fog this resolves into [ต่อระบบ LLM จริง (backend + Ollama config)](09-llm-backend-implementation.md).

