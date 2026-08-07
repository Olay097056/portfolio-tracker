# AI Technical Signal — Fitted Model Report (ticket 08)

Basket: 31 tickers. Records: 331683. Folds: 5.

## Regression: raw features -> forward return (out-of-sample R² per fold)

| Fold | Window | R² train | R² test | n train | n test (raw) | n test (effective, ~20d-spaced) |
|---|---|---|---|---|---|---|
| 1 | 5d | 0.0122 | -0.0426 | 39029 | 7812 | 403 |
| 1 | 10d | 0.0155 | -0.0719 | 39029 | 7812 | 403 |
| 1 | 20d | 0.0246 | -0.1120 | 39029 | 7812 | 403 |
| 2 | 5d | 0.0075 | 0.0065 | 39029 | 7781 | 403 |
| 2 | 10d | 0.0086 | 0.0150 | 39029 | 7781 | 403 |
| 2 | 20d | 0.0140 | 0.0181 | 39029 | 7781 | 403 |
| 3 | 5d | 0.0085 | -0.0142 | 38998 | 7781 | 403 |
| 3 | 10d | 0.0120 | -0.0234 | 38998 | 7781 | 403 |
| 3 | 20d | 0.0171 | -0.0293 | 38998 | 7781 | 403 |
| 4 | 5d | 0.0081 | 0.0043 | 38998 | 7750 | 403 |
| 4 | 10d | 0.0114 | 0.0083 | 38998 | 7750 | 403 |
| 4 | 20d | 0.0165 | 0.0203 | 38998 | 7750 | 403 |
| 5 | 5d | 0.0040 | -0.0034 | 38936 | 7781 | 403 |
| 5 | 10d | 0.0067 | -0.0039 | 38936 | 7781 | 403 |
| 5 | 20d | 0.0109 | -0.0132 | 38936 | 7781 | 403 |

**Average out-of-sample R² across folds:** 5d = -0.0099, 10d = -0.0152, 20d = -0.0232

## Classification: raw features -> hit-target-before-stop (baseline 1.5x/3.0x setup)

| Fold | Accuracy (test) | Majority-class baseline | AUC (test) | n train | n test (raw) | n test (effective) |
|---|---|---|---|---|---|---|
| 1 | 0.6358 | 0.5403 | 0.7835 | 35469 | 6991 | 403 |
| 2 | 0.5528 | 0.5754 | 0.5996 | 35503 | 7265 | 403 |
| 3 | 0.6813 | 0.6231 | 0.7464 | 35721 | 7179 | 403 |
| 4 | 0.6015 | 0.5732 | 0.6380 | 35547 | 7279 | 403 |
| 5 | 0.6658 | 0.6116 | 0.7207 | 35678 | 7067 | 403 |

**Beats majority-class baseline in 4/5 folds.** Average accuracy: 0.6274 vs average baseline: 0.5847

## Fitted coefficients (last fold, for inspection — sign/magnitude sanity check)

Regression (20d forward return):
- rsi14: -0.0129
- macd_histogram: 0.2055
- distance_from_sma50_pct: -0.0596
- volume_ratio: 0.0453
- bb_width_pct: 0.0053
- has_support: -0.0181
- support_distance_pct: -0.0649
- has_resistance: 0.3495
- resistance_distance_pct: 0.0540

Classification (hit-target-before-stop):
- rsi14: 0.0014
- macd_histogram: 0.0066
- distance_from_sma50_pct: -0.0086
- volume_ratio: -0.0616
- bb_width_pct: -0.0225
- has_support: -0.4095
- support_distance_pct: -0.1654
- has_resistance: -0.3311
- resistance_distance_pct: -0.0369