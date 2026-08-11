"""Probe 14: find the module defining getVolumeDetails / the fetch URL."""
import re

import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
# get the full product-volume js
js = httpx.get("https://www.cmegroup.com/etc.clientlibs/cmegroupaem/clientlibs/product-volume.f813049f609d1f7bc64c19aa071e16e1.js",
               headers=UA, timeout=20).text
# find the import statement for k
m = re.search(r'[,\s]k\s*=\s*([A-Za-z0-9_]+)\((\d+)\)', js)
print("import k:", m.group(0) if m else "not found")
# find what k is bound to
if m:
    mod_id = m.group(2)
    i = js.find(f"{mod_id}:(")
    print(f"module {mod_id} def at:", i)
    if i != -1:
        seg = js[i:i+2500]
        # find URL patterns
        for pat in [r'fetch\(["\']([^"\']+)', r'url\s*:\s*["\']([^"\']+)', r'["\'](/[A-Za-z0-9_/.-]+(?:volume|Volume)[^"\']*)["\']',
                    r'["\']([^"\']*cmegroup[^"\']*)["\']', r'axios[^;]{0,120}']:
            hits = sorted(set(re.findall(pat, seg)))
            if hits:
                print(f"  {pat[:30]}:")
                for h in hits[:6]:
                    print("    ", h[:160])
