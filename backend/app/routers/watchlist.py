# backend/app/routers/watchlist.py
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dividend_metrics import dividend_growth_pct, gross_yield_pct, payment_frequency
from app.dividend_service import get_dividend_payments
from app.history_service import get_history
from app.models import WatchlistItem
from app.price_service import get_price
from app.routers._deps import get_or_404
from app.schemas import DividendSignalOut, PriceSignalOut, WatchlistItemCreate, WatchlistItemOut
from app.signals import (
    atr_pct,
    bollinger_band_width_pct,
    bollinger_band_width_percentile,
    distance_from_sma,
    percent_change,
    rsi,
    volume_ratio,
)

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


@router.post("", response_model=WatchlistItemOut, status_code=201)
def create_watchlist_item(payload: WatchlistItemCreate, db: Session = Depends(get_db)):
    item = WatchlistItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("", response_model=list[WatchlistItemOut])
def list_watchlist_items(db: Session = Depends(get_db)):
    return db.execute(select(WatchlistItem)).scalars().all()


@router.delete("/{item_id}", status_code=204)
def delete_watchlist_item(item_id: int, db: Session = Depends(get_db)):
    item = get_or_404(db, WatchlistItem, item_id, "Watchlist item not found")
    db.delete(item)
    db.commit()


PERIOD_TRADING_DAYS: dict[str, int] = {"1d": 1, "1w": 5, "1m": 21}


@router.get("/scan/price-signals", response_model=PriceSignalOut)
def scan_price_signal(ticker: str, period: Literal["1d", "1w", "1m"] = "1w"):
    bars = get_history(ticker)
    if bars is None:
        return PriceSignalOut(
            ticker=ticker,
            percent_change_pct=None,
            rsi_14=None,
            volume_ratio=None,
            distance_from_sma50_pct=None,
            bb_width_pct=None,
            bb_width_percentile=None,
            atr_pct=None,
        )
    closes = [bar["close"] for bar in bars]
    highs = [bar["high"] for bar in bars]
    lows = [bar["low"] for bar in bars]
    volumes = [bar["volume"] for bar in bars]
    return PriceSignalOut(
        ticker=ticker,
        percent_change_pct=percent_change(closes, PERIOD_TRADING_DAYS[period]),
        rsi_14=rsi(closes),
        volume_ratio=volume_ratio(volumes),
        distance_from_sma50_pct=distance_from_sma(closes),
        bb_width_pct=bollinger_band_width_pct(closes),
        bb_width_percentile=bollinger_band_width_percentile(closes),
        atr_pct=atr_pct(highs, lows, closes),
    )


@router.get("/scan/dividends", response_model=DividendSignalOut)
def scan_dividends(ticker: str):
    price = get_price(ticker)
    payments = get_dividend_payments(ticker)
    if payments is None:
        return DividendSignalOut(ticker=ticker, price=price, gross_yield_pct=None, payment_frequency=None, dividend_growth_pct=None)
    as_of = date.today()
    return DividendSignalOut(
        ticker=ticker,
        price=price,
        gross_yield_pct=gross_yield_pct(payments, price, as_of),
        payment_frequency=payment_frequency([d for d, _ in payments], as_of),
        dividend_growth_pct=dividend_growth_pct(payments, as_of),
    )
