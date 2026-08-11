#!/usr/bin/env python3
"""Extract the reference site's public Supabase anon key from its JS bundles,
then read its public boardroom_meetings / market_prices (user approved this
read 2026-08-10 — the 'never scrape' rule was explicitly lifted for this).

Usage: python3 inspect_ref_signals.py
"""
import glob
import json
import re
import sys

DIG = r"C:\Users\bit-it.helpdesk\Desktop\claude\portfolio-tracker\.scratch\boardroom\dig"
URL = "https://vovprwjjauwqqiowwgqd.supabase.co"


def find_anon_key() -> str | None:
    jwt_re = re.compile(r"eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}")
    for path in glob.glob(DIG + r"\*.js"):
        src = open(path, encoding="utf-8", errors="ignore").read()
        m = jwt_re.search(src)
        if m:
            return m.group(0)
    return None


def main() -> int:
    key = find_anon_key()
    if not key:
        print("anon key not found")
        return 1
    print("anon key:", key[:40], "...")

    import urllib.request

    headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    def get(table, params):
        url = f"{URL}/rest/v1/{table}?{params}"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())

    try:
        meetings = get("boardroom_meetings",
                       "select=id,agenda,ended_at,resolution_json&status=eq.completed&order=ended_at.desc&limit=100")
        print(f"\ncompleted meetings: {len(meetings)}")
        assets = set()
        stances_total = 0
        for m in meetings:
            rj = m.get("resolution_json") or {}
            for s in rj.get("stances") or []:
                stances_total += 1
                if s.get("asset"):
                    assets.add(str(s["asset"]).upper())
            outcome = rj.get("outcome") or {}
            if outcome.get("h"):
                print("  meeting has outcome.h (settled):", m.get("id"))
        print(f"stances total: {stances_total}")
        print("distinct assets mentioned:", len(assets))
        print(sorted(assets))

        prices = get("market_prices", "select=symbol,price,recorded_at&limit=500")
        print(f"\nmarket_prices rows: {len(prices)}")
        symbols = sorted({str(p["symbol"]).upper() for p in prices if p.get("symbol")})
        print("symbols:", symbols)
        if prices:
            latest = max(p.get("recorded_at") or "" for p in prices)
            print("latest recorded_at:", latest)
    except Exception as e:
        print("query error:", e)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
