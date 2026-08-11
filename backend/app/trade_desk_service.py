"""Trade desk service — schema + models (multi-agent-trade-desk plan, ticket 04).

Single-team multi-agent architecture (one deepseek LLM, five personas):
  Lead (หัวหน้าทีม) sets agenda, hears analysts, decides orders, adjusts constitution.
  4 Analysts (trend / technical / macro / contrarian) each get a tailored context
  slice and submit their opinion.  The lead then issues a consensus order or dissent.

Tables live in the prod Supabase (the same Postgres pool as everything else).
Tests run against SQLite via the test fixtures — no separate migration step needed
for local runs; Vercel/CI uses Postgres directly.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Session, declarative_base, relationship

from app.database import Base  # shared declarative base

# ── Constants (mirror the reference's config shape) ──────────────────────────

DEFAULT_CAPITAL = 10_000.0
DAILY_CAP_DEFAULT = 4
TURN_INTERVAL_HOURS = 4
WEEKLY_TARGET_PCT = 1.5
RISK_BAND = (2.0, 10.0)  # size_pct min / max
SL_DEFAULT = 5.0          # % stop-loss
TP_DEFAULT = 10.0         # % take-profit

# ── ORM Models ───────────────────────────────────────────────────────────────

class TradeTeam(Base):
    __tablename__ = "trade_teams"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code = Column(String(16), unique=True, nullable=False, index=True)  # "DEEPSEEK"
    name_th = Column(String(128), nullable=False)
    name_en = Column(String(128), nullable=False)
    status = Column(String(16), default="active")  # active | paused | inactive

    # Portfolio
    capital = Column(Float, default=DEFAULT_CAPITAL)
    balance = Column(Float, default=DEFAULT_CAPITAL)  # cash unallocated
    equity = Column(Float, default=DEFAULT_CAPITAL)

    # Turn config
    turn_interval_hours = Column(Integer, default=TURN_INTERVAL_HOURS)
    next_turn_at = Column(DateTime(timezone=True), nullable=True)

    # Targets
    weekly_target_pct = Column(Float, default=WEEKLY_TARGET_PCT)
    weekly_kpi_pct = Column(Float, default=WEEKLY_TARGET_PCT)
    monthly_floor_pct = Column(Float, default=5.0)
    monthly_stretch_pct = Column(Float, default=20.0)

    # LLM config (one team, one real model — but we store it for future multi-model)
    lead_model = Column(String(64), default="deepseek-v4-flash")
    lead_system_prompt = Column(Text, nullable=True)      # constitution — lead adjusts this
    analyst_prompts = Column(JSON, nullable=True)           # {trend: sys_prompt, technical: ..., macro: ..., contrarian: ...}

    # Stats
    turns_today = Column(Integer, default=0)
    cost_today_usd = Column(Float, default=0.0)
    cost_total_usd = Column(Float, default=0.0)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    turns = relationship("TradeTurn", back_populates="team", lazy="dynamic")
    positions = relationship("TradePosition", back_populates="team", lazy="dynamic")


class TradeTurn(Base):
    """One complete turn cycle: lead sets agenda → analysts submit → lead decides."""

    __tablename__ = "trade_turns"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id = Column(String(36), ForeignKey("trade_teams.id"), nullable=False, index=True)

    # Meeting phase
    agenda = Column(Text, nullable=True)       # lead's agenda / lens
    constitution_snapshot = Column(JSON, nullable=True)  # constitution at turn time

    # Analyst submissions (JSON array: [{seat, opinion, key_signals, tokens_in, tokens_out}])
    analyst_opinions = Column(JSON, nullable=True)

    # Lead decision
    lead_decision = Column(JSON, nullable=True)   # {action, market, side, size_pct, sl_pct, tp_pct, rationale}
    consensus = Column(String(16), nullable=True)  # "consensus" | "dissent" | "hold"
    dissent_note = Column(Text, nullable=True)

    # Token accounting
    tokens_in = Column(Integer, default=0)
    tokens_out = Column(Integer, default=0)
    cost_usd = Column(Float, default=0.0)

    # Turn lifecycle
    trigger = Column(String(24), default="scheduled")  # scheduled | manual | news | model | calendar
    started_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    finished_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    team = relationship("TradeTeam", back_populates="turns")
    positions = relationship("TradePosition", back_populates="turn", lazy="dynamic")


class TradePosition(Base):
    """Open or closed trade position — opened by a turn, possibly modified by AI."""

    __tablename__ = "trade_positions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id = Column(String(36), ForeignKey("trade_teams.id"), nullable=False, index=True)
    turn_id = Column(String(36), ForeignKey("trade_turns.id"), nullable=True, index=True)

    symbol = Column(String(32), nullable=False)
    side = Column(String(8), nullable=False)        # long | short
    size_pct = Column(Float, nullable=False)         # % of capital
    entry_price = Column(Float, nullable=False)

    # Order parameters (can be modified by AI autonomously)
    sl_pct = Column(Float, nullable=True)            # stop-loss % from entry
    tp_pct = Column(Float, nullable=True)            # take-profit % from entry
    sl_price = Column(Float, nullable=True)          # resolved SL price
    tp_price = Column(Float, nullable=True)          # resolved TP price

    status = Column(String(16), default="open")      # open | closed
    closed_by = Column(String(24), nullable=True)     # sl | tp | signal | liq | admin | fired | manual
    close_price = Column(Float, nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)

    realized_pnl = Column(Float, default=0.0)
    live_pnl = Column(Float, default=0.0)            # unrealized P&L (mark - entry) * side

    opened_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    team = relationship("TradeTeam", back_populates="positions")
    turn = relationship("TradeTurn", back_populates="positions")


class TradeKnowledge(Base):
    """Knowledge base entry — lessons from closed positions.

    - Per-team (team_id NOT NULL): take-profit wins — team's own playbook.
    - Central  (team_id IS NULL): stop-loss losses — all teams learn from mistakes.
    """

    __tablename__ = "trade_knowledge"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id = Column(String(36), ForeignKey("trade_teams.id"), nullable=True, index=True)
    turn_id = Column(String(36), ForeignKey("trade_turns.id"), nullable=True)

    entry_type = Column(String(8), nullable=False)   # win | loss
    symbol = Column(String(32), nullable=False)
    side = Column(String(8), nullable=False)
    entry_price = Column(Float, nullable=False)
    exit_price = Column(Float, nullable=False)
    pnl_pct = Column(Float, nullable=False)

    lesson_summary = Column(Text, nullable=True)      # AI-generated summary (Thai)
    key_signals = Column(JSON, nullable=True)          # Snapshot of signals at entry

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


# ── Seed ─────────────────────────────────────────────────────────────────────

def seed_team(db: Session) -> TradeTeam:
    """Create the single DEEPSEEK team if it doesn't exist."""
    team = db.query(TradeTeam).filter(TradeTeam.code == "DEEPSEEK").first()
    if team is None:
        team = TradeTeam(
            code="DEEPSEEK",
            name_th="ทีม DeepSeek · เทรดเดอร์ AI",
            name_en="Team DeepSeek Trader",
            lead_system_prompt=_DEFAULT_LEAD_PROMPT,
            analyst_prompts={
                "trend": _DEFAULT_TREND_PROMPT,
                "technical": _DEFAULT_TECHNICAL_PROMPT,
                "macro": _DEFAULT_MACRO_PROMPT,
                "contrarian": _DEFAULT_CONTRARIAN_PROMPT,
            },
        )
        db.add(team)
        db.commit()
        db.refresh(team)
    return team


