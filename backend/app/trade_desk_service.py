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

    # MANDATE (ลู่ทีม) — central-mandated, immutable by lead
    mandate = Column(String(64), nullable=True)          # "contrarian" | "trend" | etc
    team_directive = Column(Text, nullable=True)          # weekly target set by lead (หัวหน้าตั้ง)
    team_directive_at = Column(DateTime(timezone=True), nullable=True)
    gen = Column(Integer, default=1)                     # team generation/version
    paused = Column(Integer, default=0)                  # 0=active, 1=paused
    master_on = Column(Integer, default=1)               # master switch (11.5): 1=on, 0=off — off stops NEW turns, SL/TP+settle keep working

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
    size_pct = Column(Float, nullable=False)         # % of capital (position sizing)
    entry_price = Column(Float, nullable=False)
    quantity = Column(Float, nullable=True)          # shares held (fractional, paper)
    reserved_cash = Column(Float, nullable=True)     # cash locked = qty × entry (long cost / short full notional)

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


class TradeConstitution(Base):
    """Versioned team constitution (ธรรมนูญทีม) — written by lead, immutable once created."""

    __tablename__ = "trade_constitutions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id = Column(String(36), ForeignKey("trade_teams.id"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class TradeCoachLog(Base):
    """Coach / adjustment log (สั่งโค้ช / ปรับตัวตน) — lead managing analyst behavior."""

    __tablename__ = "trade_coach_log"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id = Column(String(36), ForeignKey("trade_teams.id"), nullable=False, index=True)
    analyst_seat = Column(String(32), nullable=False)
    log_type = Column(String(16), nullable=False)   # "coach" | "adjust"
    content = Column(Text, nullable=False)
    delivered = Column(Integer, default=0)           # 0=pending, 1=delivered
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class TradePendingOrder(Base):
    """Pending LIMIT/STOP orders — placed by lead, executed when price condition met."""

    __tablename__ = "trade_pending_orders"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id = Column(String(36), ForeignKey("trade_teams.id"), nullable=False, index=True)
    symbol = Column(String(32), nullable=False)
    side = Column(String(8), nullable=False)
    order_type = Column(String(8), nullable=False)   # "LIMIT" | "STOP"
    target_price = Column(Float, nullable=False)
    size_notional = Column(Float, nullable=False)
    margin_reserved = Column(Float, default=0)
    sl_price = Column(Float, nullable=True)
    tp_price = Column(Float, nullable=True)
    status = Column(String(16), default="pending")   # pending | filled | cancelled
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class TradeSnapshot(Base):
    """Periodic equity snapshot — used to compute MTD (equity at month start)."""

    __tablename__ = "trade_snapshots"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id = Column(String(36), ForeignKey("trade_teams.id"), nullable=False, index=True)
    equity = Column(Float, nullable=False)
    snapped_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)


class TradeSummary(Base):
    """AI-written summary / weekly target record.

    UNIQUE (team_id, kind, period) is the idempotence guard — the job tick
    runs 144x/day; without it each summary would cost 144 LLM calls/day.
    kind: daily | monthly | weekly_target · period: "2026-08-12" | "2026-08" | "2026-W33"
    """

    __tablename__ = "trade_summaries"
    __table_args__ = (
        UniqueConstraint("team_id", "kind", "period", name="uq_trade_summaries_period"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id = Column(String(36), ForeignKey("trade_teams.id"), nullable=False, index=True)
    kind = Column(String(16), nullable=False)
    period = Column(String(16), nullable=False)
    summary_th = Column(Text, nullable=False)
    tokens_in = Column(Integer, default=0)
    tokens_out = Column(Integer, default=0)
    cost_usd = Column(Float, default=0.0)
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
                "news": _DEFAULT_NEWS_PROMPT,
                "quant": _DEFAULT_QUANT_PROMPT,
            },
        )
        db.add(team)
        db.commit()
        db.refresh(team)
    return team


# ── Default Prompts (will be iterated in ticket 05 prototype) ────────────────

