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
from app.cache import cache_clear, cache_get, cache_set
from app.database import Base, get_db

router = APIRouter(prefix="/api/models", tags=["models"])

_CACHE_TTL_SECONDS = 600
_CACHE_PREFIX = "models:"
_CACHE_KEY = _CACHE_PREFIX + "dashboard"


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
    news_factor_since: str | None = None  # "dd/mm/yyyy" — history divider
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
    cached = cache_get(_CACHE_KEY)
    if cached is not None:
        return cached
    try:
        payload = model_service.build_models()
    except Exception:
        raise HTTPException(status_code=503, detail="Model data is unavailable right now")
    _record_snapshot(payload, db)
    payload["history"] = [p.model_dump() for p in _load_history(db)]
    # Divider for the score-history chart: scores before this date were
    # computed WITHOUT the news factor (hardcoded 0), after WITH it — the
    # two halves of the series are not on the same scale.
    payload["news_factor_since"] = "09/08/2026"
    sources = set()
    for section in payload.get("_macro_sources", []):
        sources.add(section)
    payload["data_sources"] = sorted(sources)
    result = ModelsOut(**payload)
    cache_set(_CACHE_KEY, result, _CACHE_TTL_SECONDS)
    return result


@router.get("", response_model=ModelsOut)
def get_models(db: Session = Depends(get_db)) -> ModelsOut:
    return _get_or_fetch(db)


@router.post("/refresh", response_model=ModelsOut)
def refresh_models(db: Session = Depends(get_db)) -> ModelsOut:
    cache_clear(_CACHE_PREFIX)
    out = _get_or_fetch(db)
    try:
        from app import boardroom_service
        boardroom_service.check_triggers(db)  # piggyback (ticket 10)
    except Exception:
        pass
    return out

# ---------------------------------------------------------------------------
# Scenario simulation (forecast tab — spec 2026-08-09). Slider specs mirror
# the reference /forecast page: signed deltas (default 0), auctionBtc absolute
# (default 2.5). backend is the single source of truth for scoring.
# ---------------------------------------------------------------------------
SLIDER_SPECS: dict[str, dict] = {
    "fedBps": {"min": -200, "max": 200, "step": 25, "default": 0, "unit": "bps", "label_th": "Fed ขึ้น/ลดดอกเบี้ย"},
    "oilPct": {"min": -40, "max": 60, "step": 5, "default": 0, "unit": "%", "label_th": "ราคาน้ำมันเปลี่ยน"},
    "goldPct": {"min": -20, "max": 40, "step": 5, "default": 0, "unit": "%", "label_th": "ราคาทองคำเปลี่ยน"},
    "vixPts": {"min": -10, "max": 30, "step": 1, "default": 0, "unit": "pts", "label_th": "VIX เปลี่ยน"},
    "hyBps": {"min": -100, "max": 400, "step": 25, "default": 0, "unit": "bps", "label_th": "HY Spread เปลี่ยน"},
    "cpiPts": {"min": -2, "max": 3, "step": 0.25, "default": 0, "unit": "pt", "label_th": "เงินเฟ้อ CPI เปลี่ยน"},
    "depositPct": {"min": -3, "max": 1, "step": 0.25, "default": 0, "unit": "%", "label_th": "เงินฝากแบงก์ (2 สัปดาห์)"},
    "dwBillion": {"min": 0, "max": 100, "step": 5, "default": 0, "unit": "$B", "label_th": "Fed Discount Window พุ่ง"},
    "sofrSpreadBps": {"min": 0, "max": 100, "step": 5, "default": 0, "unit": "bps", "label_th": "SOFR-EFFR spread (repo ตึง)"},
    "debtPts": {"min": 0, "max": 20, "step": 1, "default": 0, "unit": "pt", "label_th": "หนี้สหรัฐต่อ GDP เพิ่ม"},
    "auctionBtc": {"min": 1.8, "max": 3.2, "step": 0.1, "default": 2.5, "unit": "x", "label_th": "ประมูล 10Y Bid-to-Cover"},
}
MODEL_IDS_FORECAST = model_service.MODEL_IDS
# Fallback base values when a ctx key has no live data (reference values from
# the /forecast bundle: us10y 4.2, us2y 3.8, vix 18, usoil 70, hy 300, cpi 3).
_FALLBACK_BASE = {
    "us10y": 4.2, "us2y": 3.8, "vix": 18.0, "usoil": 70.0,
    "us_hy_spread": 3.0, "us_cpi_yoy": 3.0, "us_debt_gdp": 120.0,
    "xauusd": 3300.0, "gold_chg_pct": 0.0, "deposits_chg_pct": 0.0,
    "discount_window_b": 0.0, "sofr_effr_spread_bps": 0.0, "auction_btc": 2.5,
    "curve_10y2y_bps": 0.0, "us30y": 4.5, "us_10y_real": 2.0, "dxy": 100.0,
    "hy_spread_bps": 300.0, "ig_spread_bps": 100.0, "move": 75.0,
    "cot_gold_mm_net": 0.0, "bank_reserves_b": 3200.0, "reserves_chg_pct": 0.0,
    "on_rrp_b": 300.0, "usdjpy": 150.0, "nas100_chg_pct": 0.0, "kre_chg_pct": 0.0,
}


