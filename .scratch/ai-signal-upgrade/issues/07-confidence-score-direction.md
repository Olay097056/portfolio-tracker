Type: grilling
Blocked by: 06
Status: resolved

## Question

The backtest in [สร้างและรัน backtest engine จริง](06-backtest-implementation.md) found that **none of the 5 confidence-score pillars** (trend_alignment, rsi_condition, macd_momentum, volume_ratio, sr_distance_squeeze) show a measurable, reliable correlation with subsequent price returns — across a 31-ticker basket, 5 walk-forward years, and all three tested forward windows (5/10/20 days). The pattern is near-zero, sign-flipping noise, not a confidently-wrong signal — so there's no data-derived alternative weighting to substitute one pillar for another.

Ticket 03's methodology anticipated "revise the weak pillars, keep the strong ones." This result doesn't fit that shape — there's no strong pillar to anchor a revision to. This ticket decides what actually happens to the confidence score given that.

Options to weigh with the user (not exhaustive — surface others if they come up):
- **Keep the score as-is**, but make its unvalidated status explicit in the UI (e.g. a "not statistically validated" note) rather than presenting it with the same visual confidence as before.
- **De-emphasize or remove the numeric score**, leaning more on the new LLM narrative (ticket 04/05) for qualitative judgment instead of a point-bucket number that this backtest couldn't validate.
- **Redesign the scoring approach** from scratch — e.g. explore whether a non-linear model, pillar interactions, or a different ticker-outcome definition (this backtest only tested linear correlation with raw forward return) would fare better, before concluding the underlying indicators themselves are non-predictive.
- **Re-run with a looser/different test** first (e.g. classification accuracy — did BULLISH-typed signals outperform BEARISH-typed ones — rather than pillar-level linear correlation) to see if the *combined* score fares differently than its parts, before deciding the individual-pillar result settles anything.

Whatever is decided here likely reshapes what ticket 05 (dual-display prototype) needs to show, and possibly ticket 04 (LLM contract) if the LLM's role shifts from "supplement the score" to "primary judgment."

## Answer

Before deciding, ran the follow-up check the user asked for (option 4): does the *combined* signal_type badge (BULLISH/BEARISH/SQUEEZE/NEUTRAL — what the UI actually shows) fare better than the individual pillars did? Code: `backend/app/backtest/run_classification_check.py` (adds `calc_signal_type` to `indicators.py`, mirroring `generateAiTechnicalSignal`'s type-derivation logic, and `signal_type_forward_returns` to `engine.py`), reusing the ticket 06 basket/records.

**Result: worse than the pillar finding, not better.** Aggregated across all 5 test-fold years (24,066 BULLISH-labeled days, 5,040 NEUTRAL, 9,695 SQUEEZE, 104 BEARISH):

| Forward window | BULLISH | NEUTRAL | SQUEEZE | BEARISH |
|---|---|---|---|---|
| 5d | 0.31% | 0.56% | 0.17% | 0.55% |
| 10d | 0.56% | 1.05% | 0.47% | 2.09% |
| 20d | 0.98% | **1.91%** | 1.36% | **3.25%** |

NEUTRAL-labeled days out-earned BULLISH-labeled days in 4 of 5 test folds at every horizon (only fold 1, a down-market period, broke the pattern). BEARISH's small sample (n=104) makes it noisier, but it never underperformed either. **The badge that tells a user "this is a buy signal" did not predict better subsequent returns than no signal at all, in this test.**

**Decision**: reject both "keep as-is with a disclaimer" and "remove the score outright." Pursue a **data-derived redesign** — replace the hand-picked point-buckets in `calc_confidence_score` with weights/coefficients actually *fit* to this backtest's data (regression or classification against forward returns), validated out-of-sample on the same walk-forward folds, rather than another round of manually-guessed thresholds. If a fitted model still shows no genuine out-of-sample skill, that itself is the honest answer to ship (a validated "we tried, it doesn't work" beats an unvalidated "it works" badge) — but the attempt is worth making before concluding these six indicators simply carry no signal for this basket.

Graduated into [ค้นคว้าและ fit สมการคะแนนใหม่จากข้อมูลจริง](08-fit-scoring-model.md).

## Caveat carried forward

331,683 raw records are **not** 331,683 independent samples — forward-return windows overlap heavily within a ticker (adjacent days share most of their 20-day future window) and tickers move together cross-sectionally (especially the 5 broad-market ETFs vs. their constituents). The *effective* sample size for any fitted model is much smaller than the raw count suggests — ticket 08 needs to treat this as a real overfitting risk, not a footnote.

