# backend/app/routers/watchlist.py
from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.history_service import get_history
from app.models import WatchlistItem
from app.routers._deps import get_or_404
from app.schemas import PriceSignalOut, WatchlistItemCreate, WatchlistItemOut
from app.signals import percent_change

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
        return PriceSignalOut(ticker=ticker, percent_change_pct=None)
    closes = [bar["close"] for bar in bars]
    pct = percent_change(closes, PERIOD_TRADING_DAYS[period])
    return PriceSignalOut(ticker=ticker, percent_change_pct=pct)
