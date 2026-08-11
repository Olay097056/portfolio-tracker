"""Deployability spike for portfolio-tracker -> Vercel migration.

Throwaway code (not production). Measures, from Vercel's real egress:
  /fred   -> FRED fredgraph reachable? (httpx DEFAULT UA per project lesson; custom UA times out)
  /yf     -> yfinance works?
  /scrape -> worldgovernmentbonds scrape works?
  /cold   -> detect cold vs warm via time-since-app-import
  /bundle -> confirms numpy + scikit-learn bundled & importable (deploy-time bundle size measure)
"""
import json
import time

import httpx

# Import the heavy deps at module load so they land in the serverless bundle.
import numpy as np  # noqa: F401
import sklearn  # noqa: F401

from fastapi import FastAPI

app = FastAPI(title="deployability-spike")

_START = time.time()

FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10"
YB_URL = "https://www.worldgovernmentbonds.com/"


@app.get("/")
def root():
    return {"ok": True, "spike": "deployability"}


@app.get("/bundle")
def bundle():
    return {"numpy": np.__version__, "sklearn": sklearn.__version__}


@app.get("/cold")
def cold():
    # ~0 right after a cold boot, grows with instance age.
    return {"uptime_s": round(time.time() - _START, 2)}


@app.get("/fred")
def fred():
    t0 = time.time()
    try:
        r = httpx.get(FRED_URL, timeout=15.0, follow_redirects=True)
        body = r.text
        # grab last non-empty data line to prove a real value came back
        sample = ""
        for ln in body.strip().splitlines():
            if ln.strip() and not ln.startswith("observation"):
                sample = ln
        return {
            "status": r.status_code,
            "elapsed_ms": round((time.time() - t0) * 1000, 1),
            "bytes": len(body),
            "sample": sample,
            "final_url": str(r.url),
        }
    except Exception as e:  # noqa: BLE001
        return {"status": 0, "elapsed_ms": round((time.time() - t0) * 1000, 1), "error": f"{type(e).__name__}: {e}"}


@app.get("/yf")
def yf():
    t0 = time.time()
    try:
        import yfinance as yf

        df = yf.download("GC=F", period="5d", interval="1d", progress=False, auto_adjust=False)
        if df is None or df.empty:
            return {"ok": False, "elapsed_ms": round((time.time() - t0) * 1000, 1), "reason": "empty"}
        # Close column may be a scalar or a Series (ticker-grouped col) -- handle both.
        raw = df["Close"].dropna().iloc[-1]
        last = float(raw.iloc[0]) if hasattr(raw, "iloc") else float(raw)
        return {"ok": True, "symbol": "GC=F", "close": last, "rows": int(len(df)), "elapsed_ms": round((time.time() - t0) * 1000, 1)}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "elapsed_ms": round((time.time() - t0) * 1000, 1), "error": f"{type(e).__name__}: {e}"}


@app.get("/scrape")
def scrape():
    t0 = time.time()
    try:
        r = httpx.get(YB_URL, timeout=15.0, follow_redirects=True)
        return {
            "status": r.status_code,
            "elapsed_ms": round((time.time() - t0) * 1000, 1),
            "bytes": len(r.content),
            "final_url": str(r.url),
        }
    except Exception as e:  # noqa: BLE001
        return {"status": 0, "elapsed_ms": round((time.time() - t0) * 1000, 1), "error": f"{type(e).__name__}: {e}"}
