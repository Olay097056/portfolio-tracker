"""Probe vol2vol real endpoints (expected-range / analytics)."""
import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "Origin": "https://www.vol2vol.com",
      "Referer": "https://www.vol2vol.com/"}


def try_call(name, method, url, **kw):
    try:
        r = httpx.request(method, url, headers=UA, timeout=20, **kw)
        print(f"[{r.status_code}] {name}: {method} {url}")
        if r.status_code == 200:
            print("   head:", r.text[:250].replace("\n", " "))
        else:
            print("   body:", r.text[:200].replace("\n", " "))
        return r
    except Exception as e:
        print(f"[ERR] {name}: {type(e).__name__} {str(e)[:150]}")


B = "https://www.vol2vol.com"
# expected-range for gold (GC) — params guessed
try_call("range GC", "GET", f"{B}/api/expected-range/dte-options?symbol=GC")
try_call("range GC post", "POST", f"{B}/api/expected-range/dte-options",
         json={"symbol": "GC", "dte": 16})
try_call("analytics GC", "GET", f"{B}/api/analytics/?symbol=GC")
try_call("analytics GC post", "POST", f"{B}/api/analytics/",
         json={"symbol": "GC", "dte": 16})
# maybe query params differ — inspect page chunk for how it's called
