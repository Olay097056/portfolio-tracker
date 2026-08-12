"""Fix per-category summary rows — count-driven, not eyeball-driven. v2.

- Sections are delimited by "## N" headers; sub-sections by "### N." headers.
- Rows counted: "| Dxx |" (disclaimer) and "| N.M |" (category rows).
- Each "| **สรุป** |" row gets the count of rows in ITS sub-section (or
  section when no sub-sections exist).
- Verification pass re-counts; any mismatch exits non-zero.
"""
import re
import sys
from pathlib import Path

PATH = Path("docs/research/reference-parity-checklist-2026-08-12.md")
text = PATH.read_text(encoding="utf-8")
lines = text.split("\n")

ROW_RE = re.compile(r"^\| (D\d+|\d+\.\d+) ")
SEC_RE = re.compile(r"^## (.*)$")
SUB_RE = re.compile(r"^### (\d+)\. (.*)$")
SUM_RE = re.compile(r"^\| \*\*สรุป\*\* \|")

def count_statuses(start: int, end: int) -> tuple[int, int, int]:
    yes = missing = diff = 0
    for ln in lines[start:end]:
        if not ROW_RE.match(ln):
            continue
        if "✅ มี" in ln:
            yes += 1
        elif "❌ ขาด" in ln:
            missing += 1
        elif "⚠️ ต่าง" in ln:
            diff += 1
    return yes, missing, diff

# Build boundaries: every "##" and "###" header position
boundaries = []  # (idx, level, label)
for i, ln in enumerate(lines):
    if SEC_RE.match(ln):
        boundaries.append((i, 2, ln))
    elif SUB_RE.match(ln):
        boundaries.append((i, 3, ln))

# For each summary row, find the nearest preceding boundary
updates = 0
for i, ln in enumerate(lines):
    if not SUM_RE.match(ln):
        continue
    prev = [b for b in boundaries if b[0] < i]
    if not prev:
        print(f"L{i+1}: NO SECTION BOUNDARY — skip")
        continue
    start = prev[-1][0] + 1
    yes, missing, diff = count_statuses(start, i)
    new = f"| **สรุป** | | **{yes} มี · {missing} ขาด · {diff} ต่าง** | |"
    if ln != new:
        print(f"L{i+1}: {ln.strip()[:70]}  ->  {new.strip()}")
        lines[i] = new
        updates += 1

PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")

# ── Verify pass: re-read, recompute, must be 0 ──────────────────────────────
text2 = PATH.read_text(encoding="utf-8")
lines2 = text2.split("\n")
boundaries2 = []
for i, ln in enumerate(lines2):
    if SEC_RE.match(ln) or SUB_RE.match(ln):
        boundaries2.append(i)

bad = 0
for i, ln in enumerate(lines2):
    if not SUM_RE.match(ln):
        continue
    prev = [b for b in boundaries2 if b < i]
    start = prev[-1] + 1 if prev else 0
    yes, missing, diff = count_statuses(start, i)  # note: uses lines (pre-write) — OK, statuses unchanged
    expected = f"| **สรุป** | | **{yes} มี · {missing} ขาด · {diff} ต่าง** | |"
    if ln != expected:
        bad += 1
        print(f"MISMATCH L{i+1}: {ln}  !=  {expected}")

print(f"\nupdates={updates} · VERIFY mismatches = {bad}")
sys.exit(1 if bad else 0)