_DEFAULT_LEAD_PROMPT = (
    "คุณเป็นหัวหน้าทีมเทรด AI (Team DeepSeek Trader) บริหารพอร์ต $10,000 เทรด "
    "หุ้นเงินสด S&P 500 — ไม่มี leverage ไม่มี funding rate ไม่มีราคา liquidation\n"
    "เป้าหมายกำไรเดือนละ 5-20% กรอบเวลา 1-7 วัน ความเสี่ยงต่อไม้ 2-10% ของพอร์ต\n\n"
    "บทบาทของคุณ:\n"
    "1. ประเมินสถานการณ์ตลาดจากข้อมูล bond-crisis — ตั้งวาระประชุม (lens)\n"
    "2. ฟังข้อเสนอจากลูกทีม 6 คน (trend, technical, macro, contrarian, news, quant)\n"
    "3. ตัดสินใจ: open (long/short), close, หรือ hold — พร้อม size_pct, SL, TP\n"
    "   หมายเหตุ: short ต้องสำรองเงินสดเต็มจำนวน (เท่ากับขนาดไม้) — ไม่มี margin\n"
    "4. ประเมินผลงานลูกทีม — ให้คะแนน ปรับคำแนะนำ\n"
    "5. ปรับธรรมนูญทีม (constitution) เมื่อเจอ pattern ที่ควรปรับ\n\n"
    "ตอบ JSON เท่านั้น: "
    '{"action": "open|close|hold", "market": "AAPL", '
    '"side": "long|short", "size_pct": 5, "sl_pct": 5, "tp_pct": 10, '
    '"order_type": "MARKET|LIMIT|STOP", "trigger_price": 200, '
    '"rationale": "เหตุผลสั้นๆ"}\n'
    "market ต้องเป็น ticker หุ้นรายตัวใน S&P 500 (เช่น AAPL, MSFT, NVDA, JPM) เท่านั้น\n"
    "ห้ามใช้ดัชนีหรือ ETF: SPX, ^GSPC, S&P-500, QQQ, SPY, DIA, IWM ล้วนเป็นสิ่งที่เทรดไม่ได้\n"
    "เลือกจากรายชื่อหุ้นใน snapshot ตลาดหุ้นด้านบน (Top gainers/losers/high volume) — "
    "มีราคาและปริมาตรจริงทุกตัว\n"
    "order_type: MARKET = เปิดทันที · LIMIT = รอราคาแตะ trigger_price แล้วเปิด (buy long: ราคาต่ำกว่า trigger · sell short: สูงกว่า) · "
    "STOP = รอราคาแตะ trigger_price แบบทะลุ (buy long: ราคาสูงกว่า · sell short: ต่ำกว่า) · "
    "ไม่ระบุ = MARKET"
)

_DEFAULT_TREND_PROMPT = (
    "คุณเป็นนักวิเคราะห์สายเทรนด์/โมเมนตัม — ดู MA (SMA20/SMA50), โมเมนตัม, คะแนนโมเดล, "
    "เทรนด์ระยะสั้น-กลาง จากสัญญาณ TA จริง (คำนวณจากแท่งรายวัน)\n"
    "เสนอมุมมอง: เข้าเมื่อเทรนด์ชัด (ราคาเหนือ MA + โมเมนตัม + คะแนนโมเดล ≥60) "
    "ตัดขาดทุนไวเมื่อเทรนด์พัง\n\n"
    "ตอบ JSON: "
    '{"market": "AAPL", "bias": "bullish|bearish|neutral", '
    '"confidence": 0-100, "key_signals": ["..."]}'
)

_DEFAULT_TECHNICAL_PROMPT = (
    "คุณเป็นนักวิเคราะห์เทคนิคอล — ดูแนวรับ/ต้าน, รูปแบบแท่ง, volume, "
    "divergence, RSI, MACD จากแท่งรายวันจริง\n"
    "เสนอมุมมอง: จุดเข้าที่มี RR ดี, จุดที่ควรหลีกเลี่ยง, โซน overbought/oversold\n\n"
    "ตอบ JSON: "
    '{"market": "AAPL", "bias": "bullish|bearish|neutral", '
    '"confidence": 0-100, "key_levels": {"support": N, "resistance": N}}'
)

_DEFAULT_MACRO_PROMPT = (
    "คุณเป็นนักวิเคราะห์มหภาค — ดู FRED (ยิลด์, เงินเฟ้อ, แรงงาน), จุดเปลี่ยนนโยบาย, "
    "flow of funds, cross-asset correlation\n"
    "เสนอมุมมอง: macro backdrop เอื้อต่อ risk-on หรือ risk-off, "
    "เซกเตอร์/หุ้นไหนได้หรือเสียประโยชน์\n\n"
    "ตอบ JSON: "
    '{"market": "AAPL", "bias": "bullish|bearish|neutral", '
    '"confidence": 0-100, "macro_drivers": ["..."]}'
)

_DEFAULT_CONTRARIAN_PROMPT = (
    "คุณเป็นนักวิเคราะห์สวนฝูง — ดู extreme positioning, sentiment divergence, "
    "ข่าว impact, consensus fragility\n"
    "เสนอมุมมอง: ถ้ากระแสหลักผิด หลักฐานแรกคืออะไร? "
    "โซนที่ตลาดน่าจะกลับตัว\n\n"
    "ตอบ JSON: "
    '{"market": "AAPL", "bias": "bullish|bearish|neutral", '
    '"confidence": 0-100, "contrarian_signal": "..."}'
)

