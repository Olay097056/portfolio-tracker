"""Probe 4: Deribit crypto IV + CME gold OI public sources."""
import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def try_call(name, method, url, **kw):
    try:
        r = httpx.request(method, url, headers=UA, timeout=20, **kw)
        print(f"[{r.status_code}] {name}")
        if r.status_code == 200:
            print("   head:", r.text[:300].replace("\n", " "))
        else:
            print("   body:", r.text[:200].replace("\n", " "))
    except Exception as e:
        print(f"[ERR] {name}: {type(e).__name__} {str(e)[:150]}")


# --- Deribit: public options data (free, no key) ---
# IV for BTC options near expiry — use the book summary / ticker
try_call("deribit BTC summary",
         "GET", "https://www.deribit.com/api/v2/public/get_book_summary_by_currency",
         params={"currency": "BTC", "kind": "option"})
try_call("deribit BTC instruments",
         "GET", "https://www.deribit.com/api/v2/public/get_instruments",
         params={"currency": "BTC", "kind": "option", "expired": "false"})

# --- CME gold OI: public report sources ---
# 1) gold-volume.com (the reference's own table said "gold-volume · CME public report")
try_call("gold-volume.com", "GET", "https://www.gold-volume.com/")
# 2) CME daily volume/OI CSV endpoint variants
try_call("cme dailypx", "GET", "https://www.cmegroup.com/CmeWS/mvc/DailyPx/FUT/1/G")
# 3) CFTC has gold futures OI too (we already fetch CFTC disagg — check a public CSV)
try_call("cftc fut oi", "GET",
         "https://publicreporting.cftc.gov/resource/6dca-aqww.json",
         params={"$limit": "2"})
