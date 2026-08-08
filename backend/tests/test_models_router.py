# backend/tests/test_models_router.py
# /api/models — six regime models scored from the macro dashboard's data.
# The macro dashboard layer is stubbed (same fixtures as test_macro_router);
# nothing touches the network except the router's SQLite history write.
import pytest

from app import model_service
import app.routers.models as models_router


@pytest.fixture(autouse=True)
def _clear_cache():
    models_router._cache.clear()
    yield
    models_router._cache.clear()


# Minimal macro-dashboard stub: only the series the model scorers read.
def _stub_macro_dashboard(monkeypatch, overrides: dict | None = None):
    base = {
        "dxy": 99.60, "vix": 14.90, "move": 72.03,
        "us10y": 4.69, "us2y": 4.25, "us30y": 5.21,
        "usoil": 78.18, "xauusd": 4340.70,
        "us_cpi_yoy": 3.58, "us_pce_yoy": 3.2, "us_10y_real": 2.43,
        "us_hy_spread": 271.0, "us_ig_spread": 78.0,
        "us_bank_deposits": 19401.1, "us_discount_window": 0.0,
        "us_bank_reserves": 2993.3, "us_on_rrp": 140.0,
        "us_sofr_effr_spread": 2.0, "cot_gold_mm_net": 130766.0,
        "us_auction_btc": 2.59, "us13w": 3.71, "us1y": 4.06,
        "us5y": 4.36, "us20y": 5.22,
        "deposits_chg_pct": 0.2, "reserves_chg_pct": 0.1, "gold_chg_pct": 0.3,
        "us2y_change_val": 0.0,
    }
    base.update(overrides or {})

    def card(series_id, value, change_pct=None, change_val=None):
        return {
            "series_id": series_id, "value": value, "change_val": change_val,
            "change_pct": change_pct, "trend": "flat", "recorded_at": "2026-08-06",
            "available": value is not None,
        }

    sections = [
        {"key": "treasuryYields", "title_th": "", "title_en": "",
         "items": [card("us13w", base["us13w"]), card("us1y", base["us1y"]),
                   card("us2y", base["us2y"], change_val=base["us2y_change_val"]),
                   card("us5y", base["us5y"]), card("us10y", base["us10y"]),
                   card("us20y", base["us20y"]), card("us30y", base["us30y"])]},
        {"key": "moneyMarketRates", "title_th": "", "title_en": "",
         "items": [card("us_sofr", 3.65), card("us_effr", 3.63), card("us_obfr", 3.63),
                   card("us_on_rrp", base["us_on_rrp"]), card("us_tga", 929.3),
                   card("us_sofr_effr_spread", base["us_sofr_effr_spread"])]},
        {"key": "macroIndicators", "title_th": "", "title_en": "",
         "items": [card("dxy", base["dxy"]), card("vix", base["vix"]),
                   card("move", base["move"]), card("xauusd", base["xauusd"], change_pct=base["gold_chg_pct"]),
                   card("xagusd", 63.33), card("usoil", base["usoil"]),
                   card("brent", 81.35), card("us_cpi_yoy", base["us_cpi_yoy"]),
                   card("us_pce_yoy", base["us_pce_yoy"]),
                   card("us_core_cpi", 3.4), card("us_10y_real", base["us_10y_real"]),
                   card("us_10y_breakeven", 2.25), card("us_5y_breakeven", 2.22),
                   card("us_unemployment", 4.1)]},
        {"key": "creditSpreads", "title_th": "", "title_en": "",
         "items": [card("us_hy_spread", base["us_hy_spread"]),
                   card("us_ig_spread", base["us_ig_spread"]),
                   card("us_debt_gdp", 122.59), card("us_fiscal_deficit", None),
                   card("us_household_debt", 68.55), card("us_sloos_tightening", 0.0),
                   card("us_auction_btc", base["us_auction_btc"]),
                   card("us_auction_btc_2y", 2.66), card("us_auction_btc_5y", 2.28),
                   card("us_auction_btc_30y", 2.3),
                   card("us_auction_indirect_10y", 65.2)]},
        {"key": "positioning", "title_th": "", "title_en": "",
         "items": [card("cot_gold_mm_net", base["cot_gold_mm_net"]),
                   card("cot_silver_mm_net", 12000.0),
                   card("cot_wti_mm_net", 90000.0),
                   card("cot_copper_mm_net", 25000.0),
                   card("cot_wheat_mm_net", -30000.0),
                   card("cot_corn_mm_net", -20000.0),
                   card("cot_dx_lev_net", -15000.0),
                   card("cot_jpy_lev_net", 40000.0),
                   card("cot_ust10y_lev_net", 20000.0),
                   card("cot_ust10y_am_net", 50000.0),
                   card("cot_ust30y_lev_net", 8000.0),
                   card("cot_ust30y_am_net", 30000.0),
                   card("foreign_ust_total", 7402.5),
                   card("foreign_official_ust", 3713.9)]},
        {"key": "bankingIndicators", "title_th": "", "title_en": "",
         "items": [card("us_banking_stress_index", None),
                   card("us_bank_deposits", base["us_bank_deposits"], change_pct=base["deposits_chg_pct"]),
                   card("us_small_bank_deposits", 5635.9),
                   card("us_discount_window", base["us_discount_window"]),
                   card("us_stlfsi", -0.51),
                   card("us_bank_reserves", base["us_bank_reserves"], change_pct=base["reserves_chg_pct"]),
                   card("us_cp_rate_90d", 3.76),
                   card("us_fima_repo_pool", 317.7),
                   card("us_fima_repo_used", 0.0),
                   card("us_crude_inventory", None), card("us_crude_inventory_chg", None),
                   card("us_gasoline_inventory", None), card("us_distillate_inventory", None),
                   card("us_distillate_inventory_chg", None)]},
    ]
    dash = {
        "yield_curve": {
            "points": [], "spread_10y2y_bps": (base["us10y"] - base["us2y"]) * 100,
            "inverted": base["us10y"] < base["us2y"],
        },
        "gold_cme": {"available": False},
        "sections": sections,
        "updated_at": "08/08/2026 12:00:00 UTC",
        "data_sources": ["FRED (fredgraph.csv)", "Yahoo Finance (yfinance)"],
    }
    monkeypatch.setattr(model_service.macro_service, "build_dashboard", lambda: dash)
    # yfinance extras used by model inputs (JPY, NAS100, KRE) — offline in tests.
    monkeypatch.setattr(model_service, "_yf_extras", lambda: None)


