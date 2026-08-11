"""Vercel Python function entry — re-exports the FastAPI app (vercel-supabase 08).

The real app lives in backend/app/main.py; Vercel's Python runtime calls this
file as an ASGI app. We add backend/ to sys.path so `from app.main import app`
resolves, and the API routes in vercel.json point here.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.join(_HERE, "..", "backend")  # /var/task/api/index.py -> /var/task/backend
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

# Serverless home dir is read-only — yfinance's default cache location
# (~/.cache/py-yfinance) fails there. Point both caches at /tmp (writable).
try:
    import yfinance as _yf

    _yf.set_tz_cache_location("/tmp/yf-tz")
    _yf.set_cookie_cache_location("/tmp/yf-cookie")
except Exception:
    pass  # yfinance optional at boot; never let cache setup break the app

from app.main import app  # noqa: E402
