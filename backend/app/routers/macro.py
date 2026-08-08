# backend/app/routers/macro.py
import time
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app import macro_service

router = APIRouter(prefix="/api/macro", tags=["macro"])

# FRED's DGS series update once per business day and yfinance assets a few times
# per minute at most, so a 10-minute cache keeps the page snappy without
# hammering either source on every load.
_CACHE_TTL_SECONDS = 600
_cache: dict[str, tuple[float, "MacroDashboardOut"]] = {}


class YieldCurvePoint(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    tenor: str
    series_id: str
    yield_: float | None = Field(default=None, alias="yield")
    prev: float | None = None
    change_bps: float | None = None
    date: str | None = None
    available: bool = False


class YieldCurveOut(BaseModel):
    points: list[YieldCurvePoint]
    spread_10y2y_bps: float | None = None
    inverted: bool = False


class GoldCmeOut(BaseModel):
    oi: float | None = None
    oi_chg: float | None = None
    vol: float | None = None
    opt_oi: float | None = None
    spark: list[float] = []
    available: bool = False
    note: str | None = None


class MacroMetricCard(BaseModel):
    series_id: str
    name_th: str
    name_en: str
    unit: str
    value: float | None = None
    change_val: float | None = None
    change_pct: float | None = None
    trend: Literal["up", "down", "flat"] = "flat"
    recorded_at: str | None = None
    available: bool = False


class MacroSection(BaseModel):
    key: str
    title_th: str
    title_en: str
    items: list[MacroMetricCard]


class MacroDashboardOut(BaseModel):
    yield_curve: YieldCurveOut
    gold_cme: GoldCmeOut
    sections: list[MacroSection]
    updated_at: str
    data_sources: list[str]


def _get_or_fetch() -> "MacroDashboardOut":
    cached = _cache.get("dashboard")
    if cached and (time.time() - cached[0] < _CACHE_TTL_SECONDS):
        return cached[1]
    payload = macro_service.build_dashboard()
    result = MacroDashboardOut(**payload)
    _cache["dashboard"] = (time.time(), result)
    return result


@router.get("", response_model=MacroDashboardOut)
def get_macro_dashboard() -> MacroDashboardOut:
    return _get_or_fetch()


@router.post("/refresh", response_model=MacroDashboardOut)
def refresh_macro_dashboard() -> MacroDashboardOut:
    """Invalidate the cache and re-fetch everything now."""
    _cache.clear()
    try:
        return _get_or_fetch()
    except Exception:
        raise HTTPException(status_code=503, detail="Macro data is unavailable right now")
