# backend/app/ai_narrative_service.py
"""Ollama-backed AI narrative for the AI Technical Signal feature (wayfinder ticket 09,
contract decided in ticket 04). Local-only LLM, on-demand (never auto-triggered — llama3.2:3b
takes ~39s per call on this CPU-only host per ticket 02's measurement), cached per (ticker, date)
so a same-day re-request for the same ticker doesn't re-run inference.

The frontend already computes every indicator (aiTechnicalSignal.ts) — this module never
recomputes anything, it only formats those already-computed values into a prompt and asks the
model for its qualitative read, structured as JSON per ticket 04's contract.
"""

from __future__ import annotations

import json
from datetime import date

import requests

from app.schemas import AiNarrativeOut, AiSignalMetricsIn

OLLAMA_URL = "http://host.docker.internal:11434/api/generate"
# Switched from llama3.2:3b (ticket 02's pick, on reasoning-quality grounds) to the Thai-tuned
# model after live user feedback that the narrative read as awkward/hard to follow and too
# short. Safe to switch now that conflict detection no longer depends on the LLM noticing it
# unprompted -- see _detect_conflicts() below, added the same day after a live re-test showed
# *neither* model reliably caught a planted RSI-overbought/bullish-MACD conflict once the prompt
# asked for a longer, more structured narrative (llama3.2:3b's output degraded into an
# incoherent fragment; typhoon2-3b wrote fluent Thai but still misread RSI-overbought as
# confirming bullish strength, the same failure mode ticket 02 first found). Rather than keep
# gambling on which 3B model's reasoning is less unreliable this week, conflicts are now computed
# deterministically in Python and handed to the model as a fact to explain, not a thing to spot.
MODEL = "scb10x/llama3.2-typhoon2-3b-instruct"
TIMEOUT_SECONDS = 120  # typhoon2-3b measured slower (~70s) than llama3.2:3b (~39s) on this host

_cache: dict[tuple[str, date], AiNarrativeOut] = {}


class AiNarrativeError(Exception):
    """Raised on any failure the frontend should render as 'AI วิเคราะห์ไม่สำเร็จ' + retry
    (ticket 04's fallback decision) — never fabricate a result to paper over one of these."""


def clear_cache() -> None:
    _cache.clear()


def _format_zone(label: str, zone) -> str:
    if zone is None:
        return f"{label}: ไม่พบ"
    return f"{label}: {zone.price:.2f} (ห่าง {zone.distance_pct:+.1f}%)"


NO_DATA_LABEL = "ไม่มีข้อมูลในรอบนี้"


def _or_no_data(value, suffix: str = "") -> str:
    """Null-safe indicator formatting for the prompt -- previously a bare None/null could get
    interpolated straight into the Thai text (e.g. 'Volume Ratio: Nonex'), which reads like a
    real value to a model that's been told not to invent numbers of its own."""
    return NO_DATA_LABEL if value is None else f"{value}{suffix}"


PREV_TREND_WINDOW_LABEL = "5 วันทำการก่อนหน้า"
# Says "5 trading days" (what the code actually guarantees), not "a week" -- live-checked
# 2026-08-07 with a synthetic holiday gap in the window: 5 trading bars spanned 9 calendar days,
# not 7, so "a week ago" would be a real (if minor) misstatement on any week with a market
# holiday. Coupled to aiTechnicalSignal.ts's PREV_TREND_OFFSET_TRADING_DAYS constant (=5) --
# update both together if that offset ever changes.


def _trend_line(label: str, current, previous, prefix: str = "", suffix: str = "") -> str:
    """A '{label}: {current} ({direction}จาก {previous} {PREV_TREND_WINDOW_LABEL})' line when both
    values exist, degrading to the plain current-value line (or NO_DATA_LABEL) otherwise -- never
    inventing a previous value or a direction that isn't backed by real prior data."""
    if current is None:
        return f"{label}: {NO_DATA_LABEL}"
    if previous is None:
        return f"{label}: {prefix}{current}{suffix} (ข้อมูลก่อนหน้าไม่มี)"
    if current > previous:
        direction = "สูงขึ้น"
    elif current < previous:
        direction = "ลดลง"
    else:
        direction = "ทรงตัว"
    return f"{label}: {prefix}{current}{suffix} ({direction}จาก {prefix}{previous}{suffix} {PREV_TREND_WINDOW_LABEL})"


MAX_CONFLICTS_IN_PROMPT = 2  # cap so the model isn't asked to weave 4+ conflicts into one narrative


