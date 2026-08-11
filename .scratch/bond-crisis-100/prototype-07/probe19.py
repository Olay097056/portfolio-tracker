"""Probe 19: find the real getVolumeDetails definition in common.js."""
import re

import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
js = httpx.get("https://www.cmegroup.com/etc.clientlibs/cmegroupaem/clientlibs/common.d90a30652b9c2aa8ecaf4205681ea2f3.js",
               headers=UA, timeout=30).text
i = js.find("getVolumeDetails")
print("getVolumeDetails at:", i)
# find enclosing module id: search backwards for "NNNN:(e,t,r)=>"
start = js.rfind(":", max(0, i-20000), i)
mod_start = js.rfind("(", start-8, start) if start > 0 else -1
# simpler: find the last "NNNN:(" before i
m = list(re.finditer(r'(\d+):\(e,t,r?\)=>\{', js[:i]))
if m:
    last = m[-1]
    print("enclosing module:", last.group(1), "at", last.start())
    seg = js[last.start():i+3000]
    open("volume_module.js", "w").write(seg)
    print("module bytes:", len(seg))
    # find URL strings in this module
    for pat in [r'["\'](/[A-Za-z0-9_./?=&-]{8,})["\']', r'url\s*:\s*["\']([^"\']+)["\']']:
        hits = sorted(set(re.findall(pat, seg)))
        if hits:
            print(f"\n{pat[:20]}:")
            for h in hits[:12]:
                print("  ", h[:150])
