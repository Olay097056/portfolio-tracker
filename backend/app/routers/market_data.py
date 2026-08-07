from datetime import date

from fastapi import APIRouter

from app.earnings_service import days_until, get_next_earnings_date
from app.price_service import get_market_data

router = APIRouter(prefix="/market-data", tags=["market-data"])


@router.get("")
def read_market_data(tickers: str = ""):
    ticker_list = [t.strip() for t in tickers.split(",") if t.strip()]
    return {"market_data": get_market_data(ticker_list)}


@router.get("/earnings")
def read_next_earnings(ticker: str):
    """Next earnings date for `ticker`, or null fields if unknown (delisted, some ETFs, etc.) --
    wayfinder ticket 03, ai-signal-investor-upgrades map."""
    next_date = get_next_earnings_date(ticker.strip().upper())
    if next_date is None:
        return {"ticker": ticker, "next_earnings_date": None, "days_until": None}
    return {
        "ticker": ticker,
        "next_earnings_date": next_date.isoformat(),
        "days_until": days_until(next_date, today=date.today()),
    }
