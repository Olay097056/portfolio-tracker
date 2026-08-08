# backend/tests/test_compare_router.py
# Compare tool proxies konbalongtun's public stock-summaries API (same upstream the
# Investor Tracker already uses). Shapes here are real ones captured from that API on
# 2026-08-08, including the ETF case where most fundamentals are genuinely absent.
import json
import urllib.request

import pytest

import app.routers.compare as compare_module


@pytest.fixture(autouse=True)
def _clear_compare_caches():
    compare_module._autocomplete_cache.clear()
    compare_module._stock_cache.clear()
    yield
    compare_module._autocomplete_cache.clear()
    compare_module._stock_cache.clear()


def _fake_post(payload):
    class FakeResponse:
        status = 200

        def read(self):
            return json.dumps(payload).encode("utf-8")

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    return lambda *a, **k: FakeResponse()


AAPL_UPSTREAM = {
    "success": True,
    "data": {
        "company": "AAPL",
        "name": "Apple Inc",
        "logoFile": "AAPL.svg",
        "sector": "Technology",
        "industry": "Consumer Electronics",
        "price": "308.91",
        "regularMarketPrice": 313.33,
        "targetPrice": "327.82",
        "peRatio": 35.43,
        "enterpriseValue": "4559.02B",
        "perfWeek": "-7.24%",
        "roe": 148.75,
        "volatilityW": "2.22%",
        "volatilityM": "2.44%",
    },
}


def test_autocomplete_maps_upstream_shape(client, monkeypatch):
    monkeypatch.setattr(
        urllib.request,
        "urlopen",
        _fake_post([
            {"_id": "x1", "company": "AAPL", "logoFile": "AAPL.svg", "name": "Apple Inc", "sector": "Technology"},
            {"_id": "x2", "company": "AAPB", "logoFile": "AAPB.svg", "name": "GraniteShares 2x Long AAPL Daily ETF", "sector": "Financial"},
        ]),
    )

    data = client.get("/api/compare/autocomplete?q=AAP").json()

    assert len(data) == 2
    assert data[0]["symbol"] == "AAPL"
    assert data[0]["name"] == "Apple Inc"
    assert data[0]["logo_url"] == "https://konbalongtun.sgp1.cdn.digitaloceanspaces.com/prod/stock-logo/AAPL.svg"


def test_autocomplete_respects_limit(client, monkeypatch):
    monkeypatch.setattr(
        urllib.request,
        "urlopen",
        _fake_post([{"company": f"S{i}", "name": f"Stock {i}", "logoFile": ""} for i in range(20)]),
    )

    data = client.get("/api/compare/autocomplete?q=S&limit=3").json()
    assert len(data) == 3


def test_autocomplete_returns_empty_on_upstream_failure(client, monkeypatch):
    def boom(*a, **k):
        raise urllib.error.URLError("upstream down")

    monkeypatch.setattr(urllib.request, "urlopen", boom)

    response = client.get("/api/compare/autocomplete?q=AAPL")
    assert response.status_code == 200
    assert response.json() == []


def test_autocomplete_requires_query(client):
    assert client.get("/api/compare/autocomplete?q=").status_code == 422
    assert client.get("/api/compare/autocomplete").status_code == 422


def test_get_stock_maps_metrics_and_keeps_upstream_formatting(client, monkeypatch):
    monkeypatch.setattr(urllib.request, "urlopen", _fake_post(AAPL_UPSTREAM))

    stock = client.get("/api/compare/stock/AAPL").json()["stock"]

    assert stock["symbol"] == "AAPL"
    assert stock["name"] == "Apple Inc"
    assert stock["sector"] == "Technology"
    # Pre-formatted upstream strings pass through untouched -- not re-parsed and re-rendered.
    assert stock["metrics"]["enterprise_value"] == "4559.02B"
    assert stock["metrics"]["perf_week"] == "-7.24%"
    # Numerics are stringified without inventing units or rounding.
    assert stock["metrics"]["pe_ratio"] == "35.43"
    assert stock["metrics"]["roe"] == "148.75"


def test_get_stock_computes_upside_from_live_price_not_delayed_price(client, monkeypatch):
    """konbalongtun's own page computes upside off regularMarketPrice (313.33), not the
    delayed `price` string (308.91) -- verified against their rendered AAPL output showing
    ~4.6%, which only reconciles with the live price. (327.82-313.33)/313.33 = 4.62%."""
    monkeypatch.setattr(urllib.request, "urlopen", _fake_post(AAPL_UPSTREAM))

    stock = client.get("/api/compare/stock/AAPL").json()["stock"]

    assert stock["price"] == 313.33
    assert stock["analyst_target_upside_pct"] == 4.62


