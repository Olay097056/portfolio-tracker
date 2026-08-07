# backend/app/backtest/run_classification_check.py
"""Ticket 07 follow-up check: does the combined signal_type badge (BULLISH/BEARISH/SQUEEZE/
NEUTRAL) the user actually sees carry predictive signal, even though ticket 06 found none of the
5 individual pillar point-values correlate with forward returns? Reuses the cached basket data —
no re-fetch needed.

Usage: .venv/Scripts/python.exe -m app.backtest.run_classification_check
"""

from __future__ import annotations

from app.backtest.data import load_basket
from app.backtest.engine import build_folds, evaluate_ticker, signal_type_forward_returns


def main() -> None:
    basket = load_basket()
    all_records = []
    for ticker, bars in basket.items():
        all_records.extend(evaluate_ticker(ticker, bars))

    all_dates = sorted({r["date"] for r in all_records})
    folds = build_folds(all_dates)

    print(f"Total records: {len(all_records)}, folds: {len(folds)}\n")

    for window in (5, 10, 20):
        print(f"=== {window}-day forward return by signal_type (per fold TEST window) ===")
        for i, f in enumerate(folds, 1):
            test_recs = [r for r in all_records if f["test_start"] <= r["date"] < f["test_end"]]
            res = signal_type_forward_returns(test_recs, window)
            line = f"  Fold {i}: "
            parts = []
            for t in ("BULLISH", "NEUTRAL", "SQUEEZE", "BEARISH"):
                m = res[t]
                if m["n"]:
                    parts.append(f"{t}={m['mean']:.2f}% (n={m['n']})")
                else:
                    parts.append(f"{t}=n/a")
            print(line + " | ".join(parts))
        print()

    # Aggregate across all test folds combined, for a single headline number per type
    print("=== Aggregate across all 5 test-fold windows combined ===")
    all_test_recs = []
    for f in folds:
        all_test_recs.extend([r for r in all_records if f["test_start"] <= r["date"] < f["test_end"]])
    for window in (5, 10, 20):
        res = signal_type_forward_returns(all_test_recs, window)
        parts = [f"{t}={res[t]['mean']:.2f}% (n={res[t]['n']})" if res[t]["n"] else f"{t}=n/a" for t in ("BULLISH", "NEUTRAL", "SQUEEZE", "BEARISH")]
        print(f"  {window}d: " + " | ".join(parts))


if __name__ == "__main__":
    main()
