"""Tests for the trade desk schema (multi-agent-trade-desk ticket 04).

Covers: model creation, seed, relationships, knowledge base win/loss split.
"""

import pytest
from app.trade_desk_service import (
    TradeTeam, TradeTurn, TradePosition, TradeKnowledge, seed_team, DEFAULT_CAPITAL,
)


class TestSchema:
    def test_seed_creates_one_team(self, db_session):
        team = seed_team(db_session)
        assert team.code == "DEEPSEEK"
        assert team.capital == DEFAULT_CAPITAL
        assert team.lead_system_prompt is not None
        assert team.analyst_prompts is not None
        assert len(team.analyst_prompts) == 4
        # idempotent
        team2 = seed_team(db_session)
        assert team2.id == team.id

    def test_turn_cycle(self, db_session):
        team = seed_team(db_session)
        turn = TradeTurn(
            team_id=team.id,
            agenda="CPI report review — contrarian lens",
            lead_decision={"action": "hold", "rationale": "uncertain"},
            consensus="dissent",
            trigger="manual",
        )
        db_session.add(turn)
        db_session.commit()
        assert turn.id is not None
        assert turn.team_id == team.id

    def test_position_with_turn(self, db_session):
        team = seed_team(db_session)
        turn = TradeTurn(team_id=team.id, trigger="scheduled")
        db_session.add(turn)
        db_session.flush()

        pos = TradePosition(
            team_id=team.id,
            turn_id=turn.id,
            symbol="BTC-USD",
            side="long",
            size_pct=5.0,
            entry_price=63500.0,
            sl_pct=5.0,
            tp_pct=10.0,
        )
        db_session.add(pos)
        db_session.commit()

        assert pos.id is not None
        assert pos.status == "open"
        assert team.positions.count() == 1

    def test_knowledge_win_loss_split(self, db_session):
        team = seed_team(db_session)

        # Win → team's own knowledge base
        win = TradeKnowledge(
            team_id=team.id, entry_type="win",
            symbol="ETH-USD", side="long",
            entry_price=1800, exit_price=1900, pnl_pct=5.5,
            lesson_summary="ETH long breakout with volume confirmation",
        )
        # Loss → central knowledge base (team_id=None)
        loss = TradeKnowledge(
            team_id=None, entry_type="loss",
            symbol="SOL-USD", side="long",
            entry_price=75, exit_price=70, pnl_pct=-6.7,
            lesson_summary="SOL long breakdown — over-leveraged, ignored SL signal",
        )
        db_session.add_all([win, loss])
        db_session.commit()

        team_kb = db_session.query(TradeKnowledge).filter(
            TradeKnowledge.team_id == team.id).all()
        central_kb = db_session.query(TradeKnowledge).filter(
            TradeKnowledge.team_id.is_(None)).all()
        assert len(team_kb) == 1 and team_kb[0].entry_type == "win"
        assert len(central_kb) == 1 and central_kb[0].entry_type == "loss"
