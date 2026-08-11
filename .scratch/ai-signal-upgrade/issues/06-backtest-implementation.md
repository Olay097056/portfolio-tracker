Type: task
Blocked by: 03
Status: resolved

## Question

Build and run the backtest engine (backend, Python — reusing the existing yfinance pipeline) exactly per the methodology confirmed in [ออกแบบวิธี backtest](03-backtest-methodology.md):

1. Pull 10 years of daily OHLCV for a fixed representative basket of 30–50 liquid US equities/ETFs across sectors (extend `backend/app/chart_service.py` / `price_service.py`'s current `period="5y"` cap — pick the basket explicitly and record it in the Answer).
2. For every day in the dataset (once enough history exists for SMA200), compute the same indicator set `aiTechnicalSignal.ts` already produces — port the calculation to Python or call the existing TS logic somehow; decide and record which, since the two must agree — and run it through `calcConfidenceScore` and `calcTradingSetup`'s current logic.
3. Walk-forward split: rolling 5-year train / 1-year test windows across the 10 years (~4–5 folds).
4. Score two things per fold:
   - Confidence-score pillars vs. forward returns at 5/10/20 trading days.
   - Trading-setup entry/target/stop vs. actual price path over the following 60 trading days (hit target first / hit stop first / expired-neutral).
5. Apply the revision rule from ticket 03 (≥3-of-4–5-folds, non-trivial margin) to decide which pillar weights and/or ATR multipliers actually change.
6. Produce a written results report (linked asset) and, where the evidence clears the bar, the actual code change to `calcConfidenceScore` / `calcTradingSetup` in `frontend/src/utils/aiTechnicalSignal.ts` with the revised constants — this map carries execution, so a revision that clears the bar should land in the code, not just get written up.

## Answer

Built and ran the full walk-forward backtest per ticket 03's methodology. Code: `backend/app/backtest/` (`indicators.py` — Python port of `aiTechnicalSignal.ts`; `data.py` — basket + yfinance fetch; `engine.py` — walk-forward evaluation; `run.py` — CLI orchestrator). Full report: [backtest_report.md](../../../backend/app/backtest/results/backtest_report.md); raw numbers: [backtest_raw.json](../../../backend/app/backtest/results/backtest_raw.json).

**Scale**: 31-ticker basket (see `data.py:BASKET`), 331,683 evaluable (ticker, day) records, 5 walk-forward folds spanning 2016–2026 (anchored to the most recent data — see the note on `data.py` fetching "max" history and `engine.py:build_folds` anchoring backward from today, both adaptations disclosed in their own docstrings; without them, some basket tickers' shorter raw fetches or AAPL's 45-year history would have broken the promised ~10y/5-fold shape).

**One disclosed methodology adaptation** (also documented in `engine.py`'s module docstring): `calc_confidence_score`/`calc_trading_setup` have no *fitted* parameters — the pillar buckets and 1.5x/3.0x multipliers are fixed formulas, not something this engine trains. So each fold's revision tally counts strictly against the **TEST window** (5 independent out-of-sample years), the strictest read available; TRAIN-window numbers are reported alongside for context but don't enter the tally.

### Result 1 — ATR multipliers: **no revision.** Keep 1.5x/3.0x.

Wider stop/target multipliers (2.0x/4.0x) show *directionally* higher raw expectancy in most folds, but only clear the ≥3-of-5-folds / ≥15%-margin bar in 2 of 5 test folds (fold 3: +31%, fold 5: +32%; fold 2 narrowly misses at +14.1%; fold 4 at +9%; fold 1 is actually worse, −23%). Per ticket 03's own rule, this doesn't clear the revision bar — the current 1.5x/3.0x default stands. **No code change needed** (it's already the default).

### Result 2 — Confidence-score pillars: a bigger finding than "which pillar to reweight."

Every one of the 5 pillars — trend_alignment, rsi_condition, macd_momentum, volume_ratio, sr_distance_squeeze — showed weak/wrong-signed correlation with forward returns in the *majority* of test folds (4/5, 5/5, 3/5, 4/5, 4/5 respectively), consistently across all three forward windows (5d/10d/20d), not just one. By ticket 03's literal rule, all five clear the "≥3-of-5 folds" bar for revision.

But the pattern isn't "confidently wrong" (a strong, consistent negative correlation) — it's **sign-flipping, near-zero noise** (e.g. trend_alignment's test-fold 20d correlations: +0.130, −0.152, +0.029, −0.166, −0.046). That's a materially different, and more serious, finding than "this pillar's bucket thresholds need retuning": across this 31-ticker basket and the last decade, **none of the five pillars show a measurable, reliable linear relationship with what happens to price afterward** — individually. Ticket 03's methodology anticipated "revise the weak ones, keep the strong ones"; it didn't anticipate all five landing in the same place, because then there's no data-derived alternative weighting to substitute — reweighting toward whichever pillar looks *least* bad this run would be fitting noise, not a real finding.

**Not applying an automatic code change here** — this crosses from "tune a formula" into "the formula's premise needs a real decision," which the map's Notes still route through the user, not through an unattended edit to `calcConfidenceScore`. Graduated into a new ticket: [ทิศทางคะแนน confidence หลังพบว่าไม่มีนัยสำคัญเชิงพยากรณ์](07-confidence-score-direction.md).

**Caveats, stated plainly**: single-metric (linear correlation), single-basket, single-decade test — doesn't rule out non-linear relationships, interaction effects between pillars, or validity on a different ticker universe. It's real evidence, not a proof of nothing.

