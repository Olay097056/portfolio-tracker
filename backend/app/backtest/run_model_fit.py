# backend/app/backtest/run_model_fit.py
"""Ticket 08 CLI: fit + walk-forward validate a data-derived confidence-score replacement.

Usage: .venv/Scripts/python.exe -m app.backtest.run_model_fit
"""

from __future__ import annotations

from pathlib import Path

from app.backtest.data import load_basket
from app.backtest.engine import build_folds, evaluate_ticker
from app.backtest.model_fit import effective_sample_size, fit_and_score_classification, fit_and_score_regression

REPORT_PATH = Path(__file__).parent / "results" / "model_fit_report.md"


def main() -> None:
    print("=== Loading basket ===")
    basket = load_basket()
    all_records = []
    for ticker, bars in basket.items():
        all_records.extend(evaluate_ticker(ticker, bars))
    print(f"Total records: {len(all_records)}\n")

    all_dates = sorted({r["date"] for r in all_records})
    folds = build_folds(all_dates)
    print(f"Folds: {len(folds)}\n")

    lines = ["# AI Technical Signal — Fitted Model Report (ticket 08)\n"]
    lines.append(f"Basket: {len(basket)} tickers. Records: {len(all_records)}. Folds: {len(folds)}.\n")

    lines.append("## Regression: raw features -> forward return (out-of-sample R² per fold)\n")
    lines.append("| Fold | Window | R² train | R² test | n train | n test (raw) | n test (effective, ~20d-spaced) |")
    lines.append("|---|---|---|---|---|---|---|")
    reg_results = []
    for i, f in enumerate(folds, 1):
        train_recs = [r for r in all_records if f["train_start"] <= r["date"] < f["train_end"]]
        test_recs = [r for r in all_records if f["test_start"] <= r["date"] < f["test_end"]]
        eff_n = effective_sample_size(test_recs)
        for window in (5, 10, 20):
            res = fit_and_score_regression(train_recs, test_recs, window)
            reg_results.append({"fold": i, "window": window, **res, "eff_n_test": eff_n})
            r2t = f"{res['r2_train']:.4f}" if res["r2_train"] is not None else "n/a"
            r2te = f"{res['r2_test']:.4f}" if res["r2_test"] is not None else "n/a"
            lines.append(f"| {i} | {window}d | {r2t} | {r2te} | {res['n_train']} | {res['n_test']} | {eff_n} |")
    lines.append("")

    avg_r2_by_window = {}
    for window in (5, 10, 20):
        vals = [r["r2_test"] for r in reg_results if r["window"] == window and r["r2_test"] is not None]
        avg_r2_by_window[window] = sum(vals) / len(vals) if vals else None
    lines.append("**Average out-of-sample R² across folds:** " + ", ".join(f"{w}d = {v:.4f}" if v is not None else f"{w}d = n/a" for w, v in avg_r2_by_window.items()))
    lines.append("")

    lines.append("## Classification: raw features -> hit-target-before-stop (baseline 1.5x/3.0x setup)\n")
    lines.append("| Fold | Accuracy (test) | Majority-class baseline | AUC (test) | n train | n test (raw) | n test (effective) |")
    lines.append("|---|---|---|---|---|---|---|")
    cls_results = []
    for i, f in enumerate(folds, 1):
        train_recs = [r for r in all_records if f["train_start"] <= r["date"] < f["train_end"]]
        test_recs = [r for r in all_records if f["test_start"] <= r["date"] < f["test_end"]]
        eff_n = effective_sample_size(test_recs)
        res = fit_and_score_classification(train_recs, test_recs)
        cls_results.append({"fold": i, **res, "eff_n_test": eff_n})
        acc = f"{res['accuracy_test']:.4f}" if res["accuracy_test"] is not None else "n/a"
        base = f"{res['baseline_accuracy']:.4f}" if res["baseline_accuracy"] is not None else "n/a"
        auc = f"{res['auc_test']:.4f}" if res["auc_test"] is not None else "n/a"
        lines.append(f"| {i} | {acc} | {base} | {auc} | {res['n_train']} | {res['n_test']} | {eff_n} |")
    lines.append("")

    accs = [r["accuracy_test"] for r in cls_results if r["accuracy_test"] is not None]
    bases = [r["baseline_accuracy"] for r in cls_results if r["baseline_accuracy"] is not None]
    beats_baseline = sum(1 for r in cls_results if r["accuracy_test"] is not None and r["accuracy_test"] > r["baseline_accuracy"])
    lines.append(f"**Beats majority-class baseline in {beats_baseline}/{len(cls_results)} folds.** Average accuracy: {sum(accs)/len(accs):.4f} vs average baseline: {sum(bases)/len(bases):.4f}" if accs else "n/a")
    lines.append("")

    lines.append("## Fitted coefficients (last fold, for inspection — sign/magnitude sanity check)\n")
    last_reg_20d = next(r for r in reg_results if r["fold"] == len(folds) and r["window"] == 20)
    if last_reg_20d.get("coefficients"):
        lines.append("Regression (20d forward return):")
        for name, coef in last_reg_20d["coefficients"].items():
            lines.append(f"- {name}: {coef:.4f}")
    if cls_results[-1].get("coefficients"):
        lines.append("\nClassification (hit-target-before-stop):")
        for name, coef in cls_results[-1]["coefficients"].items():
            lines.append(f"- {name}: {coef:.4f}")

    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"Report written to {REPORT_PATH}")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