class SimulateRequest(BaseModel):
    overrides: dict[str, float] = {}


class SimulatedModel(BaseModel):
    model_id: str
    score: float
    status: str
    confidence: int
    delta: float
    factors: ModelFactors


class SimulateOut(BaseModel):
    baseline: list[SimulatedModel]
    simulated: list[SimulatedModel]
    missing_base: list[str]
    simulated_at: str
    slider_specs: dict[str, dict]


def _apply_overrides(ctx: dict, overrides: dict) -> tuple[dict, list[str]]:
    """Fold slider overrides into a ctx copy following the reference h()
    propagation rules (fedBps moves us10y/us2y/curve together; goldPct moves
    gold_chg_pct + xauusd; depositPct -> deposits WoW; debtPts -> us_debt_gdp;
    dwBillion -> discount_window_b; sofrSpreadBps -> sofr_effr_spread_bps;
    auctionBtc -> auction_btc). Returns (new_ctx, missing_base_keys)."""
    c = dict(ctx)
    missing: list[str] = []
    for key in ("us10y", "us2y", "vix", "usoil", "us_hy_spread", "us_cpi_yoy",
                "us_debt_gdp", "xauusd", "gold_chg_pct", "deposits_chg_pct",
                "discount_window_b", "sofr_effr_spread_bps", "auction_btc",
                "curve_10y2y_bps", "us30y", "us_10y_real", "dxy", "hy_spread_bps",
                "ig_spread_bps", "move", "cot_gold_mm_net", "bank_reserves_b",
                "reserves_chg_pct", "on_rrp_b", "usdjpy", "nas100_chg_pct", "kre_chg_pct"):
        if c.get(key) is None:
            c[key] = _FALLBACK_BASE[key]
            missing.append(key)

    fed = overrides.get("fedBps", 0.0)
    if fed:
        c["us10y"] = (c.get("us10y") or 0.0) + fed / 100.0 * 0.5
        c["us2y"] = (c.get("us2y") or 0.0) + fed / 100.0
    if c.get("us10y") is not None and c.get("us2y") is not None:
        c["curve_10y2y_bps"] = (c["us10y"] - c["us2y"]) * 100.0

    gold = overrides.get("goldPct", 0.0)
    if gold:
        c["gold_chg_pct"] = gold
        c["xauusd"] = (_FALLBACK_BASE["xauusd"] if c.get("xauusd") is None else c["xauusd"]) * (1 + gold / 100.0)
    oil = overrides.get("oilPct", 0.0)
    if oil:
        # _score_oil_high (model_service.py) reads ctx["usoil"] as a price
        # LEVEL (linear 60->85 -> capped at 100), not a % change field -- ctx
        # has no such field at all. Writing to a "wti_chg_pct" key here was a
        # bug: no scorer reads it, so the oil slider had zero effect on any
        # model's score. Scale the level instead, same pattern as goldPct
        # below.
        base_oil = _FALLBACK_BASE["usoil"] if c.get("usoil") is None else c["usoil"]
        c["usoil"] = base_oil * (1 + oil / 100.0)
    if overrides.get("depositPct"):
        c["deposits_chg_pct"] = overrides["depositPct"]
    if overrides.get("dwBillion"):
        c["discount_window_b"] = (c.get("discount_window_b") or 0.0) + overrides["dwBillion"]
    if overrides.get("sofrSpreadBps"):
        c["sofr_effr_spread_bps"] = overrides["sofrSpreadBps"]
    if overrides.get("debtPts"):
        c["us_debt_gdp"] = (c.get("us_debt_gdp") or 0.0) + overrides["debtPts"]
    if overrides.get("auctionBtc"):
        c["auction_btc"] = overrides["auctionBtc"]
    if overrides.get("vixPts"):
        c["vix"] = (c.get("vix") or 0.0) + overrides["vixPts"]
    if overrides.get("hyBps"):
        c["hy_spread_bps"] = (c.get("hy_spread_bps") or 0.0) + overrides["hyBps"]
    if overrides.get("cpiPts"):
        c["us_cpi_yoy"] = (c.get("us_cpi_yoy") or 0.0) + overrides["cpiPts"]
    return c, missing


