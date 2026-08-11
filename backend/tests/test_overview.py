"""Tests for the overview dashboard (bond-crisis-100 ticket 05).

The overview payload is assembled from existing services (macro dashboard,
model scores, country risk) — we stub those service entry points with known
fixtures and assert the assembled shape, not the underlying data.
"""

import pytest

from app import overview_service


def _dash_stub():
    return {
        "sections": [
            {"key": "treasuryYields", "items": [
                {"series_id": "us13w", "value": 3.87, "unit": "%"},
                {"series_id": "us10y", "value": 4.65, "unit": "%"},
                {"series_id": "us2y", "value": 4.19, "unit": "%"},
            ]},
            {"key": "indicators", "items": [
                {"series_id": "vix", "value": 15.5, "unit": "index"},
                {"series_id": "dxy", "value": 99.8, "unit": "index"},
                {"series_id": "xauusd", "value": 4376.0, "unit": "USD"},
                {"series_id": "usoil", "value": 83.5, "unit": "USD"},
                {"series_id": "us_hy_spread", "value": 270.0, "unit": "bps"},
            ]},
        ],
        "yield_curve": [{"tenor": "10Y", "yield": 4.65}],
        "data_sources": ["stub"],
    }


def _models_stub():
    return {
        "models": [
            {"model_id": "recovery-reflation", "rank": 1, "score": 62.3,
             "status": "active", "confidence": 90,
             "conditions": [{"name": "VIX Falling", "score": 85}]},
            {"model_id": "fed-pivot", "rank": 2, "score": 58.0,
             "status": "building", "confidence": 85,
             "conditions": [{"name": "Fed Dovish", "score": 60}]},
        ],
        "meta": [
            {"model_id": "recovery-reflation", "name_th": "โมเดลฟื้นตัว / รีเฟลชัน",
             "short_th": "ฟื้นตัว", "phase": "recovery",
             "regime_th": "หลังวิกฤตผ่อนคลาย — ตลาดเริ่มฟื้นตัว",
             "trade_direction": "Long NAS100/US500", "color": "#38bdf8"},
            {"model_id": "fed-pivot", "name_th": "โมเดล Fed เปลี่ยนท่าที",
             "short_th": "Fed เปลี่ยนท่าที", "phase": "policy-pivot",
             "regime_th": "Fed ส่งสัญญาณ dovish", "trade_direction": "Long Duration",
             "color": "#a78bfa"},
        ],
        "updated_at": "11/08/2026 12:00:00 UTC",
    }


def _countries_stub():
    return {
        "countries": [
            {"code": "TR", "score": 51.0, "level": "medium"},
            {"code": "RU", "score": 58.0, "level": "high"},
            {"code": "US", "score": 15.0, "level": "low"},
        ],
    }


@pytest.fixture(autouse=True)
def _stub_services(monkeypatch):
    monkeypatch.setattr(overview_service.macro_service, "build_dashboard", _dash_stub)
    monkeypatch.setattr(overview_service.model_service, "build_models", _models_stub)
    monkeypatch.setattr(overview_service.countries_service, "build_countries", _countries_stub)
    # avoid cross-test cache pollution
    overview_service.cache_set(overview_service._OVERVIEW_CACHE_KEY, None, -1)
    yield
    overview_service.cache_set(overview_service._OVERVIEW_CACHE_KEY, None, -1)


def test_overview_assembles_all_sections():
    o = overview_service.build_overview()

    # key figures: 8 slots, values from the macro dashboard stub
    figs = {f["series_id"]: f for f in o["key_figures"]}
    assert set(figs) == {
        "us10y", "us2y", "vix", "dxy", "xauusd", "usoil",
        "us_hy_spread", "us_banking_stress_index",
    }
    assert figs["us10y"]["value"] == 4.65
    assert figs["xauusd"]["value"] == 4376.0
    # missing series -> None (renders "—"), never fabricated
    assert figs["us_banking_stress_index"]["value"] is None

    # yield curve from macro stub tenors
    assert {y["tenor"] for y in o["yield_curve"]} >= {"13W", "2Y", "10Y"}
    assert next(y for y in o["yield_curve"] if y["tenor"] == "10Y")["yield"] == 4.65


def test_regime_from_top_model():
    o = overview_service.build_overview()
    r = o["regime"]
    assert r["phase"] == "recovery"
    assert r["top_model_id"] == "recovery-reflation"
    assert r["top_model_score"] == 62.3
    assert r["confidence"] == 90
    # top vs second gap -> transition zone (62.3 - 58.0 = 4.3 < 5)
    assert r["is_transition_zone"] is True
    assert r["triggers"][0]["name"] == "VIX Falling"


def test_country_risk_sorted_top():
    o = overview_service.build_overview()
    top = o["country_risk"]["top"]
    assert o["country_risk"]["total"] == 3
    assert [c["country_code"] for c in top] == ["RU", "TR", "US"]  # score desc


def test_models_ranked_list():
    o = overview_service.build_overview()
    assert len(o["models"]) == 2
    assert o["models"][0]["name_th"] == "โมเดลฟื้นตัว / รีเฟลชัน"
    assert o["models"][0]["color"] == "#38bdf8"
    assert o["models"][1]["rank"] == 2


def test_brief_json_parser():
    # fenced
    assert overview_service._parse_brief_json(
        '```json\n{"brief_md": "x"}\n```') == {"brief_md": "x"}
    # bare object with trailing noise
    assert overview_service._parse_brief_json(
        'prefix {"brief_md": "y"} suffix') == {"brief_md": "y"}
    # unparseable -> None
    assert overview_service._parse_brief_json("no json here") is None
