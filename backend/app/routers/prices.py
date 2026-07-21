from fastapi import APIRouter

from app.price_service import get_prices

router = APIRouter(prefix="/prices", tags=["prices"])


@router.get("")
def read_prices(tickers: str = ""):
    ticker_list = [t.strip() for t in tickers.split(",") if t.strip()]
    return {"prices": get_prices(ticker_list)}
