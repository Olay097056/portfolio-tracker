"""Ticket 08 tests — pending orders + master switch (the risky one).

The three expensive traps this guards:
1. settle_pending_orders must NEVER call the LLM (100 settle rounds, 0 llm_call)
2. LIMIT fill price = the order's target price, not the price seen at settle
3. master off → no NEW turns, but settle keeps working
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.trade_desk_service import (
    TradeTeam, TradePendingOrder, TradePosition, TradeTurn,
    settle_pending_orders, run_due_turns, run_turn,
)


def _make_team(db, master_on=1):
    team = TradeTeam(
        code="DEEPSEEK", name_th="T8", name_en="T8",
        capital=10000.0, balance=10000.0, equity=10000.0,
        master_on=master_on,
        created_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
    )
    db.add(team)
    db.commit()
    db.refresh(team)
    return team


def _add_pending(db, team, symbol="BTC-USD", otype="LIMIT", side="long",
                 target=50000.0, status="pending", expires_in_hours=24):
    o = TradePendingOrder(
        team_id=team.id, symbol=symbol, side=side, order_type=otype,
        target_price=target, size_notional=1000.0,
        status=status,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=expires_in_hours),
    )
    db.add(o)
    db.commit()
    return o


class TestSettleNeverCallsLLM:
    def test_100_settle_rounds_zero_llm_calls(self, db_session):
        """The #1 trap: settle must be pure price math. 100 rounds → 0 LLM calls."""
        team = _make_team(db_session)
        for i in range(20):
            _add_pending(db_session, team, symbol=f"SYM{i}", target=1000 + i)

        llm_calls = []

        def spy(*args, **kwargs):
            llm_calls.append(args)
            return ('{"action":"hold"}', {}, 0.1)

        # patch both the analyst runner and llm_call — nothing may fire
        with patch("app.trade_desk_service.llm_call", side_effect=spy):
            with patch("app.stock_universe_service.get_prices_for_symbols",
                       return_value={}):
                for _ in range(100):
                    settle_pending_orders(db_session, team)

        assert llm_calls == [], f"settle called LLM {len(llm_calls)} times!"


class TestLimitFillPrice:
    def test_limit_fills_at_target_price_not_current(self, db_session):
        """Trap #2: price ran past the limit during the 10-min gap →
        fill must be the LIMIT price, not the current price."""
        team = _make_team(db_session)
        o = _add_pending(db_session, team, symbol="BTC-USD", otype="LIMIT",
                         side="long", target=50000.0)
        # current price is 45000 (ran BELOW the buy limit) — fill at 50000
        with patch("app.stock_universe_service.get_prices_for_symbols",
                   return_value={"BTC-USD": {"mark_price": 45000.0}}):
            result = settle_pending_orders(db_session, team)

        assert result[0]["status"] == "filled"
        assert result[0]["fill_px"] == 50000.0  # target, not 45000
        pos = db_session.query(TradePosition).filter(
            TradePosition.team_id == team.id).first()
        assert pos is not None
        assert pos.entry_price == 50000.0

    def test_stop_fills_at_current_mark(self, db_session):
        """STOP order fills at the current price when triggered."""
        team = _make_team(db_session)
        _add_pending(db_session, team, symbol="ETH-USD", otype="STOP",
                     side="long", target=3000.0)
        with patch("app.stock_universe_service.get_prices_for_symbols",
                   return_value={"ETH-USD": {"mark_price": 3050.0}}):
            result = settle_pending_orders(db_session, team)
        assert result[0]["status"] == "filled"
        assert result[0]["fill_px"] == 3050.0

    def test_not_hit_stays_pending(self, db_session):
        team = _make_team(db_session)
        _add_pending(db_session, team, symbol="BTC-USD", otype="LIMIT",
                     side="long", target=50000.0)
        with patch("app.stock_universe_service.get_prices_for_symbols",
                   return_value={"BTC-USD": {"mark_price": 60000.0}}):
            result = settle_pending_orders(db_session, team)
        assert result[0]["status"] == "waiting"
        o = db_session.query(TradePendingOrder).first()
        assert o.status == "pending"

    def test_expired_cancels(self, db_session):
        team = _make_team(db_session)
        _add_pending(db_session, team, symbol="BTC-USD", target=50000.0,
                     expires_in_hours=-1)  # already expired
        with patch("app.stock_universe_service.get_prices_for_symbols",
                   return_value={"BTC-USD": {"mark_price": 45000.0}}):
            result = settle_pending_orders(db_session, team)
        assert result[0]["status"] == "expired"
        o = db_session.query(TradePendingOrder).first()
        assert o.status == "cancelled"


class TestMasterSwitch:
    def test_master_off_no_new_turns_but_settle_runs(self, db_session):
        """Trap #3: master off → no new turns, but pending orders still settle."""
        team = _make_team(db_session, master_on=0)
        # make the team due for a turn (past next_turn_at, under daily cap)
        team.next_turn_at = datetime.now(timezone.utc) - timedelta(hours=1)
        _add_pending(db_session, team, symbol="BTC-USD", otype="LIMIT",
                     side="long", target=50000.0)
        db_session.commit()

        with patch("app.stock_universe_service.get_prices_for_symbols",
                   return_value={"BTC-USD": {"mark_price": 45000.0}}):
            with patch("app.trade_desk_service.llm_call") as llm:
                result = run_due_turns(db_session)

        assert result[0]["skipped"] == "master_off"
        assert llm.call_count == 0, "master off must not run LLM turns"
        # but the pending order was settled (filled)
        o = db_session.query(TradePendingOrder).first()
        assert o.status == "filled"
        pos = db_session.query(TradePosition).filter(
            TradePosition.team_id == team.id).first()
        assert pos is not None

    def test_master_on_normal_turn(self, db_session):
        team = _make_team(db_session, master_on=1)
        team.next_turn_at = datetime.now(timezone.utc) - timedelta(hours=1)
        db_session.commit()
        with patch("app.trade_desk_service.llm_call",
                   return_value=('{"action":"hold"}', {}, 0.1)):
            with patch("app.stock_universe_service.get_prices_for_symbols",
                       return_value={}):
                result = run_due_turns(db_session)
        assert "skipped" not in result[0] or result[0]["skipped"] != "master_off"
