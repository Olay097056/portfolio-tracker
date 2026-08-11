"""Probe 6: Deribit IV with filtering + barchart gold OI extraction."""
import re

import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Accept": "text/html,application/xhtml+xml"}


def deribit_iv(currency):
    r = httpx.get("https://www.deribit.com/api/v2/public/get_book_summary_by_currency",
                  params={"currency": currency, "kind": "option"}, headers=UA, timeout=20)
    rows = [g for g in r.json()["result"] if g.get("vol")]
    if not rows:
        return f"{currency}: no IV rows"
    # nearest expiry group with IV
    by_exp = {}
    for row in rows:
        by_exp.setdefault(row.get("expiration_timestamp", 0), []).append(row)
    nearest = min(by_exp)
    group = by_exp[nearest]
    ivs = [g["vol"] for g in group]
    return (f"{currency}: nearest-exp IV avg={sum(ivs)/len(ivs):.2%} "
            f"({len(ivs)} rows) OI={sum(g.get('open_interest') or 0 for g in group):.0f}")


for c in ["BTC", "ETH"]:
    try:
        print(deribit_iv(c))
    except Exception as e:
        print(f"{c}: ERR {type(e).__name__} {str(e)[:120]}")


# barchart gold futures page — find OI
r = httpx.get("https://www.barchart.com/futures/quotes/GC*0", headers=UA, timeout=20)
html = r.text
print(f"\nbarchart bytes: {len(html)}")
for pat in ["open interest", "Open Interest", "oi-value", '"oi"']:
    i = html.lower().find(pat.lower())
    if i != -1:
        seg = html[max(0, i-100):i+200]
        seg = re.sub(r"<[^>]+>", " ", seg)
        print(f"  {pat}: ...{seg[:200]}...")
        break
else:
    print("  OI not found in page")
