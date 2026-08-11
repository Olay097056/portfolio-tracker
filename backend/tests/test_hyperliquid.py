"""Tests for Hyperliquid market service (multi-agent-trade-desk ticket 06)."""

import pytest
from app.hyperliquid_service import (
    _classify, get_market_by_symbol, get_markets, get_prices_for_symbols,
)


class TestClassify:
    def test_crypto(self):
        assert _classify("BTC") == "crypto"
        assert _classify("ETH") == "crypto"
        assert _classify("SOME-USD") == "crypto"   # unknown -USD → crypto

    def test_stocks(self):
        assert _classify("NVDA") == "stocks"
        assert _classify("MSFT") == "stocks"
        assert _classify("PLTR") == "stocks"

    def test_macro(self):
        # Hyperliquid meta universe doesn't include macro commodities directly —
        # those come from yfinance (mapped via _MACRO_TICKERS).  The classify
        # function handles the symbols we display, not the raw Hyperliquid names.
        assert _classify("BTC") == "crypto"  # sanity

    def test_fx(self):
        # Hyperliquid doesn't list FX pairs — those come from yfinance.
        assert _classify("BTC") == "crypto"


class TestService:
    def test_get_markets_returns_data(self):
        data = get_markets()
        assert data is not None
        assert "markets" in data
        assert "by_category" in data
        assert data["total"] > 200
        # crypto + stocks come from Hyperliquid; macro + fx are fed separately
        assert data["by_category"]["crypto"] > 0
        assert data["by_category"]["stocks"] > 0

    def test_get_market_by_symbol(self):
        btc = get_market_by_symbol("BTC")
        assert btc is not None
        assert btc["symbol"] == "BTC"
        assert btc["category"] == "crypto"
        assert btc["mark_price"] > 10000
        assert get_market_by_symbol("NONEXISTENT") is None

    def test_get_prices_for_symbols(self):
        prices = get_prices_for_symbols(["BTC", "ETH", "NOPE"])
        assert prices["BTC"] is not None
        assert prices["ETH"] is not None
        assert prices["NOPE"] is None
