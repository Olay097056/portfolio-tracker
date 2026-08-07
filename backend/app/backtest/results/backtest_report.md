# AI Technical Signal — Backtest Report

Basket: 31 tickers. Evaluable (ticker, day) records: 331683. Folds: 5.

## Fold boundaries

- Fold 1: train 2016-05-09..2021-05-09, test 2021-05-09..2022-05-09
- Fold 2: train 2017-05-09..2022-05-09, test 2022-05-09..2023-05-09
- Fold 3: train 2018-05-09..2023-05-09, test 2023-05-09..2024-05-08
- Fold 4: train 2019-05-09..2024-05-08, test 2024-05-08..2025-05-08
- Fold 5: train 2020-05-08..2025-05-08, test 2025-05-08..2026-05-08

## Confidence-score pillar correlation with forward returns (Pearson r, 20-day window)

| Pillar | Fold 1 train | Fold 2 train | Fold 3 train | Fold 4 train | Fold 5 train | Fold 1 test | Fold 2 test | Fold 3 test | Fold 4 test | Fold 5 test |
|---|---|---|---|---|---|---|---|---|---|---|
| trend_alignment | -0.082 | -0.031 | -0.064 | -0.029 | -0.039 | 0.130 | -0.152 | 0.029 | -0.166 | -0.046 |
| rsi_condition | -0.045 | -0.047 | -0.042 | -0.042 | -0.039 | -0.066 | -0.019 | -0.007 | -0.060 | -0.028 |
| macd_momentum | -0.045 | -0.030 | -0.007 | 0.002 | -0.010 | -0.015 | 0.045 | 0.045 | -0.060 | -0.046 |
| volume_ratio | -0.025 | -0.021 | -0.014 | -0.010 | 0.015 | 0.040 | 0.023 | 0.010 | 0.015 | -0.001 |
| sr_distance_squeeze | -0.037 | -0.013 | -0.011 | -0.025 | -0.018 | 0.057 | -0.019 | -0.100 | -0.031 | -0.062 |

**Weak/wrong-signed pillars (r ≤ 0.03 in ≥3 test folds — revision candidates per ticket 03's rule):**

- `trend_alignment`: weak/wrong-signed in 4/5 measured test folds
- `rsi_condition`: weak/wrong-signed in 5/5 measured test folds
- `macd_momentum`: weak/wrong-signed in 3/5 measured test folds
- `volume_ratio`: weak/wrong-signed in 4/5 measured test folds
- `sr_distance_squeeze`: weak/wrong-signed in 4/5 measured test folds

## ATR-multiplier candidate expectancy (win_rate*avg_win - loss_rate*avg_loss, %)

| Candidate | Fold 1 train | Fold 2 train | Fold 3 train | Fold 4 train | Fold 5 train | Fold 1 test | Fold 2 test | Fold 3 test | Fold 4 test | Fold 5 test |
|---|---|---|---|---|---|---|---|---|---|---|
| 1.0x/2.0x | 1.60 | 1.42 | 1.17 | 1.31 | 1.24 | 0.64 | 0.73 | 1.26 | 0.77 | 1.19 |
| 1.5x/2.5x | 2.00 | 1.74 | 1.45 | 1.63 | 1.51 | 0.60 | 0.93 | 1.61 | 0.98 | 1.44 |
| 1.5x/3.0x (baseline) | 2.29 | 1.98 | 1.63 | 1.85 | 1.73 | 0.64 | 0.99 | 1.93 | 1.10 | 1.65 |
| 2.0x/4.0x | 2.88 | 2.40 | 1.93 | 2.26 | 2.09 | 0.49 | 1.13 | 2.53 | 1.20 | 2.18 |

**ATR candidates that beat the 1.5x/3.0x baseline in ≥3 test folds by ≥15.0% relative margin:**

- None — the current 1.5x/3.0x default was not beaten consistently enough to clear the revision bar.
