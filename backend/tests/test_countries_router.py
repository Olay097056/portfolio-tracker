# backend/tests/test_countries_router.py
# /api/countries — 27 country cards with yields, computed risk scores,
# bps-vs-US and trends. Yield sources and the score components are stubbed
# with known fixtures; the router cache is tested like the other routers.
import pytest

from app import countries_service
from app.country_ai_service import AI_MODEL
from app.main import app
from app.routers import countries as countries_router
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _clear_cache():
    
    yield
    


def _stub_yields(monkeypatch):
    """Stub per-country yield rows: US 4.47, TH 2.05 (wgb), MX 9.45 (fred),
    LA none. FRED countries get a small history for trend; wgb get 1 point."""

    def fake_yield_rows(code, meta):
        if code == "US":
            rows = [("2026-06-01", 4.30), ("2026-06-15", 4.40), ("2026-07-01", 4.47)]
            return rows, "2026-07-01", 7.0
        if code == "TH":
            return [("2026-08-09", 2.05)], "2026-08-09", 8.3
        if code == "MX":
            rows = [("2026-05-01", 9.0), ("2026-06-01", 9.45)]
            return rows, "2026-06-01", 45.0
        if code == "RU":
            return [("2018-06-01", 7.62)], "2018-06-01", None  # stale
        if code == "LA":
            return None, None, None  # no source
        return [("2026-07-01", 3.0)], "2026-07-01", 0.0

    monkeypatch.setattr(countries_service, "_yield_rows", fake_yield_rows)


def _stub_fx(monkeypatch):
    monkeypatch.setattr(countries_service, "_fx_score", lambda ccy: 0.0)


def _client() -> TestClient:
    return TestClient(app)


def test_happy_path_all_countries_present(monkeypatch):
    _stub_yields(monkeypatch)
    _stub_fx(monkeypatch)
    r = _client().get("/api/countries")
    assert r.status_code == 200
    b = r.json()
    assert len(b["countries"]) == 27
    assert b["us_10y"] == 4.47

    by_code = {c["code"]: c for c in b["countries"]}
    # US is the benchmark: score low, no bps-vs-us
    us = by_code["US"]
    assert us["yield_value"] == 4.47
    assert us["bps_vs_us"] is None
    assert us["level"] == "low"
    # TH from Playwright single point: yield + chg + bps vs US
    th = by_code["TH"]
    assert th["yield_value"] == 2.05
    assert th["chg_bp"] == 8.3
    assert th["bps_vs_us"] == -242.0  # (2.05-4.47)*100
    # MX: high yield spread -> medium-ish score, positive bps
    mx = by_code["MX"]
    assert mx["bps_vs_us"] == 498.0
    assert mx["score"] is not None and mx["score"] > 20
    # LA: no free source -> None everywhere (never fabricated)
    la = by_code["LA"]
    assert la["yield_value"] is None
    assert la["score"] is None
    assert la["level"] is None
    assert la["data_tier"] == "manual"


def test_score_formula_matches_user_confirmed_components(monkeypatch):
    _stub_yields(monkeypatch)
    _stub_fx(monkeypatch)
    r = _client().get("/api/countries")
    by_code = {c["code"]: c for c in r.json()["countries"]}
    # TH: yield_level (spread -2.42 -> 0) + momentum 8.3/10=0.8 + fx 0 + fresh 0
    th = by_code["TH"]
    assert th["score"] == 0.8
    assert th["components"]["yield_level"] == 0.0
    assert th["components"]["yield_momentum"] == 0.8
    # MX: yield_level (spread +4.98 -> capped near 25) + momentum 45/10 = 4.5
    mx = by_code["MX"]
    assert mx["components"]["yield_level"] > 20
    assert mx["components"]["yield_momentum"] == 4.5  # 45bp / 10


def test_stale_russia_flagged_not_fabricated(monkeypatch):
    _stub_yields(monkeypatch)
    _stub_fx(monkeypatch)
    by_code = {c["code"]: c for c in _client().get("/api/countries").json()["countries"]}
    ru = by_code["RU"]
    assert ru["yield_value"] == 7.62  # real data, shown
    assert ru["yield_stale"] is True  # but flagged stale
    assert ru["components"]["data_freshness"] == 5.0


def test_fred_countries_have_trend_playwright_single_point_do_not(monkeypatch):
    _stub_yields(monkeypatch)
    _stub_fx(monkeypatch)
    by_code = {c["code"]: c for c in _client().get("/api/countries").json()["countries"]}
    # US has 3-point FRED history -> trend points (2 after diff)
    assert len(by_code["US"]["trend"]) >= 1
    # TH is a Playwright single point -> no trend yet (SQLite snapshots accumulate)
    assert by_code["TH"]["trend"] == []


def test_router_caches_within_ttl(monkeypatch):
    _stub_yields(monkeypatch)
    _stub_fx(monkeypatch)
    client = _client()
    calls = {"n": 0}
    real = countries_service.build_countries

    def counting():
        calls["n"] += 1
        return real()

    monkeypatch.setattr(countries_service, "build_countries", counting)
    client.get("/api/countries")
    client.get("/api/countries")
    assert calls["n"] == 1


def test_refresh_invalidates_cache(monkeypatch):
    _stub_yields(monkeypatch)
    _stub_fx(monkeypatch)
    client = _client()
    calls = {"n": 0}
    real = countries_service.build_countries

    def counting():
        calls["n"] += 1
        return real()

    monkeypatch.setattr(countries_service, "build_countries", counting)
    client.get("/api/countries")
    client.post("/api/countries/refresh")
    assert calls["n"] == 2


