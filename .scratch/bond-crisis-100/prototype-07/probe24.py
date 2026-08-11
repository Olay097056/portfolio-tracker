"""Probe 24: find gold's real productId from the volume page HTML."""
import re

import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
html = httpx.get("https://www.cmegroup.com/markets/metals/precious/gold.volume.html",
                 headers=UA, timeout=20, follow_redirects=True).text
# find productId / venue / data attributes
for pat in [r'data-product[^>]{0,60}', r'productId[^,;]{0,40}', r'"productId"\s*:\s*\d+',
            r'product_id[^,;]{0,40}', r'"globex"[^,;]{0,30}', r'data-venue[^>]{0,30}',
            r'productNumber[^,;]{0,40}']:
    hits = re.findall(pat, html)
    if hits:
        print(pat, "->", hits[:6])
# look for JSON config in the page
m = re.search(r'window\.__[A-Z_]+__\s*=\s*(\{.{0,200})', html)
if m:
    print("config:", m.group(1)[:250])
