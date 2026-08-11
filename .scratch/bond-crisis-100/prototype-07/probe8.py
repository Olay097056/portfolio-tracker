"""Probe 8: CME daily volume/OI public sources (FTP + web APIs)."""
import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def try_get(name, url, **kw):
    try:
        r = httpx.get(url, headers=UA, timeout=20, follow_redirects=True, **kw)
        snippet = r.text[:150].replace("\n", " ")
        print(f"[{r.status_code}] {name} ({len(r.content)}b)")
        print(f"   {snippet}")
        return r
    except Exception as e:
        print(f"[ERR] {name}: {type(e).__name__} {str(e)[:130]}")
        return None


# 1. CME FTP volume files (public, HTTP-accessible)
try_get("ftp volume dir", "https://www.cmegroup.com/ftp/pub/volume/futures/")
try_get("ftp volume csv", "https://www.cmegroup.com/ftp/pub/volume/futures/2026/2026-08-10.csv")

# 2. CME Volume&OI page (web) — find its data API
r = try_get("volume page", "https://www.cmegroup.com/markets/metals/precious/gold.volume.html")
if r:
    import re
    apis = sorted(set(re.findall(r'["\'](/CmeWS[^"\']+)["\']', r.text)))
    print("   CmeWS refs:", apis[:8])
    scripts = sorted(set(re.findall(r'src="([^"]*\.js)"', r.text)))
    print("   scripts:", [s.split("/")[-1] for s in scripts[:8]])

# 3. known working CME data endpoint used by their charts
try_get("cmeweb V2", "https://www.cmegroup.com/CmeWS/mvc/VolumeAndOpenInterest/Futures/1/G")
try_get("cmeweb v3", "https://www.cmegroup.com/CmeWS/mvc/VolumeAndOpenInterest/1/G")

# 4. Try the "production" JSON used on the site (found in other projects)
try_get("cmegroup api vo", "https://www.cmegroup.com/services/volume-and-open-interest?productId=1&venue=G")
