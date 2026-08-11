# backend/tests/test_compare_router.py
# The Compare tool reads from Finnhub + yfinance first (app/compare_service.py) and only
# falls back to konbalongtun's api-server when those return nothing usable. Every test here
# stubs both layers -- no test may touch the network.
import json
import urllib.request

import pytest

import app.compare_service as compare_service
import app.routers.compare as compare_module


EMPTY_YF_BUNDLE = {"info": {}, "closes": [], "highs": [], "lows": [], "volumes": [], "dates": []}


@pytest.fixture(autouse=True)
def _isolate(monkeypatch):
    """Caches cleared and the standard sources stubbed to "know nothing" by default, so a
    test exercising the konbalongtun fallback reaches it, and no test silently makes a
    real Finnhub/yfinance call."""
    
    
    monkeypatch.setattr(compare_service, "fetch_finnhub_metrics", lambda *a, **k: {})
    monkeypatch.setattr(compare_service, "fetch_finnhub_profile", lambda *a, **k: {})
    monkeypatch.setattr(compare_service, "fetch_yfinance_bundle", lambda *a, **k: dict(EMPTY_YF_BUNDLE))
    monkeypatch.setattr(compare_service, "search_finnhub_symbols", lambda *a, **k: [])
    yield
    
    


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


def _use_standard_sources(monkeypatch, *, metric=None, profile=None, info=None, closes=None):
    monkeypatch.setattr(compare_service, "fetch_finnhub_metrics", lambda *a, **k: metric or {})
    monkeypatch.setattr(compare_service, "fetch_finnhub_profile", lambda *a, **k: profile or {})
    bundle = dict(EMPTY_YF_BUNDLE)
    bundle["info"] = info or {}
    if closes:
        bundle["closes"] = closes
    monkeypatch.setattr(compare_service, "fetch_yfinance_bundle", lambda *a, **k: bundle)


KONBALONGTUN_AAPL = {
    "success": True,
    "data": {
        "company": "AAPL",
        "name": "Apple Inc",
        "logoFile": "AAPL.svg",
        "sector": "Technology",
        "price": "308.91",
        "regularMarketPrice": 313.33,
        "targetPrice": "327.82",
        "peRatio": 35.43,
        "enterpriseValue": "4559.02B",
        "perfWeek": "-7.24%",
    },
}


# --- Primary path: Finnhub + yfinance ------------------------------------------------


def test_standard_sources_are_used_and_konbalongtun_is_not_called(client, monkeypatch):
    _use_standard_sources(
        monkeypatch,
        metric={"peTTM": 35.43, "marketCapitalization": 4_567_980_000_000},
        profile={"name": "Apple Inc", "ipo": "1980-12-12"},
        info={"regularMarketPrice": 313.33, "targetMeanPrice": 322.82, "sector": "Technology"},
    )

    def explode(*a, **k):
        raise AssertionError("konbalongtun must not be called when standard sources answer")

    monkeypatch.setattr(urllib.request, "urlopen", explode)

    stock = client.get("/api/compare/stock/AAPL").json()["stock"]

    assert stock["name"] == "Apple Inc"
    assert stock["metrics"]["pe_ratio"] == "35.43"
    assert stock["metrics"]["market_cap"] == "4,567,980,000,000"
    assert stock["metrics"]["ipo"] == "1980-12-12"


def test_upside_is_computed_from_live_price_and_analyst_target(client, monkeypatch):
    _use_standard_sources(
        monkeypatch,
        info={"regularMarketPrice": 313.33, "targetMeanPrice": 322.82},
    )

    stock = client.get("/api/compare/stock/AAPL").json()["stock"]

    assert stock["price"] == 313.33
    assert stock["analyst_target_upside_pct"] == 3.03


def test_etf_shows_net_assets_and_category_where_a_stock_shows_market_cap_and_sector(client, monkeypatch):
    """konbalongtun returned marketCap 0 and no sector for ETFs. yfinance reports real net
    assets and a fund category, so an ETF now carries meaningful values instead of blanks."""
    _use_standard_sources(
        monkeypatch,
        metric={"peTTM": 27.85},
        info={"totalAssets": 1_686_884_319_232, "category": "Large Blend", "regularMarketPrice": 710.71},
    )

    stock = client.get("/api/compare/stock/VOO").json()["stock"]

    assert stock["metrics"]["market_cap"] == "1,686,884,319,232"
    assert stock["sector"] == "Large Blend"


def test_metrics_no_source_publishes_stay_absent(client, monkeypatch):
    """Insider/institutional ownership *change* isn't published by Finnhub or yfinance.
    It must be absent rather than defaulted to 0, which would assert "no change occurred"."""
    _use_standard_sources(monkeypatch, metric={"peTTM": 35.43}, info={"regularMarketPrice": 313.33})

    metrics = client.get("/api/compare/stock/AAPL").json()["stock"]["metrics"]

    assert "insider_trans" not in metrics
    assert "inst_trans" not in metrics


def test_autocomplete_answers_known_symbols_locally_without_any_external_call(client, monkeypatch):
    """AAPL is in this app's own universe, so the picker resolves it with no outbound
    request at all -- Finnhub's /search is a symbol lookup, not a typeahead ("AAP" does
    not return AAPL there), and konbalongtun is a third-party dependency."""

    def explode(*a, **k):
        raise AssertionError("no external call should be needed for a locally-known symbol")

    monkeypatch.setattr(urllib.request, "urlopen", explode)
    monkeypatch.setattr(compare_service, "search_finnhub_symbols", explode)

    data = client.get("/api/compare/autocomplete?q=AAPL").json()
    assert data[0]["symbol"] == "AAPL"