def _detect_conflicts_scored(m: AiSignalMetricsIn) -> list[tuple[int, str, str]]:
    """(priority, rule_id, message) for every conflict rule that fires -- unsorted, uncapped.
    The single source of truth both _detect_conflicts (prompt text, capped to the top
    MAX_CONFLICTS_IN_PROMPT) and _direction_ambiguous (the sentiment-override guard, which needs
    to know whether Rule A specifically fired regardless of whether it survived the cap) build on.

    Priority (1=highest): trend-vs-momentum conflicts (rules 1-2) > confidence-vs-indicator
    conflicts (rules 3-4) > squeeze/resistance-proximity conflicts (rules A-B)."""
    ma = m.moving_averages
    macd = m.macd
    trend_bullish = ma.is_bullish_alignment or ma.ma_cross_state == "GOLDEN_CROSS" or macd.is_bullish_crossover
    trend_bearish = ma.ma_cross_state == "DEATH_CROSS" or macd.is_bearish_crossover

    scored: list[tuple[int, str, str]] = []

    if m.rsi14 is not None and m.rsi14 > 70 and trend_bullish:
        scored.append((1, "rsi_overbought_bullish", f"RSI ({m.rsi14:.1f}) เข้าเขต Overbought แล้ว แต่สัญญาณเทรนด์/โมเมนตัม (MA, MACD) ยังเป็นบวก — เสี่ยงย่อตัวระยะสั้นแม้เทรนด์หลักยังดี"))
    if m.rsi14 is not None and m.rsi14 < 30 and trend_bearish:
        scored.append((1, "rsi_oversold_bearish", f"RSI ({m.rsi14:.1f}) เข้าเขต Oversold แล้ว แต่สัญญาณเทรนด์/โมเมนตัมยังเป็นลบ — อาจมีโอกาสดีดตัวทางเทคนิคแม้เทรนด์หลักยังไม่กลับตัว"))
    if m.confidence_score.score < 40 and trend_bullish:
        scored.append((2, "low_confidence_bullish", f"คะแนนความเชื่อมั่นจากระบบ ({m.confidence_score.score}/100) บ่งชี้ความเสี่ยงด้านลบ แต่ตัวชี้วัดเทรนด์/โมเมนตัมรายตัวยังดูเป็นบวก — ระบบเห็นความเสี่ยงที่ indicator รายตัวยังไม่สะท้อน"))
    if m.confidence_score.score >= 60 and trend_bearish:
        scored.append((2, "high_confidence_bearish", f"คะแนนความเชื่อมั่นจากระบบ ({m.confidence_score.score}/100) ดูเป็นบวก แต่สัญญาณเทรนด์/โมเมนตัมรายตัวกลับเป็นลบ"))

    # Rule A: strong squeeze + dead-center RSI -- accumulation with no directional lean yet,
    # a different kind of "don't over-commit to a read" signal than the trend-vs-momentum rules.
    # Live-tested 2026-08-07: the model was told this exact condition means "don't rush to
    # bullish or bearish" and answered sentiment="bullish" anyway, fabricating supporting
    # numbers for it (claimed RSI was "high", MACD "confirmed an uptrend", volume was "above
    # average" -- none of which matched the real input). Its sentiment field is not trusted
    # when this rule fires; see _direction_ambiguous / get_ai_narrative's override.
    if m.bb_width_pct is not None and m.bb_width_pct < 5 and m.is_squeeze and m.rsi14 is not None and 45 <= m.rsi14 <= 55:
        scored.append((3, "squeeze_neutral_rsi", "Bollinger Band กำลัง Squeeze รุนแรง (BB Width < 5%) ร่วมกับ RSI อยู่กลางโซน (45-55) หมายความว่าราคากำลังสะสมพลังงานและยังไม่มีทิศทางชัดเจน อย่าด่วนสรุปว่า bullish หรือ bearish"))

    # Rule B: bullish trend running straight into a very close resistance -- the trend reading
    # and the proximity-to-resistance reading point at different near-term outcomes.
    if m.nearest_resistance is not None and m.nearest_resistance.distance_pct < 2 and trend_bullish:
        r = m.nearest_resistance
        scored.append((3, "bullish_near_resistance", f"ราคาอยู่ห่างแนวต้านใกล้สุดแค่ {r.distance_pct:.1f}% (แนวต้าน {r.label}) แม้เทรนด์จะเป็นบวก แต่กำลังเข้าใกล้โซนที่อาจมีแรงขายทำกำไร"))

    return scored


