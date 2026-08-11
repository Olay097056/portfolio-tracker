"""Tests for the central DB-backed cache (app/cache.py — ticket 06)."""
import time

import numpy as np

from app.cache import cache_clear, cache_get, cache_set

P = "test:cache:"  # namespace for these tests


def test_set_get_roundtrip():
    cache_clear(P)
    key = P + "roundtrip"
    payload = {"a": 1, "b": [1, 2, 3], "c": "x", "d": {"nested": True}}
    cache_set(key, payload, ttl_sec=60)
    assert cache_get(key) == payload


def test_expiry_wall_clock():
    cache_clear(P)
    key = P + "expiry"
    cache_set(key, 123, ttl_sec=0.2)
    assert cache_get(key) == 123
    time.sleep(0.35)
    assert cache_get(key) is None  # expired → gone


def test_get_missing_returns_default():
    cache_clear(P)
    assert cache_get(P + "missing") is None
    assert cache_get(P + "missing", default="D") == "D"


def test_numpy_and_datetime_roundtrip():
    cache_clear(P)
    key = P + "numpy"
    from datetime import datetime, timezone

    cache_set(key, {"x": np.float64(3.14), "y": np.array([1, 2, 3]),
                    "d": datetime(2026, 8, 11, tzinfo=timezone.utc)}, ttl_sec=60)
    got = cache_get(key)
    assert got["x"] == 3.14
    assert got["y"] == [1, 2, 3]
    assert isinstance(got["d"], str)  # datetime stored as ISO string (JSON)


def test_clear_prefix_only():
    cache_clear(P)
    cache_set(P + "k1", 1, 60)
    cache_set(P + "k2", 2, 60)
    cache_set(P + "other", 9, 60)
    cache_clear(P + "k")
    assert cache_get(P + "k1") is None
    assert cache_get(P + "k2") is None
    assert cache_get(P + "other") == 9
    cache_clear(P)


def test_overwrite_updates_value():
    cache_clear(P)
    key = P + "overwrite"
    cache_set(key, "old", 60)
    cache_set(key, "new", 60)
    assert cache_get(key) == "new"
    cache_clear(P)
