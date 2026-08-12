"""Prototype 05: Multi-agent trade desk prompt flow (1 team deepseek, 5 personas).

Tests the complete meeting cycle with real LLM calls:
  1. Lead sets agenda + lens
  2. 4 analysts receive tailored bond-crisis context
  3. Each analyst submits their opinion (JSON)
  4. Lead reviews all 4 opinions → final decision (JSON)
  5. Token usage + cost report

Runs from project root:  cd backend && env -u PYTHONPATH -u VIRTUAL_ENV .venv/Scripts/python.exe ../scratch/multi-agent-trade-desk/prototype-05/prototype_meeting.py
"""

import json
import sys
import time
from dataclasses import dataclass, field

sys.path.insert(0, ".")  # backend/
from app.boardroom_service import llm_call  # noqa: E402
from app.trade_desk_service import (  # noqa: E402
    _DEFAULT_LEAD_PROMPT,
    _DEFAULT_TREND_PROMPT,
    _DEFAULT_TECHNICAL_PROMPT,
    _DEFAULT_MACRO_PROMPT,
    _DEFAULT_CONTRARIAN_PROMPT,
)

# ── Mock bond-crisis context (what the system would build in production) ─────

MOCK_CONTEXT = """
=== BOND-CRISIS DASHBOARD SNAPSHOT ===
เวลา: 12 ส.ค. 2026 21:00 น. (UTC+7)

--- ข้อมูลมหภาค (Macro) ---
US10Y: 4.68% (+3bps) | US2Y: 4.25% (+6bps) | Spread 10Y-2Y: 43bps (ไม่ inverted)
VIX: 15.46 (+0.19%) | DXY: 99.82 (-0.00%) | Gold: $4,383 (-1.35%) | WTI: $82.35 (-0.69%)
US HY Spread: 270bps (0bps) | CPI YoY: 3.5% | Fed Funds: 3.63%
FedWatch: โอกาสขึ้น 25bp = 52%, คง = 48%
JGB 10Y: 2.8% — ญี่ปุ่นดึงเงินกลับ

--- โมเดลทำกำไร ---
#1 โมเดลฟื้นตัว/รีเฟลชัน: 42.9/100 (กำลังก่อตัว) — long NAS/SPX, long oil, short gold, short JPY
#2 โมเดลเงินเฟ้อ-น้ำมัน: 40.4/100 (กำลังก่อตัว) — long oil, long gold, short bonds
#3 โมเดล Yield ช็อก: 38.0/100 (ไม่ทำงาน)
#4 โมเดล Fed เปลี่ยนท่าที: 36.9/100 (ไม่ทำงาน)
#5 โมเดลวิกฤตสินเชื่อ: 26.9/100 (ไม่ทำงาน)
#6 โมเดลแบงก์รัน: 19.5/100 (ไม่ทำงาน)

--- อารมณ์ตลาด (Sentiment) ---
CNN Fear & Greed: 63 (Greed) | Crypto FG: 29 (Fear)
ห่างกันมาก — ตลาดหุ้น optimistic แต่คริปโต panic

--- ข่าวสำคัญ ---
• CPI 12 ส.ค. 19:30 น. — คาด 0.1% m/m, ก่อนหน้า -0.4%
• ประมูลพันธบัตร 30Y 13 ส.ค. — อาจกดดัน yield
• ซีเรียระบุ IAEA จะประกาศความคืบหน้านิวเคลียร์

--- Hyperliquid Prices (122 markets) ---
BTC: $63,517 (-0.58%) | ETH: $1,864 (-0.38%) | SOL: $74.96 (-0.99%)
XRP: $1.008 (-1.01%) | GOLD: $4,382 (+0.64%) | CL (WTI): $82.40 (+1.66%)
SP500: $7,734 (-0.22%) | JPY: 159.26 (+0.16%)
"""

# ── Context slices per analyst ──────────────────────────────────────────────

TREND_CONTEXT = MOCK_CONTEXT + """
--- เลนส์ของคุณ (TREND / โมเมนตัม) ---
ดู: MA crossover, ทำ Higher High, volume ยืนยัน, คะแนนโมเดล ≥60
คำถาม: เทรนด์ระยะ 1-7 วันของ BTC/ETH/SOL/GOLD เป็นยังไง? มีจุดเข้าที่ชัดไหม?
"""

TECHNICAL_CONTEXT = MOCK_CONTEXT + """
--- เลนส์ของคุณ (TECHNICAL) ---
ดู: แนวรับ/ต้าน, RSI, MACD, รูปแบบแท่ง, volume profile
คำถาม: BTC/ETH/SOL/GOLD อยู่โซน overbought/oversold ไหม? RR จุดเข้าเป็นยังไง?
"""

MACRO_CONTEXT = MOCK_CONTEXT + """
--- เลนส์ของคุณ (MACRO) ---
ดู: ยิลด์, เงินเฟ้อ, Fed policy, flow of funds, cross-asset
คำถาม: CPI คืนนี้ + JGB 2.8% + FedWatch 52% ขึ้น — macro backdrop เอื้อ risk-on หรือ risk-off? สินทรัพย์ไหนได้/เสีย?
"""

CONTRARIAN_CONTEXT = MOCK_CONTEXT + """
--- เลนส์ของคุณ (CONTRARIAN) ---
ดู: extreme positioning, sentiment divergence, consensus fragility
คำถาม: CNN 63 greed vs Crypto 29 fear — divergence นี้บอกอะไร? ถ้าตลาดผิด หลักฐานแรกคืออะไร?
"""


