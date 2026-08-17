"""Tests for trade desk turn engine + router (multi-agent-trade-desk ticket 07).

LLM calls are mocked — real multi-agent flow tested in prototype-05.
"""

import pytest
from fastapi.testclient import TestClient

from app.database import get_db, SessionLocal
from app.main import app
from app.trade_desk_service import (
    seed_team, get_state, TradeTeam, TradeTurn, TradePosition, DEFAULT_CAPITAL,
)


@pytest.fixture
def client(db_session):
    """Test client with override to use the test DB session."""
    def override():
        try:
            yield db_session
        finally:
            pass
    app.dependency_overrides[get_db] = override
    yield TestClient(app)
    app.dependency_overrides.clear()


class TestStateEndpoint:
    def test_empty_state(self, client, db_session):
        """Before seeding, state returns empty."""
        resp = client.get("/api/trade-desk/state")
        assert resp.status_code == 200
        body = resp.json()
        assert body["teams"] == []

    def test_state_with_team(self, client, db_session):
        """After seeding, state returns team data."""
        seed_team(db_session)
        resp = client.get("/api/trade-desk/state")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["teams"]) == 1
        assert body["teams"][0]["code"] == "DEEPSEEK"
        assert body["teams"][0]["capital"] == DEFAULT_CAPITAL
        assert body["updated_at"] is not None


class TestManualTurnEndpoint:
    def test_turn_no_team_returns_404(self, client, db_session):
        resp = client.post("/api/trade-desk/turn?team_code=GHOST")
        assert resp.status_code == 404

    def test_turn_with_mock_llm(self, client, db_session, monkeypatch):
        """Turn endpoint with mocked LLM (no real API call)."""
        seed_team(db_session)

        # Mock the LLM call to avoid real API costs
        def mock_llm(system, user, **kw):
            return (
                '{"action": "hold", "rationale": "test mock"}',
                {"prompt_tokens": 100, "completion_tokens": 50},
                0.5,
            )

        # Also mock _run_analyst for speed
        def mock_analyst(seat, sys_prompt, user_prompt):
            return {
                "seat": seat, "content": "mock", "parsed": {"bias": "neutral", "confidence": 50},
                "tokens_in": 100, "tokens_out": 50, "latency_s": 0.1,
            }

        monkeypatch.setattr("app.trade_desk_service._run_analyst", mock_analyst)
        monkeypatch.setattr("app.trade_desk_service.llm_call", mock_llm)
        monkeypatch.setattr("app.stock_universe_service.get_prices_for_symbols",
                           lambda syms: {})
        monkeypatch.setattr("app.stock_universe_service.fetch_fundamentals",
                           lambda force=False: {})

        resp = client.post("/api/trade-desk/turn?team_code=DEEPSEEK&agenda=test+agenda")
        assert resp.status_code == 200
        body = resp.json()
        assert body["turn_id"] is not None
        assert body["action"] == "hold"
        assert body["consensus"] == "consensus"

        # Verify turn recorded in DB
        turn = db_session.query(TradeTurn).filter(
            TradeTurn.id == body["turn_id"]).first()
        assert turn is not None
        assert turn.trigger == "manual"
        assert len(turn.analyst_opinions) == 6
