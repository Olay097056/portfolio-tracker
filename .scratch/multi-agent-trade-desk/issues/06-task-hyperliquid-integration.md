# 06 — Task: Hyperliquid price feed integration

Type: task
Status: closed
Claimed: hermes/2026-08-12
Blocked by: 01

## Answer

Hyperliquid price feed — commit `0be5b24`

**Service**: `backend/app/hyperliquid_service.py`
- GET /api/hyperliquid/markets → 232 markets (crypto 20 + stocks 212)
- Prices (mark/mid/oracle), 24h change, funding rate, OI, volume
- 60s cache · category classifier (crypto/stocks — macro/FX from yfinance)
- GET /api/hyperliquid/markets/{symbol} → single lookup
- `get_prices_for_symbols()` helper for bulk context building

**Key finding**: Hyperliquid meta universe = crypto + stock perps only.
GOLD/CL/SP500/JPY/EUR → fed from yfinance via macro_service (already exists).

**Tests**: 7 passed (classify + service) · full suite **534 passed**
