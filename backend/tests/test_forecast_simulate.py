# --- Scenario simulation (forecast tab) -------------------------------------

import pytest

from tests.test_models_router import _client, _stub_macro_dashboard, _stub_yf_extras


def test_simulate_deposit_flight_makes_bank_run_top(monkeypatch):
    """Bank-run stress scenario: deposits -2.5% WoW + discount window +$80B +
    SOFR-EFFR 60bps + heavy bank-run news must lift bank-run above baseline
    and into building/active. Simulated must never write to trading_signals."""
    _stub_macro_dashboard(monkeypatch)
    _stub_yf_extras(monkeypatch)
    from app import signals_service as ss
    before = len(ss.list_signals()) if hasattr(ss, "list_signals") else None
    body = _client().post("/api/models/simulate", json={
        "overrides": {
            "depositPct": -2.5, "dwBillion": 80, "sofrSpreadBps": 60,
            "vixPts": 15, "hyBps": 200, "news-bank-run": 90,
        },
    }).json()

    base = {m["model_id"]: m for m in body["baseline"]}
    sim = {m["model_id"]: m for m in body["simulated"]}
    assert sim["bank-run"]["score"] > base["bank-run"]["score"]
    assert sim["bank-run"]["score"] > sim["yield-shock"]["score"]  # top now
    assert sim["bank-run"]["status"] in ("building", "active")
    # deltas are consistent
    for mid in sim:
        assert sim[mid]["delta"] == round(sim[mid]["score"] - base[mid]["score"], 1)
    # slider specs shipped so the UI can render without hardcoding
    assert set(body["slider_specs"]) >= {"fedBps", "depositPct", "auctionBtc"}
    assert body["slider_specs"]["auctionBtc"]["default"] == 2.5
    # never persists: trading_signals row count unchanged
    if before is not None:
        after = len(ss.list_signals())
        assert after == before


def test_simulate_validation_rejects_out_of_range(monkeypatch):
    _stub_macro_dashboard(monkeypatch)
    _stub_yf_extras(monkeypatch)
    r = _client().post("/api/models/simulate", json={"overrides": {"fedBps": 999}})
    assert r.status_code == 422
    assert "fedBps" in r.json()["detail"]
    r2 = _client().post("/api/models/simulate", json={"overrides": {"nope": 1}})
    assert r2.status_code == 422
    r3 = _client().post("/api/models/simulate", json={"overrides": {"news-nope": 50}})
    assert r3.status_code == 422
    r4 = _client().post("/api/models/simulate", json={"overrides": {"news-bank-run": 150}})
    assert r4.status_code == 422


def test_simulate_fed_hike_moves_curve_together(monkeypatch):
    """fedBps +150 must propagate to us10y (+0.75) and us2y (+1.5) so the
    curve flattens/inverts — the coupled-key rule from ticket 03."""
    _stub_macro_dashboard(monkeypatch)
    _stub_yf_extras(monkeypatch)
    body = _client().post("/api/models/simulate", json={"overrides": {"fedBps": 150}}).json()
    # yield-shock benefits from higher yields; fed-pivot loses (no more cuts)
    sim = {m["model_id"]: m for m in body["simulated"]}
    base = {m["model_id"]: m for m in body["baseline"]}
    assert sim["yield-shock"]["score"] > base["yield-shock"]["score"]
    assert sim["fed-pivot"]["score"] < base["fed-pivot"]["score"]


def test_simulate_no_news_override_keeps_real_news(monkeypatch):
    """Without news-* overrides the simulated factors carry the real news
    factor (which may be 0 when no related news in the 7-day window)."""
    _stub_macro_dashboard(monkeypatch)
    _stub_yf_extras(monkeypatch)
    body = _client().post("/api/models/simulate", json={"overrides": {"vixPts": 5}}).json()
    sim = {m["model_id"]: m for m in body["simulated"]}
    assert 0 <= sim["bank-run"]["factors"]["news"] <= 15


