"""Probe 29: LastTotals + daily-voi."""
import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
for url in [
    "https://www.cmegroup.com/CmeWS/mvc/Volume/LastTotals/GCVL?days=15",
    "https://www.cmegroup.com/CmeWS/mvc/Volume/LastTotals/437?days=15",
    "https://www.cmegroup.com/services/daily-voi?days=15",
]:
    r = httpx.get(url, headers=UA, timeout=25)
    print(f"\n[{r.status_code}] {url.split('.com')[1][:60]}")
    print(r.text[:500])
