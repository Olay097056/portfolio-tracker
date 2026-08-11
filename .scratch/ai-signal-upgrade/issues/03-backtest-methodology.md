Type: grilling
Status: resolved

## Question

Design the backtest methodology that will validate — and where warranted, revise — two things currently hardcoded in `frontend/src/utils/aiTechnicalSignal.ts` with no empirical basis:

1. The confidence-score pillar weights in `calcConfidenceScore` (trend alignment, RSI condition, MACD momentum, volume ratio, S/R distance/squeeze — currently point buckets like "RSI 50–65 → 25pts" chosen by feel).
2. The trading-setup ATR multipliers in `calcTradingSetup` (stop-loss at `latestClose - 1.5×ATR`, target at `latestClose + 3.0×ATR`, overridden by nearest S/R zone when present).

Resolve, with the user, one at a time:

- **Ticker universe**: backtest against the user's actual portfolio/watchlist tickers only, or a broader representative universe (e.g. S&P 500 / a fixed basket of liquid US equities and ETFs)? Narrower is faster and more relevant to this user; broader generalizes better and avoids overfitting to a handful of names.
- **Historical data range & source**: how far back, and does the existing yfinance pipeline (backend already uses it — see `.scratch/planning/issues/01-price-data-api-research.md`) have enough depth/quality for this, or does the backtest need something more?
- **Definition of a "correct" / successful signal**: e.g. N-day forward return exceeding a threshold, or "did price hit the computed target before the computed stop-loss" (directly validates the trading setup, not just the score) — these two options can pull toward different metrics, so pick deliberately.
- **Split strategy**: simple train/test holdout vs. walk-forward (rolling window) validation — walk-forward is more rigorous for time-series data (avoids lookahead bias) but is more work to build.
- **How results translate into a decision to revise**: what evidence threshold triggers actually changing a pillar weight or an ATR multiplier vs. leaving it as-is (e.g. statistical significance, minimum sample size, minimum improvement margin)?

Produce a written methodology precise enough that a follow-on implementation ticket can build the backtest engine directly from it — no remaining open questions about *what* to measure or *how* to score correctness, only the "how many revised weights come out the other end" which is the backtest's actual output.

## Answer

Resolved via live grilling with the user. `portfolio.db` was checked first and confirmed empty (0 portfolios, 0 holdings, 0 watchlist items) — a fact, not a decision, but it foreclosed the "user's own tickers" option before it was even offered.

**1. Ticker universe**: a fixed representative basket, not the user's portfolio/watchlist (currently empty). 30–50 liquid US equities/ETFs spanning multiple sectors — generalizes to whatever the user adds later instead of overfitting to a handful of names.

**2. Historical range**: 10 years via yfinance, extending the existing pipeline (`backend/app/chart_service.py`, `price_service.py` currently cap at `period="5y"`) rather than the app's current 5y ceiling — needed so SMA200 and the walk-forward folds below both have enough real sample size, and to span multiple market regimes (2016–2019 bull run, the 2020 COVID crash, the 2022 bear market).

**3. Two separate correctness metrics** (not one shared metric), each matched to what it validates:
   - **Confidence-score pillar weights** → **forward-return correlation**: does a higher score actually correlate with better subsequent returns?
   - **Trading-setup ATR multipliers** → **hit-target-before-stop-loss win rate**: does the literal tradeable setup (entry/target/stop) work, the way a user would actually experience it?

**4. Time horizons**:
   - Confidence score: evaluated at **3 forward windows simultaneously** — 5, 10, and 20 trading days.
   - Trading setup: **60 trading-day expiry** — if neither the computed target nor the computed stop-loss is hit within that window, the trial is recorded as **expired/neutral**, excluded from the win/loss ratio rather than counted as a loss.

**5. Split strategy**: **walk-forward validation**, not a single holdout — train on a rolling 5-year window, test on the following 1 year, roll forward by 1 year across the 10-year dataset (≈4–5 folds total). Chosen over a simple holdout specifically to avoid overfitting to one market regime.

**6. Revision threshold** — evidence bar before actually changing a shipped number:
   - **Pillar weights**: revise a pillar only if its measured correlation with forward returns is weak/wrong-signed **consistently in ≥3 of the 4–5 walk-forward folds** — not just in the aggregate or in one anomalous fold.
   - **ATR multipliers**: backtest a small candidate grid (e.g. 1.0x/2.0x, 1.5x/2.5x, 2.0x/4.0x stop/target pairs) against the current 1.5x/3.0x using expectancy (win_rate × avg_win − loss_rate × avg_loss); adopt an alternative only if it beats the current default in **≥3 of 4–5 folds** by a non-trivial margin — a one-fold win is treated as noise, not evidence.

This is precise enough for a direct implementation ticket — see [Implement the backtest engine](06-backtest-implementation.md), graduated from this ticket's resolution.