# ── Default Prompts (will be iterated in ticket 05 prototype) ────────────────

_DEFAULT_LEAD_PROMPT = (
    "คุณเป็นหัวหน้าทีมเทรด AI (Team DeepSeek Trader) บริหารพอร์ต $10,000 "
    "เป้าหมายกำไรเดือนละ 5-20% กรอบเวลา 1-7 วัน ความเสี่ยงต่อไม้ 2-10% ของพอร์ต\n\n"
    "บทบาทของคุณ:\n"
    "1. ประเมินสถานการณ์ตลาดจากข้อมูล bond-crisis — ตั้งวาระประชุม (lens)\n"
    "2. ฟังข้อเสนอจากลูกทีม 4 คน (trend, technical, macro, contrarian)\n"
    "3. ตัดสินใจ: open (long/short), close, หรือ hold — พร้อม size_pct, SL, TP\n"
    "4. ประเมินผลงานลูกทีม — ให้คะแนน ปรับคำแนะนำ\n"
    "5. ปรับธรรมนูญทีม (constitution) เมื่อเจอ pattern ที่ควรปรับ\n\n"
    "ตอบ JSON เท่านั้น: "
    '{"action": "open|close|hold", "market": "BTC-USD", '
    '"side": "long|short", "size_pct": 5, "sl_pct": 5, "tp_pct": 10, '
    '"rationale": "เหตุผลสั้นๆ"}'
)

