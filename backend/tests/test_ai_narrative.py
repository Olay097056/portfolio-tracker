from unittest.mock import patch

import pytest

from app import ai_narrative_service
from app.ai_narrative_service import AiNarrativeError, get_ai_narrative
from app.schemas import AiSignalMetricsIn, MacdMetricsIn, MovingAverageMetricsIn, ConfidenceScoreIn, ZoneRefIn


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


def test_conflict_rule_a_fires_on_strong_squeeze_with_neutral_rsi():
    metrics = _sample_metrics().model_copy(update={"bb_width_pct": 4.0, "is_squeeze": True, "rsi14": 50.0})
    fake_response = '{"sentiment": "neutral", "narrative": "x", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_ollama", return_value=fake_response):
        result = get_ai_narrative("NVDA", metrics)

    assert result.conflicting_signals is not None
    assert any("Squeeze" in c and "45-55" in c for c in result.conflicting_signals)


def test_conflict_rule_a_does_not_fire_outside_the_squeeze_or_rsi_window():
    # BB Width not tight enough (< 5 required).
    metrics = _sample_metrics().model_copy(update={"bb_width_pct": 8.0, "is_squeeze": True, "rsi14": 50.0})
    fake_response = '{"sentiment": "neutral", "narrative": "x", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_ollama", return_value=fake_response):
        result = get_ai_narrative("NVDA", metrics)
    assert result.conflicting_signals is None or not any("Squeeze" in c for c in result.conflicting_signals)


def test_conflict_rule_b_fires_on_bullish_trend_near_resistance():
    # rsi14/confidence_score neutralized so rules 1 and 3 (the base fixture's RSI-overbought and
    # low-confidence conflicts) don't also fire and crowd rule B out of the top-2 cap.
    metrics = _sample_metrics().model_copy(
        update={
            "rsi14": 55.0,
            "confidence_score": _sample_metrics().confidence_score.model_copy(update={"score": 50}),
            "nearest_resistance": ZoneRefIn(label="R1 (150.00)", price=150.0, distance_pct=1.5),
        }
    )
    fake_response = '{"sentiment": "bullish", "narrative": "x", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_ollama", return_value=fake_response):
        result = get_ai_narrative("NVDA", metrics)

    assert result.conflicting_signals is not None
    assert any("แนวต้าน" in c and "1.5" in c for c in result.conflicting_signals)


def test_conflict_rule_b_does_not_fire_when_resistance_is_far_away():
    metrics = _sample_metrics().model_copy(
        update={"nearest_resistance": ZoneRefIn(label="R1 (200.00)", price=200.0, distance_pct=15.0)}
    )
    fake_response = '{"sentiment": "bullish", "narrative": "x", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_ollama", return_value=fake_response):
        result = get_ai_narrative("NVDA", metrics)
    assert result.conflicting_signals is None or not any("แนวต้าน" in c for c in result.conflicting_signals)


def test_conflicts_are_capped_to_two_highest_priority_when_more_fire():
    # Fires rule 1 (priority 1, RSI overbought + bullish), rule 3 (priority 2, low confidence +
    # bullish), and rule B (priority 3, bullish trend near resistance) all at once -- only the
    # two highest-priority survive; rule B's message must not appear.
    metrics = _sample_metrics().model_copy(
        update={
            "rsi14": 75.0,
            "confidence_score": _sample_metrics().confidence_score.model_copy(update={"score": 35}),
            "nearest_resistance": ZoneRefIn(label="R1 (150.00)", price=150.0, distance_pct=1.0),
        }
    )
    fake_response = '{"sentiment": "bullish", "narrative": "x", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_ollama", return_value=fake_response):
        result = get_ai_narrative("NVDA", metrics)

    assert result.conflicting_signals is not None
    assert len(result.conflicting_signals) == 2
    assert any("Overbought" in c for c in result.conflicting_signals)
    assert any("คะแนนความเชื่อมั่น" in c for c in result.conflicting_signals)
    assert not any("แนวต้าน" in c for c in result.conflicting_signals)


def test_prompt_never_interpolates_a_bare_null_for_a_missing_indicator():
    metrics = _sample_metrics().model_copy(update={"volume_ratio": None, "atr14": None})
    fake_response = '{"sentiment": "neutral", "narrative": "x", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_ollama", return_value=fake_response) as mock_call:
        get_ai_narrative("NVDA", metrics)

    prompt = mock_call.call_args[0][0]
    assert "None" not in prompt
    assert "null" not in prompt
    assert ai_narrative_service.NO_DATA_LABEL in prompt
    assert "ห้ามเดาตัวเลขขึ้นมาเอง" in prompt


def test_prompt_shows_price_and_rsi_trend_when_previous_values_present():
    metrics = _sample_metrics().model_copy(update={"current_price": 571.48, "price_prev": 558.1, "rsi14": 58.6, "rsi14_prev": 54.2})
    fake_response = '{"sentiment": "neutral", "narrative": "x", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_ollama", return_value=fake_response) as mock_call:
        get_ai_narrative("NVDA", metrics)

    prompt = mock_call.call_args[0][0]
    assert "สูงขึ้นจาก $558.1 เมื่อสัปดาห์ก่อน" in prompt
    assert "สูงขึ้นจาก 54.2 เมื่อสัปดาห์ก่อน" in prompt


def test_prompt_says_previous_data_unavailable_rather_than_omit_or_fabricate_it():
    metrics = _sample_metrics().model_copy(update={"current_price": 571.48, "price_prev": None})
    fake_response = '{"sentiment": "neutral", "narrative": "x", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_ollama", return_value=fake_response) as mock_call:
        get_ai_narrative("NVDA", metrics)

    prompt = mock_call.call_args[0][0]
    assert "ข้อมูลก่อนหน้าไม่มี" in prompt


def test_prompt_includes_market_context_when_both_sector_and_trend_provided():
    metrics = _sample_metrics().model_copy(update={"sector": "Technology", "market_trend": "ขาขึ้น"})
    fake_response = '{"sentiment": "neutral", "narrative": "x", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_ollama", return_value=fake_response) as mock_call:
        get_ai_narrative("NVDA", metrics)

    prompt = mock_call.call_args[0][0]
    assert "บริบทตลาด: Technology กำลัง ขาขึ้น" in prompt


def test_prompt_market_context_falls_back_to_no_data_when_absent():
    fake_response = '{"sentiment": "neutral", "narrative": "x", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_ollama", return_value=fake_response) as mock_call:
        get_ai_narrative("NVDA", _sample_metrics())

    prompt = mock_call.call_args[0][0]
    assert "บริบทตลาด: ไม่มีข้อมูลเพิ่มเติม" in prompt


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
