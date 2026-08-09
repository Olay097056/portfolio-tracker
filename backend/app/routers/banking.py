# backend/app/routers/banking.py
"""GET /api/banking — bank-run stress gauge, funding rates, deposits,
discount window, KRE/^BKX prices, deposit-flow WoW and SOFR-EFFR history
for the Bond-crisis "วิกฤตแบงก์รัน" tab."""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import banking_service

router = APIRouter(prefix="/api/banking", tags=["banking"])

_CACHE_TTL_SECONDS = 600
_cache: dict[str, tuple[float, dict]] = {}


class FundingCardOut(BaseModel):
    series_id: str
    name_th: str | None
    name_en: str | None
    unit: str | None
    value: float | None
    change_bps: float | None
    recorded_at: str | None
    available: bool


class StatCardOut(BaseModel):
    series_id: str | None = None
    value: float | None
    change_pct: float | None
    recorded_at: str | None
    available: bool


class PriceCardOut(BaseModel):
    price: float | None
    change_pct: float | None


class GaugeOut(BaseModel):
    value: float | None
    status: str | None
    zones: list[dict]
    partial_inputs: bool
    recorded_at: str | None


class ModelOut(BaseModel):
    model_id: str
    score: float | None
    status: str | None
    name_th: str | None
    name_en: str | None
    concept_th: str | None
    trade_direction: str | None
    regime_th: str | None
    color: str | None


class HistoryPointOut(BaseModel):
    date: str
    value: float


class BankingOut(BaseModel):
    funding: list[FundingCardOut]
    stat_cards: dict[str, StatCardOut | PriceCardOut | None]
    gauge: GaugeOut
    deposit_flow: list[HistoryPointOut]
    sofr_effr_spread: list[HistoryPointOut]
    model: ModelOut
    updated_at: str
    data_sources: list[str]


def _get_or_fetch(force: bool = False) -> dict:
    cached = _cache.get("banking")
    if not force and cached and (time.time() - cached[0] < _CACHE_TTL_SECONDS):
        return cached[1]
    payload = banking_service.build_banking()
    _cache["banking"] = (time.time(), payload)
    return payload


@router.get("", response_model=BankingOut)
def get_banking() -> BankingOut:
    try:
        payload = _get_or_fetch()
    except Exception:
        raise HTTPException(status_code=503, detail="Banking data is unavailable right now")
    return BankingOut(**payload)


@router.post("/refresh", response_model=BankingOut)
def refresh_banking() -> BankingOut:
    """Invalidate the cache and rebuild now."""
    _cache.clear()
    macro_service_clear()
    try:
        payload = _get_or_fetch(force=True)
    except Exception:
        raise HTTPException(status_code=503, detail="Banking data is unavailable right now")
    return BankingOut(**payload)


def macro_service_clear() -> None:
    from app import macro_service

    macro_service._clear_dashboard_cache()