_DEFAULT_TREND_PROMPT = (
    "คุณเป็นนักวิเคราะห์สายเทรนด์/โมเมนตัม — ดู MA, โมเมนตัม, คะแนนโมเดล, "
    "เทรนด์ระยะสั้น-กลาง\n"
    "เสนอมุมมอง: เข้าเมื่อเทรนด์ชัด (ราคาเหนือ MA + โมเมนตัม + คะแนนโมเดล ≥60) "
    "ตัดขาดทุนไวเมื่อเทรนด์พัง\n\n"
    "ตอบ JSON: "
    '{"market": "BTC-USD", "bias": "bullish|bearish|neutral", '
    '"confidence": 0-100, "key_signals": ["..."]}'
)

_DEFAULT_TECHNICAL_PROMPT = (
    "คุณเป็นนักวิเคราะห์เทคนิคอล — ดูแนวรับ/ต้าน, รูปแบบแท่ง, volume, "
    "divergence, RSI, MACD\n"
    "เสนอมุมมอง: จุดเข้าที่มี RR ดี, จุดที่ควรหลีกเลี่ยง, โซน overbought/oversold\n\n"
    "ตอบ JSON: "
    '{"market": "BTC-USD", "bias": "bullish|bearish|neutral", '
    '"confidence": 0-100, "key_levels": {"support": N, "resistance": N}}'
)

_DEFAULT_MACRO_PROMPT = (
    "คุณเป็นนักวิเคราะห์มหภาค — ดู FRED (ยิลด์, เงินเฟ้อ, แรงงาน), จุดเปลี่ยนนโยบาย, "
    "flow of funds, cross-asset correlation\n"
    "เสนอมุมมอง: macro backdrop เอื้อต่อ risk-on หรือ risk-off, "
    "สินทรัพย์ไหนได้/เสียประโยชน์\n\n"
    "ตอบ JSON: "
    '{"market": "BTC-USD", "bias": "bullish|bearish|neutral", '
    '"confidence": 0-100, "macro_drivers": ["..."]}'
)

_DEFAULT_CONTRARIAN_PROMPT = (
    "คุณเป็นนักวิเคราะห์สวนฝูง — ดู extreme positioning, sentiment divergence, "
    "ข่าว impact, consensus fragility\n"
    "เสนอมุมมอง: ถ้ากระแสหลักผิด หลักฐานแรกคืออะไร? "
    "โซนที่ตลาดน่าจะกลับตัว\n\n"
    "ตอบ JSON: "
    '{"market": "BTC-USD", "bias": "bullish|bearish|neutral", '
    '"confidence": 0-100, "contrarian_signal": "..."}'
)


