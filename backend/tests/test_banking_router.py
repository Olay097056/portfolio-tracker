# backend/tests/test_banking_router.py
# /api/banking — bank-run stress gauge (= bank-run model score), funding
# cards, deposits/discount WoW, KRE/^BKX prices, deposit-flow + SOFR-EFFR
# history. The macro dashboard and model scores are stubbed; the two history
# fetchers and yfinance prices are stubbed with known fixtures.
import pytest

from app import banking_service
from app.routers import banking as banking_router
from app.database import SessionLocal, get_db
from app.main import app
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _clear_cache():
    banking_router._cache.clear()
    banking_service.macro_service._clear_dashboard_cache()
    yield
    banking_router._cache.clear()
    banking_service.macro_service._clear_dashboard_cache()


def _stub_dashboard(monkeypatch) -> None:
    """Stub macro_service.build_dashboard with just the banking-relevant cards."""

    def card(sid, value, change_val=None, change_pct=None, unit="%", available=True):
        return {
            "series_id": sid,
            "name_th": sid, "name_en": sid, "unit": unit,
            "value": value, "change_val": change_val, "change_pct": change_pct,
            "trend": "up" if (change_val or 0) > 0 else "down",
            "recorded_at": "2026-08-08T12:00:00Z", "available": available,
        }

    sections = [
        {"key": "moneyMarketRates", "items": [
            card("us_sofr", 5.30, 0.01),
            card("us_effr", 5.28, 0.0),
            card("us_obfr", 5.28, 0.0),
            card("us_sofr_effr_spread", 2.0, unit="bps"),
        ]},
        {"key": "bankingIndicators", "items": [
            card("us_bank_deposits", 19.4, change_pct=-0.5, unit="$B"),
            card("us_discount_window", 0.0, change_pct=0.0, unit="$B"),
            card("us_banking_stress_index", None, available=False, unit="index"),
        ]},
    ]
    dash = {"sections": sections, "data_sources": ["FRED (fredgraph.csv)"]}
    monkeypatch.setattr(banking_service.macro_service, "build_dashboard", lambda: dash)


def _stub_models(monkeypatch) -> None:
    """Stub model_service.build_models with a fixed bank-run score."""

    def fake():
        return {
            "models": [{"model_id": "bank-run", "score": 42.5, "status": "building"}],
            "meta": [{
                "model_id": "bank-run", "name_th": "โมเดลแบงก์รัน", "name_en": "Bank Run",
                "concept_th": "เงินฝากไหลออก", "trade_direction": "Short banks",
                "regime_th": "วิกฤต", "color": "#34d399",
            }],
            "updated_at": "2026-08-08T12:00:00Z",
            "data_sources": [],
        }

    monkeypatch.setattr(banking_service.model_service, "build_models", fake)


def _stub_histories(monkeypatch) -> None:
    """Stub FRED raw rows: deposits weekly 3 points, SOFR/DFF daily 3 days."""
    monkeypatch.setattr(
        banking_service, "_fred_rows",
        lambda sid: {
            "us_bank_deposits": [("2026-07-25", 100.0), ("2026-08-01", 110.0), ("2026-08-08", 121.0)],
            "us_sofr": [("2026-08-06", 5.30), ("2026-08-07", 5.31), ("2026-08-08", 5.32)],
            "us_effr": [("2026-08-06", 5.28), ("2026-08-07", 5.28), ("2026-08-08", 5.28)],
        }[sid],
    )


def _stub_prices(monkeypatch) -> None:
    monkeypatch.setattr(
        banking_service, "_bank_prices",
        lambda: {
            "KRE": {"price": 50.0, "change_pct": -2.0},
            "^BKX": {"price": 180.0, "change_pct": 1.5},
        },
    )


def _client() -> TestClient:
    return TestClient(app)


