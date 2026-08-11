"""Probe 16: extract module 26088 from common.js — the CME volume API URL."""
import re

import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
js = httpx.get("https://www.cmegroup.com/etc.clientlibs/cmegroupaem/clientlibs/common.d90a30652b9c2aa8ecaf4205681ea2f3.js",
               headers=UA, timeout=30).text
print("common.js bytes:", len(js))
i = js.find("26088:")
print("module 26088 at:", i)
if i != -1:
    seg = js[i:i+4000]
    # find URLs
    for pat in [r'["\'](/[A-Za-z0-9_/.-]+)["\']', r'url\s*:\s*["\']([^"\']+)["\']']:
        hits = []
        for m in re.finditer(pat, seg):
            u = m.group(1)
            if any(k in u.lower() for k in ("volume", "mvc", "api", "json", "data", "quote", "settle")):
                hits.append(u)
        if hits:
            print(f"  {pat[:20]}:")
            for h in sorted(set(hits))[:10]:
                print("    ", h[:140])