# ── Country detail (/api/countries/{code}) ────────────────────────────────
def _stub_detail_yields(monkeypatch):
    """Stub the detail path: full yield table + us10 + fx."""
    def fake_wgb_yields(slug):
        if slug == "thailand":
            return {"1Y": {"yield": 1.01, "chg_1m_bp": 3.0}, "2Y": {"yield": 1.20, "chg_1m_bp": 2.1},
                    "5Y": {"yield": 1.52, "chg_1m_bp": 1.2}, "10Y": {"yield": 2.05, "chg_1m_bp": 8.3},
                    "20Y": {"yield": 3.00, "chg_1m_bp": 6.0}}
        if slug == "united-states":
            return {"10Y": {"yield": 4.47, "chg_1m_bp": 7.0}}
        return {}
    monkeypatch.setattr(countries_service, "_wgb_yields", fake_wgb_yields)
    monkeypatch.setattr(countries_service, "_fx_score", lambda ccy: 0.0)
    monkeypatch.setattr(countries_service, "_fred_series", lambda sid: [("2026-06-01", 4.47)] if sid == "IRLTLT01USM156N" else None)
    monkeypatch.setattr(countries_service, "yf", type("yf", (), {"Ticker": lambda s: type("T", (), {"history": lambda period: type("H", (), {"__len__": lambda self: 0, "iloc": None})()})()}))


def test_country_detail_full_curve_and_risk(monkeypatch):
    _stub_detail_yields(monkeypatch)
    r = _client().get("/api/countries/TH")
    assert r.status_code == 200
    d = r.json()
    assert d["country"]["name_th"] == "ไทย"
    # full curve in tenor order
    assert [p["tenor"] for p in d["yield_curve"]] == ["1Y", "2Y", "5Y", "10Y", "20Y"]
    assert d["yield_curve"][3] == {"tenor": "10Y", "value": 2.05}
    # risk mirrors the overview formula: ylv(2.05-4.47≈0) + mom(8.3/10=0.8) + fx0
    assert d["risk"]["score"] == 0.8
    assert d["risk"]["level"] == "low"
    assert d["bps_vs_us"] == -242.0
    assert d["us10"] == 4.47


def test_country_detail_unknown_code_404(monkeypatch):
    _stub_detail_yields(monkeypatch)
    assert _client().get("/api/countries/ZZ").status_code == 404
    assert _client().post("/api/countries/refresh").status_code == 200  # not captured as code


def test_country_detail_missing_tenors_never_fabricated(monkeypatch):
    def empty(slug):
        return {}
    monkeypatch.setattr(countries_service, "_wgb_yields", empty)
    monkeypatch.setattr(countries_service, "yf", type("yf", (), {"Ticker": lambda s: type("T", (), {"history": lambda period: type("H", (), {"__len__": lambda self: 0, "iloc": None})()})()}))
    r = _client().get("/api/countries/LA")
    assert r.status_code == 200
    d = r.json()
    assert d["yield_curve"] == []
    assert d["risk"]["score"] is None
    assert d["mini_cards"][0]["value"] is None


# ── Country AI brief + report ─────────────────────────────────────────────
def _stub_ai(monkeypatch):
    from app import country_ai_service as cas

    monkeypatch.setattr(cas, "_call_deepseek", lambda system, user, max_tokens=8000: (
        '{"brief_md": "สรุปสั้นๆ", "recommendations": ["ข้อ 1"], "scenarios": ["ฉาก 1"]}'
        if "brief_md" in system or "สรุปสถานการณ์" in system else
        '{"report_md": "## สรุปภาพรวม\\nรายละเอียด..."}'
    ))
    monkeypatch.setattr(cas, "_country_context", lambda code: "ประเทศ: X")


def test_brief_generated_and_cached(monkeypatch):
    _stub_ai(monkeypatch)
    from app import country_ai_service as cas
    monkeypatch.setattr(cas, "save_brief", lambda code, b: None)
    r1 = _client().get("/api/countries/TH/brief")
    assert r1.status_code == 200
    d = r1.json()
    assert d["brief_md"].startswith("สรุป")
    assert d["recommendations"] == ["ข้อ 1"]
    assert d["model_used"] == AI_MODEL


def test_brief_reuses_cached_copy(monkeypatch):
    _stub_ai(monkeypatch)
    from app import country_ai_service as cas
    calls = {"n": 0}
    real_gen = cas.generate_brief

    def counting(code):
        calls["n"] += 1
        return real_gen(code)

    monkeypatch.setattr(cas, "generate_brief", counting)
    # First call saves a brief; second call within TTL must not regenerate
    c = _client()
    c.get("/api/countries/TH/brief")
    n_after_first = calls["n"]
    c.get("/api/countries/TH/brief")
    assert calls["n"] == n_after_first  # cached, no second DeepSeek call


def test_report_generated_on_demand(monkeypatch):
    _stub_ai(monkeypatch)
    from app import country_ai_service as cas
    monkeypatch.setattr(cas, "save_report", lambda code, r: None)
    r = _client().post("/api/countries/TH/report")
    assert r.status_code == 200
    d = r.json()
    assert "สรุปภาพรวม" in d["report_md"]
    assert d["model_used"] == AI_MODEL


def test_ai_failure_returns_503(monkeypatch):
    from app import country_ai_service as cas
    monkeypatch.setattr(cas, "_call_deepseek", lambda system, user, max_tokens=8000: None)
    monkeypatch.setattr(cas, "_country_context", lambda code: "ประเทศ: X")
    monkeypatch.setattr(cas, "get_brief", lambda code: None)
    assert _client().get("/api/countries/TH/brief").status_code == 503
    assert _client().post("/api/countries/TH/report").status_code == 503
