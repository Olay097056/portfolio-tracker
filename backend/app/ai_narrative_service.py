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


def _detect_conflicts(m: AiSignalMetricsIn) -> list[str]:
    """Deterministic, rule-based conflict detection -- the thing this feature exists to surface
    (ticket 02), computed here instead of trusted to the LLM's own judgment. Live re-testing
    (same day as the switch away from llama3.2:3b, see MODEL's comment) found neither 3B model
    reliably caught a textbook RSI-overbought/bullish-momentum conflict on its own, so this list
    is authoritative for the response's `conflicting_signals` field -- the model is told about
    these explicitly in the prompt and asked to explain them, not to go find them."""
    conflicts: list[str] = []
    ma = m.moving_averages
    macd = m.macd
    trend_bullish = ma.is_bullish_alignment or ma.ma_cross_state == "GOLDEN_CROSS" or macd.is_bullish_crossover
    trend_bearish = ma.ma_cross_state == "DEATH_CROSS" or macd.is_bearish_crossover

    if m.rsi14 is not None and m.rsi14 > 70 and trend_bullish:
        conflicts.append(f"RSI ({m.rsi14:.1f}) เข้าเขต Overbought แล้ว แต่สัญญาณเทรนด์/โมเมนตัม (MA, MACD) ยังเป็นบวก — เสี่ยงย่อตัวระยะสั้นแม้เทรนด์หลักยังดี")
    if m.rsi14 is not None and m.rsi14 < 30 and trend_bearish:
        conflicts.append(f"RSI ({m.rsi14:.1f}) เข้าเขต Oversold แล้ว แต่สัญญาณเทรนด์/โมเมนตัมยังเป็นลบ — อาจมีโอกาสดีดตัวทางเทคนิคแม้เทรนด์หลักยังไม่กลับตัว")
    if m.confidence_score.score < 40 and trend_bullish:
        conflicts.append(f"คะแนนความเชื่อมั่นจากระบบ ({m.confidence_score.score}/100) บ่งชี้ความเสี่ยงด้านลบ แต่ตัวชี้วัดเทรนด์/โมเมนตัมรายตัวยังดูเป็นบวก — ระบบเห็นความเสี่ยงที่ indicator รายตัวยังไม่สะท้อน")
    if m.confidence_score.score >= 60 and trend_bearish:
        conflicts.append(f"คะแนนความเชื่อมั่นจากระบบ ({m.confidence_score.score}/100) ดูเป็นบวก แต่สัญญาณเทรนด์/โมเมนตัมรายตัวกลับเป็นลบ")

    return conflicts


def _build_prompt(ticker: str, m: AiSignalMetricsIn, conflicts: list[str]) -> str:
    macd = m.macd
    ma = m.moving_averages
    cs = m.confidence_score
    ts = m.trading_setup

    conflict_step = (
        "3. อธิบายความขัดแย้งที่ระบบตรวจพบแล้วด้านล่าง (ในหัวข้อ 'ความขัดแย้งที่ตรวจพบ') ให้ชัดว่าขัดแย้งกันยังไง "
        "ทำไมถึงน่ากังวลหรือน่าสนใจ ห้ามมองข้ามหรือกลบเกลื่อน — นี่คือข้อเท็จจริงที่ระบบคำนวณไว้แล้ว ไม่ใช่สิ่งที่คุณต้องไปหาเอง"
        if conflicts
        else "3. ระบบตรวจสอบแล้วไม่พบสัญญาณขัดแย้งกันชัดเจนในรอบนี้ ไม่ต้องพยายามหาความขัดแย้งที่ไม่มีอยู่จริง"
    )

    lines = [
        "คุณคือนักลงทุนหุ้นที่มีประสบการณ์ กำลังอธิบายสถานการณ์ของหุ้นตัวนี้ให้เพื่อนนักลงทุนฟังแบบละเอียด "
        "ไม่ใช่เขียนรายงานสั้นๆ ห้วนๆ แบบทางการ",
        "",
        "อ่านตัวเลข indicator ที่คำนวณไว้แล้วด้านล่าง (ห้ามคิดตัวเลขใหม่เอง ใช้เฉพาะตัวเลขที่ให้มา) "
        "แล้วอธิบายตามลำดับนี้:",
        "1. เกริ่นภาพรวมก่อนว่าตอนนี้หุ้นตัวนี้อยู่ในสถานการณ์แบบไหน",
        "2. ไล่อธิบายทีละสัญญาณ (เทรนด์/Moving Average, โมเมนตัม/MACD, RSI, วอลุ่ม, แนวรับ-แนวต้าน) "
        "ว่าแต่ละตัวบอกอะไร ทำไมถึงสำคัญกับการตัดสินใจ ไม่ใช่แค่ท่องตัวเลข",
        conflict_step,
        "4. สรุปมุมมองรวมพร้อมเหตุผลว่าทำไมถึงสรุปแบบนั้น",
        "",
        "เขียนเป็นภาษาไทยธรรมชาติแบบคนคุยกัน อ่านเข้าใจง่าย ไม่ใช่ภาษาราชการหรือรายงานธุรกิจ "
        "ความยาวประมาณ 4-6 ย่อหน้า อธิบายละเอียดพอสมควร ไม่ต้องรีบสรุปสั้นๆ",
        "",
        f"หุ้น: {ticker}",
        f"RSI(14): {m.rsi14 if m.rsi14 is not None else 'N/A'}",
        f"MACD: เส้น MACD {macd.macd_line}, เส้น Signal {macd.signal_line}, Histogram {macd.histogram}, สถานะ {macd.crossover}",
        f"Moving Average: SMA20={ma.sma20}, SMA50={ma.sma50}, SMA200={ma.sma200}, "
        f"สถานะ {ma.ma_cross_state}, Bullish Alignment={ma.is_bullish_alignment}, "
        f"ห่างจาก SMA50 {ma.distance_from_sma50_pct}%",
        f"Volume Ratio: {m.volume_ratio}x ของค่าเฉลี่ย 20 วัน",
        f"Bollinger Band Width: {m.bb_width_pct}% ({'Squeeze' if m.is_squeeze else 'ไม่ใช่ Squeeze'})",
        _format_zone("แนวรับใกล้สุด (S1)", m.nearest_support),
        _format_zone("แนวต้านใกล้สุด (R1)", m.nearest_resistance),
        f"ATR(14): {m.atr14}",
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

    conflicts = _detect_conflicts(metrics)
    prompt = _build_prompt(ticker, metrics, conflicts)
    raw = _call_ollama(prompt)
    result = _parse_model_output(raw)
    # conflicting_signals is authoritative from the rule-based detector, not the model's own JSON
    # (which the prompt no longer even asks it to fill in) -- see MODEL's comment for why.
    result = result.model_copy(update={"conflicting_signals": conflicts or None})

    _cache[cache_key] = result
    return result