def test_autocomplete_extends_past_the_local_universe_with_finnhub(client, monkeypatch):
    monkeypatch.setattr(
        compare_service,
        "search_finnhub_symbols",
        lambda q, limit: [{"symbol": "XYZQ", "name": "XYZ Quantum Inc"}],
    )

    def explode(*a, **k):
        raise AssertionError("konbalongtun must not be called when Finnhub answers")

    monkeypatch.setattr(urllib.request, "urlopen", explode)

    data = client.get("/api/compare/autocomplete?q=XYZQ").json()
    assert [row["symbol"] for row in data] == ["XYZQ"]


# --- Fallback path: konbalongtun ------------------------------------------------------


def test_falls_back_to_konbalongtun_when_standard_sources_know_nothing(client, monkeypatch):
    monkeypatch.setattr(urllib.request, "urlopen", _fake_post(KONBALONGTUN_AAPL))

    stock = client.get("/api/compare/stock/AAPL").json()["stock"]

    assert stock["name"] == "Apple Inc"
    # Upstream's pre-formatted strings pass through untouched on this path.
    assert stock["metrics"]["enterprise_value"] == "4559.02B"
    assert stock["metrics"]["perf_week"] == "-7.24%"


def test_fallback_market_cap_uses_separators_never_scientific_notation(client, monkeypatch):
    payload = json.loads(json.dumps(KONBALONGTUN_AAPL))
    payload["data"]["marketCap"] = 4537070000000
    monkeypatch.setattr(urllib.request, "urlopen", _fake_post(payload))

    stock = client.get("/api/compare/stock/AAPL").json()["stock"]
    assert stock["metrics"]["market_cap"] == "4,537,070,000,000"
    assert "e+" not in stock["metrics"]["market_cap"]


def test_fallback_zero_market_cap_on_an_etf_is_treated_as_not_applicable(client, monkeypatch):
    monkeypatch.setattr(
        urllib.request,
        "urlopen",
        _fake_post({"success": True, "data": {"company": "VOO", "name": "Vanguard S&P 500 ETF", "marketCap": 0}}),
    )

    stock = client.get("/api/compare/stock/VOO").json()["stock"]
    assert stock["metrics"]["market_cap"] is None


def test_fallback_keeps_genuinely_zero_metrics(client, monkeypatch):
    monkeypatch.setattr(
        urllib.request,
        "urlopen",
        _fake_post({"success": True, "data": {"company": "X", "name": "X Corp", "instTrans": 0, "payout": 0}}),
    )

    m = client.get("/api/compare/stock/X").json()["stock"]["metrics"]
    assert m["inst_trans"] == "0"
    assert m["payout"] == "0"


def test_autocomplete_falls_back_to_konbalongtun_for_symbols_no_other_source_knows(client, monkeypatch):
    # A query outside this app's own universe, with Finnhub stubbed silent by the fixture.
    monkeypatch.setattr(
        urllib.request,
        "urlopen",
        _fake_post([{"company": "ZZQQ", "name": "Zeta Quantum", "logoFile": "ZZQQ.svg", "sector": "Technology"}]),
    )

    data = client.get("/api/compare/autocomplete?q=ZZQQ").json()
    assert data[0]["symbol"] == "ZZQQ"
    assert data[0]["logo_url"].endswith("/stock-logo/ZZQQ.svg")


def test_autocomplete_returns_empty_when_every_source_fails(client, monkeypatch):
    def boom(*a, **k):
        raise urllib.error.URLError("down")

    monkeypatch.setattr(urllib.request, "urlopen", boom)

    response = client.get("/api/compare/autocomplete?q=ZZQQ")
    assert response.status_code == 200
    assert response.json() == []


def test_autocomplete_requires_query(client):
    assert client.get("/api/compare/autocomplete?q=").status_code == 422
    assert client.get("/api/compare/autocomplete").status_code == 422


def test_404_when_no_source_recognises_the_symbol(client, monkeypatch):
    monkeypatch.setattr(urllib.request, "urlopen", _fake_post({"success": False, "message": "not found"}))

    assert client.get("/api/compare/stock/NOTAREALTICKER").status_code == 404


def test_503_when_standard_sources_are_silent_and_fallback_is_unreachable(client, monkeypatch):
    def boom(*a, **k):
        raise urllib.error.URLError("down")

    monkeypatch.setattr(urllib.request, "urlopen", boom)

    assert client.get("/api/compare/stock/AAPL").status_code == 503


def test_stock_is_cached_so_repeat_views_do_not_refetch(client, monkeypatch):
    calls = {"n": 0}

    def counting_metrics(*a, **k):
        calls["n"] += 1
        return {"peTTM": 35.43}

    monkeypatch.setattr(compare_service, "fetch_finnhub_metrics", counting_metrics)

    client.get("/api/compare/stock/AAPL")
    client.get("/api/compare/stock/AAPL")
    client.get("/api/compare/stock/aapl")  # same symbol, different case

    assert calls["n"] == 1
