from app.cache import cache_clear, cache_get, cache_set

CACHE_TTL_SECONDS = 86400.0

_CACHE_KEY = "fx:usdthb"


def clear_cache() -> None:
    cache_clear("fx:")


def _get_cached_rate() -> float | None:
    return cache_get(_CACHE_KEY)


def _set_cached_rate(rate: float) -> None:
    cache_set(_CACHE_KEY, rate, CACHE_TTL_SECONDS)


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
