# backend/app/routers/countries.py
"""GET /api/countries — country-risk overview (27 countries: 10Y yields,
computed risk scores, bps vs US, 60-day trend) for the "รายประเทศ" tab."""

from __future__ import annotations

import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import countries_service

router = APIRouter(prefix="/api/countries", tags=["countries"])

_CACHE_TTL_SECONDS = 600
_cache: dict[str, tuple[float, dict]] = {}


class TrendPointOut(BaseModel):
    date: str
    value: float


class ComponentsOut(BaseModel):
    yield_level: float | None = None
    yield_momentum: float | None = None
    fx_depreciation: float | None = None
    data_freshness: float | None = None


class CountryOut(BaseModel):
    code: str
    name_en: str
    name_th: str
    currency: str
    flag: str
    data_tier: str
    data_tier_note_th: str
    yield_value: float | None = None
    yield_asof: str | None = None
    yield_stale: bool = False
    chg_bp: float | None = None
    score: float | None = None
    level: str | None = None
    components: ComponentsOut | None = None
    bps_vs_us: float | None = None
    trend: list[TrendPointOut]


class CountriesOut(BaseModel):
    countries: list[CountryOut]
    us_10y: float | None
    updated_at: str
    data_sources: list[str]


def _get_or_fetch(force: bool = False) -> dict:
    cached = _cache.get("countries")
    if not force and cached and (time.time() - cached[0] < _CACHE_TTL_SECONDS):
        return cached[1]
    payload = countries_service.build_countries()
    _cache["countries"] = (time.time(), payload)
    return payload


@router.get("", response_model=CountriesOut)
def get_countries() -> CountriesOut:
    try:
        payload = _get_or_fetch()
    except Exception:
        raise HTTPException(status_code=503, detail="Country data is unavailable right now")
    return CountriesOut(**payload)


# ── Country detail ────────────────────────────────────────────────────────
class CountryDetailOut(BaseModel):
    country: dict
    yield_curve: list[dict]
    yield_asof: str | None = None
    yield_stale: bool = False
    risk: dict | None = None
    trend: list[TrendPointOut]
    us10: float | None = None
    bps_vs_us: float | None = None
    mini_cards: list[dict]


@router.get("/{code}", response_model=CountryDetailOut)
def get_country_detail(code: str) -> CountryDetailOut:
    """Per-country detail: full yield curve, risk scorecard, trend, us10,
    mini stat cards. 404 for unknown codes; missing data renders None.
    NOTE: declared BEFORE /refresh so 'refresh' isn't captured as a code."""
    payload = countries_service.build_country_detail(code)
    if payload is None:
        raise HTTPException(status_code=404, detail=f"Unknown country code: {code}")
    return CountryDetailOut(**payload)


@router.post("/refresh", response_model=CountriesOut)
def refresh_countries() -> CountriesOut:
    """Invalidate the cache and rebuild now."""
    _cache.clear()
    try:
        payload = _get_or_fetch(force=True)
    except Exception:
        raise HTTPException(status_code=503, detail="Country data is unavailable right now")
    return CountriesOut(**payload)
