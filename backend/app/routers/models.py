# backend/app/routers/models.py
"""GET /api/models — six regime models scored 0-100 from live macro data,
plus a 30-day score history persisted in SQLite (the reference site keeps a
per-hour history; we record one snapshot per cache build and prune to 30
days, so the chart fills in over time instead of being fabricated)."""
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import Column, DateTime, Float, String, delete, select
from sqlalchemy.orm import Session

from app import model_service
from app.database import Base, get_db

router = APIRouter(prefix="/api/models", tags=["models"])

_CACHE_TTL_SECONDS = 600
_cache: dict[str, tuple[float, "ModelsOut"]] = {}


class ModelCondition(BaseModel):
    name: str
    logic: str
    weight: float
    score: float | None = None


class ModelFactors(BaseModel):
    market_structure: float
    macro: float
    news: float
    confirmation: float
    risk_penalty: float


class ModelResult(BaseModel):
    model_id: str
    rank: int
    score: float
    confidence: int
    status: str
    factors: ModelFactors
    conditions: list[ModelCondition]
    available: bool


class SignalMapEntry(BaseModel):
    asset: str
    category: str
    direction: str
    reason: str


class ModelMeta(BaseModel):
    model_id: str
    name_th: str
    name_en: str
    short_th: str
    short_en: str
    concept_th: str
    concept_en: str
    trade_direction: str
    regime_th: str
    regime_en: str
    phase: str
    color: str
    signal_map: list[SignalMapEntry]


class HistoryPoint(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    recorded_at: str
    scores: dict[str, float]


class ModelsOut(BaseModel):
    models: list[ModelResult]
    meta: list[ModelMeta]
    factor_caps: dict[str, float]
    factor_labels_th: dict[str, str]
    status_meta: dict[str, dict[str, str]]
    thresholds: dict[str, float]
    history: list[HistoryPoint]
    updated_at: str
    data_sources: list[str]


# ---------------------------------------------------------------------------
# Score history table (one snapshot row per build, pruned to 30 days).
# ---------------------------------------------------------------------------
class ModelScoreHistory(Base):
    __tablename__ = "model_score_history"

    id = Column(String(36), primary_key=True)  # uuid4 hex
    recorded_at = Column(DateTime(timezone=True), nullable=False, index=True)
    model_id = Column(String(64), nullable=False)
    score = Column(Float, nullable=False)


def _record_snapshot(payload: dict, db: Session) -> None:
    """Insert one score row per model and prune rows older than 30 days."""
    import uuid

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=30)
    for model in payload["models"]:
        db.add(ModelScoreHistory(
            id=uuid.uuid4().hex,
            recorded_at=now,
            model_id=model["model_id"],
            score=model["score"],
        ))
    db.execute(delete(ModelScoreHistory).where(ModelScoreHistory.recorded_at < cutoff))
    db.commit()


def _load_history(db: Session) -> list[HistoryPoint]:
    """Group the last 30 days of snapshots by recorded_at, one row per model."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    rows = db.execute(
        select(ModelScoreHistory)
        .where(ModelScoreHistory.recorded_at >= cutoff)
        .order_by(ModelScoreHistory.recorded_at.asc())
    ).scalars().all()

    by_time: dict[str, dict[str, float]] = {}
    for row in rows:
        key = row.recorded_at.strftime("%d/%m %H:%M")
        by_time.setdefault(key, {})[row.model_id] = row.score
    return [HistoryPoint(recorded_at=key, scores=scores) for key, scores in sorted(by_time.items())]


def _get_or_fetch(db: Session) -> "ModelsOut":
    cached = _cache.get("models")
    if cached and (time.time() - cached[0] < _CACHE_TTL_SECONDS):
        return cached[1]
    try:
        payload = model_service.build_models()
    except Exception:
        raise HTTPException(status_code=503, detail="Model data is unavailable right now")
    _record_snapshot(payload, db)
    payload["history"] = [p.model_dump() for p in _load_history(db)]
    sources = set()
    for section in payload.get("_macro_sources", []):
        sources.add(section)
    payload["data_sources"] = sorted(sources)
    result = ModelsOut(**payload)
    _cache["models"] = (time.time(), result)
    return result


@router.get("", response_model=ModelsOut)
def get_models(db: Session = Depends(get_db)) -> ModelsOut:
    return _get_or_fetch(db)


@router.post("/refresh", response_model=ModelsOut)
def refresh_models(db: Session = Depends(get_db)) -> ModelsOut:
    _cache.clear()
    return _get_or_fetch(db)