# --- Prompts added by ticket 02 (6 analysts) ---
_DEFAULT_NEWS_PROMPT = (
    "คุณเป็นนักวิเคราะห์สายข่าว — รายงานข่าวสำคัญ+sentiment พร้อม invalidation price "
    "ที่คำนวณจาก ATR14 (รายวัน)*2.0-2.5 ทุกตัว — ต้องมีทั้ง catalyst และ invalidation price "
    "เป็นตัวเลขชัดเจน อ้างอิงแหล่งข่าวทุกการวิเคราะห์\n"
    "เสนอมุมมอง: สรุป catalyst + sentiment + invalidation price\n\n"
    "ตอบ JSON: "
    '{"market": "AAPL", "bias": "bullish|bearish|neutral", '
    '"confidence": 0-100, "catalyst": "...", "invalidation_price": N}'
)

_DEFAULT_QUANT_PROMPT = (
    "คุณเป็นนักวิเคราะห์ควอนต์/ข้อมูล — จับ volume/valuation divergence เทียบ momentum "
    "ระบุ crowding risk + จุดกลับตัวแบบตัวเลข (ใช้ market_cap/PE จากข้อมูลจริง)\n"
    "ทุกการวิเคราะห์ต้องเสนอ invalidation ราคาชัดเจน (ATR14*1.5-2.0) "
    "และอ้างอิงข้อมูลตลาดอย่างน้อย 2 จุด\n"
    "เสนอมุมมอง: volume/valuation divergence + crowding risk\n\n"
    "ตอบ JSON: "
    '{"market": "AAPL", "bias": "bullish|bearish|neutral", '
    '"confidence": 0-100, "volume_divergence": "low|med|high", '
    '"valuation_note": "...", "squeeze_risk": "low|med|high"}'
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


def _stock_market_snapshot() -> str:
    """Top gainers/losers + volume leaders from the REAL S&P 500 universe
    (cached build_markets). Without this the lead/analysts see zero stocks
    and the LLM defaults to famous non-universe tickers (BTC-USD)."""
    try:
        from app import stock_universe_service
        data = stock_universe_service.build_markets()
        markets = data.get("markets", []) if isinstance(data, dict) else data
        if not markets:
            return ""
        by_chg = sorted(
            markets,
            key=lambda m: (m.get("change_24h_pct") is None, m.get("change_24h_pct") or 0),
            reverse=True,
        )
        by_vol = sorted(markets, key=lambda m: m.get("dollar_volume") or 0, reverse=True)[:5]
        lines = ["--- ตลาดหุ้น S&P 500 (ราคาจริง, อัปเดตทุก 10 นาที) ---"]
        lines.append("  Top gainers 24h: " + ", ".join(
            f"{m['symbol']} ${m.get('price', '?')} ({m.get('change_24h_pct', '?')}%)"
            for m in by_chg[:5]))
        lines.append("  Top losers 24h: " + ", ".join(
            f"{m['symbol']} ${m.get('price', '?')} ({m.get('change_24h_pct', '?')}%)"
            for m in by_chg[-5:]))
        lines.append("  High volume: " + ", ".join(
            f"{m['symbol']} (${(m.get('dollar_volume') or 0) / 1e9:.1f}B)"
            for m in by_vol))
        return "\n".join(lines)
    except Exception:
        return ""


def _build_base_context(db: Session, team: TradeTeam | None = None) -> str:
    """Gather bond-crisis data shared across all analysts."""
    parts = ["=== BOND-CRISIS SNAPSHOT ===\n"]
    # คำสั่งโต๊ะกลาง (directive) + ลู่ทีม (mandate) — ต้องให้ AI เห็นจริง
    if team is not None:
        if getattr(team, "team_directive", None):
            parts.append("--- คำสั่งโต๊ะกลาง (directive — user ตั้ง, ต้องทำตาม) ---")
            parts.append(f"  📌 {team.team_directive}")
        if getattr(team, "mandate", None):
            parts.append("--- ลู่ทีม (mandate — กำหนดจากส่วนกลาง) ---")
            parts.append(f"  {team.mandate}")
        parts.append("")
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
    snap = _stock_market_snapshot()
    if snap:
        parts.append(snap)
    return "\n".join(parts)


def _build_seat_context(base: str, seat: str, agenda: str, db: Session) -> str:
    """Tailor context for one analyst seat."""
    ctx = [f"วาระประชุม: {agenda}", "", base]
    try:
        from app import stock_universe_service
        # Symbols explicitly named in the agenda get per-symbol detail, but the
        # base context already carries the full S&P 500 snapshot (top movers /
        # volume) so analysts always see real stocks to pick from.
        syms = list(set(re.findall(r"\b([A-Z]{1,5})\b", agenda.upper())))
        if syms:
            prices = stock_universe_service.get_prices_for_symbols(syms)
            if prices:
                ctx.append("--- ราคาปัจจุบัน (S&P 500) ---")
                for sym, p in prices.items():
                    if p:
                        ctx.append(f"  {sym}: ${p.get('mark_price', '?')} "
                                   f"({p.get('change_24h_pct', '?')}%) · {p.get('sector', '?')}")
        # Fundamentals (market cap / PE) for the symbols under discussion —
        # real values from yfinance, only for names that have them (never guessed).
        fund = stock_universe_service.fetch_fundamentals()
        if fund:
            ctx.append("--- ข้อมูลพื้นฐาน (yfinance) ---")
            for sym in syms:
                f = fund.get(sym.upper())
                if f:
                    mcap = f.get("market_cap")
                    mcap_s = f"${mcap / 1e9:.0f}B" if mcap else "—"
                    pe = f.get("trailing_pe")
                    fpe = f.get("forward_pe")
                    ctx.append(f"  {sym.upper()}: mcap {mcap_s} · PE {pe if pe is not None else '—'} · "
                               f"fwdPE {fpe if fpe is not None else '—'} · {f.get('sector', '—')}")
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
        agenda = ("ประเมินตลาดหุ้นสหรัฐวันนี้ — momentum (ราคา/TA), fundamental "
                  "(PE/mcap), ข่าว, volume — เสนอหุ้น S&P 500 ที่มี edge "
                  "เลนส์ contrarian: ถ้ากระแสหลักผิด หลักฐานแรกคืออะไร?")

    base_ctx = _build_base_context(db, team)
    specs = [
        ("trend", _DEFAULT_TREND_PROMPT),
        ("technical", _DEFAULT_TECHNICAL_PROMPT),
        ("macro", _DEFAULT_MACRO_PROMPT),
        ("contrarian", _DEFAULT_CONTRARIAN_PROMPT),
        ("news", _DEFAULT_NEWS_PROMPT),
        ("quant", _DEFAULT_QUANT_PROMPT),
    ]
    results = []
    tokens_in = 0
    tokens_out = 0

    with ThreadPoolExecutor(max_workers=6) as pool:
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
    lead_user = (f"{agenda}\n\n{base_ctx}\n\nข้อเสนอลูกทีม:\n{opinions}\n\n"
                 "เคาะออเดอร์ (JSON: action, market, side, size_pct, sl_pct, tp_pct, rationale)")
    lead_content, lead_usage, _ = llm_call(
        _DEFAULT_LEAD_PROMPT,
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

    # Execute the lead's order: MARKET → open position now ·
    # LIMIT/STOP → create pending order (settled by the 10-min tick)
    action = (lead_parsed or {}).get("action")
    market = (lead_parsed or {}).get("market")
    side = (lead_parsed or {}).get("side")
    if action == "open" and market and side:
        otype = str((lead_parsed or {}).get("order_type") or "MARKET").upper()
        trigger = (lead_parsed or {}).get("trigger_price")
        size_pct = float((lead_parsed or {}).get("size_pct") or 0)
        sl_pct = (lead_parsed or {}).get("sl_pct")
        tp_pct = (lead_parsed or {}).get("tp_pct")
        size_notional = team.capital * size_pct / 100 if size_pct else 0
        if otype in ("LIMIT", "STOP") and trigger:
            # pending order — settled later by settle_pending_orders
            db.add(TradePendingOrder(
                team_id=team.id, symbol=market, side=side,
                order_type=otype, target_price=float(trigger),
                size_notional=size_notional,
                sl_price=float(sl_pct) if sl_pct else None,
                tp_price=float(tp_pct) if tp_pct else None,
                status="pending",
                expires_at=datetime.now(timezone.utc) + timedelta(days=7),
            ))
        elif size_notional > 0:
            # market order — open immediately at current price. Cash equity:
            # shares = notional / price; the full notional is reserved up front.
            mark = _market_price(market)
            if mark:
                qty = size_notional / mark
                team.balance = (team.balance or 0) - size_notional
                db.add(TradePosition(
                    team_id=team.id, symbol=market, side=side,
                    size_pct=size_pct, entry_price=mark,
                    quantity=qty, reserved_cash=size_notional,
                    sl_pct=float(sl_pct) if sl_pct else None,
                    tp_pct=float(tp_pct) if tp_pct else None,
                    status="open",
                    opened_at=datetime.now(timezone.utc),
                ))
            else:
                # Not in the S&P 500 universe (or price unavailable) — do NOT
                # open a phantom position. Record why in the turn so the UI can
                # show it instead of silently doing nothing.
                lead_parsed = dict(lead_parsed or {})
                lead_parsed["action"] = "rejected"
                lead_parsed["rationale"] = (
                    f"{lead_parsed.get('rationale', '')} "
                    f"[REJECTED: {market} ไม่มีราคาใน S&P 500 universe — "
                    f"ต้องเป็น ticker หุ้นอเมริกา (AAPL, MSFT, NVDA…)]".strip())
                turn.lead_decision = lead_parsed

    db.commit()
    db.refresh(turn)
    return turn


def _market_price(symbol: str) -> float | None:
    """Current price for one stock from the S&P 500 universe (cached)."""
    try:
        from app import stock_universe_service
        px = stock_universe_service.get_prices_for_symbols([symbol]) or {}
        p = (px.get(symbol.upper()) or {}).get("mark_price")
        return float(p) if p is not None else None
    except Exception:
        return None


def settle_pending_orders(db: Session, team: TradeTeam) -> list[dict]:
    """Settle pending LIMIT/STOP orders against current S&P 500 prices.

    Runs inside the 10-min job tick. **NEVER calls the LLM** — it only
    compares prices and fills/expires. Fill price = the order's target price
    (limit) or the current price (stop), NOT whatever price we see at settle
    time — otherwise results would randomly be better/worse than reality.
    On fill the order's notional is reserved from cash (same as a market open).
    """
    out: list[dict] = []
    orders = db.query(TradePendingOrder).filter(
        TradePendingOrder.team_id == team.id,
        TradePendingOrder.status == "pending",
    ).all()
    if not orders:
        return out

    from app import stock_universe_service
    syms = list({o.symbol for o in orders})
    prices = {}
    try:
        prices = stock_universe_service.get_prices_for_symbols(syms) or {}
    except Exception:
        prices = {}

    now = datetime.now(timezone.utc)

    def _aware(dt):
        return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt

    for o in orders:
        # expiry check
        if _aware(o.expires_at) and _aware(o.expires_at) <= now:
            o.status = "cancelled"  # expired → cancel (no fill)
            out.append({"symbol": o.symbol, "order_type": o.order_type, "status": "expired"})
            continue

        cur = prices.get(o.symbol.upper())
        if not cur or cur.get("mark_price") is None:
            out.append({"symbol": o.symbol, "order_type": o.order_type, "status": "no_price"})
            continue

        mark = float(cur["mark_price"])
        hit = False
        if o.order_type == "LIMIT":
            # buy limit: fill when price <= target · sell limit: price >= target
            hit = mark <= o.target_price if o.side == "long" else mark >= o.target_price
        elif o.order_type == "STOP":
            hit = mark >= o.target_price if o.side == "long" else mark <= o.target_price

        if hit:
            fill_px = o.target_price if o.order_type == "LIMIT" else mark
            qty = o.size_notional / fill_px if fill_px else 0
            team.balance = (team.balance or 0) - o.size_notional  # reserve cash on fill
            pos = TradePosition(
                team_id=team.id, symbol=o.symbol, side=o.side,
                size_pct=o.size_notional / team.capital * 100 if team.capital else 0,
                entry_price=fill_px, quantity=qty, reserved_cash=o.size_notional,
                sl_pct=o.sl_price, tp_pct=o.tp_price,
                status="open",
                opened_at=now,
            )
            db.add(pos)
            o.status = "filled"
            out.append({"symbol": o.symbol, "order_type": o.order_type, "status": "filled", "fill_px": fill_px})
        else:
            out.append({"symbol": o.symbol, "order_type": o.order_type, "status": "waiting"})

    db.commit()
    return out


def settle_open_positions(db: Session, team: TradeTeam) -> list[dict]:
    """Check SL/TP on open positions against current S&P 500 prices.

    Cash-equity close: realized PnL = (exit - entry) × qty for a long,
    (entry - exit) × qty for a short. The reserved cash is released back to
    balance and the realized PnL is added on top. **NEVER calls the LLM.**
    Equity = cash balance + Σ(reserved_cash + live_pnl) over open positions
    (for a long that equals market value; for a cash-backed short it is the
    reserve plus unrealized PnL).
    """
    out: list[dict] = []
    positions = db.query(TradePosition).filter(
        TradePosition.team_id == team.id,
        TradePosition.status == "open",
    ).all()
    if not positions:
        return out

    from app import stock_universe_service
    syms = list({p.symbol for p in positions})
    prices = {}
    try:
        prices = stock_universe_service.get_prices_for_symbols(syms) or {}
    except Exception:
        prices = {}

    now = datetime.now(timezone.utc)
    for p in positions:
        cur = prices.get(p.symbol.upper())
        if not cur or cur.get("mark_price") is None:
            out.append({"symbol": p.symbol, "status": "no_price"})
            continue
        mark = float(cur["mark_price"])
        qty = p.quantity or 0
        p.live_pnl = round(
            (mark - p.entry_price) * qty if p.side == "long" else (p.entry_price - mark) * qty, 2)

        exit_px = None
        reason = None
        if p.side == "long":
            if p.sl_price is not None and mark <= p.sl_price:
                exit_px, reason = p.sl_price, "sl"
            elif p.tp_price is not None and mark >= p.tp_price:
                exit_px, reason = p.tp_price, "tp"
        else:
            if p.sl_price is not None and mark >= p.sl_price:
                exit_px, reason = p.sl_price, "sl"
            elif p.tp_price is not None and mark <= p.tp_price:
                exit_px, reason = p.tp_price, "tp"

        if exit_px is not None:
            pnl = (exit_px - p.entry_price) * qty if p.side == "long" else (p.entry_price - exit_px) * qty
            p.status = "closed"
            p.close_price = exit_px
            p.closed_at = now
            p.closed_by = reason
            p.realized_pnl = round(pnl, 2)
            p.live_pnl = 0.0
            reserved = p.reserved_cash or 0
            team.balance = (team.balance or 0) + reserved + pnl  # release cash + PnL
            out.append({"symbol": p.symbol, "side": p.side, "status": "closed",
                        "closed_by": reason, "exit_px": exit_px, "pnl": pnl})

    # Equity = free cash + Σ(reserved + unrealized) over still-open positions
    reserved_total = sum((p.reserved_cash or 0) + (p.live_pnl or 0)
                         for p in positions if p.status == "open")
    team.equity = round((team.balance or 0) + reserved_total, 2)
    db.commit()
    return out


# ── Weekly target + daily/monthly summaries (ticket 09) ─────────────────────
# Idempotence: UNIQUE (team_id, kind, period) + pre-check → 1 LLM call per
# period even though the tick runs 144x/day. Server-side tick: this works
# whether or not anyone opened the app.

def _period_key(kind: str, now: datetime) -> str:
    if kind == "daily":
        return now.strftime("%Y-%m-%d")
    if kind == "monthly":
        return now.strftime("%Y-%m")
    if kind == "weekly_target":
        iso = now.isocalendar()
        return f"{iso[0]}-W{iso[1]:02d}"
    return now.strftime("%Y-%m-%d")


def _summary_exists(db: Session, team_id: str, kind: str, period: str) -> bool:
    return db.query(TradeSummary).filter(
        TradeSummary.team_id == team_id,
        TradeSummary.kind == kind,
        TradeSummary.period == period,
    ).first() is not None


def _charge(db: Session, team: TradeTeam, tokens_in: int, tokens_out: int, cost: float):
    """Include summary/target LLM cost in the team's cost counters (UI shows real spend)."""
    team.cost_today_usd = (team.cost_today_usd or 0) + cost
    team.cost_total_usd = (team.cost_total_usd or 0) + cost


def ensure_weekly_target(db: Session, team: TradeTeam,
                         now: datetime | None = None) -> dict:
    """First tick of the week: lead sets the weekly target (1 LLM call/week).

    Runs ONLY when master_on=1 AND status=active — a closed master switch
    must not leak LLM calls (user decision, ticket 09). Directive (user)
    has priority over the AI-set target — asserted in the prompt and tested.
    """
    now = now or datetime.now(timezone.utc)
    period = _period_key("weekly_target", now)
    if _summary_exists(db, team.id, "weekly_target", period):
        return {"skipped": "already_set", "period": period}
    if not team.master_on or team.status != "active":
        return {"skipped": "master_off_or_inactive", "period": period}

    base = _build_base_context(db, team)
    system = (
        "คุณเป็นหัวหน้าทีมเทรด AI บริหารพอร์ต $10,000 — ตั้งเป้ากำไรประจำสัปดาห์ "
        "จากสภาพตลาดจริง (context ด้านล่าง) และเป้าหมายรายเดือน (floor/stretch)\n"
        "ถ้ามี 'คำสั่งโต๊ะกลาง (directive)' ให้ปฏิบัติตาม directive นั้นเป็นหลัก "
        "แล้วตั้งเป้าภายใต้กรอบที่ directive กำหนด — directive ของ user มีน้ำหนักเหนือเป้าของ AI เสมอ\n"
        "ตอบ JSON เท่านั้น: {\"weekly_target_pct\": 2.5, \"monthly_floor_pct\": 5.0, "
        "\"monthly_stretch_pct\": 20.0, \"rationale\": \"เหตุผลสั้นๆ ไทย\"}"
    )
    try:
        content, usage, _ = llm_call(system, base, temperature=0.4, max_tokens=250)
    except Exception as exc:
        return {"error": str(exc)[:150], "period": period}
    import re as _re
    import json as _json
    m = _re.search(r"\{.*\}", content, _re.S)
    try:
        parsed = _json.loads(m.group()) if m else {}
    except Exception:
        parsed = {}
    tgt = parsed.get("weekly_target_pct")
    if isinstance(tgt, (int, float)) and 0 < tgt < 100:
        team.weekly_target_pct = float(tgt)
        team.monthly_floor_pct = float(parsed.get("monthly_floor_pct") or 5.0)
        team.monthly_stretch_pct = float(parsed.get("monthly_stretch_pct") or 20.0)
        tokens_in = usage.get("prompt_tokens", 0)
        tokens_out = usage.get("completion_tokens", 0)
        cost = tokens_in * COST_IN_PER_TOKEN + tokens_out * COST_OUT_PER_TOKEN
        db.add(TradeSummary(
            team_id=team.id, kind="weekly_target", period=period,
            summary_th=str(parsed.get("rationale") or content)[:500],
            tokens_in=tokens_in, tokens_out=tokens_out, cost_usd=round(cost, 6),
        ))
        _charge(db, team, tokens_in, tokens_out, cost)
        db.commit()
        return {"set": True, "period": period, "weekly_target_pct": team.weekly_target_pct}
    return {"error": "unparseable_target", "raw": content[:150], "period": period}


def ensure_daily_summary(db: Session, team: TradeTeam,
                         now: datetime | None = None) -> dict:
    """1 LLM call/day — recap of today's turns, decisions, results."""
    now = now or datetime.now(timezone.utc)
    period = _period_key("daily", now)
    if _summary_exists(db, team.id, "daily", period):
        return {"skipped": "already_written", "period": period}
    if not team.master_on or team.status != "active":
        return {"skipped": "master_off_or_inactive", "period": period}

    turns = db.query(TradeTurn).filter(
        TradeTurn.team_id == team.id,
        TradeTurn.started_at >= now.replace(hour=0, minute=0, second=0, microsecond=0),
    ).order_by(TradeTurn.started_at.desc()).limit(20).all()
    if not turns:
        # no activity today — record a cheap note, NO LLM call
        db.add(TradeSummary(team_id=team.id, kind="daily", period=period,
                            summary_th="ยังไม่มีการเทิร์นในวันนี้"))
        db.commit()
        return {"skipped": "no_activity", "period": period}

    lines = "\n".join(
        f"• {t.trigger}: {t.consensus} → {str(t.lead_decision)[:120]}" for t in turns)
    system = ("คุณคือผู้ช่วยสรุปทีมเทรด — สรุปกิจกรรมวันนี้ของทีมเป็นภาษาไทย กระชับ 2-3 บรรทัด "
              "(เทิร์นกี่ครั้ง · ทิศทาง · ผล) ไม่ใช่คำแนะนำการลงทุน")
    try:
        content, usage, _ = llm_call(system, f"กิจกรรมวันนี้:\n{lines}", temperature=0.5, max_tokens=200)
    except Exception as exc:
        return {"error": str(exc)[:150], "period": period}
    tokens_in = usage.get("prompt_tokens", 0)
    tokens_out = usage.get("completion_tokens", 0)
    cost = tokens_in * COST_IN_PER_TOKEN + tokens_out * COST_OUT_PER_TOKEN
    db.add(TradeSummary(
        team_id=team.id, kind="daily", period=period, summary_th=content.strip()[:800],
        tokens_in=tokens_in, tokens_out=tokens_out, cost_usd=round(cost, 6),
    ))
    _charge(db, team, tokens_in, tokens_out, cost)
    db.commit()
    return {"written": True, "period": period}


def ensure_monthly_summary(db: Session, team: TradeTeam,
                           now: datetime | None = None) -> dict:
    """1 LLM call/month — month recap. Runs on the first tick of a new month."""
    now = now or datetime.now(timezone.utc)
    period = _period_key("monthly", now)
    if _summary_exists(db, team.id, "monthly", period):
        return {"skipped": "already_written", "period": period}
    if not team.master_on or team.status != "active":
        return {"skipped": "master_off_or_inactive", "period": period}

    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    turns = db.query(TradeTurn).filter(
        TradeTurn.team_id == team.id,
        TradeTurn.started_at >= month_start,
    ).order_by(TradeTurn.started_at.desc()).limit(50).all()
    if not turns:
        db.add(TradeSummary(team_id=team.id, kind="monthly", period=period,
                            summary_th="ยังไม่มีการเทิร์นในเดือนนี้"))
        db.commit()
        return {"skipped": "no_activity", "period": period}

    wins = sum(1 for t in turns if (t.lead_decision or {}).get("action") == "open")
    lines = "\n".join(
        f"• {t.trigger}: {t.consensus} → {str(t.lead_decision)[:120]}" for t in turns[:30])
    system = ("คุณคือผู้ช่วยสรุปทีมเทรด — สรุปผลประจำเดือนของทีมเป็นภาษาไทย 3-4 บรรทัด "
              "(เทิร์นรวม · แนวโน้มการตัดสินใจ · จุดที่ควรทบทวน) ไม่ใช่คำแนะนำการลงทุน")
    try:
        content, usage, _ = llm_call(system, f"เดือนนี้ ({period}) มี {len(turns)} เทิร์น, เปิดไม้ {wins} ครั้ง:\n{lines}",
                                     temperature=0.5, max_tokens=250)
    except Exception as exc:
        return {"error": str(exc)[:150], "period": period}
    tokens_in = usage.get("prompt_tokens", 0)
    tokens_out = usage.get("completion_tokens", 0)
    cost = tokens_in * COST_IN_PER_TOKEN + tokens_out * COST_OUT_PER_TOKEN
    db.add(TradeSummary(
        team_id=team.id, kind="monthly", period=period, summary_th=content.strip()[:1200],
        tokens_in=tokens_in, tokens_out=tokens_out, cost_usd=round(cost, 6),
    ))
    _charge(db, team, tokens_in, tokens_out, cost)
    db.commit()
    return {"written": True, "period": period}


def run_due_turns(db: Session) -> list[dict]:
    """Check DEEPSEEK team — run if due (called by cron)."""
    team = db.query(TradeTeam).filter(
        TradeTeam.code == "DEEPSEEK", TradeTeam.status == "active").first()
    if team is None:
        return [{"skipped": "no_team"}]

    # 0. Master switch OFF → no NEW turns, but SL/TP + settle keep working
    if not team.master_on:
        closed = settle_open_positions(db, team)
        settled = settle_pending_orders(db, team)
        return [{"skipped": "master_off", "settled": len(settled), "closed": len(closed)}]

    now = datetime.now(timezone.utc)
    next_at = team.next_turn_at
    if next_at is not None and next_at.tzinfo is None:
        next_at = next_at.replace(tzinfo=timezone.utc)
    if next_at and next_at > now:
        return [{"skipped": "not_due", "next": next_at.isoformat()}]
    # Compare against a datetime, not now.date().isoformat(). SQLite happily
    # compares its ISO-8601 text timestamps to a "2026-08-13" string, so this
    # passed every local test; Postgres raises
    #   operator does not exist: timestamp with time zone >= character varying
    # which aborted the transaction, so every later commit in the tick failed —
    # including the one marking the job_runs row finished. The row stayed
    # `running`, the next tick took over a "wedged" lock, and the loop stalled
    # for 13 hours (2026-08-12 12:00 → 2026-08-13 01:14).
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_count = db.query(TradeTurn).filter(
        TradeTurn.team_id == team.id,
        TradeTurn.started_at >= start_of_day).count()
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
    # MTD: equity change since start of this calendar month (from snapshots)
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # Find the latest snapshot before this month — that's equity at month start
    snap_before = db.query(TradeSnapshot).filter(
        TradeSnapshot.team_id == team.id,
        TradeSnapshot.snapped_at < month_start,
    ).order_by(TradeSnapshot.snapped_at.desc()).first()
    if snap_before is not None:
        equity_start = snap_before.equity  # real equity at start of this month
    elif team.created_at and team.created_at.month == now.month and team.created_at.year == now.year:
        equity_start = team.capital  # team started this month — start from capital
    else:
        equity_start = None  # cannot compute — return null, UI shows "—"
    mtd_pnl_pct = round((team.equity - equity_start) / equity_start * 100, 2) if equity_start else None
    turns = db.query(TradeTurn).filter(
        TradeTurn.team_id == team.id).order_by(TradeTurn.started_at.desc()).limit(10).all()
    pending = db.query(TradePendingOrder).filter(
        TradePendingOrder.team_id == team.id).order_by(TradePendingOrder.created_at.desc()).limit(20).all()
    summaries = db.query(TradeSummary).filter(
        TradeSummary.team_id == team.id).order_by(TradeSummary.created_at.desc()).limit(5).all()
    return {
        "teams": [{
            "code": team.code, "name_th": team.name_th, "name_en": team.name_en,
            "status": team.status, "capital": team.capital, "balance": team.balance,
            "equity": team.equity,
            "pnl_pct": round((team.equity - team.capital) / team.capital * 100, 2) if team.capital else 0,
            "mtd_pnl_pct": mtd_pnl_pct,
            "margin_used": round(sum(p.reserved_cash or 0 for p in open_pos), 2),  # cash reserved (long cost / short notional)
            "weekly_target_pct": team.weekly_target_pct,
            "weekly_kpi_pct": team.weekly_kpi_pct,
            "next_turn_at": team.next_turn_at.isoformat() if team.next_turn_at else None,
            "turns_today": team.turns_today,
            "cost_today_usd": team.cost_today_usd,
            "cost_total_usd": team.cost_total_usd,
            "master_on": bool(team.master_on),
        }],
        "pending_orders": [{
            "id": o.id, "symbol": o.symbol, "side": o.side,
            "order_type": o.order_type, "target_price": o.target_price,
            "size_notional": o.size_notional,
            "sl_price": o.sl_price, "tp_price": o.tp_price,
            "status": o.status,
            "expires_at": o.expires_at.isoformat() if o.expires_at else None,
            "created_at": o.created_at.isoformat() if o.created_at else None,
        } for o in pending],
        "summaries": [{
            "kind": s.kind, "period": s.period, "summary_th": s.summary_th,
            "tokens_in": s.tokens_in, "tokens_out": s.tokens_out,
            "cost_usd": s.cost_usd,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        } for s in summaries],
        "positions": {
            "open": [{
                "id": p.id, "symbol": p.symbol, "side": p.side,
                "size_pct": p.size_pct, "entry_price": p.entry_price,
                "mark_price": None, "sl_pct": p.sl_pct, "tp_pct": p.tp_pct,
                "live_pnl": p.live_pnl,
                "quantity": p.quantity, "reserved_cash": p.reserved_cash,
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
