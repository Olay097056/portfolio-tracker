"""Test which UA passes CME's bot filter (local first, then decide)."""
import httpx

URL = "https://www.cmegroup.com/CmeWS/mvc/Volume/LastTotals/437?days=15"
UAS = {
    "default": "python-httpx/0.27.2",
    "chrome": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "firefox": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
    "empty": "",
}
for name, ua in UAS.items():
    h = {"User-Agent": ua} if ua else {}
    try:
        r = httpx.get(URL, headers=h, timeout=20, follow_redirects=True)
        print(f"{name:10s} -> {r.status_code} {len(r.content)}b {r.text[:80]}")
    except Exception as e:
        print(f"{name:10s} -> ERR {type(e).__name__} {str(e)[:80]}")
