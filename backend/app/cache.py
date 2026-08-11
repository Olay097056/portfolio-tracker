"""Central DB-backed cache — replaces the per-module in-memory `_cache` dicts
(vercel-supabase plan ticket 06).

Why DB-backed: on serverless (Vercel) every invocation is a cold start, so an
in-process dict is empty on every request. Persisting entries in a Postgres
`cache_entries` table lets a request (re)compute once, then the next request —
possibly a brand-new process — reads the hit from the table.

Design notes:
- TTL is wall-clock (computed_at + ttl_sec), NOT `time.monotonic()` — monotonic
  resets on process start, which would make a cold-start cache look "fresh"
  when its data is actually stale (the exact serverless failure we're fixing).
- Values are JSON-serialized; numpy scalars and datetime/date are handled so the
  existing price/macro/model payloads survive round-tripping.
- `cache_clear(prefix)` deletes a namespace, mirroring the old `_cache.clear()`
  invalidation (the old clear wiped a whole module's dict).
"""
from __future__ import annotations

import json
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import Column, DateTime, Float, String, Text
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal


class CacheEntry(Base):
    __tablename__ = "cache_entries"

    key = Column(String, primary_key=True)
    value_json = Column(Text, nullable=False)
    computed_at = Column(DateTime, nullable=False)
    ttl_sec = Column(Float, nullable=False)


def _json_default(o: Any) -> Any:
    if isinstance(o, (datetime, date)):
        return o.isoformat()
    # pydantic v2 BaseModel (some router caches store the validated result)
    if hasattr(o, "model_dump"):
        try:
            return o.model_dump()
        except Exception:
            pass
    # numpy scalars (many price/macro payloads carry them)
    try:
        import numpy as np

        if isinstance(o, np.generic):
            return o.item()
        if isinstance(o, np.ndarray):
            return o.tolist()
    except Exception:
        pass
    raise TypeError(f"Object of type {type(o).__name__} is not JSON serializable")


def _dumps(value: Any) -> str:
    return json.dumps(value, default=_json_default)


def _loads(text: str) -> Any:
    return json.loads(text)


def _now_utc_naive():
    """Wall-clock UTC as a naive datetime (matches the DateTime column storage)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _age(row) -> float:
    stored = row.computed_at
    if stored.tzinfo is not None:
        stored = stored.astimezone(timezone.utc).replace(tzinfo=None)
    return (_now_utc_naive() - stored).total_seconds()


def cache_get(key: str, default: Any = None) -> Any:
    """Return the cached value for ``key`` if present and not expired, else default.

    Expired entries are deleted on read so the table doesn't grow unbounded.
    """
    with SessionLocal() as db:
        row = db.get(CacheEntry, key)
        if row is None:
            return default
        if _age(row) > row.ttl_sec:
            db.delete(row)
            db.commit()
            return default
        try:
            return _loads(row.value_json)
        except (TypeError, ValueError):
            db.delete(row)
            db.commit()
            return default


def cache_set(key: str, value: Any, ttl_sec: float) -> None:
    with SessionLocal() as db:
        row = db.get(CacheEntry, key)
        if row is None:
            row = CacheEntry(key=key, value_json="", computed_at=_now_utc_naive(), ttl_sec=float(ttl_sec))
            db.add(row)
        row.value_json = _dumps(value)
        row.computed_at = _now_utc_naive()
        row.ttl_sec = float(ttl_sec)
        db.commit()


def cache_clear(prefix: str) -> None:
    """Delete every entry whose key starts with ``prefix`` (namespace invalidation)."""
    with SessionLocal() as db:
        db.query(CacheEntry).filter(CacheEntry.key.like(prefix + "%")).delete(
            synchronize_session=False
        )
        db.commit()


def session_cache_get(db: Session, key: str, default: Any = None) -> Any:
    """Same as :func:`cache_get` but on an explicit session (for use inside tests
    or within an existing transaction without opening a second engine session)."""
    row = db.get(CacheEntry, key)
    if row is None:
        return default
    if _age(row) > row.ttl_sec:
        db.delete(row)
        db.commit()
        return default
    try:
        return _loads(row.value_json)
    except (TypeError, ValueError):
        db.delete(row)
        db.commit()
        return default