@router.post("/simulate", response_model=SimulateOut)
def simulate(req: SimulateRequest) -> SimulateOut:
    """Score all six models under slider overrides (forecast tab). The
    baseline uses the shared macro cache; overrides fold into a ctx copy
    and _score_model re-runs — no network, no DB writes. news-NNN overrides
    (0-100 simulated news intensity per model) become news_override."""
    for key, val in req.overrides.items():
        if key.startswith("news-"):
            mid = key[len("news-"):]
            if mid not in MODEL_IDS_FORECAST:
                raise HTTPException(status_code=422, detail=f"overrides.{key}: unknown model '{mid}'")
            if not 0 <= val <= 100:
                raise HTTPException(status_code=422, detail=f"overrides.{key}: {val} is outside [0, 100]")
            continue
        spec = SLIDER_SPECS.get(key)
        if spec is None:
            raise HTTPException(status_code=422, detail=f"overrides.{key}: unknown slider")
        if not spec["min"] <= val <= spec["max"]:
            raise HTTPException(status_code=422, detail=f"overrides.{key}: {val} is outside [{spec['min']}, {spec['max']}]")

    try:
        dash = model_service.macro_service.build_dashboard()
        base_ctx = model_service._build_context_from(dash)
    except Exception:
        raise HTTPException(status_code=503, detail="Model data is unavailable right now")

    news_overrides = {k[len("news-"):]: v for k, v in req.overrides.items() if k.startswith("news-")}
    slider_overrides = {k: v for k, v in req.overrides.items() if not k.startswith("news-")}
    sim_ctx, missing = _apply_overrides(base_ctx, slider_overrides)

    def _pack(ctx: dict, is_baseline: bool) -> list[SimulatedModel]:
        out = []
        for m in model_service.MODELS:
            news_ov = news_overrides.get(m["model_id"]) if not is_baseline else None
            r = model_service._score_model(m, ctx, news_override=news_ov)
            out.append(SimulatedModel(
                model_id=m["model_id"],
                score=r["score"],
                status=r["status"],
                confidence=r["confidence"],
                delta=0.0,
                factors=ModelFactors(**r["factors"]),
            ))
        out.sort(key=lambda x: x.score, reverse=True)
        return out

    baseline = _pack(base_ctx, is_baseline=True)
    simulated = _pack(sim_ctx, is_baseline=False)
    base_by_id = {m.model_id: m.score for m in baseline}
    for m in simulated:
        m.delta = round(m.score - base_by_id.get(m.model_id, 0.0), 1)

    return SimulateOut(
        baseline=baseline,
        simulated=simulated,
        missing_base=missing,
        simulated_at=datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC"),
        slider_specs=SLIDER_SPECS,
    )
