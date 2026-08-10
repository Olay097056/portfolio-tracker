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
    fake_response = '{"sentiment": "bearish", "narrative": "ระวัง RSI overbought รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response) as mock_call:
        result = get_ai_narrative("NVDA", _sample_metrics())

    assert result.sentiment == "bearish"
    assert "overbought" in result.narrative
    mock_call.assert_called_once()


def test_get_ai_narrative_conflicting_signals_are_rule_based_not_model_provided():
    # The model is prompted to write about conflicts, but never asked (or trusted) to enumerate
    # them itself -- if it hallucinates a conflicting_signals field anyway, it must be ignored.
    fake_response = '{"sentiment": "bullish", "narrative": "x รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "conflicting_signals": ["a made-up conflict the model invented"], "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response):
        result = get_ai_narrative("NVDA", _sample_metrics())

    assert result.conflicting_signals is not None
    assert "a made-up conflict the model invented" not in result.conflicting_signals
    assert any("RSI" in c and "Overbought" in c for c in result.conflicting_signals)


def test_get_ai_narrative_no_conflicts_when_signals_agree():
    agreeing_metrics = _sample_metrics().model_copy(
        update={"rsi14": 55.0, "confidence_score": _sample_metrics().confidence_score.model_copy(update={"score": 70})}
    )
    fake_response = '{"sentiment": "bullish", "narrative": "x รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response):
        result = get_ai_narrative("NVDA", agreeing_metrics)

    assert result.conflicting_signals is None


def test_get_ai_narrative_caches_per_ticker_per_day():
    fake_response = '{"sentiment": "neutral", "narrative": "test รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "conflicting_signals": null, "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response) as mock_call:
        get_ai_narrative("NVDA", _sample_metrics())
        get_ai_narrative("NVDA", _sample_metrics())  # second call, same ticker/day -- should hit cache

    mock_call.assert_called_once()  # not called twice


def test_get_ai_narrative_raises_on_malformed_json():
    with patch.object(ai_narrative_service, "_call_llm", return_value="this is not json"):
        with pytest.raises(AiNarrativeError):
            get_ai_narrative("NVDA", _sample_metrics())


def test_get_ai_narrative_raises_on_wrong_shape():
    # valid JSON, but missing required fields / wrong sentiment value
    with patch.object(ai_narrative_service, "_call_llm", return_value='{"sentiment": "very bullish", "narrative": "x"}'):
        with pytest.raises(AiNarrativeError):
            get_ai_narrative("NVDA", _sample_metrics())


def test_get_ai_narrative_raises_when_model_echoes_the_json_template_placeholder():
    # Live-observed 2026-08-07: a fast (12.7s vs the usual 40-70s) response came back with
    # narrative literally equal to the prompt's own placeholder text -- valid JSON, passes
    # schema validation, but is an empty non-answer, not real analysis.
    from app.ai_narrative_service import NARRATIVE_PLACEHOLDER_TEXT, CAVEATS_PLACEHOLDER_TEXT
    import json

    fake_response = json.dumps(
        {"sentiment": "neutral", "narrative": NARRATIVE_PLACEHOLDER_TEXT, "caveats": [CAVEATS_PLACEHOLDER_TEXT]},
        ensure_ascii=False,
    )
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response):
        with pytest.raises(AiNarrativeError, match="template"):
            get_ai_narrative("NVDA", _sample_metrics())


def test_get_ai_narrative_raises_on_suspiciously_short_narrative():
    fake_response = '{"sentiment": "neutral", "narrative": "สั้นไป", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response):
        with pytest.raises(AiNarrativeError):
            get_ai_narrative("NVDA", _sample_metrics())


def test_degenerate_response_is_never_cached_so_a_retry_actually_re_calls_ollama():
    fake_bad = '{"sentiment": "neutral", "narrative": "สั้นไป", "caveats": []}'
    fake_good = '{"sentiment": "neutral", "narrative": "เนื้อหาการวิเคราะห์ที่สมบูรณ์และมีความยาวเพียงพอสำหรับผ่านการตรวจสอบของระบบในรอบนี้อย่างแท้จริง", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", side_effect=[fake_bad, fake_good]) as mock_call:
        with pytest.raises(AiNarrativeError):
            get_ai_narrative("NVDA", _sample_metrics())
        result = get_ai_narrative("NVDA", _sample_metrics())

    assert mock_call.call_count == 2  # the failed first attempt was never cached
    assert "เนื้อหาการวิเคราะห์" in result.narrative


