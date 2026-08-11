#!/usr/bin/env python3
"""Probe: AI Analyst narrative ผ่าน OpenRouter (DeepSeek) — วัดต้นทุน+เวลา+คุณภาพ.

เลียนแบบ get_ai_narrative เต็มแต่ _call_ollama → OpenRouter chat/completions
(reuse DEEPSEEK config + reasoning:enabled:false + response_format:json_object)
"""
import json, os, sys, time
sys.path.insert(0, os.getcwd())
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.getcwd(), ".env"))  # cwd=backend — หา .env ตรงๆ
import httpx

from app import ai_narrative_service as ans
from app.schemas import (AiSignalMetricsIn, MacdMetricsIn, MovingAverageMetricsIn,
                         ConfidenceScoreIn)
from app.news_service import DEEPSEEK_URL, DEEPSEEK_MODEL, _deepseek_key

def sample_metrics() -> AiSignalMetricsIn:
    return AiSignalMetricsIn(
        rsi14=78.3, volume_ratio=2.1, distance_from_sma50_pct=12.3,
        bb_width_pct=18.2, is_squeeze=False, nearest_support=None, nearest_resistance=None,
        macd=MacdMetricsIn(macd_line=2.3, signal_line=1.1, histogram=1.2, crossover="BULLISH",
                           is_bullish_crossover=True, is_bearish_crossover=False),
        moving_averages=MovingAverageMetricsIn(sma20=132.5, sma50=118.2, sma200=95.4,
            ma_cross_state="GOLDEN_CROSS", is_bullish_alignment=True, distance_from_sma50_pct=12.3),
        atr14=4.2, trading_setup={"entryZone": {"min": 130.2, "max": 132.5, "formatted": "$130.20 - $132.50"}},
        confidence_score=ConfidenceScoreIn(score=32, rating_badge="BEARISH RISK",
                                          pillars={"rsiContribution": 0.31}),
    )

_LAST_USAGE = None
def _openrouter_call(prompt: str) -> str:
    global _LAST_USAGE
    key = _deepseek_key()
    if not key:
        raise ans.AiNarrativeError("DEEPSEEK_API_KEY not set")
    r = httpx.post(DEEPSEEK_URL,
                   headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                   json={"model": DEEPSEEK_MODEL,
                         "messages": [
                             {"role": "system", "content": "คุณคือนักวิเคราะห์เทคนิคอลหุ้นที่ตอบเป็นภาษาไทย"},
                             {"role": "user", "content": prompt}],
                         "max_tokens": 8000, "stream": False,
                         "response_format": {"type": "json_object"},
                         "reasoning": {"enabled": False}},
                   timeout=300)
    if r.status_code != 200:
        raise ans.AiNarrativeError(f"OpenRouter HTTP {r.status_code}: {r.text[:200]}")
    j = r.json()
    _LAST_USAGE = j.get("usage", {})
    return j["choices"][0]["message"]["content"]

def run(label: str, ticker: str, m: AiSignalMetricsIn):
    ans.clear_cache()
    ans._call_ollama = _openrouter_call   # เปลี่ยนเฉพาะจุดติดต่อ → เหลือ pipeline จริงครบ
    t0 = time.monotonic()
    try:
        res = ans.get_ai_narrative(ticker, m)
        ok = True
    except Exception as e:
        res = None; ok = False; ERR = e
    dt = time.monotonic() - t0
    u = _LAST_USAGE or {}
    cost = u.get("cost")
    pin = u.get("prompt_tokens"); pout = u.get("completion_tokens")
    print("=" * 70)
    print(f"[{label}] {ticker} · {'OK' if ok else 'FAIL'} · {dt:.1f}s · cost=${cost if cost is not None else '?'}")
    if ok:
        print("sentiment:", res.sentiment)
        print("conflicts:", res.conflicting_signals)
        print("caveats:", res.caveats)
        print("narrative len:", len(res.narrative), "chars")
        print("--- narrative (first 700 chars) ---")
        print(res.narrative[:700])
    else:
        print("ERROR:", type(ERR).__name__, str(ERR)[:200])

if __name__ == "__main__":
    run("scenario1", "NVDA", sample_metrics())
