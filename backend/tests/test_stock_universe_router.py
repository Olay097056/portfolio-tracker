"""Router tests for /api/stock-universe/markets — cash equity universe.

The S&P 500 payload carries sector + real TA + tier and must NEVER carry
perp-only fields (funding_rate / max_leverage / liquidation) — cash equity
has none of those, and the rule is "cut them, don't simulate them".
"""

from fastapi.testclient import TestClient

from app import stock_universe_service as su
from app.main import app


def _payload():
    return {
        "markets": [{
            "symbol": "AAPL", "name": "Apple Inc.",
            "sector": "Information Technology",
            "price": 212.5, "change_24h_pct": 0.8,
            "dollar_volume": 8_500_000_000,
            "ta_signals": ["bull trend+8"], "ta_score": 8,
            "ta_arrow": "↑", "tier": 1,
        }],
        "total": 1,
        "by_sector": {"Information Technology": 1},
        "updated_at": "2026-08-13T00:00:00+00:00",
    }


def test_markets_endpoint_returns_stock_shape():
    with TestClient(app) as client:
        r = client.get("/api/stock-universe/markets")
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 0
    # shape keys exist even for the empty-universe fallback
    assert "markets" in data and "by_sector" in data and "updated_at" in data


def test_markets_endpoint_payload_has_sector_and_no_perp_fields(monkeypatch):
    monkeypatch.setattr(su, "build_markets", lambda force=False: _payload())
    with TestClient(app) as client:
        r = client.get("/api/stock-universe/markets")
    assert r.status_code == 200
    m = r.json()["markets"][0]
    assert m["symbol"] == "AAPL"
    assert m["sector"] == "Information Technology"
    assert m["price"] == 212.5
    assert m["tier"] == 1
    assert m["ta_arrow"] == "↑"
    # cash equity: the perp-only fields must not exist at all
    assert "funding_rate" not in m
    assert "max_leverage" not in m
    assert "liquidation" not in m


def test_markets_endpoint_force_flag_passthrough(monkeypatch):
    seen = {}

    def fake(force=False):
        seen["force"] = force
        return _payload()

    monkeypatch.setattr(su, "build_markets", fake)
    with TestClient(app) as client:
        r = client.get("/api/stock-universe/markets?force=true")
    assert r.status_code == 200
    assert seen["force"] is True


def test_markets_endpoint_empty_universe_is_not_an_error(monkeypatch):
    monkeypatch.setattr(su, "build_markets", lambda force=False: {
        "markets": [], "total": 0, "by_sector": {}, "updated_at": None})
    with TestClient(app) as client:
        r = client.get("/api/stock-universe/markets")
    assert r.status_code == 200
    assert r.json()["markets"] == []
