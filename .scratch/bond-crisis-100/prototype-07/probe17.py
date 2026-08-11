"""Probe 17: print raw module 26088 (no URL filter — find the endpoint)."""
import re

import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
js = httpx.get("https://www.cmegroup.com/etc.clientlibs/cmegroupaem/clientlibs/common.d90a30652b9c2aa8ecaf4205681ea2f3.js",
               headers=UA, timeout=30).text
i = js.find("26088:")
# module ends at next "N:(" pattern
next_mod = re.search(r',\d+:\(', js[i+10:])
end = i + 10 + next_mod.start() if next_mod else i + 8000
seg = js[i:end]
open("module_26088.js", "w").write(seg)
print("module bytes:", len(seg))
# find ALL string literals that look like paths
paths = sorted(set(re.findall(r'["\'](/[A-Za-z0-9_./?=&-]{6,})["\']', seg)))
print("\npaths:")
for p in paths[:20]:
    print("  ", p[:150])
