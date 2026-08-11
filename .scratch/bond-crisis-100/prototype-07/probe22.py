"""Probe 22: final — CME gold volume details with the real URL shape."""
import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

# getVolumeDetails(productId=1, tradeDate=20260810, venue=G, pageSize=500)
url = "https://www.cmegroup.com/CmeWS/mvc/Volume/Details/F/1/20260810/G?tradeDate=20260810&pageSize=500"
r = httpx.get(url, headers=UA, timeout=25)
print(f"[{r.status_code}] {len(r.content)}b")
print(r.text[:800])