def _detect_conflicts(m: AiSignalMetricsIn) -> list[str]:
    """Deterministic, rule-based conflict detection -- the thing this feature exists to surface
    (ticket 02), computed here instead of trusted to the LLM's own judgment. Live re-testing
    (same day as the switch away from llama3.2:3b, see MODEL's comment) found neither 3B model
    reliably caught a textbook RSI-overbought/bullish-momentum conflict on its own, so this list
    is authoritative for the response's `conflicting_signals` field -- the model is told about
    these explicitly in the prompt and asked to explain them, not to go find them.

    When more than MAX_CONFLICTS_IN_PROMPT fire at once, only the highest-priority ones are kept
    -- asking the model to hold 4+ conflicting threads in one narrative degrades the same way a
    longer, less-focused prompt already did once (see MODEL's comment)."""
    scored = sorted(_detect_conflicts_scored(m), key=lambda t: t[0])
    return [message for _, _, message in scored[:MAX_CONFLICTS_IN_PROMPT]]


def _direction_ambiguous(m: AiSignalMetricsIn) -> bool:
    """True when Rule A (squeeze + dead-center RSI) fires, regardless of whether it survived
    the MAX_CONFLICTS_IN_PROMPT cap -- the underlying data situation is direction-ambiguous
    either way. get_ai_narrative overrides the model's own sentiment to 'neutral' in this case;
    see _detect_conflicts_scored's Rule A comment for why it can't be trusted here."""
    return any(rule_id == "squeeze_neutral_rsi" for _, rule_id, _ in _detect_conflicts_scored(m))


# Core indicators a narrative actually needs something real to say about. Live-tested
# 2026-08-07: with every one of these null, the model didn't say "not enough data" -- it
# fabricated a confident bullish narrative (a $0.00 price "near an all-time high", a "clear
# uptrend" from a null MACD, etc.), directly violating the prompt's own "don't guess a number"
# instruction. Rather than keep hoping the LLM behaves, missing MISSING_DATA_THRESHOLD or more
# of these bails out to a deterministic response before ever calling it.
MISSING_DATA_THRESHOLD = 4


def _has_insufficient_data(m: AiSignalMetricsIn) -> bool:
    core_fields = [m.rsi14, m.macd.macd_line, m.moving_averages.sma20, m.current_price, m.atr14]
    return sum(1 for f in core_fields if f is None) >= MISSING_DATA_THRESHOLD


def _insufficient_data_response(ticker: str) -> AiNarrativeOut:
    return AiNarrativeOut(
        sentiment="neutral",
        narrative=(
            f"ข้อมูลราคาและตัวชี้วัดทางเทคนิคของ {ticker} ในรอบนี้มีไม่เพียงพอสำหรับการวิเคราะห์ที่น่าเชื่อถือ "
            "(ตัวชี้วัดหลักส่วนใหญ่ยังไม่มีข้อมูลในรอบนี้) กรุณาลองใหม่เมื่อมีข้อมูลราคาย้อนหลังมากขึ้น"
        ),
        conflicting_signals=None,
        caveats=["ข้อมูลไม่เพียงพอสำหรับการวิเคราะห์ในรอบนี้ -- ไม่ได้เรียกใช้ AI เพื่อป้องกันการเดาตัวเลขที่ไม่มีอยู่จริง"],
    )


