"""Hyperliquid market data router — GET /api/hyperliquid/markets."""

from fastapi import APIRouter, HTTPException, Query

from app import hyperliquid_service

router = APIRouter(prefix="/api/hyperliquid", tags=["hyperliquid"])


@router.get("/markets")
def get_markets(force: bool = Query(False)):
    """All 200+ Hyperliquid markets with prices, funding, volume, category."""
    data = hyperliquid_service.get_markets(force=force)
    if data is None:
        raise HTTPException(status_code=503, detail="Hyperliquid data unavailable")
    return data


@router.get("/markets/{symbol}")
def get_market(symbol: str):
    """Single market lookup (e.g. /api/hyperliquid/markets/BTC)."""
    data = hyperliquid_service.get_market_by_symbol(symbol)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Market '{symbol}' not found")
    return data
