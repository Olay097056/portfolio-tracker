#!/usr/bin/env python3
"""analyze.py — compare prototype-03 runs: cost, time, stances, fabrication check.

Usage: env -u PYTHONPATH -u VIRTUAL_ENV backend/.venv/Scripts/python.exe
           .scratch/boardroom/prototype-03/analyze.py [runA runB baseline]
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RUNS = HERE / "runs"

# real numbers present in the input context (for fabrication check)
REF_SERIES = ["us10y", "us2y", "us30y", "us_hy_spread", "us_ig_spread", "vix",
              "xauusd", "dxy", "move", "usoil", "brent", "us13w", "us1y", "us5y",
              "us20y", "gold_chg_pct", "us_cpi_yoy", "us_pce_yoy"]


def load(tag: str) -> dict:
    return {
        "summary": json.loads((RUNS / tag / "summary.json").read_text(encoding="utf-8")),
        "messages": json.loads((RUNS / tag / "messages.json").read_text(encoding="utf-8")),
        "context": json.loads((RUNS / tag / "context.json").read_text(encoding="utf-8")),
    }


def fmt_usd(x):
    if x is None:
        return "—"
    if x >= 1:
        return f"${x:,.3f}"
    if x >= 0.01:
        return f"${x * 100:.1f}¢"
    return f"${x:.4f}"


def numbers_in(text: str) -> set[str]:
    """All numeric tokens (with optional +/-/./%/e) in a text."""
    toks = set(re.findall(r"[+\-−]?\d[\d,.]*(?:[eE][+\-]?\d+)?\s?(?:%|bp|bps|USD|จุด)?", text))
    # drop list markers like "4." (digit + trailing dot + space + non-digit)
    return {t for t in toks if not re.fullmatch(r"[+\-−]?\d+\.", t.strip())}


def main():
    tags = sys.argv[1:] or ["runA", "runB", "baseline"]
    rows = []
    for tag in tags:
        try:
            d = load(tag)
        except FileNotFoundError:
            print(f"[{tag}] ยังไม่มีผลลัพธ์ — ข้าม")
            continue
        rows.append((tag, d["summary"], d["messages"], d["context"]))

    print("=" * 78)
    print("PROTOTYPE-03 SUMMARY — 7-seat meeting vs single-call baseline")
    print("Rates (deepseek-v4-flash, USD/1M tok): miss $0.14 / hit $0.0028 / out $0.28")
    print("=" * 78)
    for tag, s, msgs, ctx in rows:
        u = s.get("usage", {})
        dur = s.get("duration_s")
        dur_txt = f"{dur / 60:.1f} min" if dur and dur > 90 else f"{dur}s"
        print(f"\n[{tag}] status={s.get('status')} mode={s.get('mode', s.get('kind', '-'))}")
        print(f"  calls={s.get('calls')}  tokens in={u.get('prompt_tokens', 0):,} "
              f"(hit {u.get('cache_hit', 0):,} / miss {u.get('cache_miss', 0):,})  "
              f"out={u.get('completion_tokens', 0):,}")
        print(f"  cost={fmt_usd(s.get('cost_usd'))}  duration={dur_txt}  "
              f"consensus={s.get('consensus', '-')}  skips={len(s.get('skip_reasons', []))}")
        for r in s.get("skip_reasons", []):
            print(f"    ↳ {r}")
        if s.get("stances"):
            for sid, st in s["stances"].items():
                print(f"    stance {sid}: {st}")
        if s.get("data_requests"):
            print(f"    data_requests: {s['data_requests']}")
        if s.get("error"):
            print(f"  ERROR: {s['error']}")
        if s.get("phase_times"):
            pts = s["phase_times"]
            print("  phases:", " → ".join(f"{p['phase']}@{p['at_s']}s" for p in pts))

    # ---- per-phase cost/time (meetings only) -----------------------------
    try:
        a = load("runA")
    except FileNotFoundError:
        print("\n(runA ยังไม่พร้อม — ข้าม per-phase breakdown)")
        a = None

    if a is not None:
        print("\n" + "=" * 78)
        print("PER-PHASE BREAKDOWN (runA)")
        print("=" * 78)
        by_phase: dict[str, list] = {}
        for m in a["messages"]:
            by_phase.setdefault(m["phase"], []).append(m)
        tot_in = tot_out = 0
        for phase, msgs in by_phase.items():
            tin = sum(m.get("tokens_in", 0) for m in msgs)
            tout = sum(m.get("tokens_out", 0) for m in msgs)
            lat = [m.get("latency_s") for m in msgs if m.get("latency_s")]
            cost = (tin * 0.14 + tout * 0.28) / 1e6
            tot_in += tin
            tot_out += tout
            lat_txt = f"avg {sum(lat) / len(lat):.0f}s" if lat else "—"
            print(f"  {phase:<14} msgs={len(msgs):>2}  in={tin:>6,}  out={tout:>5,}  "
                  f"cost={fmt_usd(cost):>8}  {lat_txt}")

    # ---- fabrication check: every number in the transcript vs real data ----
    print("\n" + "=" * 78)
    print("FABRICATION SPOT-CHECK — numbers in transcript vs numbers in input data")
    print("=" * 78)
    ctx_src = None
    for tag in tags:
        try:
            ctx_src = load(tag)["context"]
            break
        except FileNotFoundError:
            continue
    real_text = (
        (ctx_src or {}).get("macro", "") + "\n" + (ctx_src or {}).get("news", "")
        + "\n" + (ctx_src or {}).get("models", "")
        + "\n" + json.dumps((ctx_src or {}).get("reference_prices", {}))
    ) if ctx_src else ""
    real_nums: set[float] = set()
    for tok in re.findall(r"[+\-−]?\d[\d,.]*(?:[eE][+\-]?\d+)?", real_text):
        try:
            real_nums.add(float(tok.replace(",", "")))
        except ValueError:
            continue
    for tag, s, msgs, ctx in rows:
        if tag == "baseline":
            continue
        suspicious = []
        for m in msgs:
            if m.get("kind") == "error":
                continue
            for tok in numbers_in(m["content"]):
                num = tok.replace(",", "").replace("%", "").replace("USD", "").strip()
                try:
                    f = float(num)
                except ValueError:
                    continue
                # consider numbers that look like market values (>= 3 digits or decimal)
                if abs(f) >= 100 or (abs(f) >= 1 and "." in num):
                    # is it (approximately) in the real data set?
                    if not any(abs(f - rn) <= max(0.01, abs(f) * 0.002) for rn in real_nums):
                        suspicious.append((m["seat_name"], m["phase"], tok))
        if suspicious:
            print(f"\n[{tag}] ตัวเลขที่ไม่ตรงกับข้อมูลป้อน ({len(suspicious)} จุด):")
            for seat, phase, tok in suspicious[:15]:
                print(f"  {seat} [{phase}]: {tok}")
        else:
            print(f"\n[{tag}] ตัวเลขทั้งหมดในบทสนทนาตรงกับข้อมูลป้อน (หรือเป็นตัวเล็ก/วันที่) ✓")

    # ---- stability: stances runA vs runB ---------------------------------
    print("\n" + "=" * 78)
    print("STABILITY — runA vs runB (same input, two runs)")
    print("=" * 78)
    try:
        b = load("runB")
        st_a = a["summary"].get("stances", {})
        st_b = b["summary"].get("stances", {})
        for sid in sorted(set(st_a) | set(st_b)):
            x, y = st_a.get(sid), st_b.get(sid)
            same = x == y
            print(f"  {sid:<12} A={x}  B={y}  {'✓' if same else '✗ ต่าง'}")
        rj_a = a["summary"].get("resolution", {}).get("resolution_json", {}).get("stances", [])
        print(f"  (ดูมติเต็มใน transcript ของแต่ละ run)")
    except FileNotFoundError:
        print("  runB ยังไม่พร้อม")


def _floatable(s: str) -> bool:
    try:
        float(s.replace(",", ""))
        return True
    except ValueError:
        return False


if __name__ == "__main__":
    main()
