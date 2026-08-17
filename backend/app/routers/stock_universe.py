"""S&P 500 stock universe router — GET /api/stock-universe/markets.

The trade desk trades US cash equities (S&P 500 constituents, user decision
2026-08-13). This router exposes the real universe from
stock_universe_service.build_markets(): prices, real TA computed from daily
bars, GICS sector, and tier by dollar volume.

It deliberately does NOT touch /api/hyperliquid/markets — the old perp feed
is still used elsewhere in the app.

Cash equity has no funding rate, no leverage and no liquidation price, so
none of those fields is carried anywhere in this payload.
"""

from fastapi import APIRouter, Query

from app import stock_universe_service

router = APIRouter(prefix="/api/stock-universe", tags=["stock-universe"])


@router.get("/markets")
def get_markets(force: bool = Query(False)):
    """All S&P 500 constituents with price, sector, real TA signals and tier."""
    return stock_universe_service.build_markets(force=force)