def test_happy_path_full_payload(monkeypatch):
    _stub_dashboard(monkeypatch)
    _stub_models(monkeypatch)
    _stub_histories(monkeypatch)
    _stub_prices(monkeypatch)
    r = _client().get("/api/banking")
    assert r.status_code == 200
    b = r.json()

    # Gauge = bank-run model score (user decision: gauge == model card).
    assert b["gauge"]["value"] == 42.5
    assert b["gauge"]["status"] == "building"
    assert b["gauge"]["zones"] == [
        {"max": 40, "color": "#10b981"},
        {"max": 70, "color": "#f59e0b"},
        {"max": 100, "color": "#ef4444"},
    ]

    # Funding cards: 4, values + change bps.
    assert [f["series_id"] for f in b["funding"]] == [
        "us_sofr", "us_effr", "us_obfr", "us_sofr_effr_spread",
    ]
    sofr = b["funding"][0]
    assert sofr["value"] == 5.30
    assert sofr["change_bps"] == 1.0  # 0.01% * 100

    # Stat cards: deposits/discount from dashboard, KRE/^BKX from yfinance.
    assert b["stat_cards"]["us_bank_deposits"]["value"] == 19.4
    assert b["stat_cards"]["us_bank_deposits"]["change_pct"] == -0.5
    assert b["stat_cards"]["kre"] == {"price": 50.0, "change_pct": -2.0}
    assert b["stat_cards"]["bkx"] == {"price": 180.0, "change_pct": 1.5}

    # Deposit-flow WoW: 100 -> 110 = +10%, 110 -> 121 = +10%.
    assert b["deposit_flow"] == [
        {"date": "2026-08-01", "value": 10.0},
        {"date": "2026-08-08", "value": 10.0},
    ]

    # SOFR-EFFR spread bps: (5.30-5.28)*100=2, (5.31-5.28)*100=3, (5.32-5.28)*100=4.
    assert b["sofr_effr_spread"] == [
        {"date": "2026-08-06", "value": 2.0},
        {"date": "2026-08-07", "value": 3.0},
        {"date": "2026-08-08", "value": 4.0},
    ]

    # Model card mirrors the gauge value.
    assert b["model"]["model_id"] == "bank-run"
    assert b["model"]["score"] == 42.5
    assert b["model"]["name_th"] == "โมเดลแบงก์รัน"
    assert b["model"]["color"] == "#34d399"
    assert "Bank-run regime model (computed)" in b["data_sources"]


def test_missing_series_renders_none_not_fabricated(monkeypatch):
    """A card whose value is missing must be None (renders '—'), never 0."""
    _stub_dashboard(monkeypatch)
    _stub_models(monkeypatch)
    _stub_histories(monkeypatch)
    _stub_prices(monkeypatch)
    monkeypatch.setattr(banking_service, "_bank_prices", lambda: {"KRE": None, "^BKX": None})
    r = _client().get("/api/banking")
    b = r.json()
    assert b["stat_cards"]["kre"] is None
    assert b["stat_cards"]["bkx"] is None


def test_router_caches_within_ttl(monkeypatch):
    _stub_dashboard(monkeypatch)
    _stub_models(monkeypatch)
    _stub_histories(monkeypatch)
    _stub_prices(monkeypatch)
    client = _client()
    calls = {"n": 0}
    real = banking_service.build_banking

    def counting():
        calls["n"] += 1
        return real()

    monkeypatch.setattr(banking_service, "build_banking", counting)
    client.get("/api/banking")
    client.get("/api/banking")
    assert calls["n"] == 1  # second call served from cache


def test_refresh_invalidates_cache(monkeypatch):
    _stub_dashboard(monkeypatch)
    _stub_models(monkeypatch)
    _stub_histories(monkeypatch)
    _stub_prices(monkeypatch)
    client = _client()
    calls = {"n": 0}
    real = banking_service.build_banking

    def counting():
        calls["n"] += 1
        return real()

    monkeypatch.setattr(banking_service, "build_banking", counting)
    client.get("/api/banking")
    client.post("/api/banking/refresh")
    assert calls["n"] == 2  # refresh rebuilt
