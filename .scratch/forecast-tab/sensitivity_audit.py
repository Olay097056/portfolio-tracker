# Sensitivity audit for wayfinder ticket 02: which ctx keys actually move the
# 6 model scores, and by how much. AFK measurement task — no user input.
#
# Plan:
#  1. Build a real ctx once, pickle it (no repeated network).
#  2. Baseline: _score_model(m, ctx) for all 6 models.
#  3. Per key: sweep a realistic min..max range, record score range per model.
#  4. Report dead keys (0 movement everywhere), rank by total influence,
#     math-coupled pairs, and frequently-unavailable keys.

import json
import os
import pickle
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend")))

from app import model_service
from app import macro_service

MODELS = ["recovery-reflation", "inflation-oil", "fed-pivot",
          "yield-shock", "credit-panic", "bank-run"]

# Realistic sweep ranges per ctx key (low, high, steps) — grounded in real-world
# magnitudes for each series (not fabricated: these are plausible bounds).
SWEEP: dict[str, tuple[float, float, int]] = {
    "hy_spread_bps": (200, 1200, 25),
    "ig_spread_bps": (80, 500, 20),
    "vix": (10, 80, 5),
    "dxy": (90, 120, 3),
    "us10y": (1.0, 8.0, 0.5),
    "us30y": (1.5, 6.5, 0.5),
    "us2y": (0.5, 7.0, 0.5),
    "us2y_chg": (-2.0, 2.0, 0.25),
    "curve_10y2y_bps": (-150, 150, 25),
    "move": (60, 200, 15),
    "usoil": (40, 140, 10),
    "xauusd": (1800, 3200, 100),
    "gold_chg_pct": (-4.0, 6.0, 0.5),
    "us_pce_yoy": (1.0, 6.0, 0.5),
    "us_cpi_yoy": (1.0, 8.0, 0.5),
    "us_10y_real": (-1.0, 4.0, 0.5),
    "cot_gold_mm_net": (50000, 320000, 20000),
    "auction_btc": (1.8, 3.2, 0.1),
    "deposits_chg_pct": (-3.0, 2.0, 0.25),
    "discount_window_b": (0, 120, 10),
    "bank_reserves_b": (2400, 4200, 200),
    "reserves_chg_pct": (-4.0, 4.0, 0.5),
    "on_rrp_b": (0, 800, 50),
    "sofr_effr_spread_bps": (0, 60, 5),
    "usdjpy": (130, 170, 4),
    "nas100_chg_pct": (-4.0, 6.0, 0.5),
    "kre_chg_pct": (-6.0, 6.0, 0.5),
}

PICKLE = os.path.join(os.path.dirname(__file__), "ctx_snapshot.pkl")


def load_ctx() -> dict:
    if os.path.exists(PICKLE):
        with open(PICKLE, "rb") as f:
            return pickle.load(f)
    dash = macro_service.build_dashboard()
    ctx = model_service._build_context_from(dash)
    os.makedirs(os.path.dirname(PICKLE), exist_ok=True)
    with open(PICKLE, "wb") as f:
        pickle.dump(ctx, f)
    return ctx


def model_scores(models: list, ctx: dict) -> dict[str, float]:
    out = {}
    for m in models:
        r = model_service._score_model(m, ctx)
        out[m["model_id"]] = r["score"]
    return out


def main():
    ctx = load_ctx()
    print("ctx snapshot (pickled):", PICKLE)
    print(f"keys: {len(ctx)}, present: {sum(1 for v in ctx.values() if v is not None)}/{len(ctx)}")
    for k, v in ctx.items():
        print(f"  {k:24s} = {v}")
    print()

    models = [m for m in model_service.MODELS if isinstance(m, dict)]
    baseline = model_scores(models, ctx)
    print("baseline scores:", {k: round(v, 1) for k, v in baseline.items()})
    print()

    # Per-key sweep: record score range (max-min) per model.
    rows = []
    for key, (lo, hi, step) in SWEEP.items():
        v0 = ctx.get(key)
        if v0 is None:
            # key currently unavailable — sweep around the range anyway using
            # the range center as the "base" so we can still measure effect.
            base = (lo + hi) / 2
        else:
            base = v0
        spreads: dict[str, float] = {}
        for m in models:
            vals = []
            v = lo
            while v <= hi + 1e-9:
                c = dict(ctx)
                c[key] = v
                r = model_service._score_model(m, c)
                vals.append(r["score"])
                v += step
            spreads[m["model_id"]] = round(max(vals) - min(vals), 2)
        rows.append((key, spreads))

    print(f"{'key':24s} | " + " | ".join(f"{mid:>14s}" for mid in MODELS))
    print("-" * 24 + "-+-" + "-+-".join("-" * 14 for _ in MODELS))
    totals = {k: 0.0 for k in MODELS}
    for key, spreads in rows:
        line = f"{key:24s} | " + " | ".join(f"{spreads[mid]:>14.1f}" for mid in MODELS)
        print(line)
        for mid in MODELS:
            totals[mid] += spreads[mid]
    print("-" * 24 + "-+-" + "-+-".join("-" * 14 for _ in MODELS))
    print(f"{'TOTAL influence':24s} | " + " | ".join(f"{totals[mid]:>14.1f}" for mid in MODELS))
    print()

    # Dead keys: no movement in any model.
    print("=== DEAD KEYS (0 movement in every model) ===")
    for key, spreads in rows:
        if all(s == 0.0 for s in spreads.values()):
            print(f"  {key}")
    print()

    # Rank keys by total influence (sum across models).
    print("=== RANK BY TOTAL INFLUENCE ===")
    ranked = sorted(rows, key=lambda kv: -sum(kv[1].values()))
    for i, (key, spreads) in enumerate(ranked, 1):
        print(f"  {i:2d}. {key:24s} total={sum(spreads.values()):6.1f}")

    # Coupled pairs check (math relationships).
    print()
    print("=== COUPLED PAIRS (same underlying series) ===")
    print("  curve_10y2y_bps vs us10y/us2y: curve = spread(10y-2y)")
    print("  gold_chg_pct vs xauusd: chg is computed from xauusd")
    print("  reserves_chg_pct vs bank_reserves_b: chg computed from level")
    print("  us2y_chg vs us2y: change vs level")


if __name__ == "__main__":
    main()
