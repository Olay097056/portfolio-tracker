# backend/tests/test_signals_router.py
# /api/signals — the Bond-crisis trade desk. The signal engine is stubbed
# (model scores + yfinance candles); the router's persistence + stats + close
# flow runs against a real (test) SQLite database, same pattern as the other
# routers.
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import model_service, signals_service
from app.database import SessionLocal, engine
from app.main import app
from app.routers import signals as signals_router
from app.routers.signals import TradingSignal
from sqlalchemy import delete, select

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def _clear_state():
    signals_router._cache.clear()
    db = SessionLocal()
    db.execute(delete(TradingSignal))
    db.commit()
    db.close()
    yield
    signals_router._cache.clear()
    db = SessionLocal()
    db.execute(delete(TradingSignal))
    db.commit()
    db.close()


def _stub_models(monkeypatch, scores: dict[str, float]):
    """Model payload: score + status per model_id; registry keeps signal_map."""
    models = [
        {"model_id": mid, "score": score,
         "status": "active" if score >= 60 else ("building" if score >= 40 else "inactive"),
         "name_th": mid, "available": True}
        for mid, score in scores.items()
    ]
    models.sort(key=lambda m: m["score"], reverse=True)
    for i, m in enumerate(models, 1):
        m["rank"] = i
    payload = {
        "models": models,
        "data_sources": ["FRED (fredgraph.csv)", "Yahoo Finance (yfinance)"],
    }

    def fake_build_models():
        return payload

    monkeypatch.setattr(model_service, "build_models", fake_build_models)


def _fake_candles(base: float, step: float = 0.01, n: int = 60) -> list[dict]:
    """60 rising daily candles (uptrend)."""
    out = []
    price = base
    for i in range(n):
        price = base + i * base * step
        out.append({"o": price * 0.999, "h": price * 1.004, "l": price * 0.997,
                    "c": price, "t": f"2026-06-{i % 28 + 1:02d}"})
    return out


def _stub_yf(monkeypatch):
    """Every asset yields an uptrend with a high TA score (>=50)."""
    def fake_yf_candles(ticker):
        return _fake_candles(100.0, 0.02)
    monkeypatch.setattr(signals_service, "_yf_candles", fake_yf_candles)


def _client() -> TestClient:
    return TestClient(app)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
def test_generates_signals_when_models_building(monkeypatch):
    """Two building models + rising candles -> signals generated & persisted."""
    _stub_models(monkeypatch, {"fed-pivot": 53.7, "yield-shock": 23.5})
    _stub_yf(monkeypatch)
    body = _client().get("/api/signals").json()

    assert body["stats"]["active_count"] > 0
    assert body["stats"]["closed_count"] == 0
    for s in body["signals"]:
        assert s["status"] == "active"
        assert s["model_id"] == "fed-pivot"  # only the building model emits
        assert s["ta_snapshot"]["ta_score"] >= s["ta_snapshot"]["threshold"]
        assert s["signal_strength"] == sum(s["strength_factors"].values())
        assert s["expires_at"] is not None


def test_inactive_models_emit_nothing(monkeypatch):
    """All models inactive -> no signals, stats empty, honest note."""
    _stub_models(monkeypatch, {"yield-shock": 23.5, "bank-run": 11.2})
    _stub_yf(monkeypatch)
    body = _client().get("/api/signals").json()

    assert body["signals"] == []
    assert body["stats"]["active_count"] == 0
    assert any("ยังไม่มี" in n for n in body["notes"])


def test_close_signal_updates_stats(monkeypatch):
    """Closing an active signal sets status + pnl and feeds the stats panel."""
    _stub_models(monkeypatch, {"fed-pivot": 53.7})
    _stub_yf(monkeypatch)
    c = _client()
    body = c.get("/api/signals").json()
    sig = body["signals"][0]

    r = c.post("/api/signals/close", json={"signal_id": sig["id"]})
    assert r.status_code == 200
    closed = r.json()
    assert closed["status"] in ("tp_hit", "sl_hit")
    assert closed["closed_at"] is not None

    body2 = c.get("/api/signals").json()
    assert body2["stats"]["closed_count"] == 1
    assert body2["stats"]["win_rate"] in (0.0, 100.0)


def test_close_unknown_signal_404(monkeypatch):
    _stub_models(monkeypatch, {"fed-pivot": 53.7})
    _stub_yf(monkeypatch)
    r = _client().post("/api/signals/close", json={"signal_id": "nope"})
    assert r.status_code == 404


def test_close_twice_rejected(monkeypatch):
    _stub_models(monkeypatch, {"fed-pivot": 53.7})
    _stub_yf(monkeypatch)
    c = _client()
    sig = c.get("/api/signals").json()["signals"][0]
    assert c.post("/api/signals/close", json={"signal_id": sig["id"]}).status_code == 200
    assert c.post("/api/signals/close", json={"signal_id": sig["id"]}).status_code == 400


def test_expire_stale_signal_p54(monkeypatch):
    """A signal past expires_at closes automatically at the current price."""
    _stub_models(monkeypatch, {"fed-pivot": 53.7})
    _stub_yf(monkeypatch)
    c = _client()
    body = c.get("/api/signals").json()
    sig = body["signals"][0]

    db = SessionLocal()
    row = db.execute(select(TradingSignal).where(TradingSignal.id == sig["id"])).scalar_one()
    from datetime import datetime, timedelta, timezone
    row.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db.commit()
    db.close()

    # Next fetch expires it.
    signals_router._cache.clear()
    body2 = c.get("/api/signals").json()
    statuses = {s["status"] for s in body2["signals"]}
    assert "expired" in statuses
    assert body2["stats"]["closed_count"] >= 1


def test_cache_and_refresh(monkeypatch):
    _stub_models(monkeypatch, {"fed-pivot": 53.7})
    _stub_yf(monkeypatch)
    c = _client()
    calls = {"n": 0}
    real_gen = signals_service.generate_signals

    def counting_gen():
        calls["n"] += 1
        return real_gen()

    monkeypatch.setattr(signals_service, "generate_signals", counting_gen)
    c.get("/api/signals")
    c.get("/api/signals")
    assert calls["n"] == 1  # cached
    c.post("/api/signals/refresh")
    assert calls["n"] == 2  # force


def test_stats_formulas_match_reference(monkeypatch):
    """compute_stats implements the reference module-26079 formulas."""
    from app.signals_service import compute_stats

    signals = [
        {"status": "active", "pnl_pct": 1.5, "entry_price": 100, "sl": 95, "tp": 110,
         "created_at": "2026-08-01T00:00:00", "closed_at": None},
        {"status": "tp_hit", "pnl_pct": 8.0, "entry_price": 100, "sl": 95, "tp": 110,
         "created_at": "2026-08-01T00:00:00", "closed_at": "2026-08-02T00:00:00"},
        {"status": "sl_hit", "pnl_pct": -5.0, "entry_price": 100, "sl": 95, "tp": 110,
         "created_at": "2026-08-01T00:00:00", "closed_at": "2026-08-03T00:00:00"},
    ]
    st = compute_stats(signals)
    assert st.active_count == 1
    assert st.closed_count == 2
    assert st.win_rate == 50.0
    assert st.realized_pnl == 3.0
    assert st.unrealized_pnl == 1.5
    assert st.expectancy == 1.5
    assert st.profit_factor == 8.0 / 5.0
    assert st.best_trade == 8.0
    assert st.worst_trade == -5.0
    assert st.avg_rr == 2.0  # (110-100)/(100-95)
    assert len(st.equity_curve) == 2
    assert st.equity_curve[-1]["equity"] == 3.0
