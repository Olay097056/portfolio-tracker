# backend/app/backtest/run.py
"""CLI entrypoint: run the full walk-forward backtest and write a results report.

Usage (from backend/, with the project venv):
    .venv/Scripts/python.exe -m app.backtest.run
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from app.backtest.data import load_basket
from app.backtest.engine import (
    ATR_CANDIDATES,
    BASELINE_ATR,
    PILLAR_NAMES,
    build_folds,
    evaluate_ticker,
    pillar_correlation,
    setup_expectancy,
)

WEAK_CORRELATION_THRESHOLD = 0.03  # |r| below this, or wrong-signed (r <= 0), counts as "weak/wrong-signed"
EXPECTANCY_MARGIN_PCT = 15.0  # candidate must beat baseline by at least this % relative margin to count as "wins" a fold
REVISION_FOLD_THRESHOLD = 3  # out of len(folds) (4-5) -- ticket 03's "≥3-of-4-5 folds" rule

REPORT_PATH = Path(__file__).parent / "results" / "backtest_report.md"
RAW_RESULTS_PATH = Path(__file__).parent / "results" / "backtest_raw.json"


def main() -> None:
    print("=== Loading basket (10y daily history) ===")
    basket = load_basket()
    print(f"\nLoaded {len(basket)} tickers.\n")

    print("=== Evaluating every ticker/day (indicators + forward outcomes) ===")
    t0 = time.time()
    all_records = []
    for ticker, bars in basket.items():
        recs = evaluate_ticker(ticker, bars)
        all_records.extend(recs)
        print(f"  {ticker}: {len(recs)} evaluable days")
    print(f"\nTotal evaluable (ticker, day) records: {len(all_records)}  ({time.time() - t0:.1f}s)\n")

    all_dates = sorted({r["date"] for r in all_records})
    folds = build_folds(all_dates)
    print(f"=== Walk-forward folds: {len(folds)} ===")
    for i, f in enumerate(folds, 1):
        print(f"  Fold {i}: train {f['train_start']}..{f['train_end']}  test {f['test_start']}..{f['test_end']}")
    print()

    # ---- Per-fold, per-pillar correlation (train and test, all three forward windows) ----
    pillar_results: dict[str, list[dict]] = {p: [] for p in PILLAR_NAMES}
    for i, f in enumerate(folds, 1):
        train_recs = [r for r in all_records if f["train_start"] <= r["date"] < f["train_end"]]
        test_recs = [r for r in all_records if f["test_start"] <= r["date"] < f["test_end"]]
        for pillar in PILLAR_NAMES:
            fold_entry = {"fold": i, "train_n": len(train_recs), "test_n": len(test_recs)}
            for w in (5, 10, 20):
                fold_entry[f"train_r_{w}d"] = pillar_correlation(train_recs, pillar, w)
                fold_entry[f"test_r_{w}d"] = pillar_correlation(test_recs, pillar, w)
            pillar_results[pillar].append(fold_entry)

    # ---- Per-fold ATR-candidate expectancy (train and test) ----
    atr_results: dict[str, list[dict]] = {f"{sl}x/{tp}x": [] for sl, tp in ATR_CANDIDATES}
    for i, f in enumerate(folds, 1):
        train_recs = [r for r in all_records if f["train_start"] <= r["date"] < f["train_end"]]
        test_recs = [r for r in all_records if f["test_start"] <= r["date"] < f["test_end"]]
        for sl, tp in ATR_CANDIDATES:
            key = f"{sl}x/{tp}x"
            atr_results[key].append(
                {
                    "fold": i,
                    "train_expectancy": setup_expectancy(train_recs, (sl, tp)),
                    "test_expectancy": setup_expectancy(test_recs, (sl, tp)),
                }
            )

    # ---- Apply the revision rule (test-fold tally, ≥3-of-N, per ticket 03 / engine.py's disclosed adaptation) ----
    weak_pillars = []
    for pillar in PILLAR_NAMES:
        weak_fold_count = sum(
            1
            for entry in pillar_results[pillar]
            if entry["test_r_20d"] is not None and entry["test_r_20d"] <= WEAK_CORRELATION_THRESHOLD
        )
        measured_folds = sum(1 for entry in pillar_results[pillar] if entry["test_r_20d"] is not None)
        if measured_folds >= REVISION_FOLD_THRESHOLD and weak_fold_count >= REVISION_FOLD_THRESHOLD:
            weak_pillars.append((pillar, weak_fold_count, measured_folds))

    baseline_key = f"{BASELINE_ATR[0]}x/{BASELINE_ATR[1]}x"
    winning_candidates = []
    for sl, tp in ATR_CANDIDATES:
        if (sl, tp) == BASELINE_ATR:
            continue
        key = f"{sl}x/{tp}x"
        win_fold_count = 0
        measured_folds = 0
        for cand_entry, base_entry in zip(atr_results[key], atr_results[baseline_key]):
            c, b = cand_entry["test_expectancy"], base_entry["test_expectancy"]
            if c is None or b is None:
                continue
            measured_folds += 1
            if b <= 0 and c > 0:
                win_fold_count += 1
            elif b > 0 and c > b * (1 + EXPECTANCY_MARGIN_PCT / 100):
                win_fold_count += 1
        if measured_folds >= REVISION_FOLD_THRESHOLD and win_fold_count >= REVISION_FOLD_THRESHOLD:
            winning_candidates.append((key, win_fold_count, measured_folds))

    # ---- Write report ----
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    lines.append("# AI Technical Signal — Backtest Report\n")
    lines.append(f"Basket: {len(basket)} tickers. Evaluable (ticker, day) records: {len(all_records)}. Folds: {len(folds)}.\n")
    lines.append("## Fold boundaries\n")
    for i, f in enumerate(folds, 1):
        lines.append(f"- Fold {i}: train {f['train_start']}..{f['train_end']}, test {f['test_start']}..{f['test_end']}")
    lines.append("")

    lines.append("## Confidence-score pillar correlation with forward returns (Pearson r, 20-day window)\n")
    lines.append("| Pillar | " + " | ".join(f"Fold {i} train" for i in range(1, len(folds) + 1)) + " | " + " | ".join(f"Fold {i} test" for i in range(1, len(folds) + 1)) + " |")
    lines.append("|---" * (1 + 2 * len(folds)) + "|")
    for pillar in PILLAR_NAMES:
        train_vals = [f"{e['train_r_20d']:.3f}" if e["train_r_20d"] is not None else "n/a" for e in pillar_results[pillar]]
        test_vals = [f"{e['test_r_20d']:.3f}" if e["test_r_20d"] is not None else "n/a" for e in pillar_results[pillar]]
        lines.append(f"| {pillar} | " + " | ".join(train_vals) + " | " + " | ".join(test_vals) + " |")
    lines.append("")

    lines.append(f"**Weak/wrong-signed pillars (r ≤ {WEAK_CORRELATION_THRESHOLD} in ≥{REVISION_FOLD_THRESHOLD} test folds — revision candidates per ticket 03's rule):**\n")
    if weak_pillars:
        for pillar, weak_count, measured in weak_pillars:
            lines.append(f"- `{pillar}`: weak/wrong-signed in {weak_count}/{measured} measured test folds")
    else:
        lines.append("- None — every pillar showed positive, non-trivial correlation with forward returns in enough test folds to clear the bar for *not* revising.")
    lines.append("")

    lines.append("## ATR-multiplier candidate expectancy (win_rate*avg_win - loss_rate*avg_loss, %)\n")
    lines.append("| Candidate | " + " | ".join(f"Fold {i} train" for i in range(1, len(folds) + 1)) + " | " + " | ".join(f"Fold {i} test" for i in range(1, len(folds) + 1)) + " |")
    lines.append("|---" * (1 + 2 * len(folds)) + "|")
    for sl, tp in ATR_CANDIDATES:
        key = f"{sl}x/{tp}x"
        label = key + (" (baseline)" if (sl, tp) == BASELINE_ATR else "")
        train_vals = [f"{e['train_expectancy']:.2f}" if e["train_expectancy"] is not None else "n/a" for e in atr_results[key]]
        test_vals = [f"{e['test_expectancy']:.2f}" if e["test_expectancy"] is not None else "n/a" for e in atr_results[key]]
        lines.append(f"| {label} | " + " | ".join(train_vals) + " | " + " | ".join(test_vals) + " |")
    lines.append("")

    lines.append(f"**ATR candidates that beat the {baseline_key} baseline in ≥{REVISION_FOLD_THRESHOLD} test folds by ≥{EXPECTANCY_MARGIN_PCT}% relative margin:**\n")
    if winning_candidates:
        for key, win_count, measured in winning_candidates:
            lines.append(f"- `{key}`: beat baseline in {win_count}/{measured} measured test folds")
    else:
        lines.append(f"- None — the current {baseline_key} default was not beaten consistently enough to clear the revision bar.")
    lines.append("")

    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nReport written to {REPORT_PATH}")

    # Raw numbers, for anyone who wants to re-derive the report or dig further without re-running the backtest.
    RAW_RESULTS_PATH.write_text(
        json.dumps({"pillar_results": pillar_results, "atr_results": atr_results, "n_records": len(all_records), "n_folds": len(folds)}, indent=2),
        encoding="utf-8",
    )
    print(f"Raw results written to {RAW_RESULTS_PATH}")


if __name__ == "__main__":
    main()
