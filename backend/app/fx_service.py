import time

CACHE_TTL_SECONDS = 86400.0

_cached_rate: tuple[float, float] | None = None


def clear_cache() -> None:
    global _cached_rate
    _cached_rate = None


def _get_cached_rate() -> float | None:
    if _cached_rate is None:
        return None
    rate, fetched_at = _cached_rate
    if time.monotonic() - fetched_at > CACHE_TTL_SECONDS:
        return None
    return rate


def _set_cached_rate(rate: float) -> None:
    global _cached_rate
    _cached_rate = (rate, time.monotonic())


def _fetch_from_frankfurter() -> float | None:
    import httpx

    try:
        response = httpx.get(
            "https://api.frankfurter.app/latest",
            params={"from": "USD", "to": "THB"},
            timeout=5.0,
        )
        response.raise_for_status()
        rate = response.json().get("rates", {}).get("THB")
        return float(rate) if rate is not None else None
    except Exception:
        return None


def get_usd_to_thb_rate() -> float | None:
    cached = _get_cached_rate()
    if cached is not None:
        return cached

    rate = _fetch_from_frankfurter()
    if rate is not None:
        _set_cached_rate(rate)

    return rate