def _build_prompt(ticker: str, m: AiSignalMetricsIn, conflicts: list[str]) -> str:
    macd = m.macd
    ma = m.moving_averages
    cs = m.confidence_score
    ts = m.trading_setup

    conflict_step = (
        "3. อธิบายความขัดแย้งที่ระบบตรวจพบแล้วด้านล่าง (ในหัวข้อ 'ความขัดแย้งที่ตรวจพบ') ให้ชัดว่าขัดแย้งกันยังไง "
        "ทำไมถึงน่ากังวลหรือน่าสนใจ ห้ามมองข้ามหรือกลบเกลื่อน — นี่คือข้อเท็จจริงที่ระบบคำนวณไว้แล้ว ไม่ใช่สิ่งที่คุณต้องไปหาเอง"
        if conflicts
        else "3. ระบบตรวจสอบแล้วไม่พบสัญญาณขัดแย้งกันชัดเจนในรอบนี้ (ด้านล่างจะเห็นแค่ '- ไม่พบ') "
        "ห้ามไปพยายามหาความขัดแย้งที่ไม่มีอยู่จริงมาเล่าเอง"
    )

    market_context = (
        f"บริบทตลาด: {m.sector} กำลัง {m.market_trend}"
        if m.sector is not None and m.market_trend is not None
        else "บริบทตลาด: ไม่มีข้อมูลเพิ่มเติม"
    )

    # Real per-ticker context (52-week high/low), chosen over sector/market_trend above per user
    # roadmap discussion 2026-08-07: this needs no sector mapping and is never wrong for a
    # ticker outside some incomplete static list -- it's just the high/low of data already
    # fetched for this exact ticker.
    week52_line = (
        f"52-week High: ${m.week52_high:.2f} (ราคาปัจจุบันห่างจากจุดสูงสุด {m.distance_from_52w_high_pct:.1f}%), "
        f"52-week Low: ${m.week52_low:.2f} (ราคาปัจจุบันสูงกว่าจุดต่ำสุด {m.distance_from_52w_low_pct:.1f}%)"
        if m.week52_high is not None
        and m.week52_low is not None
        and m.distance_from_52w_high_pct is not None
        and m.distance_from_52w_low_pct is not None
        else f"52-week High/Low: {NO_DATA_LABEL}"
    )

    lines = [
        "คุณคือนักลงทุนหุ้นที่มีประสบการณ์ กำลังอธิบายสถานการณ์ของหุ้นตัวนี้ให้เพื่อนนักลงทุนฟังแบบละเอียด "
        "ไม่ใช่เขียนรายงานสั้นๆ ห้วนๆ แบบทางการ",
        "",
        "อ่านตัวเลข indicator ที่คำนวณไว้แล้วด้านล่าง (ห้ามคิดตัวเลขใหม่เอง ใช้เฉพาะตัวเลขที่ให้มา) "
        "แล้วอธิบายตามลำดับนี้:",
        "1. เกริ่นภาพรวมก่อนว่าตอนนี้หุ้นตัวนี้อยู่ในสถานการณ์แบบไหน",
        "2. ไล่อธิบายทีละสัญญาณ (เทรนด์/Moving Average, โมเมนตัม/MACD, RSI, วอลุ่ม, แนวรับ-แนวต้าน, "
        "ตำแหน่งราคาในรอบ 52 สัปดาห์) ว่าแต่ละตัวบอกอะไร ทำไมถึงสำคัญกับการตัดสินใจ ไม่ใช่แค่ท่องตัวเลข",
        conflict_step,
        "4. สรุปมุมมองรวมพร้อมเหตุผลว่าทำไมถึงสรุปแบบนั้น",
        "",
        "เขียนเป็นภาษาไทยธรรมชาติแบบคนคุยกัน อ่านเข้าใจง่าย ไม่ใช่ภาษาราชการหรือรายงานธุรกิจ "
        "ความยาวประมาณ 4-6 ย่อหน้า อธิบายละเอียดพอสมควร ไม่ต้องรีบสรุปสั้นๆ",
        "",
        # Some indicators may be missing this round (short history, no zones placed, etc.) --
        # they show up below as the literal text "ไม่มีข้อมูลในรอบนี้", never a fabricated number.
        f"หมายเหตุ: ถ้าเห็นค่าใดๆ เขียนว่า '{NO_DATA_LABEL}' แปลว่าระบบไม่มีข้อมูลจริงๆ ห้ามเดาตัวเลขขึ้นมาเองแทนที่ "
        "ให้พูดถึงมันว่า 'ไม่มีข้อมูล' ไปตรงๆ",
        "",
        market_context,
        week52_line,
        f"หุ้น: {ticker}",
        _trend_line("ราคา", m.current_price, m.price_prev, prefix="$"),
        _trend_line("RSI(14)", m.rsi14, m.rsi14_prev),
        f"MACD: เส้น MACD {_or_no_data(macd.macd_line)}, เส้น Signal {_or_no_data(macd.signal_line)}, "
        f"Histogram {_or_no_data(macd.histogram)}, สถานะ {macd.crossover}",
        f"Moving Average: SMA20={_or_no_data(ma.sma20)}, SMA50={_or_no_data(ma.sma50)}, SMA200={_or_no_data(ma.sma200)}, "
        f"สถานะ {ma.ma_cross_state}, Bullish Alignment={ma.is_bullish_alignment}, "
        f"ห่างจาก SMA50 {_or_no_data(ma.distance_from_sma50_pct, '%')}",
        f"Volume Ratio: {_or_no_data(m.volume_ratio, 'x')} ของค่าเฉลี่ย 20 วัน",
        f"Bollinger Band Width: {_or_no_data(m.bb_width_pct, '%')} ({'Squeeze' if m.is_squeeze else 'ไม่ใช่ Squeeze'})",
        _format_zone("แนวรับใกล้สุด (S1)", m.nearest_support),
        _format_zone("แนวต้านใกล้สุด (R1)", m.nearest_resistance),
        f"ATR(14): {_or_no_data(m.atr14)}",
        f"คะแนนความเชื่อมั่นจากระบบ (fitted model): {cs.score}/100 — {cs.rating_badge}",
        f"Trading Setup ที่ระบบคำนวณไว้: {json.dumps(ts, ensure_ascii=False)}",
        "",
        "ความขัดแย้งที่ตรวจพบ (คำนวณไว้แล้ว ไม่ต้องหาเอง):",
    ]
    lines += [f"- {c}" for c in conflicts] if conflicts else ["- ไม่พบ"]
    lines += [
        "",
        "ตอบเป็น JSON เท่านั้น ตรงตามรูปแบบนี้ (ห้ามมีข้อความอื่นนอกเหนือจาก JSON — ไม่ต้องใส่ conflicting_signals "
        "ในนี้ ระบบจะเติมให้เองจากรายการด้านบน):",
        "{",
        '  "sentiment": "bullish" | "bearish" | "neutral",',
        '  "narrative": "บทวิเคราะห์ภาษาไทยแบบละเอียด 4-6 ย่อหน้า ตามลำดับที่กำหนดไว้ข้างบน",',
        '  "caveats": ["ข้อควรระวังสั้นๆ"]',
        "}",
    ]
    return "\n".join(lines)


