# Ctx sensitivity audit — which keys actually move the 6 model scores (2026-08-09)

Result of wayfinder ticket **02 - Research: Sensitivity audit — ctx คีย์ไหนขยับคะแนนโมเดลจริง**.
Method: built a real ctx snapshot once (pickled at `.scratch/forecast-tab/ctx_snapshot.pkl`,
27 keys), then swept each key across a realistic world range and recorded the
score range (max−min) per model via `_score_model(m, ctx)` — pure function, no
network, deterministic. Script: `.scratch/forecast-tab/sensitivity_audit.py`.

## Sensitivity table (score range in points per model, 27 keys × 6 models)

| key | recovery | inflation | fed-pivot | yield-shock | credit-panic | bank-run |
|---|---|---|---|---|---|---|
| hy_spread_bps | 5.6 | 0.0 | 0.0 | 0.0 | 6.9 | 4.0 |
| ig_spread_bps | 0.0 | 0.0 | 0.0 | 0.0 | 6.9 | 0.0 |
| vix | 11.9 | 6.7 | 6.7 | 6.6 | 13.5 | 9.3 |
| dxy | 5.2 | 3.4 | 5.5 | 5.2 | 3.4 | 0.0 |
| us10y | 5.3 | 3.4 | 7.4 | 6.6 | 3.5 | 0.0 |
| us30y | 0.0 | 0.0 | 0.0 | 3.9 | 0.0 | 0.0 |
| **us2y** | **0.0** | **0.0** | **0.0** | **0.0** | **0.0** | **0.0** |
| us2y_chg | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 3.9 |
| curve_10y2y_bps | 20.3 | 15.0 | 15.0 | 15.0 | 15.0 | 15.0 |
| move | 17.1 | 15.0 | 15.0 | 17.1 | 17.5 | 15.0 |
| usoil | 0.0 | 8.3 | 0.0 | 0.0 | 0.0 | 0.0 |
| **xauusd** | **0.0** | **0.0** | **0.0** | **0.0** | **0.0** | **0.0** |
| gold_chg_pct | 8.3 | 8.3 | 13.9 | 8.3 | 8.3 | 8.3 |
| us_pce_yoy | 0.0 | 6.7 | 0.0 | 0.0 | 0.0 | 0.0 |
| us_cpi_yoy | 0.0 | 6.7 | 5.6 | 0.0 | 0.0 | 0.0 |
| us_10y_real | 0.0 | 0.0 | 0.0 | 3.9 | 0.0 | 0.0 |
| cot_gold_mm_net | 1.5 | 1.3 | 1.5 | 1.5 | 1.5 | 1.5 |
| auction_btc | 0.0 | 0.0 | 0.0 | 1.8 | 0.0 | 0.0 |
| deposits_chg_pct | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 5.3 |
| discount_window_b | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 5.3 |
| bank_reserves_b | 6.0 | 6.0 | 6.0 | 6.0 | 6.0 | 6.0 |
| reserves_chg_pct | 0.0 | 0.0 | 2.2 | 0.0 | 0.0 | 0.0 |
| on_rrp_b | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 1.0 |
| **sofr_effr_spread_bps** | **0.0** | **0.0** | **0.0** | **0.0** | **0.0** | **0.0** |
| usdjpy | 0.0 | 0.0 | 0.0 | 2.7 | 0.0 | 0.0 |
| nas100_chg_pct | 0.0 | 0.0 | 3.7 | 3.9 | 0.0 | 0.0 |
| kre_chg_pct | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 5.3 |

## Dead keys (0 movement in every model) — 3 keys

1. **`us2y`** — no indicator reads the 2Y *level*. The only 2Y indicator is
   "US2Y Collapse" (bank-run) which maps to `us2y_collapse` → reads **`us2y_chg`**,
   not `us2y`. So `us2y` is inert; `us2y_chg` moves bank-run by 3.9.
   Not a bug — the level is genuinely unused by any scorer.
2. **`xauusd`** — `_score_gold_rising` reads `gold_chg_pct` first and only falls
   back to the `xauusd` level when the change is missing; in a live ctx the
   change is always present, so the level is shadowed. Not a bug, but a
   simulator should expose **`gold_chg_pct`** (the live lever), not `xauusd`.
3. **`sofr_effr_spread_bps`** — scorer `sofr_effr_funding` (`_score_sofr_effr_stress`)
   exists in `INDICATOR_SCORERS` but **no indicator of any of the 6 models maps
   to it** (`_INDICATOR_NAME_MAP` has no entry pointing at it). Orphan scorer —
   the key is dead *because nothing in the model set uses it*.

## Key ranking by total influence (all models summed)

1. move (96.7) — appears in market_structure + confirmation of every model
2. curve_10y2y_bps (95.3) — same, structural
3. gold_chg_pct (55.4)
4. vix (54.7)
5. bank_reserves_b (36.0) — every model via risk_penalty
6. us10y (26.2)
7. dxy (22.7)
8. hy_spread_bps (16.5)
9. us_cpi_yoy (12.3)
10. cot_gold_mm_net (8.8)
11. usoil (8.3)
12. nas100_chg_pct (7.6)
13. ig_spread_bps (6.9)
14. us_pce_yoy (6.7)
15-17. deposits_chg_pct / discount_window_b / kre_chg_pct (5.3 each)
18-20. us30y / us2y_chg / us_10y_real (3.9 each)
21. usdjpy (2.7)
22. reserves_chg_pct (2.2)
23. auction_btc (1.8)
24. on_rrp_b (1.0)
25-27. us2y / xauusd / sofr_effr_spread_bps (0.0 — dead)

**Top levers for the simulator (ticket 03):** the reference /forecast exposes 11
sliders; of those, **fedBps (→ us10y/us2y/us2y_chg), oilPct (→usoil), goldPct
(→gold_chg_pct), vixPts (→vix), hyBps (→hy_spread_bps), cpiPts (→us_cpi_yoy),
depositPct (→deposits_chg_pct), dwBillion (→discount_window_b), sofrSpreadBps
(→sofr_effr_spread_bps — DEAD in our engine), debtPts (→ no direct ctx key),
auctionBtc (→auction_btc)**. Note sofrSpreadBps maps to a dead key in OUR
scoring — the reference's /forecast still shows it (their engine differs), so
we must decide (ticket 03) whether to keep it as a slider (it would do nothing)
or wire the orphan scorer into a model.

## Coupled pairs (math relationships) — for the fog "ตัวแปรที่พันกันเอง"

- `curve_10y2y_bps` = us10y − us2y in bps (the dashboard's yield_curve spread).
- `gold_chg_pct` is derived from `xauusd` history (change %); `xauusd` itself is dead.
- `reserves_chg_pct` is derived from `bank_reserves_b` history (change %).
- `us2y_chg` is derived from `us2y` history; `us2y` itself is dead (use us2y_chg).
- `nas100_chg_pct` / `kre_chg_pct` / `usdjpy` come from the `_yf_extras()` wave —
  independent of the FRED dashboard.

## Availability in the live snapshot

ctx 27 keys; the pickled live snapshot (2026-08-09) — see `ctx_snapshot.pkl`
for exact values. `available=false` keys in real use: the snapshot lists
which values are None (see script output); the reference UI's missing-base
warning covers the same set (us10y/us2y/vix/usoil/hy/cpi + dxy). Simulator
should treat None base as the reference does: use the middle fallback + amber
warning, never fabricate.
