"""Extend module 23741 window — show g (LastTotals) + O (ExchangeVol) bodies."""
import re

import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
js = httpx.get("https://www.cmegroup.com/etc.clientlibs/cmegroupaem/clientlibs/common.d90a30652b9c2aa8ecaf4205681ea2f3.js",
               headers=UA, timeout=30).text
i = js.find("getVolumeDetails")
m = list(re.finditer(r'(\d+):\(e,t,r?\)=>\{', js[:i]))
last = m[-1]
seg = js[last.start():last.start()+8000]
open("volume_module2.js", "w").write(seg)
# find the LastTotals function body: "function g(){"
j = seg.find("function g(){")
print("g at:", j)
if j != -1:
    print(seg[j:j+900])
