Type: grilling
Status: resolved

## Question

Design how "has this ticker been in a situation like this before?" actually gets computed and shown, before building it. Resolve, with the user, one at a time:

- **What counts as "a situation like this"?** Options include: (a) match on the exact `conflicting_signals` rule(s) currently triggered (reuses `backend/app/ai_narrative_service.py`'s `_detect_conflicts` logic directly — narrow but precise), (b) match on the fitted confidence-score bucket (e.g. "score was 30-40" — broader, less precise), (c) match on the `signal_type` badge (BULLISH/BEARISH/etc. — broadest). These aren't mutually exclusive; pick what's shown by default and whether others are available as a toggle.
- **Where does this run?** Live, on-demand (scan the ticker's own history each time the AI panel is analyzed — adds latency on top of the LLM call) vs. precomputed by extending the existing `backend/app/backtest/` walk-forward pipeline to cache a per-ticker pattern index. Given item 1 only needs one ticker's history (not the 31-ticker basket), a live on-demand scan may be fast enough — check before assuming precomputation is needed.
- **What's shown**: a count + win rate ("เจอสถานการณ์แบบนี้ 12 ครั้งใน 5 ปี ชนะ 7 แพ้ 5") is the minimum bar the user asked for — decide if anything more (e.g. average time-to-resolution, best/worst case) is worth the added complexity.
- **Minimum sample size**: what happens when a ticker has too few historical matches to say anything meaningful (e.g. a recent IPO, or a rare pattern)? Needs an explicit "not enough history" state, not a misleadingly confident 1-for-1 win rate.

## Answer

Resolved via live grilling.

**1. What counts as "a situation like this"**: `signal_type` badge (BULLISH/BEARISH/SQUEEZE/NEUTRAL) is the primary match — broad enough for a usable sample, and it's what the user already sees as the headline badge. When a conflict is currently active (`_detect_conflicts()` returned non-empty), show a supplementary narrower line: how many of those same-badge historical occurrences *also* had the same specific conflict rule triggered.

**2. Where it runs**: live, on-demand, computed as part of the same "วิเคราะห์ด้วย AI" flow — not precomputed, no new job/cache system. Bound the historical lookback to ~10-12 years (matching the main backtest's methodology), not `data.py`'s full "max" fetch, to keep single-ticker computation to a few seconds — negligible next to the ~35-40s LLM call it rides alongside.

**3. What's shown**: count + win rate **+ average outcome magnitude** for both sides ("เจอ 12 ครั้ง ชนะ 7 (เฉลี่ย +8%) แพ้ 5 (เฉลี่ย -4%)") — reuses the existing `setup_expectancy`-style calculation from `backend/app/backtest/engine.py`, no new formula.

**4. Minimum sample size**: **5** historical occurrences before showing a win-rate %. Below that, show the raw count only with "ยังสะสมข้อมูลไม่พอจะสรุปเป็น % ได้" — the same wording ticket 04 (track-record cold-start) uses, kept consistent across the map.

Graduated into [เพิ่ม pattern-match lookup เฉพาะหุ้นจริง](06-per-ticker-pattern-implementation.md).

