"""Cash-equity trade desk tests (Layer 2 — perp → หุ้นเงินสด S&P 500).

Guards the mechanics that did not exist before:
1. Opening a market position reserves cash (long: cost; short: full notional)
2. SL/TP closes positions at the SL/TP price and releases cash + realized PnL
3. Equity = free cash + Σ(reserved + unrealized) over open positions
4. settle_open_positions NEVER calls the LLM
"""

from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from app.trade_desk_service import (
    TradeTeam, TradePosition, settle_open_positions,
)


def _make_team(db, balance=10000.0):
    team = TradeTeam(
        code="DEEPSEEK", name_th="T-cash", name_en="T-cash",
        capital=10000.0, balance=balance, equity=balance,
        created_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
    )
    db.add(team)
    db.commit()
    db.refresh(team)
    return team


def _open_pos(db, team, symbol="AAPL", side="long", entry=100.0, qty=5.0,
              sl_price=None, tp_price=None, reserved=None):
    reserved = reserved if reserved is not None else round(entry * qty, 2)
    team.balance = (team.balance or 0) - reserved  # opening reserves cash
    p = TradePosition(
        team_id=team.id, symbol=symbol, side=side,
        size_pct=5.0, entry_price=entry, quantity=qty,
        reserved_cash=reserved,
        sl_price=sl_price, tp_price=tp_price,
        status="open",
        opened_at=datetime(2026, 8, 13, tzinfo=timezone.utc),
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@pytest.fixture()
def fast_base_context(monkeypatch):
    """Isolate the slow cold-cache services the base context loads on every turn.

    build_markets downloads all 503 S&P constituents from yfinance (~12s),
    build_dashboard re-fetches 31 FRED series (~5-6s) and fetch_cnn hits the
    CNN Fear & Greed page — all network-bound and irrelevant to these tests'
    mechanics. Cache is cleared per test by conftest, so each call pays the
    full cold start without this fixture.
    """
    monkeypatch.setattr(
        "app.stock_universe_service.build_markets",
        lambda force=False: {"markets": [], "total": 0, "by_sector": {}, "updated_at": None},
    )
    monkeypatch.setattr(
        "app.macro_service.build_dashboard",
        lambda force=False: {"sections": [], "updated_at": None},
    )
    monkeypatch.setattr("app.model_service.build_models", lambda: {"models": []})
    monkeypatch.setattr("app.fear_greed_service.fetch_cnn", lambda: None)


class TestOpenReservesCash:
    def test_market_open_reserves_notional(self, db_session, fast_base_context):
        """Opening a long via run_turn deducts cost from balance, sets quantity."""
        from app.trade_desk_service import run_turn
        team = _make_team(db_session)  # balance 10000
        with patch("app.trade_desk_service.llm_call",
                   return_value=('{"action":"open","market":"AAPL","side":"long",'
                                 '"size_pct":5,"sl_pct":5,"tp_pct":10,"rationale":"t"}',
                                 {"prompt_tokens": 100, "completion_tokens": 50}, 0.5)):
            with patch("app.trade_desk_service._run_analyst",
                       return_value={"seat": "trend", "content": "m",
                                     "parsed": {"bias": "neutral", "confidence": 50},
                                     "tokens_in": 100, "tokens_out": 50, "latency_s": 0.1}):
                with patch("app.stock_universe_service.get_prices_for_symbols",
                           return_value={"AAPL": {"mark_price": 100.0}}):
                    with patch("app.stock_universe_service.fetch_fundamentals",
                               return_value={"AAPL": {"market_cap": 3_000_000_000_000,
                                                     "trailing_pe": 30.0, "forward_pe": 28.0,
                                                     "sector": "Technology"}}):
                        run_turn(db_session, team, trigger="manual")

        db_session.refresh(team)
        assert team.balance == 9500.0          # 10000 - 5% × 10000 = 500
        p = db_session.query(TradePosition).first()
        assert p.status == "open"
        assert p.quantity == 5.0               # 500 / 100
        assert p.reserved_cash == 500.0
        assert p.symbol == "AAPL"

    def test_sl_closes_long_at_sl_price(self, db_session):
        """Long SL hit → closed at SL price, cash released + PnL realized."""
        team = _make_team(db_session)          # balance 10000
        _open_pos(db_session, team, "AAPL", "long", entry=100.0, qty=5.0,
                  sl_price=95.0, reserved=500.0)   # balance 9500
        with patch("app.stock_universe_service.get_prices_for_symbols",
                   return_value={"AAPL": {"mark_price": 94.0}}):
            out = settle_open_positions(db_session, team)
        assert out[0]["status"] == "closed"
        assert out[0]["closed_by"] == "sl"
        assert out[0]["exit_px"] == 95.0
        assert out[0]["pnl"] == -25.0          # (95 - 100) × 5
        p = db_session.query(TradePosition).first()
        assert p.status == "closed"
        assert p.realized_pnl == -25.0
        assert team.balance == 10000.0 - 500.0 + 500.0 - 25.0  # 9975
        assert team.equity == 9975.0

    def test_tp_closes_long_at_tp_price(self, db_session):
        """Long TP hit → closed at TP price, positive PnL."""
        team = _make_team(db_session)
        _open_pos(db_session, team, "AAPL", "long", entry=100.0, qty=5.0,
                  tp_price=110.0, reserved=500.0)
        with patch("app.stock_universe_service.get_prices_for_symbols",
                   return_value={"AAPL": {"mark_price": 112.0}}):
            out = settle_open_positions(db_session, team)
        assert out[0]["closed_by"] == "tp"
        assert out[0]["exit_px"] == 110.0
        assert out[0]["pnl"] == 50.0           # (110 - 100) × 5
        assert team.balance == 10050.0
        assert team.equity == 10050.0

    def test_short_reserves_full_notional_and_closes(self, db_session):
        """Short reserves full notional; SL (price up) closes and realizes loss."""
        team = _make_team(db_session)
        _open_pos(db_session, team, "NVDA", "short", entry=100.0, qty=5.0,
                  sl_price=105.0, reserved=500.0)
        with patch("app.stock_universe_service.get_prices_for_symbols",
                   return_value={"NVDA": {"mark_price": 106.0}}):
            out = settle_open_positions(db_session, team)
        assert out[0]["closed_by"] == "sl"
        assert out[0]["exit_px"] == 105.0
        assert out[0]["pnl"] == -25.0          # (100 - 105) × 5
        assert team.balance == 9975.0
        assert team.equity == 9975.0

    def test_short_tp_closes_at_lower_price(self, db_session):
        """Short TP (price down) → positive PnL."""
        team = _make_team(db_session)
        _open_pos(db_session, team, "NVDA", "short", entry=100.0, qty=5.0,
                  tp_price=90.0, reserved=500.0)
        with patch("app.stock_universe_service.get_prices_for_symbols",
                   return_value={"NVDA": {"mark_price": 88.0}}):
            out = settle_open_positions(db_session, team)
        assert out[0]["closed_by"] == "tp"
        assert out[0]["pnl"] == 50.0
        assert team.balance == 10050.0

    def test_no_hit_updates_live_pnl_and_stays_open(self, db_session):
        """Price inside SL/TP → live_pnl updates, position stays open."""
        team = _make_team(db_session)
        _open_pos(db_session, team, "AAPL", "long", entry=100.0, qty=5.0,
                  sl_price=95.0, tp_price=110.0, reserved=500.0)
        with patch("app.stock_universe_service.get_prices_for_symbols",
                   return_value={"AAPL": {"mark_price": 104.0}}):
            out = settle_open_positions(db_session, team)
        assert out == []
        p = db_session.query(TradePosition).first()
        assert p.status == "open"
        assert p.live_pnl == 20.0              # (104 - 100) × 5
        # equity = cash + reserved + live = 9500 + 500 + 20
        assert team.equity == 10020.0

    def test_missing_price_keeps_position_open(self, db_session):
        """No price → position untouched, equity unchanged."""
        team = _make_team(db_session)
        _open_pos(db_session, team, "AAPL", "long", entry=100.0, qty=5.0, reserved=500.0)
        with patch("app.stock_universe_service.get_prices_for_symbols",
                   return_value={"AAPL": None}):
            out = settle_open_positions(db_session, team)
        assert out[0]["status"] == "no_price"
        p = db_session.query(TradePosition).first()
        assert p.status == "open"


class TestSettleNeverCallsLLM:
    def test_100_settle_rounds_zero_llm_calls(self, db_session):
        """SL/TP settle must be pure price math — 100 rounds → 0 LLM calls."""
        team = _make_team(db_session)
        _open_pos(db_session, team, "AAPL", "long", entry=100.0, qty=5.0, reserved=500.0)
        llm_calls = []

        def spy(*args, **kwargs):
            llm_calls.append(args)
            return ('{"action":"hold"}', {}, 0.1)

        with patch("app.trade_desk_service.llm_call", side_effect=spy):
            with patch("app.stock_universe_service.get_prices_for_symbols",
                       return_value={"AAPL": {"mark_price": 99.0}}):
                for _ in range(100):
                    settle_open_positions(db_session, team)

        assert llm_calls == [], f"settle_open_positions called LLM {len(llm_calls)} times!"
        # still open (never hit SL/TP at 99)
        p = db_session.query(TradePosition).first()
        assert p.status == "open"
