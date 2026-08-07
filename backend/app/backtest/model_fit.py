# backend/app/backtest/model_fit.py
"""Ticket 08: fit a data-derived replacement for calcConfidenceScore's hand-picked buckets,
using the same walk-forward folds as ticket 06/07 — fit on each fold's TRAIN window, score on
that fold's TEST window. Two framings, per ticket 08's scope:

  1. Regression: raw features -> forward return (5/10/20d).
  2. Classification: raw features -> did the baseline (1.5x/3.0x) trading setup hit its target
     before its stop (the same win/loss definition ticket 03/06 already used), on trials that
     resolved (excluding "expired").

Both start with the simplest model (linear/logistic regression) per ticket 08's "start simple"
instruction, and both report an effective-sample-size estimate alongside any fit statistic --
see effective_sample_size()'s docstring for why the raw record count overstates independence.
"""

from __future__ import annotations

import numpy as np
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import r2_score, roc_auc_score

from app.backtest.engine import FEATURE_NAMES, BASELINE_ATR, DayRecord


def _feature_matrix(records: list[DayRecord]) -> np.ndarray:
    return np.array([[r["features"][name] for name in FEATURE_NAMES] for r in records])


def effective_sample_size(records: list[DayRecord], spacing_days: int = 20) -> int:
    """Approximate count of *roughly independent* observations, by keeping only one record every
    `spacing_days` trading days per ticker. The raw record count vastly overstates independence:
    adjacent days within a ticker share almost all of their 20-day forward-return window (day t
    and day t+1's 20-day windows overlap in 19 of 20 days), and the 5 broad-market ETFs move
    together with -- and largely explain -- their constituents on the same days. Spacing by the
    longest forward window (20 trading days) keeps each ticker's kept observations from
    overlapping in their forward window, which is the specific non-independence this backtest's
    regression targets are most exposed to; it does not correct for cross-ticker correlation,
    which is a real remaining caveat to disclose alongside this number, not one this function
    fixes."""
    by_ticker: dict[str, list[DayRecord]] = {}
    for r in records:
        by_ticker.setdefault(r["ticker"], []).append(r)
    count = 0
    for recs in by_ticker.values():
        recs_sorted = sorted(recs, key=lambda r: r["date"])
        count += len(recs_sorted[::spacing_days])
    return count


def fit_and_score_regression(train: list[DayRecord], test: list[DayRecord], window: int) -> dict:
    train_f = [r for r in train if r["fwd_returns"].get(window) is not None]
    test_f = [r for r in test if r["fwd_returns"].get(window) is not None]
    if len(train_f) < 30 or len(test_f) < 30:
        return {"r2_test": None, "r2_train": None, "n_train": len(train_f), "n_test": len(test_f)}

    X_train, y_train = _feature_matrix(train_f), np.array([r["fwd_returns"][window] for r in train_f])
    X_test, y_test = _feature_matrix(test_f), np.array([r["fwd_returns"][window] for r in test_f])

    model = LinearRegression().fit(X_train, y_train)
    r2_train = r2_score(y_train, model.predict(X_train))
    r2_test = r2_score(y_test, model.predict(X_test))

    return {
        "r2_train": r2_train,
        "r2_test": r2_test,
        "n_train": len(train_f),
        "n_test": len(test_f),
        "coefficients": dict(zip(FEATURE_NAMES, model.coef_.tolist())),
        "intercept": float(model.intercept_),
    }


def fit_and_score_classification(train: list[DayRecord], test: list[DayRecord]) -> dict:
    """target = 1 if the baseline trading setup hit its target before its stop, 0 if it hit the
    stop first; "expired" trials are dropped (neither a win nor a loss, per ticket 03's own
    definition)."""

    def _xy(records: list[DayRecord]):
        xs, ys = [], []
        for r in records:
            o = r["setup_outcomes"].get(BASELINE_ATR)
            if o is None or o["outcome"] == "expired":
                continue
            xs.append([r["features"][name] for name in FEATURE_NAMES])
            ys.append(1 if o["outcome"] == "target" else 0)
        return np.array(xs), np.array(ys)

    X_train, y_train = _xy(train)
    X_test, y_test = _xy(test)
    if len(y_train) < 30 or len(y_test) < 30 or len(set(y_train.tolist())) < 2:
        return {"accuracy_test": None, "auc_test": None, "baseline_accuracy": None, "n_train": len(y_train), "n_test": len(y_test)}

    model = LogisticRegression(max_iter=2000).fit(X_train, y_train)
    pred_test = model.predict(X_test)
    accuracy_test = float((pred_test == y_test).mean())
    majority_class_rate = float(max(y_test.mean(), 1 - y_test.mean()))  # naive "always predict the majority" baseline

    auc_test = None
    if len(set(y_test.tolist())) == 2:
        proba = model.predict_proba(X_test)[:, 1]
        auc_test = float(roc_auc_score(y_test, proba))

    return {
        "accuracy_test": accuracy_test,
        "baseline_accuracy": majority_class_rate,
        "auc_test": auc_test,
        "n_train": len(y_train),
        "n_test": len(y_test),
        "coefficients": dict(zip(FEATURE_NAMES, model.coef_[0].tolist())),
        "intercept": float(model.intercept_[0]),
    }
