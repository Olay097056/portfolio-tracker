# backend/tests/test_ai_narrative_pattern_history.py
from unittest.mock import patch

from app.routers import ai_narrative


def test_pattern_history_returns_the_lookup_result(client):
    fake_result = {
        "ticker": "NVDA",
        "signal_type": "BULLISH",
        "total_matches": 12,
        "resolved_count": 10,
        "win_count": 7,
        "loss_count": 3,
        "win_rate": 0.7,
        "avg_win_pct": 8.2,
        "avg_loss_pct": -4.1,
        "conflict_matches": None,
    }
    with patch.object(ai_narrative, "lookup_pattern_history", return_value=fake_result):
        response = client.get("/ai-narrative/pattern-history", params={"ticker": "NVDA", "signal_type": "BULLISH"})

    assert response.status_code == 200
    assert response.json() == fake_result


def test_pattern_history_returns_null_when_not_enough_history(client):
    with patch.object(ai_narrative, "lookup_pattern_history", return_value=None):
        response = client.get("/ai-narrative/pattern-history", params={"ticker": "NEWCO", "signal_type": "BULLISH"})

    assert response.status_code == 200
    assert response.json() is None


def test_pattern_history_uppercases_and_strips_the_ticker(client):
    with patch.object(ai_narrative, "lookup_pattern_history", return_value=None) as mock_lookup:
        client.get("/ai-narrative/pattern-history", params={"ticker": " nvda ", "signal_type": "BULLISH"})

    mock_lookup.assert_called_once_with("NVDA", "BULLISH", False)


def test_pattern_history_passes_has_conflict_through(client):
    with patch.object(ai_narrative, "lookup_pattern_history", return_value=None) as mock_lookup:
        client.get("/ai-narrative/pattern-history", params={"ticker": "NVDA", "signal_type": "BULLISH", "has_conflict": "true"})

    mock_lookup.assert_called_once_with("NVDA", "BULLISH", True)
