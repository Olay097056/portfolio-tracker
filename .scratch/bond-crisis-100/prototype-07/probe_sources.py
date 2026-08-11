"""CME data-source probe (bond-crisis-100 ticket 07 prototype).

Measures whether the reference's data sources are usable free / without
login from this host + from Vercel egress:
1. vol2vol (IV / sigma / put-call) — the reference's core CME data source
2. Hyperliquid (live prices) — reference uses trade_marks
3. CME public reports (gold OI) — fred-style public CSV
4. ZQ Fed Funds futures (for FedWatch) — yfinance
"""
import json
import time

import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
t0 = time.time()


def probe(name, fn):
    s = time.time()
    try:
        r = fn()
        print(f"[{time.time()-s:5.1f}s] {name}: OK -> {str(r)[:180]}")
    except Exception as e:
        print(f"[{time.time()-s:5.1f}s] {name}: FAIL {type(e).__name__}: {str(e)[:200]}")


# 1. vol2vol — try known endpoints (their API is at vol2vol.com/api/...)
def vol2vol():
    # their public quote endpoint used by several dashboards
    r = httpx.get("https://vol2vol.com/api/option/quotes?symbol=GC&date=2026-08-11",
                  headers=UA, timeout=20)
    return r.status_code, r.text[:300]


# 2. Hyperliquid — public info API (free, no key)
def hyperliquid():
    r = httpx.post("https://api.hyperliquid.xyz/info",
                   json={"type": "metaAndAssetCtxs"}, headers=UA, timeout=20)
    d = r.json()
    # universe + spot prices
    metas = d[0].get("universe", [])
    ctxs = d[1]
    pair = [m for m in metas if m["name"] == "BTC"][0]["name"]
    px = ctxs[[i for i, m in enumerate(metas) if m["name"] == "BTC"][0]]["markPx"]
    return f"{len(metas)} markets, BTC mark={px}"


# 3. CME public report — gold futures OI CSV (from cftc.gov / cmegroup)
def cme_gold():
    r = httpx.get("https://www.cmegroup.com/CmeWS/mvc/VolumeAndOpenInterest",
                  params={"productId": "1", "venue": "G", "category": "F"},
                  headers=UA, timeout=20)
    return r.status_code, r.text[:200]


# 4. ZQ Fed Funds futures via yfinance (free)
def zq_yf():
    import yfinance as yf
    t = yf.Ticker("ZQ=F")
    h = t.history(period="5d")
    return f"last={h['Close'].iloc[-1]:.3f} rows={len(h)}"


probe("vol2vol quotes", vol2vol)
probe("hyperliquid meta", hyperliquid)
probe("cme gold OI", cme_gold)
probe("ZQ=F yfinance", zq_yf)
print(f"\ntotal {time.time()-t0:.1f}s")