# ── Meeting simulation ──────────────────────────────────────────────────────

@dataclass
class AnalystResult:
    seat: str
    opinion: str        # raw LLM output (JSON text)
    parsed: dict        # parsed JSON
    tokens_in: int = 0
    tokens_out: int = 0
    latency_s: float = 0.0


@dataclass
class MeetingResult:
    agenda: str
    analysts: list[AnalystResult] = field(default_factory=list)
    lead_decision: str = ""
    lead_parsed: dict = field(default_factory=dict)
    total_tokens_in: int = 0
    total_tokens_out: int = 0
    total_cost: float = 0.0
    total_latency: float = 0.0


def run_meeting(agenda: str, verbose: bool = True) -> MeetingResult:
    """Execute one full meeting cycle: 4 analysts → lead decision."""
    result = MeetingResult(agenda=agenda)
    t0 = time.monotonic()

    # Phase 1: Analysts
    analyst_specs = [
        ("trend", _DEFAULT_TREND_PROMPT, TREND_CONTEXT),
        ("technical", _DEFAULT_TECHNICAL_PROMPT, TECHNICAL_CONTEXT),
        ("macro", _DEFAULT_MACRO_PROMPT, MACRO_CONTEXT),
        ("contrarian", _DEFAULT_CONTRARIAN_PROMPT, CONTRARIAN_CONTEXT),
    ]

    opinions_text = []
    for seat, sys_prompt, ctx in analyst_specs:
        user_msg = f"{agenda}\n\n{ctx}"
        content, usage, latency = llm_call(sys_prompt, user_msg, temperature=0.7, max_tokens=500)

        try:
            parsed = json.loads(content.strip().removeprefix("```json").removesuffix("```").strip())
        except json.JSONDecodeError:
            parsed = {"raw": content[:200]}

        ar = AnalystResult(
            seat=seat, opinion=content, parsed=parsed,
            tokens_in=usage.get("prompt_tokens", 0),
            tokens_out=usage.get("completion_tokens", 0),
            latency_s=latency,
        )
        result.analysts.append(ar)
        result.total_tokens_in += ar.tokens_in
        result.total_tokens_out += ar.tokens_out
        opinions_text.append(f"[{seat}] {content[:250]}")

        if verbose:
            bias = parsed.get("bias", "?")
            conf = parsed.get("confidence", "?")
            print(f"  {seat:12s} → bias={bias:8s}  conf={str(conf):4s}  {ar.tokens_in}+{ar.tokens_out}t  {latency:.1f}s")

    # Phase 2: Lead decision
    lead_user = (
        f"{agenda}\n\n"
        f"ข้อเสนอจากลูกทีมทั้ง 4 คน:\n"
        + "\n".join(opinions_text)
        + "\n\nเคาะออเดอร์ (JSON เท่านั้น — action/market/side/size_pct/sl_pct/tp_pct/rationale)"
    )
    lead_content, lead_usage, lead_latency = llm_call(
        _DEFAULT_LEAD_PROMPT, lead_user, temperature=0.4, max_tokens=400)
    result.lead_decision = lead_content
    try:
        result.lead_parsed = json.loads(lead_content.strip().removeprefix("```json").removesuffix("```").strip())
    except json.JSONDecodeError:
        result.lead_parsed = {"raw": lead_content[:200]}

    result.total_tokens_in += lead_usage.get("prompt_tokens", 0)
    result.total_tokens_out += lead_usage.get("completion_tokens", 0)
    result.total_latency = time.monotonic() - t0

    # Cost: deepseek-v4-flash pricing (opencode-go)
    result.total_cost = (
        result.total_tokens_in * 0.14 / 1_000_000
        + result.total_tokens_out * 0.28 / 1_000_000
    )

    if verbose:
        action = result.lead_parsed.get("action", "?")
        market = result.lead_parsed.get("market", "?")
        side = result.lead_parsed.get("side", "?")
        print(f"\n  LEAD DECISION → {action} {side.upper()} {market}")
        print(f"  Total: {result.total_tokens_in:,}+{result.total_tokens_out:,} tokens"
              f" · ${result.total_cost:.4f} · {result.total_latency:.1f}s")

    return result


# ── Run ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("MULTI-AGENT TRADE DESK — PROTOTYPE MEETING")
    print("=" * 60)

    agenda = (
        "วาระประชุม: CPI สหรัฐคืนนี้ + JGB 10Y ทะลุ 2.8% ดึงเงินกลับญี่ปุ่น\n"
        "เลนส์ประจำรอบ: contrarian — ถ้ากระแสหลักผิด หลักฐานแรกคืออะไร?\n"
        "ตลาดที่สนใจ: BTC/USD, ETH/USD, GOLD"
    )
    print(f"\n📋 Agenda: {agenda}")

    result = run_meeting(agenda)

    print(f"\n{'─' * 40}")
    print("FULL LEAD DECISION:")
    print(json.dumps(result.lead_parsed, ensure_ascii=False, indent=2))
    print(f"\n📊 FINAL: {result.total_tokens_in:,}→{result.total_tokens_out:,} tokens"
          f"  ·  ${result.total_cost:.4f}  ·  {result.total_latency:.1f}s")