def test_get_ai_narrative_raises_on_openrouter_timeout():
    import httpx

    with patch("app.ai_narrative_service.httpx.post", side_effect=httpx.TimeoutException("timed out")):
        with pytest.raises(AiNarrativeError, match="timed out"):
            get_ai_narrative("NVDA", _sample_metrics())


def test_conflict_rule_a_fires_on_strong_squeeze_with_neutral_rsi():
    metrics = _sample_metrics().model_copy(update={"bb_width_pct": 4.0, "is_squeeze": True, "rsi14": 50.0})
    fake_response = '{"sentiment": "neutral", "narrative": "x รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response):
        result = get_ai_narrative("NVDA", metrics)

    assert result.conflicting_signals is not None
    assert any("Squeeze" in c and "45-55" in c for c in result.conflicting_signals)


def test_conflict_rule_a_does_not_fire_outside_the_squeeze_or_rsi_window():
    # BB Width not tight enough (< 5 required).
    metrics = _sample_metrics().model_copy(update={"bb_width_pct": 8.0, "is_squeeze": True, "rsi14": 50.0})
    fake_response = '{"sentiment": "neutral", "narrative": "x รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response):
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
    fake_response = '{"sentiment": "bullish", "narrative": "x รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response):
        result = get_ai_narrative("NVDA", metrics)

    assert result.conflicting_signals is not None
    assert any("แนวต้าน" in c and "1.5" in c for c in result.conflicting_signals)


def test_conflict_rule_b_does_not_fire_when_resistance_is_far_away():
    metrics = _sample_metrics().model_copy(
        update={"nearest_resistance": ZoneRefIn(label="R1 (200.00)", price=200.0, distance_pct=15.0)}
    )
    fake_response = '{"sentiment": "bullish", "narrative": "x รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response):
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
    fake_response = '{"sentiment": "bullish", "narrative": "x รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response):
        result = get_ai_narrative("NVDA", metrics)

    assert result.conflicting_signals is not None
    assert len(result.conflicting_signals) == 2
    assert any("Overbought" in c for c in result.conflicting_signals)
    assert any("คะแนนความเชื่อมั่น" in c for c in result.conflicting_signals)
    assert not any("แนวต้าน" in c for c in result.conflicting_signals)


def test_prompt_never_interpolates_a_bare_null_for_a_missing_indicator():
    metrics = _sample_metrics().model_copy(update={"volume_ratio": None, "atr14": None})
    fake_response = '{"sentiment": "neutral", "narrative": "x รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response) as mock_call:
        get_ai_narrative("NVDA", metrics)

    prompt = mock_call.call_args[0][0]
    assert "None" not in prompt
    assert "null" not in prompt
    assert ai_narrative_service.NO_DATA_LABEL in prompt
    assert "ห้ามเดาตัวเลขขึ้นมาเอง" in prompt


def test_prompt_shows_price_and_rsi_trend_when_previous_values_present():
    metrics = _sample_metrics().model_copy(update={"current_price": 571.48, "price_prev": 558.1, "rsi14": 58.6, "rsi14_prev": 54.2})
    fake_response = '{"sentiment": "neutral", "narrative": "x รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response) as mock_call:
        get_ai_narrative("NVDA", metrics)

    prompt = mock_call.call_args[0][0]
    assert "สูงขึ้นจาก $558.1 5 วันทำการก่อนหน้า" in prompt
    assert "สูงขึ้นจาก 54.2 5 วันทำการก่อนหน้า" in prompt


def test_prompt_says_previous_data_unavailable_rather_than_omit_or_fabricate_it():
    metrics = _sample_metrics().model_copy(update={"current_price": 571.48, "price_prev": None})
    fake_response = '{"sentiment": "neutral", "narrative": "x รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response) as mock_call:
        get_ai_narrative("NVDA", metrics)

    prompt = mock_call.call_args[0][0]
    assert "ข้อมูลก่อนหน้าไม่มี" in prompt


