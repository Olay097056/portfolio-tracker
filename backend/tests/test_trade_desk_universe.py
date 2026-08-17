"""Tests for the S&P 500 context fix — the team must see real stocks and must
NOT trade non-universe tickers (BTC-USD). Regression for 'กดเทิร์นเองวนอยู่ที่
BTC-USD / ไม่มีอะไรเกิดขึ้น'."""

import pytest

from app import trade_desk_service as tds
from app.trade_desk_service import (
    _build_base_context, run_turn, seed_team,
    TradeTeam, TradePosition,
)

_stock_market_snapshot = getattr(tds, "_stock_market_snapshot", None)


class TestStockMarketSnapshot:
    def test_snapshot_contains_real_stocks_not_crypto(self, db_session, monkeypatch):
        """build_markets feeds real S&P 500 movers into the context."""
        assert _stock_market_snapshot is not None, "fix not applied — snapshot fn missing"
        monkeypatch.setattr(
            "app.stock_universe_service.build_markets",
            lambda force=False: {"markets": [
                {"symbol": "NVDA", "price": 225.16, "change_24h_pct": -0.06,
                 "dollar_volume": 25674533961, "sector": "Information Technology",
                 "ta_score": 11, "ta_arrow": "↑", "tier": 1},
                {"symbol": "MU", "price": 971.66, "change_24h_pct": 2.3,
                 "dollar_volume": 38152585758, "sector": "Information Technology",
                 "ta_score": -11, "ta_arrow": "↓", "tier": 1},
                {"symbol": "JPM", "price": 280.0, "change_24h_pct": 0.5,
                 "dollar_volume": 12000000000, "sector": "Financials",
                 "ta_score": 5, "ta_arrow": "↑", "tier": 1},
            ]},
        )
        snap = _stock_market_snapshot()
        assert "ตลาดหุ้น S&P 500" in snap
        assert "NVDA" in snap and "MU" in snap
        assert "BTC" not in snap

    def test_base_context_includes_stock_snapshot_no_crypto_fg(self, db_session, monkeypatch):
        """The shared context every analyst sees carries real stocks and no
        crypto fear/greed (a stock team must not be steered to crypto)."""
        monkeypatch.setattr(
            "app.stock_universe_service.build_markets",
            lambda force=False: {"markets": [
                {"symbol": "NVDA", "price": 225.16, "change_24h_pct": -0.06,
                 "dollar_volume": 25674533961, "sector": "Information Technology",
                 "ta_score": 11, "ta_arrow": "↑", "tier": 1},
            ]},
        )
        ctx = _build_base_context(db_session)
        assert "ตลาดหุ้น S&P 500" in ctx
        assert "NVDA" in ctx
        assert "Crypto FG" not in ctx
        assert "BTC" not in ctx


class TestNonUniverseRejection:
    def test_lead_picking_btc_usd_is_rejected_not_opened(self, db_session, monkeypatch):
        """If the lead still names a ticker outside the S&P 500 universe, the
        turn must record action=rejected (with reason) and open NO position —
        not silently do nothing while claiming an open."""
        seed_team(db_session)
        team = db_session.query(TradeTeam).filter(TradeTeam.code == "DEEPSEEK").first()

        def mock_llm(system, user, **kw):
            return (
                '{"action": "open", "market": "BTC-USD", "side": "long", '
                '"size_pct": 5, "sl_pct": 5, "tp_pct": 10, "rationale": "momentum"}',
                {"prompt_tokens": 100, "completion_tokens": 50},
                0.5,
            )

        def mock_analyst(seat, sys_prompt, user_prompt):
            return {
                "seat": seat, "content": "mock", "parsed": {"bias": "bullish", "confidence": 70},
                "tokens_in": 100, "tokens_out": 50, "latency_s": 0.1,
            }

        monkeypatch.setattr("app.trade_desk_service._run_analyst", mock_analyst)
        monkeypatch.setattr("app.trade_desk_service.llm_call", mock_llm)
        # Universe has no BTC-USD → _market_price returns None
        monkeypatch.setattr("app.stock_universe_service.get_prices_for_symbols",
                            lambda syms: {"BTC-USD": None})
        monkeypatch.setattr("app.stock_universe_service.fetch_fundamentals",
                            lambda force=False: {})
        monkeypatch.setattr("app.stock_universe_service.build_markets",
                            lambda force=False: {"markets": []})

        turn = run_turn(db_session, team, trigger="manual")
        assert turn.lead_decision["action"] == "rejected"
        assert "REJECTED" in turn.lead_decision["rationale"]
        assert "BTC-USD" in turn.lead_decision["rationale"]
        positions = db_session.query(TradePosition).filter(
            TradePosition.team_id == team.id).all()
        assert positions == []

    def test_lead_picking_aapl_opens_position(self, db_session, monkeypatch):
        """A valid S&P 500 ticker with a real price still opens normally."""
        seed_team(db_session)
        team = db_session.query(TradeTeam).filter(TradeTeam.code == "DEEPSEEK").first()

        def mock_llm(system, user, **kw):
            return (
                '{"action": "open", "market": "AAPL", "side": "long", '
                '"size_pct": 5, "sl_pct": 5, "tp_pct": 10, "rationale": "value"}',
                {"prompt_tokens": 100, "completion_tokens": 50},
                0.5,
            )

        def mock_analyst(seat, sys_prompt, user_prompt):
            return {
                "seat": seat, "content": "mock", "parsed": {"bias": "neutral", "confidence": 50},
                "tokens_in": 100, "tokens_out": 50, "latency_s": 0.1,
            }

        monkeypatch.setattr("app.trade_desk_service._run_analyst", mock_analyst)
        monkeypatch.setattr("app.trade_desk_service.llm_call", mock_llm)
        monkeypatch.setattr(
            "app.stock_universe_service.get_prices_for_symbols",
            lambda syms: {"AAPL": {"mark_price": 250.0, "change_24h_pct": 1.2,
                                   "dollar_volume": 100, "sector": "Technology"}})
        monkeypatch.setattr("app.stock_universe_service.fetch_fundamentals",
                            lambda force=False: {})
        monkeypatch.setattr("app.stock_universe_service.build_markets",
                            lambda force=False: {"markets": []})

        turn = run_turn(db_session, team, trigger="manual")
        assert turn.lead_decision["action"] == "open"
        positions = db_session.query(TradePosition).filter(
            TradePosition.team_id == team.id).all()
        assert len(positions) == 1
        assert positions[0].symbol == "AAPL"
        assert positions[0].quantity == pytest.approx(
            (team.capital * 0.05) / 250.0)
