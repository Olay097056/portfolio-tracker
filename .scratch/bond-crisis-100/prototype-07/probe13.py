"""Probe 13: find getVolumeOptionsDetails implementation (the fetch URL)."""
import re

import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
urls = [
    "https://www.cmegroup.com/etc.clientlibs/cmegroupaem/clientlibs/product-volume.f813049f609d1f7bc64c19aa071e16e1.js",
    "https://www.cmegroup.com/etc.clientlibs/cmegroupaem/clientlibs/common.d90a30652b9c2aa8ecaf4205681ea2f3.js",
    "https://www.cmegroup.com/etc.clientlibs/cmegroupaem/clientlibs/main.js",
]
for u in urls:
    try:
        js = httpx.get(u, headers=UA, timeout=20).text
        i = js.find("getVolumeOptionsDetails")
        if i == -1:
            # search for the api path patterns
            apis = set(re.findall(r'["\'](/[A-Za-z0-9_/.-]*[Dd]ata[^"\']*)["\']', js)) | \
                   set(re.findall(r'["\'](https?://[^"\']*cmegroup[^"\']*[Aa]pi[^"\']*)["\']', js)) | \
                   set(re.findall(r'"/[^"]*(?:quotes|volume|settlement)[^"]*"', js))
            if apis:
                print(f"=== {u.split('/')[-1][:40]} ({len(js)}b) ===")
                for a in sorted(apis)[:10]:
                    print("   ", a[:140])
            continue
        print(f"=== {u.split('/')[-1][:40]} ({len(js)}b) — found at {i} ===")
        print(js[max(0, i-600):i+600])
        break
    except Exception as e:
        print(f"[ERR] {u.split('/')[-1]}: {str(e)[:100]}")
