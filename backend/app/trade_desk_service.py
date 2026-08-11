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
