Type: research
Blocked by: 01
Status: resolved

## Question

Which of the local models pulled in [ติดตั้ง Ollama + ดึงโมเดล](01-ollama-setup.md) should this feature actually use?

Evaluate each candidate hands-on against a realistic prompt: feed it a sample set of already-computed indicator values (RSI14, MACD line/signal/histogram, SMA20/50/200, volume ratio, Bollinger Band width/squeeze, nearest support/resistance distance — the same fields `generateAiTechnicalSignal` in `frontend/src/utils/aiTechnicalSignal.ts` already produces) and ask it to write a short Thai-language technical analysis narrative plus a qualitative read (bullish/bearish/neutral, and why).

Judge each candidate on:
- **Thai language quality** — grammar, natural phrasing, correct use of Thai financial/technical-analysis vocabulary (compare against the existing template narrative in `generateThaiNarrative` as a baseline for tone).
- **Reasoning quality** — does it correctly reference the numbers it was given, catch conflicting signals (e.g. MACD bullish but RSI overbought), avoid inventing numbers not in the input?
- **Inference speed** on this CPU-only/16GB hardware — is it fast enough for a per-ticker-view call (see ticket 04 for how latency should be handled if it's slow: sync, cached, or background).
- **RAM footprint while running** — must coexist with the rest of the Docker stack (backend, frontend, postgres, other containers already running on this machine).

Recommend one model as the default, with reasoning. Note whether a second model is worth keeping as an easy swap (e.g. faster-but-slightly-worse) rather than building any provider-switching abstraction (out of scope per the map).

## Answer

**Test setup**: a single realistic prompt simulating NVDA, built from the exact fields `generateAiTechnicalSignal` produces — with one **deliberate conflict planted**: RSI(14)=78.3 (Overbought) against an otherwise strongly bullish picture (MACD bullish crossover, Golden Cross, Bullish Alignment, high volume). Each model was asked (in Thai, single-shot, default settings) to write a short narrative + Bullish/Bearish/Neutral call, explicitly instructed to flag conflicting signals rather than smooth over them. Typhoon was run twice to check run-to-run consistency; the others once each (time budget).

**Results:**

| Model | Time | RAM while loaded | Thai fluency | Caught the RSI/overbought conflict? |
|---|---|---|---|---|
| `scb10x/llama3.2-typhoon2-3b-instruct` | 20.8s | 3.1 GB | Best — clean, natural TA vocabulary | **No, both runs.** Run 1 omitted RSI entirely. Run 2 mentioned it but misread it as *confirming* bullish confidence, then closed with an unexplained "Neutral" verdict that doesn't follow from its own bullish text — internally inconsistent across two identical-input runs. |
| `qwen2.5:3b` | 36.8s | 2.2 GB | Mediocre — one incoherent clause ("ราคาปัจจุบันยังอยู่เหนือสามเวลานี้"), used the English word "SETTING" instead of "SETUP" | **No.** Mentioned RSI but explicitly framed "above overbought" as a *bullish-confirming* point — same misreading pattern as Typhoon's run 2, the opposite of correct. |
| `llama3.2:3b` | 39.0s | 2.6 GB | Weakest — visibly garbled/repeated clauses in the back half of the response | **Yes.** The only model, across all 4 generations run, to correctly state RSI-overbought "บ่งบอกถึงแนวโน้มที่จะลดลงในอนาคต" (signals a likely future decline) — i.e. actually flagged the conflict instead of glossing over or misreading it. |

**Recommendation: `llama3.2:3b` as the default.** Its Thai prose is the roughest of the three, but the map's entire reason for adding an LLM layer is to catch nuance the rule-based point-bucket scorer can't (see the map's Destination) — and on the one test built specifically to check for that, it was the only model that did it correctly, twice-replicated failure from the other two considered. Prose roughness is very plausibly fixable by prompt/parameter tuning in ticket 04 (system prompt, temperature, maybe a "list each indicator's read individually first" decomposition step); a wrong or inconsistent conclusion is a harder problem to prompt away.

**Keep `scb10x/llama3.2-typhoon2-3b-instruct` as a live alternative**, not discarded: it's the fastest and most fluent by a clear margin, and its failure mode (smoothing a bullish narrative rather than being unable to read the number — it did *transcribe* "78.3 Overbought" correctly both times) looks more like an artifact of free-form single-paragraph prompting than an inherent reasoning ceiling. Worth re-testing once ticket 04 lands a more decomposed/structured prompt.

**Drop `qwen2.5:3b`** from further consideration — slowest of the three, mediocre Thai, and the same reasoning error as Typhoon's worst run with no compensating strength (not the fastest, not the most fluent, not more accurate). It was only pulled as a stand-in after the original `qwen2.5:7b` plan was abandoned for disk-space reasons (see ticket 01); nothing here suggests the 7b variant would be worth revisiting later either, since the failure was a reasoning/framing error, not obviously a size limitation.

**Caveat**: single-prompt, low-sample testing (time-boxed for this ticket, not a rigorous benchmark) — the pattern (2/2 wrong for Typhoon, 1/1 wrong for Qwen, 1/1 right for Llama) is suggestive, not statistically airtight. If llama3.2:3b's Thai proves too rough to ship even after prompt tuning in ticket 04, it's worth re-running this same conflict-detection test a few more times per model before falling back to Typhoon, rather than assuming the pattern holds.