def _call_ollama(prompt: str) -> str:
    try:
        resp = requests.post(
            OLLAMA_URL,
            json={"model": MODEL, "prompt": prompt, "stream": False, "format": "json"},
            timeout=TIMEOUT_SECONDS,
        )
    except requests.exceptions.Timeout as e:
        raise AiNarrativeError(f"Ollama call timed out after {TIMEOUT_SECONDS}s") from e
    except requests.exceptions.ConnectionError as e:
        raise AiNarrativeError("Could not reach Ollama (is it running? OLLAMA_HOST=0.0.0.0 set?)") from e

    if resp.status_code != 200:
        raise AiNarrativeError(f"Ollama returned HTTP {resp.status_code}: {resp.text[:200]}")

    try:
        body = resp.json()
    except ValueError as e:
        raise AiNarrativeError("Ollama's own response wasn't valid JSON") from e

    response_text = body.get("response")
    if not response_text:
        raise AiNarrativeError("Ollama response had no 'response' field")
    return response_text


def _parse_model_output(raw: str) -> AiNarrativeOut:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise AiNarrativeError(f"Model output wasn't valid JSON: {raw[:200]!r}") from e

    try:
        return AiNarrativeOut(**parsed)
    except Exception as e:  # pydantic ValidationError, or a plain shape mismatch
        raise AiNarrativeError(f"Model output didn't match the expected shape: {e}") from e


def get_ai_narrative(ticker: str, metrics: AiSignalMetricsIn) -> AiNarrativeOut:
    """On-demand only — callers (the /ai-narrative/analyze route) decide when this runs; this
    function never runs on a timer or auto-refresh. Raises AiNarrativeError on any failure; the
    router turns that into the HTTP error the frontend renders as 'AI วิเคราะห์ไม่สำเร็จ' + retry."""
    cache_key = (ticker, date.today())
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    # Bails out before ever calling Ollama -- see _has_insufficient_data's comment.
    if _has_insufficient_data(metrics):
        result = _insufficient_data_response(ticker)
        _cache[cache_key] = result
        return result

    conflicts = _detect_conflicts(metrics)
    prompt = _build_prompt(ticker, metrics, conflicts)
    raw = _call_ollama(prompt)
    result = _parse_model_output(raw)
    # conflicting_signals is authoritative from the rule-based detector, not the model's own JSON
    # (which the prompt no longer even asks it to fill in) -- see MODEL's comment for why.
    result = result.model_copy(update={"conflicting_signals": conflicts or None})
    # sentiment is likewise not trusted from the model when Rule A fires -- see
    # _direction_ambiguous's comment.
    if _direction_ambiguous(metrics) and result.sentiment != "neutral":
        result = result.model_copy(update={"sentiment": "neutral"})

    _cache[cache_key] = result
    return result
