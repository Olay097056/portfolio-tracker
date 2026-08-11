"""Probe 15: scan all CME clientlibs for module 26088 (volume API)."""
import re

import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
html = httpx.get("https://www.cmegroup.com/markets/metals/precious/gold.volume.html",
                 headers=UA, timeout=20, follow_redirects=True).text
scripts = sorted(set(re.findall(r'src="([^"]*\.js)"', html)))
hits = []
for s in scripts:
    url = ("https://www.cmegroup.com" + s) if s.startswith("/") else s
    try:
        js = httpx.get(url, headers=UA, timeout=15).text
    except Exception:
        continue
    if "26088:" in js or "getVolumeDetails" in js:
        hits.append(url)
        print("FOUND:", url.split("/")[-1][:70], len(js))
print("total hits:", len(hits))
# also check the volume page's inline JSON for a data url
m = re.findall(r'data-(?:url|endpoint|api)="?([^"\s>]+)', html)
print("data-url hints:", m[:8])
