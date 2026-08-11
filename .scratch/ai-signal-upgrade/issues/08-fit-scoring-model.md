Type: task
Blocked by: 07
Status: resolved

## Question

Fit a genuinely data-derived replacement for `calcConfidenceScore`'s hand-picked point-buckets, using the same 31-ticker basket and walk-forward infrastructure already built in `backend/app/backtest/` (ticket 06).

Scope, informed by ticket 06/07's findings:

1. **Features**: the same six raw readings the current pillars are built from — RSI14, MACD histogram, distance-from-SMA50%, volume ratio, BB-width/squeeze, nearest-S/R distance — rather than their current hand-bucketed point values. Fitting on raw values lets a real model discover its own thresholds instead of inheriting the unvalidated ones.
2. **Target**: fit against forward return (regression) *and* try a classification framing (e.g. "did price rise >2% within 20 days before falling >2%" or similar, informed by the trading-setup outcome data already computed) — ticket 07's finding was that even the categorical BULLISH/BEARISH badge underperformed, not just the continuous score, so both framings are worth trying rather than assuming regression alone will fix it.
3. **Method**: start simple (linear/logistic regression) before anything fancier — a simple model that's honestly validated beats a complex one that isn't, and simple models overfit less on the effective sample size available (see the overfitting caveat below).
4. **Validation**: fit on each fold's TRAIN window, score on that fold's TEST window (genuine walk-forward, not in-sample fit statistics) — report out-of-sample R² / accuracy per fold, not just in-sample.
5. **Overfitting guard**: per ticket 07's caveat, the 331k raw records are not 331k independent samples (overlapping forward windows within a ticker, cross-sectional correlation across the basket, especially the 5 ETFs vs. their constituents). At minimum, report an effective-sample-size estimate (e.g. by ticker-day, treating each ticker's non-overlapping periods as the real unit) alongside any fitted R²/accuracy, and be suspicious of any result that looks too good relative to that count.
6. **Outcome**: if a fitted model shows real, consistent out-of-sample skill across most folds, replace `calcConfidenceScore` in `frontend/src/utils/aiTechnicalSignal.ts` with it (this map carries execution). If it doesn't, that's the honest result to report and ship as-is — don't force a replacement that isn't actually better than what ticket 07 already showed doesn't work, and loop back to the user with what was found rather than silently picking whichever model looks least bad.

Consider whether `numpy`/`scikit-learn` need adding to `backend/requirements.txt` for this (the backend currently has neither) — reasonable for a fitting task like this, unlike the pure-Python style the rest of the backend follows for simpler arithmetic.

## Answer

**Modeling done, in `backend/app/backtest/` (`model_fit.py`, `run_model_fit.py`)**: see [model_fit_report.md](../../backend/app/backtest/results/model_fit_report.md).

- **Regression** (raw features → forward return): failed — out-of-sample R² negative across nearly all folds/windows (avg 20d = −0.023). Confirms return *magnitude* isn't predictable from these six indicators via a simple linear model.
- **Classification** (raw features → hit-target-before-stop on the baseline 1.5x/3.0x setup, "expired" trials excluded): **real, walk-forward-validated skill** — beat a majority-class baseline in 4/5 folds, AUC 0.60–0.78. Fit on all 299,019 resolved trials (effective/non-overlapping sample ≈16,603) for final coefficients — see `model_fit.py`'s docstring for the effective-sample-size caveat, and note the `has_support`/`has_resistance` coefficients are somewhat entangled with `calcTradingSetup` itself using those same zones to set the target/stop levels.

**Decision**: replace `calcConfidenceScore` with this fitted logistic-regression formula (sigmoid of intercept + weighted features) — real, out-of-sample-validated skill, unlike the pillar system it replaces.

**Implementation completed (`worker_signal_fit1`)**:
1. Rewrote `calcConfidenceScore` in `frontend/src/utils/aiTechnicalSignal.ts` using the exact fitted logistic regression formula (`intercept = 0.554986` and the 9 fitted coefficients).
2. Updated `ConfidenceScoreBreakdown.pillars` to report signed logit feature contributions (`rsiContribution`, `macdContribution`, `sma50DistanceContribution`, etc.).
3. Adjusted score rating badges and `generateAiTechnicalSignal`'s `type` thresholds to match the fitted model score distribution (centered around baseline win rate ~58%).
4. Re-derived unit test expectations in `aiTechnicalSignal.test.ts` and `aiTechnicalSignal.stress.test.ts` with genuine math calculations.
5. Ran `npm test` in `frontend/` — passed 52/52 test files (457 tests total, 0 failures).
6. Handoff report written to `.agents/worker_signal_fit1/handoff.md`.