def test_prompt_includes_market_context_when_both_sector_and_trend_provided():
    metrics = _sample_metrics().model_copy(update={"sector": "Technology", "market_trend": "ขาขึ้น"})
    fake_response = '{"sentiment": "neutral", "narrative": "x รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response) as mock_call:
        get_ai_narrative("NVDA", metrics)

    prompt = mock_call.call_args[0][0]
    assert "บริบทตลาด: Technology กำลัง ขาขึ้น" in prompt


def test_prompt_includes_52_week_context_when_present():
    metrics = _sample_metrics().model_copy(
        update={"week52_high": 620.0, "week52_low": 400.0, "distance_from_52w_high_pct": 7.8, "distance_from_52w_low_pct": 42.9}
    )
    fake_response = '{"sentiment": "neutral", "narrative": "x รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response) as mock_call:
        get_ai_narrative("NVDA", metrics)

    prompt = mock_call.call_args[0][0]
    assert "52-week High: $620.00" in prompt
    assert "ห่างจากจุดสูงสุด 7.8%" in prompt
    assert "52-week Low: $400.00" in prompt
    assert "สูงกว่าจุดต่ำสุด 42.9%" in prompt


def test_prompt_52_week_context_falls_back_to_no_data_when_absent():
    fake_response = '{"sentiment": "neutral", "narrative": "x รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response) as mock_call:
        get_ai_narrative("NVDA", _sample_metrics())

    prompt = mock_call.call_args[0][0]
    assert f"52-week High/Low: {ai_narrative_service.NO_DATA_LABEL}" in prompt


def test_prompt_market_context_falls_back_to_no_data_when_absent():
    fake_response = '{"sentiment": "neutral", "narrative": "x รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response) as mock_call:
        get_ai_narrative("NVDA", _sample_metrics())

    prompt = mock_call.call_args[0][0]
    assert "บริบทตลาด: ไม่มีข้อมูลเพิ่มเติม" in prompt


def test_insufficient_data_skips_ollama_entirely():
    # Live-tested 2026-08-07: when every core indicator was null, the model fabricated a
    # confident bullish narrative instead of saying "not enough data". This guard bails out
    # before the model ever gets a chance to.
    sparse_metrics = _sample_metrics().model_copy(
        update={
            "rsi14": None,
            "current_price": None,
            "atr14": None,
            "macd": _sample_metrics().macd.model_copy(update={"macd_line": None}),
            "moving_averages": _sample_metrics().moving_averages.model_copy(update={"sma20": None}),
        }
    )
    with patch.object(ai_narrative_service, "_call_llm") as mock_call:
        result = get_ai_narrative("NVDA", sparse_metrics)

    mock_call.assert_not_called()
    assert result.sentiment == "neutral"
    assert "ไม่เพียงพอ" in result.narrative
    assert result.conflicting_signals is None


def test_insufficient_data_threshold_is_missing_at_least_four_of_five_core_fields():
    # Only 3 of the 5 core fields missing -- still calls the model (below the threshold).
    metrics = _sample_metrics().model_copy(
        update={
            "rsi14": None,
            "current_price": None,
            "atr14": None,
            # macd.macd_line and moving_averages.sma20 stay real (from _sample_metrics()).
        }
    )
    fake_response = '{"sentiment": "neutral", "narrative": "x รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response) as mock_call:
        get_ai_narrative("NVDA", metrics)

    mock_call.assert_called_once()


def test_sentiment_forced_to_neutral_when_squeeze_conflict_fires_even_if_model_says_bullish():
    # Live-tested 2026-08-07: given this exact condition and told explicitly not to declare a
    # direction, the model answered sentiment="bullish" anyway. Not trusted -- forced to neutral.
    metrics = _sample_metrics().model_copy(update={"bb_width_pct": 3.5, "is_squeeze": True, "rsi14": 50.0})
    fake_response = '{"sentiment": "bullish", "narrative": "x รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response):
        result = get_ai_narrative("NVDA", metrics)

    assert result.sentiment == "neutral"


