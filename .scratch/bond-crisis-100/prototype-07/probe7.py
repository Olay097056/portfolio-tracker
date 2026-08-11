"""Probe 7 final: Deribit ticker mark_iv + barchart internal API."""
import json

import httpx

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def deribit_ticker(instrument):
    r = httpx.get("https://www.deribit.com/api/v2/public/ticker",
                  params={"instrument_name": instrument}, headers=UA, timeout=20)
    d = r.json()["result"]
    return (f"{instrument}: mark_iv={d.get('mark_iv')} last={d.get('last_price')} "
            f"oi={d.get('open_interest')}")


# nearest BTC option instruments
r = httpx.get("https://www.deribit.com/api/v2/public/get_instruments",
              params={"currency": "BTC", "kind": "option", "expired": "false"}, headers=UA, timeout=20)
ins = r.json()["result"]
print("BTC instruments:", len(ins))
if ins:
    print(deribit_ticker(ins[0]["instrument_name"]))
    # also try the volatility index endpoint
    r2 = httpx.get("https://www.deribit.com/api/v2/public/get_volatility_index_data",
                   params={"currency": "BTC", "start_timestamp": "0", "end_timestamp": "9999999999999",
                           "resolution": "3600"}, headers=UA, timeout=20)
    rows = r2.json().get("result", {}).get("data", [])
    print(f"BTC vol index rows: {len(rows)} last={rows[-1] if rows else None}")


# barchart internal API for futures quotes (they use /proxies/core-api/v1/...)
r3 = httpx.get("https://www.barchart.com/proxies/core-api/v1/quotes/get",
               params={"symbols": "GC*0", "fields": "openInterest,lastPrice"}, headers=UA, timeout=20)
print(f"\nbarchart api: {r3.status_code} {r3.text[:200]}")