def test_get_stock_leaves_absent_etf_fundamentals_null_not_zero(client, monkeypatch):
    """An ETF genuinely has no P/E, no margins, no EPS -- upstream omits those keys
    entirely. They must stay null so the UI renders '-', never 0, which would read as a
    real measured value of zero."""
    monkeypatch.setattr(
        urllib.request,
        "urlopen",
        _fake_post({
            "success": True,
            "data": {
                "company": "VOO",
                "name": "Vanguard S&P 500 ETF",
                "sector": "Financial",
                "regularMarketPrice": 620.5,
            },
        }),
    )

    stock = client.get("/api/compare/stock/VOO").json()["stock"]

    assert stock["metrics"]["pe_ratio"] is None
    assert stock["metrics"]["profit_margin"] is None
    assert stock["metrics"]["eps_ttm"] is None
    assert stock["analyst_target_upside_pct"] is None


def test_market_cap_renders_with_separators_never_scientific_notation(client, monkeypatch):
    """Python's %g turns 4537070000000 into '4.53707e+12', which is unreadable as a market
    cap -- caught live in the browser before this test existed."""
    monkeypatch.setattr(urllib.request, "urlopen", _fake_post(AAPL_UPSTREAM))
    monkeypatch.setitem(AAPL_UPSTREAM["data"], "marketCap", 4537070000000)

    stock = client.get("/api/compare/stock/AAPL").json()["stock"]

    assert stock["metrics"]["market_cap"] == "4,537,070,000,000"
    assert "e+" not in stock["metrics"]["market_cap"]


def test_decimals_keep_two_places_and_trim_trailing_zeros(client, monkeypatch):
    payload = {
        "success": True,
        "data": {"company": "X", "name": "X Corp", "peRatio": 30.74, "pfcf": 40.80, "roe": 148.75, "debteq": 0.07},
    }
    monkeypatch.setattr(urllib.request, "urlopen", _fake_post(payload))

    m = client.get("/api/compare/stock/X").json()["stock"]["metrics"]

    assert m["pe_ratio"] == "30.74"
    assert m["pfcf"] == "40.8"
    assert m["roe"] == "148.75"
    assert m["debt_eq"] == "0.07"


def test_zero_market_cap_on_an_etf_is_treated_as_not_applicable(client, monkeypatch):
    """Upstream returns marketCap 0 for ETFs (verified for VOO). A listed security cannot
    have a $0 market cap -- rendering '0' would state something flatly false, so it must
    come through as null and display as '-'."""
    monkeypatch.setattr(
        urllib.request,
        "urlopen",
        _fake_post({"success": True, "data": {"company": "VOO", "name": "Vanguard S&P 500 ETF", "marketCap": 0}}),
    )

    stock = client.get("/api/compare/stock/VOO").json()["stock"]
    assert stock["metrics"]["market_cap"] is None


def test_genuinely_zero_metrics_are_still_reported_as_zero(client, monkeypatch):
    """The zero-means-N/A rule is deliberately narrow: a 0% institutional-ownership change
    and a 0 payout ratio are real measurements and must not be blanked out."""
    monkeypatch.setattr(
        urllib.request,
        "urlopen",
        _fake_post({"success": True, "data": {"company": "X", "name": "X Corp", "instTrans": 0, "payout": 0, "dividendTtm": 0}}),
    )

    m = client.get("/api/compare/stock/X").json()["stock"]["metrics"]
    assert m["inst_trans"] == "0"
    assert m["payout"] == "0"
    assert m["dividend_ttm"] == "0"


def test_get_stock_404_when_upstream_reports_no_match(client, monkeypatch):
    monkeypatch.setattr(urllib.request, "urlopen", _fake_post({"success": False, "message": "not found"}))

    response = client.get("/api/compare/stock/NOTAREALTICKER")
    assert response.status_code == 404


def test_get_stock_503_when_upstream_unreachable(client, monkeypatch):
    def boom(*a, **k):
        raise urllib.error.URLError("upstream down")

    monkeypatch.setattr(urllib.request, "urlopen", boom)

    response = client.get("/api/compare/stock/AAPL")
    assert response.status_code == 503


def test_get_stock_is_cached_so_repeat_views_do_not_refetch(client, monkeypatch):
    calls = {"n": 0}
    inner = _fake_post(AAPL_UPSTREAM)

    def counting(*a, **k):
        calls["n"] += 1
        return inner()

    monkeypatch.setattr(urllib.request, "urlopen", counting)

    client.get("/api/compare/stock/AAPL")
    client.get("/api/compare/stock/AAPL")
    client.get("/api/compare/stock/aapl")  # same symbol, different case

    assert calls["n"] == 1