def test_sentiment_left_alone_when_no_squeeze_conflict():
    metrics = _sample_metrics().model_copy(update={"is_squeeze": False})
    fake_response = '{"sentiment": "bearish", "narrative": "x รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response):
        result = get_ai_narrative("NVDA", metrics)

    assert result.sentiment == "bearish"


def test_fact_check_flags_rsi_called_high_when_it_is_neutral():
    # Live-tested 2026-08-07: the model called RSI 51.0 "อยู่ในโซนสูง" (high zone).
    metrics = _sample_metrics().model_copy(update={"rsi14": 51.0})
    fake_response = '{"sentiment": "bullish", "narrative": "RSI ที่อยู่ในโซนสูง แสดงถึงความแข็งแกร่ง รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response):
        result = get_ai_narrative("NVDA", metrics)

    assert any("RSI" in c and "51.0" in c for c in result.caveats)


def test_fact_check_does_not_flag_rsi_called_high_when_it_really_is():
    metrics = _sample_metrics().model_copy(update={"rsi14": 78.0})
    fake_response = '{"sentiment": "bullish", "narrative": "RSI ที่อยู่ในโซนสูง แสดงถึงความแข็งแกร่ง รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response):
        result = get_ai_narrative("NVDA", metrics)

    assert not any("RSI" in c and "โปรดตรวจสอบ" in c for c in result.caveats)


def test_fact_check_flags_macd_called_confirming_when_it_is_neutral():
    # Live-tested 2026-08-07: the model called a NEUTRAL MACD "ยืนยันแนวโน้มขาขึ้นที่ชัดเจน".
    metrics = _sample_metrics().model_copy(
        update={"macd": _sample_metrics().macd.model_copy(update={"crossover": "NEUTRAL", "is_bullish_crossover": False})}
    )
    fake_response = '{"sentiment": "bullish", "narrative": "MACD ยืนยันแนวโน้มขาขึ้นที่ชัดเจน รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response):
        result = get_ai_narrative("NVDA", metrics)

    assert any("MACD" in c and "NEUTRAL" in c for c in result.caveats)


def test_fact_check_flags_volume_called_above_average_when_it_is_below():
    # Live-tested 2026-08-07: the model called 0.8x volume "สูงกว่าค่าเฉลี่ย 20 วัน".
    metrics = _sample_metrics().model_copy(update={"volume_ratio": 0.8})
    fake_response = '{"sentiment": "bullish", "narrative": "Volume Ratio ที่สูงกว่าค่าเฉลี่ย 20 วัน รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response):
        result = get_ai_narrative("NVDA", metrics)

    assert any("Volume" in c and "0.8" in c for c in result.caveats)


def test_fact_check_flags_ma_called_golden_cross_when_it_is_not():
    # Live-tested 2026-08-07: the model called a NEUTRAL MA state "ตัดกันเป็นผลดี".
    metrics = _sample_metrics().model_copy(
        update={"moving_averages": _sample_metrics().moving_averages.model_copy(update={"ma_cross_state": "NEUTRAL", "is_bullish_alignment": False})}
    )
    fake_response = '{"sentiment": "bullish", "narrative": "Moving Average ยังตัดกันเป็นผลดีต่อการเคลื่อนไหวของราคา รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response):
        result = get_ai_narrative("NVDA", metrics)

    assert any("Moving Average" in c and "NEUTRAL" in c for c in result.caveats)


def test_fact_check_adds_no_caveat_when_narrative_makes_no_flagged_claims():
    fake_response = '{"sentiment": "neutral", "narrative": "หุ้นตัวนี้เคลื่อนไหวในกรอบ ยังไม่มีสัญญาณชัดเจน รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "caveats": ["ตัวอย่างข้อควรระวังเดิม"]}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response):
        result = get_ai_narrative("NVDA", _sample_metrics())

    assert result.caveats == ["ตัวอย่างข้อควรระวังเดิม"]


