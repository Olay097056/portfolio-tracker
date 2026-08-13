"""Guard against comparing a timestamp column to a string.

SQLite stores datetimes as ISO-8601 text, so `Column(DateTime) >= "2026-08-13"`
compares fine there and every local test passes. Postgres rejects it:

    operator does not exist: timestamp with time zone >= character varying

and — worse than a plain failure — the error aborts the surrounding
transaction, so later commits in the same session fail too. One such line in
run_due_turns stalled the production job loop for 13 hours (2026-08-12 12:00 →
2026-08-13 01:14): the tick could no longer mark its own job_runs row
finished, so every following tick took over a "wedged" lock and hit the same
line again.

The whole suite runs on SQLite, so no behavioural test can catch this class.
This one reads the source instead.
"""
from __future__ import annotations

import ast
import pathlib

APP = pathlib.Path(__file__).resolve().parent.parent / "app"

# attribute names that are datetime columns in this codebase
DATETIME_SUFFIXES = ("_at", "_until", "_date")
COMPARISONS = (ast.GtE, ast.Gt, ast.LtE, ast.Lt, ast.Eq, ast.NotEq)


def _is_datetime_column(node: ast.expr) -> bool:
    return isinstance(node, ast.Attribute) and node.attr.endswith(DATETIME_SUFFIXES)


def _looks_like_a_string(node: ast.expr) -> bool:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return True
    # x.isoformat() / x.date().isoformat() / str(x) / f"..."
    if isinstance(node, ast.JoinedStr):
        return True
    if isinstance(node, ast.Call):
        func = node.func
        if isinstance(func, ast.Attribute) and func.attr == "isoformat":
            return True
        if isinstance(func, ast.Name) and func.id == "str":
            return True
    return False


def test_no_datetime_column_is_compared_to_a_string():
    offenders: list[str] = []
    for path in sorted(APP.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Compare) or len(node.ops) != 1:
                continue
            if not isinstance(node.ops[0], COMPARISONS):
                continue
            left, right = node.left, node.comparators[0]
            for col, other in ((left, right), (right, left)):
                if _is_datetime_column(col) and _looks_like_a_string(other):
                    offenders.append(
                        f"{path.relative_to(APP.parent)}:{node.lineno} "
                        f"— {getattr(col, 'attr', '?')} เทียบกับสตริง")
    assert not offenders, (
        "เทียบคอลัมน์เวลากับสตริง — SQLite ผ่าน แต่ Postgres จะ abort transaction:\n  "
        + "\n  ".join(offenders))
