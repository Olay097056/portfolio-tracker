"""vol2vol + CME endpoint discovery (probe 2)."""
import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def try_get(name, url, **kw):
    try:
        r = httpx.get(url, headers=UA, timeout=15, **kw)
        print(f"[{r.status_code}] {name}: {url}")
        if r.status_code == 200:
            print("   head:", r.text[:200].replace("\n", " "))
        return r
    except Exception as e:
        print(f"[ERR] {name}: {url} -> {type(e).__name__} {str(e)[:120]}")
        return None


# vol2vol — try public endpoints seen in other open-source projects
try_get("v2v quote", "https://www.vol2vol.com/api/option/quotes?symbol=GC")
try_get("v2v api2", "https://api.vol2vol.com/api/option/quotes?symbol=GC")
try_get("v2v home", "https://www.vol2vol.com/")

# CME public endpoints (known working ones)
try_get("cme quotes", "https://www.cmegroup.com/CmeWS/mvc/Quotes/Future/1/G?pageSize=5")
try_get("cme settle", "https://www.cmegroup.com/CmeWS/mvc/Settlements/Futures/Settlements/1/F/G")
try_get("cme OI", "https://www.cmegroup.com/CmeWS/mvc/VolumeAndOpenInterest/Future/1/G")