def _client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


def _stub_yf_extras(monkeypatch, kre_chg=-0.2, vix_override=None):
    monkeypatch.setattr(
        model_service, "_yf_extras",
        lambda: {"usdjpy": 158.01, "nas100_chg_pct": 0.4, "kre_chg_pct": kre_chg},
    )
    if vix_override is not None:
        # Bump the stub dashboard's VIX card for panic-style scenarios.
        dash = model_service.macro_service.build_dashboard()
        for section in dash["sections"]:
            for item in section["items"]:
                if item["series_id"] == "vix" and item.get("available"):
                    item["value"] = vix_override


# --- Happy path ---------------------------------------------------------------


def test_models_endpoint_returns_six_scored_models(monkeypatch):
    _stub_macro_dashboard(monkeypatch)
    _stub_yf_extras(monkeypatch)
    response = _client().get("/api/models")
    assert response.status_code == 200
    body = response.json()

    assert len(body["models"]) == 6
    assert len(body["meta"]) == 6
    # Ranks are 1..6 and unique.
    assert sorted(m["rank"] for m in body["models"]) == [1, 2, 3, 4, 5, 6]
    # Scores are 0-100 and the list is sorted by score descending.
    assert all(0 <= m["score"] <= 100 for m in body["models"])
    assert [m["score"] for m in body["models"]] == sorted(
        (m["score"] for m in body["models"]), reverse=True
    )

    # Every model has Thai/English meta, a colour and a signal map.
    meta_by_id = {m["model_id"]: m for m in body["meta"]}
    assert set(meta_by_id) == {"recovery-reflation", "inflation-oil", "fed-pivot",
                               "yield-shock", "credit-panic", "bank-run"}
    assert meta_by_id["fed-pivot"]["name_th"] == "โมเดล Fed เปลี่ยนท่าที / Duration Rally"
    assert meta_by_id["bank-run"]["signal_map"]
    assert meta_by_id["credit-panic"]["color"] == "#f87171"

    # Factors match the reference caps and the total is their sum.
    fed = next(m for m in body["models"] if m["model_id"] == "fed-pivot")
    f = fed["factors"]
    assert f["market_structure"] <= 25 and f["macro"] <= 30
    assert f["news"] == 0 and f["confirmation"] <= 20 and f["risk_penalty"] <= 0
    assert fed["score"] == pytest.approx(
        f["market_structure"] + f["macro"] + f["news"] + f["confirmation"] + f["risk_penalty"],
        abs=0.2,
    )

    # Conditions carry name + score, and scores are honest numbers or None.
    assert fed["conditions"]
    assert all(c["name"] for c in fed["conditions"])
    assert all(c["score"] is None or 0 <= c["score"] <= 100 for c in fed["conditions"])

    # Thresholds + status mapping are present for the UI.
    assert body["thresholds"] == {"building": 40.0, "active": 60.0}
    assert body["status_meta"]["building"]["th"] == "กำลังก่อตัว"
    assert body["factor_labels_th"]["macro"] == "ข้อมูลมหภาค"


def test_stress_models_score_low_when_market_is_calm(monkeypatch):
    """Calm tape (VIX 14.9, curve normal, MOVE 72) must keep the stress
    models (yield-shock / credit-panic / bank-run) far below the risk-on
    models — same shape as the reference site's current scores."""
    _stub_macro_dashboard(monkeypatch)
    _stub_yf_extras(monkeypatch)
    body = _client().get("/api/models").json()
    by_id = {m["model_id"]: m["score"] for m in body["models"]}

    assert by_id["yield-shock"] < by_id["fed-pivot"]
    assert by_id["credit-panic"] < by_id["recovery-reflation"]
    assert by_id["bank-run"] < 40.0  # not even building


