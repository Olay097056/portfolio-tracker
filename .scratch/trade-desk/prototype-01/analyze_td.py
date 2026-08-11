#!/usr/bin/env python3
"""Analyze prototype_td.json — divergence between team A and team B orders."""
import json
import os
import sys

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "runs", "prototype_td.json")
data = json.load(open(path, encoding="utf-8"))

TOTAL = {"cost": 0.0, "tin": 0, "tout": 0, "sec": 0.0}
print("=" * 72)
for si, sc in enumerate(data["scenarios"]):
    print(f"\nScenario {si}: {sc['scenario']}")
    orders = {}
    for team in ("A", "B"):
        t = sc["teams"][team]
        lead = next(c for c in t["calls"] if c["seat"] == "lead")
        o = lead["order"]
        orders[team] = o
        calls = t["calls"]
        for c in calls:
            TOTAL["cost"] += t["cost_usd"] / 3
            TOTAL["tin"] += t["tokens_in"] / 3
            TOTAL["tout"] += t["tokens_out"] / 3
            TOTAL["sec"] += c["sec"]
        print(f"\n[Team {team}] {t['cost_usd']:.6f}$ · {t['tokens_in']}+{t['tokens_out']} tok · {t['seconds']}s")
        for c in calls:
            oo = c["order"]
            print(f"  {c['seat']:12s} -> {json.dumps(oo, ensure_ascii=False)[:110]}")
    # divergence check
    a, b = orders["A"], orders["B"]
    same_market = (a.get("market") or "").upper() == (b.get("market") or "").upper()
    same_side = (a.get("side") or "").lower() == (b.get("side") or "").lower()
    if not a.get("market") or not b.get("market"):
        verdict = "ต่าง (คนหนึ่งไม่เปิด/ข้อมูลไม่ครบ)"
    elif not same_market:
        verdict = "ต่างจริง — คนละสินทรัพย์"
    elif not same_side:
        verdict = "ต่างจริง — สวนทางกัน (A long / B short)"
    else:
        sa = a.get("size_pct", 0)
        sb = b.get("size_pct", 0)
        if abs(float(sa or 0) - float(sb or 0)) >= 2:
            verdict = f"ต่างพอควร — สินทรัพย์เดียว ทิศทางเดียว แต่ขนาดต่าง (A {sa}% vs B {sb}%)"
        else:
            verdict = "เหมือนกัน! — ต้องปรับ TEAM_A/B_CONFIG"
    print(f"\n  >>> DIVERGENCE: {verdict}")

print("\n" + "=" * 72)
print(f"TOTAL: ${TOTAL['cost']:.6f} · {int(TOTAL['tin'])}+{int(TOTAL['tout'])} tok · {TOTAL['sec']:.1f}s "
      f"({len(data['scenarios']) * 2} เทิร์น · 12 คอล)")
print(f"ต่อเทิร์น (2 ทีม): ${TOTAL['cost'] / (len(data['scenarios']) * 2):.6f}")
