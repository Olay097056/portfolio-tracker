"""Probe 26: try LastTotals + check the page's data attributes."""
import re

import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
html = httpx.get("https://www.cmegroup.com/markets/metals/precious/gold.volume.html",
                 headers=UA, timeout=20, follow_redirects=True).text
m = re.search(r'data-product-groups="([^"]{0,600})', html)
if m:
    print("product groups:", m.group(1)[:400])
m2 = re.search(r'data-product-id="([^"]+)" data-source-type="([^"]+)"[^>]*data-days="([^"]+)"', html)
if m2:
    print("product-id:", m2.group(1), "| source-type:", m2.group(2), "| days:", m2.group(3))

# getVolumeLastTotals: /CmeWS/mvc/Volume/LastTotals?...
for url in [
    "https://www.cmegroup.com/CmeWS/mvc/Volume/LastTotals?productId=GCVL&exchange=G",
    "https://www.cmegroup.com/CmeWS/mvc/Volume/LastTotals?productId=437&exchange=G",
]:
    r = httpx.get(url, headers=UA, timeout=20)
    print(f"\n[{r.status_code}] {url.split('?')[1]}")
    print(r.text[:400])
