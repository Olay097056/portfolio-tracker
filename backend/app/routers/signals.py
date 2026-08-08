# backend/app/routers/signals.py
"""GET/POST /api/signals — trading signals for the Bond-crisis tab.

Signals are generated on-demand from the regime models + TA gate (ticket 02):
every cache expiration the router runs the signal engine, persists new
active signals into SQLite, auto-expires stale ones (14 days, P54) and
recomputes the reference stats panel. The stats honestly show "—" until real
closed trades accumulate — history is never seeded.
"""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Column, DateTime, Float, Integer, String, Text, delete, select
from sqlalchemy.orm import Session

from app import signals_service
from app.database import Base, get_db

router = APIRouter(prefix="/api/signals", tags=["signals"])

_CACHE_TTL_SECONDS = 600
_cache: dict[str, tuple[float, dict]] = {}


# ---------------------------------------------------------------------------
# ORM
# ---------------------------------------------------------------------------
class TradingSignal(Base):
    __tablename__ = "trading_signals"

    id = Column(String(36), primary_key=True)
    asset = Column(String(32), nullable=False, index=True)
    category = Column(String(16), nullable=False)
    direction = Column(String(8), nullable=False)
    entry_price = Column(Float, nullable=False)
    tp = Column(Float, nullable=False)
    sl = Column(Float, nullable=False)
    current_price = Column(Float, nullable=False)
    pnl_pct = Column(Float, nullable=True)
    signal_strength = Column(Integer, nullable=False)
    strength_factors = Column(Text, nullable=False)  # JSON
    status = Column(String(16), nullable=False, index=True)  # active/tp_hit/sl_hit/expired
    model_id = Column(String(64), nullable=True, index=True)
    rationale_th = Column(Text, nullable=True)
    rationale_en = Column(Text, nullable=True)
    ta_snapshot = Column(Text, nullable=True)  # JSON
    sparkline = Column(Text, nullable=True)  # JSON list of 20 closes
    created_at = Column(DateTime(timezone=True), nullable=False, index=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------
class ConditionOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    key: str
    max: int
    pass_: bool = Field(alias="pass")
    score: float
    value: str


class LevelsOut(BaseModel):
    rr: float
    support: list[float]
    resistance: list[float]
    sl_basis: str
    tp_basis: str


class TaSnapshotOut(BaseModel):
    bars: int
    ta_score: int
    threshold: float
    conditions: list[ConditionOut]
    indicators: dict
    levels: LevelsOut


class SignalOut(BaseModel):
    id: str
    asset: str
    category: str
    direction: str
    entry_price: float
    tp: float
    sl: float
    current_price: float
    pnl_pct: float | None
    signal_strength: int
    strength_factors: dict
    status: str
    model_id: str | None
    rationale_th: str | None
    rationale_en: str | None
    ta_snapshot: TaSnapshotOut | None
    sparkline: list[float] | None
    created_at: str
    closed_at: str | None
    expires_at: str | None


class StatsOut(BaseModel):
    active_count: int
    closed_count: int
    win_count: int
    loss_count: int
    win_rate: float | None
    realized_pnl: float
    unrealized_pnl: float
    avg_hold_hours: float | None
    avg_rr: float | None
    profit_factor: float | None
    expectancy: float | None
    avg_win: float | None
    avg_loss: float | None
    payoff_ratio: float | None
    best_trade: float | None
    worst_trade: float | None
    max_drawdown: float | None
    equity_curve: list[dict]


class SignalsOut(BaseModel):
    signals: list[SignalOut]
    stats: StatsOut
    generated_at: str
    data_sources: list[str]
    notes: list[str]


class CloseRequest(BaseModel):
    signal_id: str


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------
def _row_to_dict(row: TradingSignal) -> dict:
    import json

    return {
        "id": row.id,
        "asset": row.asset,
        "category": row.category,
        "direction": row.direction,
        "entry_price": row.entry_price,
        "tp": row.tp,
        "sl": row.sl,
        "current_price": row.current_price,
        "pnl_pct": row.pnl_pct,
        "signal_strength": row.signal_strength,
        "strength_factors": json.loads(row.strength_factors or "{}"),
        "status": row.status,
        "model_id": row.model_id,
        "rationale_th": row.rationale_th,
        "rationale_en": row.rationale_en,
        "ta_snapshot": json.loads(row.ta_snapshot) if row.ta_snapshot else None,
        "sparkline": json.loads(row.sparkline) if row.sparkline else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "closed_at": row.closed_at.isoformat() if row.closed_at else None,
        "expires_at": row.expires_at.isoformat() if row.expires_at else None,
    }


def _load_signals(db: Session, limit: int = 200) -> list[dict]:
    rows = db.execute(
        select(TradingSignal).order_by(TradingSignal.created_at.desc()).limit(limit)
    ).scalars().all()
    return [_row_to_dict(r) for r in rows]


def _persist_generated(signals: list[dict], db: Session) -> int:
    """Insert signals that don't already exist (same asset+model+day)."""
    import json

    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    existing = set(
        db.execute(
            select(TradingSignal.asset, TradingSignal.model_id)
            .where(TradingSignal.created_at >= day_start, TradingSignal.status == "active")
        ).all()
    )
    added = 0
    for s in signals:
        key = (s["asset"], s["model_id"])
        if key in existing:
            continue
        db.add(TradingSignal(
            id=uuid.uuid4().hex,
            asset=s["asset"], category=s["category"], direction=s["direction"],
            entry_price=s["entry_price"], tp=s["tp"], sl=s["sl"],
            current_price=s["current_price"], pnl_pct=s["pnl_pct"],
            signal_strength=s["signal_strength"],
            strength_factors=json.dumps(s["strength_factors"]),
            status="active", model_id=s["model_id"],
            rationale_th=s.get("rationale_th"), rationale_en=s.get("rationale_en"),
            ta_snapshot=json.dumps(s["ta_snapshot"]) if s.get("ta_snapshot") else None,
            sparkline=json.dumps(s["sparkline"]) if s.get("sparkline") else None,
            created_at=datetime.fromisoformat(s["created_at"]),
            closed_at=None,
            expires_at=datetime.fromisoformat(s["expires_at"]) if s.get("expires_at") else None,
        ))
        existing.add(key)
        added += 1
    db.commit()
    return added


def _expire_stale(db: Session) -> int:
    """P54: signals still active past expires_at close at the current price."""
    now = datetime.now(timezone.utc)
    rows = db.execute(
        select(TradingSignal).where(
            TradingSignal.status == "active",
            TradingSignal.expires_at.isnot(None),
            TradingSignal.expires_at < now,
        )
    ).scalars().all()
    for row in rows:
        entry = row.entry_price or 0
        row.status = "expired"
        row.closed_at = now
        if entry:
            row.pnl_pct = round(
                (row.current_price - entry) / entry * 100 if row.direction == "long"
                else (entry - row.current_price) / entry * 100, 2)
    db.commit()
    return len(rows)


def _refresh_current_prices(db: Session) -> None:
    """Update current_price for active signals from live quotes."""
    rows = db.execute(
        select(TradingSignal).where(TradingSignal.status == "active")
    ).scalars().all()
    if not rows:
        return
    for row in rows:
        ticker = signals_service._ASSET_TICKERS.get(row.asset)
        if not ticker:
            continue
        try:
            import yfinance as yf

            hist = yf.Ticker(ticker).history(period="2d")
            if hist is not None and len(hist):
                row.current_price = float(hist["Close"].iloc[-1])
                entry = row.entry_price or 0
                if entry:
                    row.pnl_pct = round(
                        (row.current_price - entry) / entry * 100 if row.direction == "long"
                        else (entry - row.current_price) / entry * 100, 2)
        except Exception:
            continue
    db.commit()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
def _get_or_fetch(db: Session, force: bool = False) -> SignalsOut:
    cached = _cache.get("signals")
    if not force and cached and (time.time() - cached[0] < _CACHE_TTL_SECONDS):
        return cached[1]

    try:
        # Generate fresh candidates from the models + TA (no-op if cache warm).
        new_signals = signals_service.generate_signals()
        added = _persist_generated(new_signals, db)
        expired = _expire_stale(db)
        _refresh_current_prices(db)
        signals = _load_signals(db)
        stats = signals_service.compute_stats(signals)

        notes: list[str] = []
        if added:
            notes.append(f"สร้างสัญญาณใหม่ {added} รายการ")
        if expired:
            notes.append(f"ปิดอัตโนมัติ {expired} รายการ (หมดอายุ 14 วัน)")
        if stats.closed_count == 0:
            notes.append("ยังไม่มีสัญญาณปิด — สถิติจะเริ่มสะสมเมื่อมีออเดอร์จริง")

        payload = {
            "signals": signals,
            "stats": stats.__dict__,
            "generated_at": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC"),
            "data_sources": ["Yahoo Finance (yfinance)", "Regime models (model_service)"],
            "notes": notes,
        }
        result = SignalsOut(**payload)
        _cache["signals"] = (time.time(), result)
        return result
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Signal data is unavailable right now: {type(e).__name__}")


@router.get("", response_model=SignalsOut)
def get_signals(db: Session = Depends(get_db)) -> SignalsOut:
    return _get_or_fetch(db)


@router.post("/refresh", response_model=SignalsOut)
def refresh_signals(db: Session = Depends(get_db)) -> SignalsOut:
    _cache.clear()
    return _get_or_fetch(db, force=True)


@router.post("/close", response_model=SignalOut)
def close_signal(req: CloseRequest, db: Session = Depends(get_db)) -> SignalOut:
    """Manually close an active signal at the current price."""
    row = db.execute(
        select(TradingSignal).where(TradingSignal.id == req.signal_id)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Signal not found")
    if row.status != "active":
        raise HTTPException(status_code=400, detail="Signal is not active")

    ticker = signals_service._ASSET_TICKERS.get(row.asset)
    price = row.current_price
    if ticker:
        try:
            import yfinance as yf

            hist = yf.Ticker(ticker).history(period="2d")
            if hist is not None and len(hist):
                price = float(hist["Close"].iloc[-1])
        except Exception:
            pass

    entry = row.entry_price or 0
    row.current_price = price
    row.pnl_pct = round(
        (price - entry) / entry * 100 if row.direction == "long" else (entry - price) / entry * 100, 2
    ) if entry else None
    row.status = "tp_hit" if (row.pnl_pct or 0) > 0 else "sl_hit"
    row.closed_at = datetime.now(timezone.utc)
    db.commit()
    _cache.clear()
    return SignalOut(**_row_to_dict(row))