def test_fact_check_catches_lowercase_overbought_in_parentheses_real_spcx_case():
    # Real production narrative for SPCX, 2026-08-07: rsi14=43.99 (nowhere near the >70
    # overbought threshold), but the model wrote "(overbought)" lowercase inside parentheses.
    # A case-sensitive check for "Overbought" (capital O) missed this on first ship.
    metrics = _sample_metrics().model_copy(update={"rsi14": 43.99})
    fake_response = (
        '{"sentiment": "bullish", "narrative": '
        '"RSI ก็แสดงให้เห็นถึงความแรงของโมเมนตัมที่เพิ่มขึ้นอย่างเห็นได้ชัด '
        'ผ่านมาจาก 18.33 เป็น 43.99 ซึ่งบ่งชี้ว่าตลาดกำลังเข้าสู่ภาวะซื้อขายมากเกินไป (overbought) '
        'นอกจากนี้ Moving Average ยังไม่มีข้อมูลในรอบนี้", "caveats": []}'
    )
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response):
        result = get_ai_narrative("SPCX", metrics)

    assert any("Overbought" in c and "43.99" in c for c in result.caveats)


def test_fact_check_catches_ma_over_generalized_to_no_data_when_sma20_is_real():
    # Same real SPCX narrative: sma20 was real (38 days of history is enough for a 20-day
    # average), sma50/sma200 were correctly null (not enough history), but the model
    # generalized the mixed state into a blanket "Moving Average has no data" claim.
    metrics = _sample_metrics().model_copy(
        update={"moving_averages": _sample_metrics().moving_averages.model_copy(update={"sma20": 130.0, "sma50": None, "sma200": None})}
    )
    fake_response = '{"sentiment": "neutral", "narrative": "นอกจากนี้ Moving Average ยังไม่มีข้อมูลในรอบนี้ แต่ MACD แสดงให้เห็นว่าโมเมนตัมยังคงอยู่ในทิศทางขาขึ้น", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response):
        result = get_ai_narrative("SPCX", metrics)

    assert any("Moving Average" in c and "SMA20" in c for c in result.caveats)


def test_fact_check_does_not_flag_ma_no_data_claim_when_all_ma_fields_really_are_null():
    metrics = _sample_metrics().model_copy(
        update={"moving_averages": _sample_metrics().moving_averages.model_copy(update={"sma20": None, "sma50": None, "sma200": None})}
    )
    fake_response = '{"sentiment": "neutral", "narrative": "Moving Average ยังไม่มีข้อมูลในรอบนี้ รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาว", "caveats": []}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response):
        result = get_ai_narrative("SPCX", metrics)

    assert not any("Moving Average" in c and "SMA20" in c for c in result.caveats)


def test_get_ai_narrative_raises_on_openrouter_unreachable():
    import httpx

    with patch("app.ai_narrative_service.httpx.post", side_effect=httpx.ConnectError("connection refused")):
        with pytest.raises(AiNarrativeError, match="Could not reach OpenRouter"):
            get_ai_narrative("NVDA", _sample_metrics())


def test_analyze_route_returns_503_on_failure(client):
    with patch.object(ai_narrative_service, "_call_llm", return_value="not json"):
        response = client.post(
            "/ai-narrative/analyze",
            json={"ticker": "NVDA", "metrics": _sample_metrics().model_dump(by_alias=False)},
        )
    assert response.status_code == 503


def test_analyze_route_returns_200_on_success(client):
    fake_response = '{"sentiment": "bullish", "narrative": "แข็งแกร่ง รายละเอียดเพิ่มเติมสำหรับสถานการณ์นี้ในเชิงเทคนิคเพื่อให้ครบตามความยาวที่กำหนดไว้ในการทดสอบ", "conflicting_signals": null, "caveats": ["ตัวอย่างเดียว ไม่ใช่คำแนะนำการลงทุน"]}'
    with patch.object(ai_narrative_service, "_call_llm", return_value=fake_response):
        response = client.post(
            "/ai-narrative/analyze",
            json={"ticker": "NVDA", "metrics": _sample_metrics().model_dump(by_alias=False)},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["sentiment"] == "bullish"
    assert body["caveats"] == ["ตัวอย่างเดียว ไม่ใช่คำแนะนำการลงทุน"]
