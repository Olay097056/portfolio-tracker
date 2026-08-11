# backend/app/routers/fear_greed.py
import time
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import fear_greed_service
from app.cache import cache_get, cache_set

router = APIRouter(prefix="/api/fear-greed", tags=["fear-greed"])

# CNN recomputes the index a few times an hour at most, and the fallback hits yfinance for
# six symbols, so a short cache keeps both the page snappy and the outbound traffic sane.
_CACHE_TTL_SECONDS = 1800
_CACHE_PREFIX = "feargreed:"
_CACHE_KEY = _CACHE_PREFIX + "current"


class FearGreedPoint(BaseModel):
    t: int  # epoch milliseconds
    value: float


class FearGreedIndicator(BaseModel):
    key: str
    label: str
    score: float | None = None
    rating: str | None = None
    # The indicator's own raw reading (a VIX level, a % deviation, a yield spread) -- the
    # thing the sparkline plots. Deliberately not the 0-100 score: the two are different
    # quantities and showing one under the other's axis would misrepresent both.
    latest_value: float | None = None
    series: list[FearGreedPoint] = []


class FearGreedOut(BaseModel):
    score: float
    rating: str | None = None
    updated_at: str
    previous_close: float | None = None
    previous_1_week: float | None = None
    previous_1_month: float | None = None
    previous_1_year: float | None = None
    history: list[FearGreedPoint] = []
    indicators: list[FearGreedIndicator] = []
    # Which source produced this reading. The UI shows it: a "computed" score is this
    # app's own four-input composite, not CNN's seven-input index, and the two are not
    # interchangeable numbers.
    source: Literal["cnn", "computed"]


@router.get("", response_model=FearGreedOut)
def get_fear_greed():
    cached = cache_get(_CACHE_KEY)
    if cached is not None:
        return cached

    payload = fear_greed_service.fetch_cnn() or fear_greed_service.compute_fallback()
    if payload is None:
        raise HTTPException(status_code=503, detail="Fear & Greed data is unavailable right now")

    result = FearGreedOut(**payload)
    cache_set(_CACHE_KEY, result, _CACHE_TTL_SECONDS)
    return result
