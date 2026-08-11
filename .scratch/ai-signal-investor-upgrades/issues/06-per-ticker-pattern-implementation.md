Type: task
Blocked by: 01
Status: resolved

## Question

Implement per-ticker pattern lookup exactly per the methodology in [ออกแบบวิธี pattern-match backtest เฉพาะหุ้น](01-per-ticker-pattern-methodology.md):

1. **Backend**: a new function (likely `backend/app/backtest/per_ticker_lookup.py`, reusing `data.get_history` / `indicators.compute_indicator_snapshot` / `indicators.calc_signal_type` from the existing `backend/app/backtest/` package — do not re-derive indicator math) that, given a ticker and its current `signal_type`, scans that ticker's own ~10-12y history (not full "max") for prior days with the same `signal_type`, and for each, resolves the same hit-target-before-stop outcome the main backtest already uses (60-trading-day expiry = neutral, per the existing convention).
2. Compute: count, win rate (only if count >= 5), average win %, average loss %. When a conflict is currently active for this ticker (reuse `_detect_conflicts()`'s output), additionally filter to how many of those matches also had the same conflict rule(s) active on that historical day, and show that as a supplementary count.
3. **Expose it**: fold into the existing `POST /ai-narrative/analyze` response (add a field), or a new lightweight endpoint called alongside it — decide based on whichever keeps the ~2-5s added latency clearly bounded and doesn't complicate the existing endpoint's error handling; document the choice in the Answer.
4. **Frontend**: render near the AI Analyst panel (`frontend/src/components/AiAnalystPanel.tsx`) or the confidence score area — a line like "เจอสถานการณ์แบบนี้มาก่อน 12 ครั้งใน 10 ปี ชนะ 7 (เฉลี่ย +8%) แพ้ 5 (เฉลี่ย -4%)", or the below-5 "ยังสะสมข้อมูลไม่พอ" variant.
5. Tests: backend unit tests for the lookup/aggregation logic (mock the history fetch — no real yfinance calls in tests), frontend tests for both the enough-data and not-enough-data render states.
6. Verify live with a real ticker, the same way every other ticket in this map has been verified (not just unit tests).

## Answer

Built exactly per ticket 01's methodology:

1. `backend/app/backtest/per_ticker_lookup.py` — `lookup_pattern_history(ticker, signal_type, has_conflict)`, reusing `data.get_history` + `engine.evaluate_ticker` unchanged; bounds input to `252*11` (~11y) trading days before evaluating, keeping single-ticker computation to **~0.9s** in real testing (well under the "few seconds" target). Conflict-match counting approximates `ai_narrative_service._detect_conflicts`'s rules using `DayRecord`'s existing `features`/`confidence_score` (documented in the function's docstring as an approximation, not byte-identical — `DayRecord` doesn't persist MA/MACD cross-state booleans per day).
2. **Endpoint decision**: kept **separate** from `POST /ai-narrative/analyze` — new `GET /ai-narrative/pattern-history?ticker&signal_type&has_conflict`, returning `PatternHistoryOut | null`. Chosen so this deterministic, fast lookup keeps working even when Ollama is slow/down, rather than being coupled to the LLM call's success/failure.
3. **Frontend trigger**: fires when the AI narrative call reaches `success` (not in parallel with it) — `has_conflict` is only truly knowable once `conflicting_signals` comes back from that call, so this ticket sequenced it rather than guessing/duplicating conflict detection client-side. `usePatternHistory.ts` (own state machine) + `PatternHistoryPanel.tsx`, rendered directly under `AiAnalystPanel` in the same `.ai-signal-split` column.
4. Not-enough-history (`null` from the backend) and below-minimum-sample (`win_rate: null`) are rendered as distinct states, per ticket 01.

Tests: 6 in `test_per_ticker_lookup.py` (none/unknown-ticker/aggregation/min-sample/lookback-bounding/conflict-flag), 4 in `test_ai_narrative_pattern_history.py` (route), 6 in `PatternHistoryPanel.test.tsx`. Full suites: backend 285/285, frontend 477/477 (all clean, including the previously-flaky drag test).

**Verified live end-to-end**: clicked "วิเคราะห์ด้วย AI" for real NVDA in the running app — pattern-history panel rendered "เจอสถานการณ์แบบนี้มาก่อน 1720 ครั้ง — ชนะ 1244 ครั้ง (เฉลี่ย +10.3%), แพ้ 270 ครั้ง (เฉลี่ย -9.1%) — ชนะ 82%", exactly matching a standalone direct-call test of `lookup_pattern_history('NVDA', 'BULLISH', False)` run earlier in the same session.

