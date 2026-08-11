"""Probe 9: find CME volume data endpoint from page JS."""
import re

import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def get(url):
    r = httpx.get(url, headers=UA, timeout=20, follow_redirects=True)
    return r.status_code, r.text


# fetch the volume page again and grep ALL script srcs, then fetch a few
status, html = get("https://www.cmegroup.com/markets/metals/precious/gold.volume.html")
scripts = sorted(set(re.findall(r'src="([^"]*\.js)"', html)))
# only inline / production files that likely contain API calls
cands = [s for s in scripts if "cmegroup" in s or "prod" in s or "baseball" in s]
print("script candidates:", [s.split("/")[-1] for s in cands[:12]])

# known CME data file pattern: v1/dailypx JSON
for u in [
    "https://www.cmegroup.com/CmeWS/mvc/Quotes/Future/1/G",
    "https://www.cmegroup.com/CmeWS/mvc/Quotes/Future/1/G?pageSize=10&sortField=OI",
    "https://www.cmegroup.com/CmeWS/mvc/DelayedQuotes/Future/1/G",
    "https://www.cmegroup.com/CmeWS/mvc/ProductCalendar/GetProducts",
]:
    try:
        r = httpx.get(u, headers=UA, timeout=15)
        print(f"[{r.status_code}] {u.split('/')[-1]} -> {r.text[:120]}")
    except Exception as e:
        print(f"[ERR] {u} {str(e)[:80]}")