# ── Turn Engine ──────────────────────────────────────────────────────────────

import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.boardroom_service import llm_call

# Cost: deepseek-v4-flash via opencode-go (measured 2026-08-12)
COST_IN_PER_TOKEN = 0.14 / 1_000_000
COST_OUT_PER_TOKEN = 0.28 / 1_000_000


def _run_analyst(seat: str, system_prompt: str, user_prompt: str) -> dict:
    """Single analyst LLM call. Returns {seat, content, parsed, tokens_in, tokens_out, latency}."""
    content, usage, lat = llm_call(system_prompt, user_prompt, temperature=0.7, max_tokens=500)
    try:
        parsed = json.loads(content.strip().removeprefix("```json").removesuffix("```").strip())
    except json.JSONDecodeError:
        parsed = {"raw": content[:200]}
    return {
        "seat": seat, "content": content, "parsed": parsed,
        "tokens_in": usage.get("prompt_tokens", 0),
        "tokens_out": usage.get("completion_tokens", 0),
        "latency_s": round(lat, 2),
    }


def _build_base_context(db: Session) -> str:
    """Gather bond-crisis data shared across all analysts."""
    parts = ["=== BOND-CRISIS SNAPSHOT ===\n"]
    try:
        from app import macro_service
        dash = macro_service.build_dashboard()
        parts.append("--- ข้อมูลมหภาค ---")
        for sec in dash.get("sections", [])[:2]:
            for item in sec.get("items", [])[:5]:
                sid = item.get("series_id", "")[:22]
                val = item.get("value")
                if val is not None:
                    parts.append(f"  {sid}: {val}")
    except Exception:
        parts.append("  (macro unavailable)")
    try:
        from app import model_service
        models = model_service.build_models()
        parts.append("--- โมเดลทำกำไร ---")
        for m in models.get("models", [])[:4]:
            parts.append(f"  {m['model_id']}: {m.get('score', '?')}/100 ({m.get('status', '?')})")
    except Exception:
        pass
    try:
        from app.fear_greed_service import fetch_cnn
        fg = fetch_cnn()
        if fg:
            parts.append("--- อารมณ์ตลาด ---")
            parts.append(f"  CNN FG: {fg.get('score')} ({fg.get('rating')})")
            c = fg.get("crypto_fear_greed")
            if c:
                parts.append(f"  Crypto FG: {c.get('score')} ({c.get('rating')})")
    except Exception:
        pass
    try:
        from app import news_service
        rows = db.query(news_service.NewsItem).order_by(
            news_service.NewsItem.published_at.desc()).limit(2).all()
        if rows:
            parts.append("--- ข่าวล่าสุด ---")
            for n in rows:
                parts.append(f"  • {n.title_th or n.title}")
    except Exception:
        pass
    return "\n".join(parts)


def _build_seat_context(base: str, seat: str, agenda: str, db: Session) -> str:
    """Tailor context for one analyst seat."""
    ctx = [f"วาระประชุม: {agenda}", "", base]
    try:
        from app import hyperliquid_service
        syms = list(set(re.findall(r'\b([A-Z]{2,8}(?:-USD)?)\b', agenda.upper())))
        prices = hyperliquid_service.get_prices_for_symbols(syms)
        if prices:
            ctx.append("--- ราคาปัจจุบัน (Hyperliquid) ---")
            for sym, p in prices.items():
                if p:
                    ctx.append(f"  {sym}: ${p.get('mark_price', '?')} "
                               f"({p.get('change_24h_pct', '?')}%)")
    except Exception:
        pass
    lens = {
        "trend": "เลนส์: เทรนด์/โมเมนตัม — MA, โมเมนตัม, คะแนนโมเดล ≥60",
        "technical": "เลนส์: เทคนิคอล — แนวรับ/ต้าน, RSI, MACD, volume",
        "macro": "เลนส์: มหภาค — yield curve, เงินเฟ้อ, Fed policy",
        "contrarian": "เลนส์: contrarian — divergence, extreme positioning",
    }
    ctx.append(f"\n{lens.get(seat, '')}\nตอบ JSON: {{market, bias, confidence, key_signals}}")
    return "\n".join(ctx)