def test_yield_shock_reacts_to_high_yields(monkeypatch):
    """10Y > 4.5%, real yield high, USD strong, MOVE elevated, gold falling →
    yield-shock must be the top model."""
    _stub_macro_dashboard(monkeypatch, overrides={
        "us10y": 4.95, "us2y": 4.5, "us30y": 5.6, "us_10y_real": 2.8,
        "dxy": 106.5, "vix": 26.0, "move": 118.0, "us_auction_btc": 2.3,
        "gold_chg_pct": -1.0, "us_bank_reserves": 3100.0, "reserves_chg_pct": 0.5,
    })
    _stub_yf_extras(monkeypatch)
    body = _client().get("/api/models").json()
    top = body["models"][0]
    assert top["model_id"] == "yield-shock"
    assert top["score"] >= 60.0
    assert top["status"] == "active"


def test_bank_run_reacts_to_deposit_flight(monkeypatch):
    """Deposits shrinking WoW + discount window spiking + low reserves +
    regional banks breaking + flight-to-safety (2Y collapsing, curve
    inverting, bond vol up) → bank-run climbs the ranking."""
    _stub_macro_dashboard(monkeypatch, overrides={
        "us_bank_deposits": 18900.0,  # vs 19401.1 in the card -> big drop
        "deposits_chg_pct": -2.6,
        "us_discount_window": 8.0,
        "us_bank_reserves": 2800.0,
        "reserves_chg_pct": -4.0,
        "us_on_rrp": 150.0,
        "us_sofr_effr_spread": 6.0,
        "us2y": 3.9, "us2y_change_val": -0.5,  # 2Y collapsing
        "us10y": 4.1,  # curve now inverted (10Y < 2Y pre-crash baseline)
        "move": 118.0,  # bond vol spiking
        "vix": 22.0,
    })
    _stub_yf_extras(monkeypatch, kre_chg=-4.0)
    body = _client().get("/api/models").json()
    bank = next(m for m in body["models"] if m["model_id"] == "bank-run")
    assert bank["score"] > 40.0
    assert bank["status"] in ("building", "active")


def test_router_caches_within_ttl(monkeypatch):
    _stub_macro_dashboard(monkeypatch)
    _stub_yf_extras(monkeypatch)
    client = _client()
    calls = {"n": 0}
    real_build = model_service.build_models

    def counting_build():
        calls["n"] += 1
        return real_build()

    monkeypatch.setattr(model_service, "build_models", counting_build)
    client.get("/api/models")
    client.get("/api/models")
    assert calls["n"] == 1


def test_refresh_invalidates_cache(monkeypatch):
    _stub_macro_dashboard(monkeypatch)
    _stub_yf_extras(monkeypatch)
    client = _client()
    calls = {"n": 0}
    real_build = model_service.build_models

    def counting_build():
        calls["n"] += 1
        return real_build()

    monkeypatch.setattr(model_service, "build_models", counting_build)
    client.get("/api/models")
    client.get("/api/models")
    assert calls["n"] == 1
    client.post("/api/models/refresh")
    assert calls["n"] == 2


# --- History ------------------------------------------------------------------


def test_history_records_snapshots_and_prunes(monkeypatch):
    _stub_macro_dashboard(monkeypatch)
    _stub_yf_extras(monkeypatch)
    client = _client()
    from datetime import datetime, timedelta, timezone

    # Seed two old snapshots (40 days ago) plus a fresh one via the API.
    import uuid
    from app.database import SessionLocal
    from app.routers.models import ModelScoreHistory

    db = SessionLocal()
    old = datetime.now(timezone.utc) - timedelta(days=40)
    for model_id, score in (("fed-pivot", 50.0), ("bank-run", 10.0)):
        db.add(ModelScoreHistory(id=uuid.uuid4().hex, recorded_at=old,
                                 model_id=model_id, score=score))
    db.commit()
    db.close()

    body = client.get("/api/models").json()
    # The fresh snapshot's history is present; the 40-day-old rows are pruned.
    assert body["history"], "expected at least one history point"
    latest = body["history"][-1]
    assert set(latest["scores"]) == {
        "recovery-reflation", "inflation-oil", "fed-pivot", "yield-shock",
        "credit-panic", "bank-run",
    }

    db = SessionLocal()
    from sqlalchemy import select
    from app.routers.models import ModelScoreHistory as H

    rows = db.execute(select(H)).scalars().all()
    now = datetime.now(timezone.utc)
    for r in rows:
        ts = r.recorded_at if r.recorded_at.tzinfo else r.recorded_at.replace(tzinfo=timezone.utc)
        assert (now - ts).days < 30
    db.close()
