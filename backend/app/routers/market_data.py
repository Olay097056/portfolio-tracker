from fastapi import APIRouter

from app.price_service import get_market_data

router = APIRouter(prefix="/market-data", tags=["market-data"])


@router.get("")
def read_market_data(tickers: str = ""):
    ticker_list = [t.strip() for t in tickers.split(",") if t.strip()]
    return {"market_data": get_market_data(ticker_list)}