def _parse_lead_json(raw: str) -> dict:
    """Extract JSON from lead response."""
    try:
        return json.loads(raw.strip().removeprefix("```json").removesuffix("```").strip())
    except json.JSONDecodeError:
        pass
    m = re.search(r'\{[^{}]*"action"[^{}]*\}', raw)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            pass
    return {"action": "hold", "rationale": raw[:200]}


def run_turn(db: Session, team: TradeTeam, trigger: str = "manual",
             agenda: str | None = None) -> TradeTurn:
    """Execute one complete multi-agent turn for a team."""
    if agenda is None:
        agenda = ("ประเมินสถานการณ์ตลาด — CPI + JGB + FedWatch "
                  "เลนส์ contrarian: ถ้ากระแสหลักผิด หลักฐานแรกคืออะไร?")

    base_ctx = _build_base_context(db)
    specs = [
        ("trend", _DEFAULT_TREND_PROMPT),
        ("technical", _DEFAULT_TECHNICAL_PROMPT),
        ("macro", _DEFAULT_MACRO_PROMPT),
        ("contrarian", _DEFAULT_CONTRARIAN_PROMPT),
    ]
    results = []
    tokens_in = 0
    tokens_out = 0

    with ThreadPoolExecutor(max_workers=4) as pool:
        futs = {s: pool.submit(_run_analyst, s, sp, _build_seat_context(base_ctx, s, agenda, db))
                for s, sp in specs}
        for seat, fut in futs.items():
            r = fut.result()
            results.append(r)
            tokens_in += r["tokens_in"]
            tokens_out += r["tokens_out"]

    opinions = "\n".join(
        f"[{r['seat']}] bias={r['parsed'].get('bias', '?')} "
        f"conf={r['parsed'].get('confidence', '?')}"
        for r in results)
    lead_user = (f"{agenda}\n\nข้อเสนอลูกทีม:\n{opinions}\n\n"
                 "เคาะออเดอร์ (JSON: action, market, side, size_pct, sl_pct, tp_pct, rationale)")
    lead_content, lead_usage, _ = llm_call(
        team.lead_system_prompt or _DEFAULT_LEAD_PROMPT,
        lead_user, temperature=0.4, max_tokens=400)
    lead_parsed = _parse_lead_json(lead_content)
    tokens_in += lead_usage.get("prompt_tokens", 0)
    tokens_out += lead_usage.get("completion_tokens", 0)
    cost = tokens_in * COST_IN_PER_TOKEN + tokens_out * COST_OUT_PER_TOKEN

    biases = [r["parsed"].get("bias") for r in results if r["parsed"].get("bias")]
    unique = len(set(biases))
    consensus = "consensus" if unique <= 1 else "dissent" if unique >= 3 else "split"

    turn = TradeTurn(
        team_id=team.id, agenda=agenda,
        constitution_snapshot={"lead": (team.lead_system_prompt or "")[:200]},
        analyst_opinions=[{
            "seat": r["seat"], "bias": r["parsed"].get("bias"),
            "confidence": r["parsed"].get("confidence"),
            "tokens_in": r["tokens_in"], "tokens_out": r["tokens_out"],
        } for r in results],
        lead_decision=lead_parsed, consensus=consensus, trigger=trigger,
        tokens_in=tokens_in, tokens_out=tokens_out, cost_usd=round(cost, 6),
        started_at=datetime.now(timezone.utc),
        finished_at=datetime.now(timezone.utc),
    )
    db.add(turn)
    team.turns_today = (team.turns_today or 0) + 1
    team.cost_today_usd = (team.cost_today_usd or 0) + cost
    team.cost_total_usd = (team.cost_total_usd or 0) + cost
    team.next_turn_at = datetime.now(timezone.utc) + timedelta(hours=team.turn_interval_hours or 4)
    db.commit()
    db.refresh(turn)
    return turn


