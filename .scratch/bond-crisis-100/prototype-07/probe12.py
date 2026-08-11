"""Probe 12: dig cvol-data-index + product-volume for the data endpoint."""
import re

import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
for name in ["cvol-data-index.626d71f03493a35a8e696c554ec7712a.js",
             "product-volume.f813049f609d1f7bc64c19aa071e16e1.js"]:
    url = "https://www.cmegroup.com/etc.clientlibs/cmegroupaem/clientlibs/" + name
    js = httpx.get(url, headers=UA, timeout=20).text
    print(f"=== {name} ({len(js)}b) ===")
    # find fetch/ajax/url patterns
    for pat in [r'fetch\(["\']([^"\']+)', r'url\s*:\s*["\']([^"\']+)', r'["\'](/api/[^"\']+)',
                r'["\']([^"\']*[Vv]olume[^"\']*)["\']', r'["\']([^"\']*OpenInterest[^"\']*)["\']']:
        hits = sorted(set(re.findall(pat, js)))
        if hits:
            print(f"  {pat[:25]}:")
            for h in hits[:8]:
                print("    ", h[:160])
    print()
