"""Probe 11: get full script URLs from CME volume page, then dig for data API."""
import re

import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
html = httpx.get("https://www.cmegroup.com/markets/metals/precious/gold.volume.html",
                 headers=UA, timeout=20, follow_redirects=True).text
scripts = sorted(set(re.findall(r'src="([^"]*\.js)"', html)))
print("total scripts:", len(scripts))
# find ones with 'volume' or 'baseball' or 'mvc' hints
targets = [s for s in scripts if any(k in s.lower() for k in ("volume", "baseball", "quote", "data", "card"))]
print("targets:", targets[:10])

# resolve relative
for t in targets[:4]:
    if t.startswith("/"):
        url = "https://www.cmegroup.com" + t
    else:
        url = t
    try:
        r = httpx.get(url, headers=UA, timeout=20, follow_redirects=True)
        js = r.text
        print(f"\n[{r.status_code}] {url.split('/')[-1][:60]} ({len(js)}b)")
        if r.status_code == 200 and not js.startswith("<!DOCTYPE"):
            apis = sorted(set(re.findall(r'["\']((?:/CmeWS|https?://[^"\']*cmegroup[^"\']*)/[^"\']*)["\']', js)) |
                          set(re.findall(r'url\s*:\s*["\']([^"\']+)["\']', js)) |
                          set(re.findall(r'["\']/(?:prod|production)/[^"\']+["\']', js)))
            for a in sorted(apis)[:10]:
                print("   ", a[:150])
    except Exception as e:
        print(f"[ERR] {url[:80]}: {str(e)[:80]}")