def run_due_turns(db: Session) -> list[dict]:
    """Check DEEPSEEK team — run if due (called by cron)."""
    team = db.query(TradeTeam).filter(
        TradeTeam.code == "DEEPSEEK", TradeTeam.status == "active").first()
    if team is None:
        return [{"skipped": "no_team"}]
    now = datetime.now(timezone.utc)
    if team.next_turn_at and team.next_turn_at > now:
        return [{"skipped": "not_due", "next": team.next_turn_at.isoformat()}]
    today_count = db.query(TradeTurn).filter(
        TradeTurn.team_id == team.id,
        TradeTurn.started_at >= now.date().isoformat()).count()
    if today_count >= DAILY_CAP_DEFAULT:
        return [{"skipped": "daily_cap"}]
    turn = run_turn(db, team, trigger="scheduled")
    return [{"team": team.code, "turn_id": turn.id, "action": turn.lead_decision.get("action")}]


def get_state(db: Session) -> dict:
    """Full trade desk state for the frontend."""
    team = db.query(TradeTeam).filter(TradeTeam.code == "DEEPSEEK").first()
    if team is None:
        return {"teams": [], "positions": {"open": [], "closed": []}, "turns": [], "updated_at": None}
    pos_q = db.query(TradePosition).filter(
        TradePosition.team_id == team.id).order_by(TradePosition.opened_at.desc())
    open_pos = [p for p in pos_q if p.status == "open"]
    closed_pos = [p for p in pos_q if p.status == "closed"][:20]
    turns = db.query(TradeTurn).filter(
        TradeTurn.team_id == team.id).order_by(TradeTurn.started_at.desc()).limit(10).all()
    return {
        "teams": [{
            "code": team.code, "name_th": team.name_th, "name_en": team.name_en,
            "status": team.status, "capital": team.capital, "balance": team.balance,
            "equity": team.equity,
            "pnl_pct": round((team.equity - team.capital) / team.capital * 100, 2) if team.capital else 0,
            "margin_used": sum((p.size_pct or 0) / 100 * team.capital for p in open_pos),
            "weekly_target_pct": team.weekly_target_pct,
            "weekly_kpi_pct": team.weekly_kpi_pct,
            "next_turn_at": team.next_turn_at.isoformat() if team.next_turn_at else None,
            "turns_today": team.turns_today,
            "cost_today_usd": team.cost_today_usd,
            "cost_total_usd": team.cost_total_usd,
        }],
        "positions": {
            "open": [{
                "id": p.id, "symbol": p.symbol, "side": p.side,
                "size_pct": p.size_pct, "entry_price": p.entry_price,
                "mark_price": None, "sl_pct": p.sl_pct, "tp_pct": p.tp_pct,
                "live_pnl": p.live_pnl,
                "opened_at": p.opened_at.isoformat() if p.opened_at else None,
            } for p in open_pos],
            "closed": [{
                "id": p.id, "symbol": p.symbol, "side": p.side,
                "entry_price": p.entry_price, "close_price": p.close_price,
                "realized_pnl": p.realized_pnl, "closed_by": p.closed_by,
                "closed_at": p.closed_at.isoformat() if p.closed_at else None,
            } for p in closed_pos],
        },
        "turns": [{
            "id": t.id, "agenda": t.agenda, "consensus": t.consensus,
            "lead_decision": t.lead_decision, "tokens_in": t.tokens_in,
            "tokens_out": t.tokens_out, "cost_usd": t.cost_usd,
            "trigger": t.trigger,
            "started_at": t.started_at.isoformat() if t.started_at else None,
        } for t in turns],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
