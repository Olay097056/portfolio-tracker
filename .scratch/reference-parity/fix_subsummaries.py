"""Count-driven parity-summary fixer and read-only verifier.

Repair mode (default) rewrites each per-section ``**สรุป**`` row from the
actual status rows. It is a fixer, not evidence.

Check mode (``--check``) never writes. It validates:
- exactly 96 data rows, with a per-section breakdown;
- every data row has canonical table shape (a spacing mutation is corruption);
- every per-section summary matches freshly counted rows;
- the Grand Summary matches the live aggregate.

The relaxed ROW_RE is used for counting so harmless whitespace cannot silently
make a row disappear from the count. CANON_RE separately rejects malformed
rows in --check, so the verifier fails loudly instead of normalising a broken
file and then checking its own output.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

DEFAULT_PATH = Path("docs/research/reference-parity-checklist-2026-08-12.md")
EXPECTED_TOTAL = 96

# Counting accepts arbitrary whitespace; validation below requires canonical shape.
ROW_RE = re.compile(r"^\|\s*(D\d+|\d+\.\d+)\s*\|")
CANON_RE = re.compile(r"^\| (D\d+|\d+\.\d+) \|")
SEC_RE = re.compile(r"^## (.*)$")
SUB_RE = re.compile(r"^### (\d+)\. (.*)$")
SUM_RE = re.compile(r"^\| \*\*สรุป\*\* \|")


def boundaries(lines: list[str]) -> list[int]:
    return [i for i, line in enumerate(lines) if SEC_RE.match(line) or SUB_RE.match(line)]


def count_statuses(lines: list[str], start: int, end: int) -> tuple[int, int, int, int]:
    yes = missing = diff = rows = 0
    for line in lines[start:end]:
        if not ROW_RE.match(line):
            continue
        rows += 1
        if "✅ มี" in line:
            yes += 1
        elif "❌ ขาด" in line:
            missing += 1
        elif "⚠️ ต่าง" in line:
            diff += 1
    return yes, missing, diff, rows


def live_counts(lines: list[str]) -> tuple[int, int, int, int]:
    yes = missing = diff = total = 0
    for line in lines:
        if not ROW_RE.match(line):
            continue
        total += 1
        if "✅ มี" in line:
            yes += 1
        elif "❌ ขาด" in line:
            missing += 1
        elif "⚠️ ต่าง" in line:
            diff += 1
    return yes, missing, diff, total


def expected_summary(yes: int, missing: int, diff: int) -> str:
    return f"| **สรุป** | | **{yes} มี · {missing} ขาด · {diff} ต่าง** | |"


def summary_expectations(lines: list[str]) -> tuple[list[tuple[int, str]], list[str]]:
    """Return (summary updates/mismatches, structural errors)."""
    bnds = boundaries(lines)
    results: list[tuple[int, str]] = []
    errors: list[str] = []
    for i, line in enumerate(lines):
        if not SUM_RE.match(line):
            continue
        prev = [b for b in bnds if b < i]
        if not prev:
            errors.append(f"L{i + 1}: summary has no section boundary")
            continue
        yes, missing, diff, _ = count_statuses(lines, prev[-1] + 1, i)
        results.append((i, expected_summary(yes, missing, diff)))
    return results, errors


def grand_summary_errors(lines: list[str], totals: tuple[int, int, int, int]) -> list[str]:
    """Check the explicit Grand Summary aggregate against live rows."""
    yes, missing, diff, total = totals
    expected = f"| **รวม** | **{yes}** | **{missing}** | **{diff}** | **{total}** |"
    # The first exact aggregate row after Grand Summary is the authoritative one.
    try:
        start = next(i for i, line in enumerate(lines) if line.strip() == "## Grand Summary")
    except StopIteration:
        return ["Grand Summary header missing"]
    aggregate = next((line.strip() for line in lines[start:] if line.startswith("| **รวม** |")), None)
    if aggregate != expected:
        return [f"Grand Summary mismatch: got {aggregate!r}, expected {expected!r}"]

    # The per-section rows of that table are a third layer. Rather than match
    # labels to headings (the 12–16 row aggregates five subsections, so a
    # 1:1 match does not exist), check that the columns ADD UP to the total.
    # Any stale section row shows up here as a column that no longer sums.
    col_sums = [0, 0, 0]
    for line in lines[start:]:
        if line.startswith("| **รวม** |"):
            break
        cells = [c.strip() for c in line.split("|")[1:-1]]
        if len(cells) != 5 or not all(c.isdigit() for c in cells[1:4]):
            continue
        for k in range(3):
            col_sums[k] += int(cells[1 + k])
    if col_sums != [yes, missing, diff]:
        return ["Grand Summary section rows do not add up: columns sum to "
                f"{col_sums} but live rows are {[yes, missing, diff]}"]
    return []


def structural_errors(lines: list[str]) -> list[str]:
    errors: list[str] = []
    for i, line in enumerate(lines):
        if ROW_RE.match(line) and not CANON_RE.match(line):
            errors.append(f"L{i + 1}: malformed data-row spacing/shape: {line.strip()[:100]}")
    return errors


def run(path: Path, check: bool) -> int:
    lines = path.read_text(encoding="utf-8").splitlines()
    totals = live_counts(lines)
    yes, missing, diff, total = totals
    errors = structural_errors(lines)
    if total != EXPECTED_TOTAL:
        breakdown = []
        bnds = boundaries(lines)
        for i, line in enumerate(lines):
            if not SUM_RE.match(line):
                continue
            prev = [b for b in bnds if b < i]
            if prev:
                _, _, _, section_rows = count_statuses(lines, prev[-1] + 1, i)
                breakdown.append(f"{lines[prev[-1]].strip()[:45]}={section_rows}")
        errors.append(f"total data rows: {total}, expected {EXPECTED_TOTAL}")
        errors.append("section row breakdown: " + " · ".join(breakdown))
    if errors:
        print("CHECK ERRORS:")
        for error in errors:
            print(f"  {error}")
        if check:
            print("CHECK: read-only validation failed")
            return 1

    expectations, section_errors = summary_expectations(lines)
    errors.extend(section_errors)
    updates = 0
    for line_no, expected in expectations:
        if lines[line_no] != expected:
            if check:
                errors.append(f"L{line_no + 1}: summary mismatch: got {lines[line_no]!r}, expected {expected!r}")
            else:
                print(f"L{line_no + 1}: {lines[line_no].strip()} -> {expected}")
                lines[line_no] = expected
                updates += 1

    # Repair the Grand Summary too. Until 2026-08-12 this function only
    # DETECTED a stale Grand Summary and left it — so a repair run finished
    # with "REPAIR VERIFY mismatches = 1" and whoever ran it had to patch the
    # aggregate by hand. It got missed once and caught the next round only by
    # luck. Repair mode now fixes every layer it checks.
    if not check:
        want = f"| **รวม** | **{yes}** | **{missing}** | **{diff}** | **{total}** |"
        for i, line in enumerate(lines):
            if line.startswith("| **รวม** |") and line.strip() != want:
                print(f"L{i + 1}: {line.strip()} -> {want}")
                lines[i] = want
                updates += 1
                break

    if not check:
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        # Re-read after writing; repair mode must not claim this is independent evidence.
        lines = path.read_text(encoding="utf-8").splitlines()
        totals = live_counts(lines)
        post_expectations, post_errors = summary_expectations(lines)
        errors = structural_errors(lines)
        if totals[3] != EXPECTED_TOTAL:
            errors.append(f"total data rows: {totals[3]}, expected {EXPECTED_TOTAL}")
        errors.extend(post_errors)
        errors.extend(
            f"L{line_no + 1}: post-write summary mismatch"
            for line_no, expected in post_expectations
            if lines[line_no] != expected
        )
        errors.extend(grand_summary_errors(lines, totals))
        print(f"updates={updates}")
        print(f"REPAIR VERIFY mismatches = {len(errors)}")
        return 1 if errors else 0

    errors.extend(grand_summary_errors(lines, totals))
    print(f"CHECK totals: {yes} มี · {missing} ขาด · {diff} ต่าง · {total} rows")
    print(f"CHECK summaries: {len(expectations)} rows inspected")
    print(f"CHECK mismatches = {len(errors)}")
    if errors:
        for error in errors:
            print(f"  {error}")
        return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="read-only verification; never writes")
    parser.add_argument("--path", type=Path, default=DEFAULT_PATH, help="check/fix this copy")
    args = parser.parse_args()
    return run(args.path, args.check)


if __name__ == "__main__":
    sys.exit(main())
