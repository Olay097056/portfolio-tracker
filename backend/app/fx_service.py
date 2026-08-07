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

    urls = [
        ("https://api.frankfurter.dev/v2/rates", {"base": "USD", "quotes": "THB"}),
        ("https://api.frankfurter.app/latest", {"from": "USD", "to": "THB"}),
    ]

    for url, params in urls:
        try:
            response = httpx.get(url, params=params, timeout=4.0)
            if response.status_code == 200:
                data = response.json()
                rates = data.get("rates", {})
                rate = rates.get("THB")
                if rate is not None:
                    return float(rate)
        except Exception:
            continue

    return 35.50


def get_usd_to_thb_rate() -> float | None:
    cached = _get_cached_rate()
    if cached is not None:
        return cached

    rate = _fetch_from_frankfurter()
    if rate is not None:
        _set_cached_rate(rate)

    return rate
