"""Probe 20: hit the real CME volume endpoints (found in module 23741)."""
import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def try_get(name, url, **kw):
    try:
        r = httpx.get(url, headers=UA, timeout=20, follow_redirects=True, **kw)
        print(f"[{r.status_code}] {name}")
        print("   ", r.text[:300].replace("\n", " "))
        return r
    except Exception as e:
        print(f"[ERR] {name}: {type(e).__name__} {str(e)[:120]}")


# gold = product 1, venue G (globex); F = futures
try_get("vol details gold", "https://www.cmegroup.com/CmeWS/mvc/Volume/Details/F/1/G")
try_get("vol details gold w/date", "https://www.cmegroup.com/CmeWS/mvc/Volume/Details/F/1/G?tradeDate=08/10/2026")
try_get("trade dates", "https://www.cmegroup.com/CmeWS/mvc/Volume/TradeDates?exchange=G")
