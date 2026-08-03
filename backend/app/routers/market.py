import os

from fastapi import APIRouter

from app.chart_service import ChartRange, get_chart_data
from app.schemas import ChartOut, TrendingOut
from app.trending_service import get_gainers, get_losers, get_most_active

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/trending", response_model=TrendingOut)
def get_trending():
    api_key_configured = bool(os.environ.get("FMP_API_KEY"))
    if not api_key_configured:
        return TrendingOut(gainers=None, losers=None, most_active=None, api_key_configured=False)
    return TrendingOut(
        gainers=get_gainers(),
        losers=get_losers(),
        most_active=get_most_active(),
        api_key_configured=True,
    )


@router.get("/chart", response_model=ChartOut)
def get_chart(ticker: str, range: ChartRange = "1Y"):
    result = get_chart_data(ticker, range)
    if result is None:
        return ChartOut(points=None, zones=[])
    return ChartOut(points=result["points"], zones=result["zones"])