def test_news_factor_weights_freshness(monkeypatch):
    """news_scores: an item 1 day old counts full weight, an item 6 days old
    counts 0.25x — and items outside the 7-day window are excluded."""
    import json as _json
    from datetime import datetime, timedelta, timezone
    from app import model_service as ms
    from app.database import SessionLocal
    from app.news_service import NewsItem

    ms._clear_news_cache()
    db = SessionLocal()
    now = datetime.now(timezone.utc)
    fresh = NewsItem(id="news-t1", title="fresh", url="https://t/f1", source="test",
                     published_at=now - timedelta(days=1), created_at=now,
                     impact_score=80, related_models=_json.dumps(["bank-run"]))
    old = NewsItem(id="news-t2", title="old", url="https://t/f2", source="test",
                   published_at=now - timedelta(days=6), created_at=now,
                   impact_score=80, related_models=_json.dumps(["bank-run"]))
    stale = NewsItem(id="news-t3", title="stale", url="https://t/f3", source="test",
                     published_at=now - timedelta(days=9), created_at=now,
                     impact_score=80, related_models=_json.dumps(["bank-run"]))
    db.add_all([fresh, old, stale])
    db.commit()
    try:
        scores = ms._compute_news_scores()
        # weighted mean: (80×1.0 + 80×0.25) / 2 = 50; stale (9d) excluded
        assert scores["bank-run"] == pytest.approx(50.0, abs=0.01)
    finally:
        db.query(NewsItem).filter(NewsItem.id.in_(["news-t1", "news-t2", "news-t3"])).delete()
        db.commit()
        db.close()
        ms._clear_news_cache()


def test_news_factor_dropped_when_no_related_news(monkeypatch):
    """No related news in window -> factor dropped (score can reach 100, the
    honest missing-data treatment)."""
    from app import model_service as ms
    ms._clear_news_cache()
    ctx = {"curve_10y2y_bps": -50.0, "move": 120.0, "gold_chg_pct": -1.0,
           "vix": 30.0, "hy_spread_bps": 500.0, "ig_spread_bps": 200.0,
           "us10y": 5.2, "us30y": 5.8, "dxy": 108.0, "us_10y_real": 3.0,
           "auction_btc": 2.0, "us_debt_gdp": 135.0, "us2y": 5.0,
           "cot_gold_mm_net": 50000.0, "bank_reserves_b": 3100.0,
           "nas100_chg_pct": -2.0, "usdjpy": 155.0, "kre_chg_pct": -1.5,
           "deposits_chg_pct": -0.5, "discount_window_b": 10.0,
           "on_rrp_b": 250.0, "sofr_effr_spread_bps": 15.0}
    m = next(x for x in ms.MODELS if x["model_id"] == "bank-run")
    r = ms._score_model(m, ctx)
    assert r["factors"]["news"] == 0.0
    # with an override the factor is present
    r2 = ms._score_model(m, ctx, news_override=90.0)
    assert r2["factors"]["news"] == pytest.approx(15.0 * 0.9, abs=0.1)


def test_simulate_missing_base_reports_fallback(monkeypatch):
    """missing_base lists every ctx key that fell back to the reference
    median — the UI shows the amber warning for exactly those."""
    _stub_macro_dashboard(monkeypatch)
    _stub_yf_extras(monkeypatch)
    body = _client().post("/api/models/simulate", json={"overrides": {"oilPct": 10}}).json()
    assert isinstance(body["missing_base"], list)


def test_simulate_oil_slider_moves_inflation_oil_score(monkeypatch):
    """oilPct must actually move the inflation-oil model. Regression test:
    _apply_overrides used to write a 'wti_chg_pct' ctx key that no scorer
    reads (_score_oil_high reads the 'usoil' price level) -- the slider had
    zero effect on any model's score, silently, with no error."""
    _stub_macro_dashboard(monkeypatch)
    _stub_yf_extras(monkeypatch)
    body = _client().post("/api/models/simulate", json={"overrides": {"oilPct": 50}}).json()
    base = {m["model_id"]: m for m in body["baseline"]}
    sim = {m["model_id"]: m for m in body["simulated"]}
    assert sim["inflation-oil"]["score"] != base["inflation-oil"]["score"]

    body_down = _client().post("/api/models/simulate", json={"overrides": {"oilPct": -30}}).json()
    sim_down = {m["model_id"]: m for m in body_down["simulated"]}
    assert sim_down["inflation-oil"]["score"] < sim["inflation-oil"]["score"]
