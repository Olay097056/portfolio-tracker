"""Probe 10: dig baseball-card.js for CME volume data endpoint."""
import re

import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

urls = [
    "https://www.cmegroup.com/_ui/js/baseball-card.1da1d492223fcf220039474c9b702214.js",
    "https://www.cmegroup.com/_ui/js/cards.02cc32954d9b18b9258d667fa3a3aad0.js",
]
for u in urls:
    try:
        r = httpx.get(u, headers=UA, timeout=20)
        js = r.text
        print(f"[{r.status_code}] {u.split('/')[-1]} ({len(js)}b)")
        apis = sorted(set(re.findall(r'["\'](/[A-Za-z0-9_/.-]*mvc[^"\']*)["\']', js)) |
                      set(re.findall(r'["\'](/[A-Za-z0-9_/.-]*volume[^"\']*)["\']', js)) |
                      set(re.findall(r'["\'](/[A-Za-z0-9_/.-]*VolOpen[^"\']*)["\']', js)) |
                      set(re.findall(r'url:\s*["\']([^"\']+)["\']', js)))
        for a in sorted(apis)[:12]:
            print("   ", a[:150])
    except Exception as e:
        print(f"[ERR] {u.split('/')[-1]}: {str(e)[:100]}")
