"""Probe 5: Deribit IV extraction (BTC/ETH/SOL/XRP) + gold OI last try."""
import json

import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def deribit_iv(currency):
    r = httpx.get("https://www.deribit.com/api/v2/public/get_book_summary_by_currency",
                  params={"currency": currency, "kind": "option"}, headers=UA, timeout=20)
    rows = r.json()["result"]
    # rows have vol (IV) + open_interest + mark_price — pick the nearest expiry
    if not rows:
        return f"{currency}: no rows"
    by_exp = {}
    for row in rows:
        exp = row.get("expiration_timestamp", 0)
        by_exp.setdefault(exp, []).append(row)
    nearest = min(by_exp)
    group = by_exp[nearest]
    ivs = [g.get("vol") for g in group if g.get("vol")]
    oi = sum(g.get("open_interest") or 0 for g in group)
    mark = group[0].get("mark_price")
    return (f"{currency}: IV={sum(ivs)/len(ivs):.2%} ({len(ivs)} opts) "
            f"OI={oi:.0f} mark={mark}")


for c in ["BTC", "ETH", "SOL", "XRP"]:
    try:
        print(deribit_iv(c))
    except Exception as e:
        print(f"{c}: ERR {type(e).__name__} {str(e)[:120]}")


# gold OI — try barchart public page JSON or CME's public data file
def gold_oi():
    # CME daily data files (public)
    r = httpx.get("https://www.cmegroup.com/CmeWS/mvc/VolumeAndOpenInterest/Futures/1/G",
                  headers=UA, timeout=15)
    if r.status_code == 200:
        return r.text[:200]
    # alternative: Barchart futures page
    r2 = httpx.get("https://www.barchart.com/futures/quotes/GC*0", headers=UA, timeout=15)
    return f"barchart {r2.status_code}"


print("\n" + gold_oi())
