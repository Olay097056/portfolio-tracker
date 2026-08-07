from unittest.mock import patch

import pytest

from app import ai_narrative_service
from app.ai_narrative_service import AiNarrativeError, get_ai_narrative
from app.schemas import AiSignalMetricsIn, MacdMetricsIn, MovingAverageMetricsIn, ConfidenceScoreIn


def _sample_metrics() -> AiSignalMetricsIn:
    return AiSignalMetricsIn(
        rsi14=78.3,
        volume_ratio=2.1,
        distance_from_sma50_pct=12.3,
        bb_width_pct=18.2,
        is_squeeze=False,
        nearest_support=None,
        nearest_resistance=None,
        macd=MacdMetricsIn(macd_line=2.3, signal_line=1.1, histogram=1.2, crossover="BULLISH", is_bullish_crossover=True, is_bearish_crossover=False),
        moving_averages=MovingAverageMetricsIn(sma20=132.5, sma50=118.2, sma200=95.4, ma_cross_state="GOLDEN_CROSS", is_bullish_alignment=True, distance_from_sma50_pct=12.3),
        atr14=4.2,
        trading_setup={"entryZone": {"min": 130.2, "max": 132.5, "formatted": "$130.20 - $132.50"}},
        confidence_score=ConfidenceScoreIn(score=32, rating_badge="BEARISH RISK", pillars={"rsiContribution": 0.31}),
    )


@pytest.fixture(autouse=True)
def _clear_cache():
    ai_narrative_service.clear_cache()
    yield
    ai_narrative_service.clear_cache()


def test_get_ai_narrative_parses_a_valid_model_response():
    # conflicting_signals is no longer taken from the model's own JSON (a mocked value here would
    # be misleading) -- it's computed deterministically by _detect_conflicts and overrides
    # whatever the model returns. See test_get_ai_narrative_conflicting_signals_are_rule_based.
    fake_response = '{"sentiment": "bearish", "narrative": "ระวัง RSI overbought", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_ollama", return_value=fake_response) as mock_call:
        result = get_ai_narrative("NVDA", _sample_metrics())

    assert result.sentiment == "bearish"
    assert "overbought" in result.narrative
    mock_call.assert_called_once()


def test_get_ai_narrative_conflicting_signals_are_rule_based_not_model_provided():
    # The model is prompted to write about conflicts, but never asked (or trusted) to enumerate
    # them itself -- if it hallucinates a conflicting_signals field anyway, it must be ignored.
    fake_response = '{"sentiment": "bullish", "narrative": "x", "conflicting_signals": ["a made-up conflict the model invented"], "caveats": []}'
    with patch.object(ai_narrative_service, "_call_ollama", return_value=fake_response):
        result = get_ai_narrative("NVDA", _sample_metrics())

    assert result.conflicting_signals is not None
    assert "a made-up conflict the model invented" not in result.conflicting_signals
    assert any("RSI" in c and "Overbought" in c for c in result.conflicting_signals)


def test_get_ai_narrative_no_conflicts_when_signals_agree():
    agreeing_metrics = _sample_metrics().model_copy(
        update={"rsi14": 55.0, "confidence_score": _sample_metrics().confidence_score.model_copy(update={"score": 70})}
    )
    fake_response = '{"sentiment": "bullish", "narrative": "x", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_ollama", return_value=fake_response):
        result = get_ai_narrative("NVDA", agreeing_metrics)

    assert result.conflicting_signals is None


def test_get_ai_narrative_caches_per_ticker_per_day():
    fake_response = '{"sentiment": "neutral", "narrative": "test", "conflicting_signals": null, "caveats": []}'
    with patch.object(ai_narrative_service, "_call_ollama", return_value=fake_response) as mock_call:
        get_ai_narrative("NVDA", _sample_metrics())
        get_ai_narrative("NVDA", _sample_metrics())  # second call, same ticker/day -- should hit cache

    mock_call.assert_called_once()  # not called twice


def test_get_ai_narrative_raises_on_malformed_json():
    with patch.object(ai_narrative_service, "_call_ollama", return_value="this is not json"):
        with pytest.raises(AiNarrativeError):
            get_ai_narrative("NVDA", _sample_metrics())


def test_get_ai_narrative_raises_on_wrong_shape():
    # valid JSON, but missing required fields / wrong sentiment value
    with patch.object(ai_narrative_service, "_call_ollama", return_value='{"sentiment": "very bullish", "narrative": "x"}'):
        with pytest.raises(AiNarrativeError):
            get_ai_narrative("NVDA", _sample_metrics())


def test_get_ai_narrative_raises_on_ollama_timeout():
    import requests

    with patch("app.ai_narrative_service.requests.post", side_effect=requests.exceptions.Timeout()):
        with pytest.raises(AiNarrativeError, match="timed out"):
            get_ai_narrative("NVDA", _sample_metrics())


def test_get_ai_narrative_raises_on_ollama_unreachable():
    import requests

    with patch("app.ai_narrative_service.requests.post", side_effect=requests.exceptions.ConnectionError()):
        with pytest.raises(AiNarrativeError, match="reach Ollama"):
            get_ai_narrative("NVDA", _sample_metrics())


def test_analyze_route_returns_503_on_failure(client):
    with patch.object(ai_narrative_service, "_call_ollama", return_value="not json"):
        response = client.post(
            "/ai-narrative/analyze",
            json={"ticker": "NVDA", "metrics": _sample_metrics().model_dump(by_alias=False)},
        )
    assert response.status_code == 503


def test_analyze_route_returns_200_on_success(client):
    fake_response = '{"sentiment": "bullish", "narrative": "แข็งแกร่ง", "conflicting_signals": null, "caveats": ["ตัวอย่างเดียว ไม่ใช่คำแนะนำการลงทุน"]}'
    with patch.object(ai_narrative_service, "_call_ollama", return_value=fake_response):
        response = client.post(
            "/ai-narrative/analyze",
            json={"ticker": "NVDA", "metrics": _sample_metrics().model_dump(by_alias=False)},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["sentiment"] == "bullish"
    assert body["caveats"] == ["ตัวอย่างเดียว ไม่ใช่คำแนะนำการลงทุน"]
