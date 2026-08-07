# backend/tests/test_refresh_screener.py
import inspect
import json
import sqlite3

from scripts import refresh_screener


def _fake_response(status_code=200, json_data=None):
    class FakeResponse:
        def __init__(self):
            self.status_code = status_code

        def json(self):
            return json_data

        def raise_for_status(self):
            if self.status_code >= 400:
                raise Exception(f"HTTP {self.status_code}")

    return FakeResponse()


def test_finnhub_api_key_has_no_hardcoded_fallback():
    # Regression test: the old FMP pipeline had `os.environ.get("FMP_API_KEY", "<literal key>")`
    # baked in as a fallback default. Guard against that pattern coming back for Finnhub.
    source = inspect.getsource(refresh_screener)
    assert 'os.environ.get("FINNHUB_API_KEY")' in source
    assert 'os.environ.get("FINNHUB_API_KEY", "' not in source


def test_fetch_universe_filters_to_common_stock_and_major_exchanges(monkeypatch):
    rows = [
        {"symbol": "AAPL", "description": "Apple Inc", "type": "Common Stock", "mic": "XNAS"},
        {"symbol": "SPY", "description": "SPDR S&P 500", "type": "ETP", "mic": "ARCX"},
        {"symbol": "OTCCO", "description": "Some OTC Co", "type": "Common Stock", "mic": "OOTC"},
        {"symbol": "NYSECO", "description": "NYSE Co", "type": "Common Stock", "mic": "XNYS"},
    ]

    def fake_get(url, params=None, timeout=None):
        assert "stock/symbol" in url
        return _fake_response(200, rows)

    monkeypatch.setattr(refresh_screener.requests, "get", fake_get)

    universe = refresh_screener.fetch_universe()

    symbols = {u["symbol"] for u in universe}
    assert symbols == {"AAPL", "NYSECO"}


def test_fetch_stock_record_maps_real_finnhub_fields(monkeypatch):
    monkeypatch.setattr(refresh_screener.time, "sleep", lambda *_: None)

    def fake_get(path, symbol, extra_params=None):
        if path == "/stock/profile2":
            return {"name": "Apple Inc", "finnhubIndustry": "Technology Hardware", "marketCapitalization": 4_500_000.0}
        if path == "/stock/metric":
            return {"metric": {
                "peTTM": 32.5, "pegTTM": 2.9, "psTTM": 9.6, "pbAnnual": 50.9,
                "roeTTM": 137.1, "roiTTM": 70.2, "grossMarginTTM": 48.6, "netProfitMarginTTM": 27.6,
                "totalDebt/totalEquityAnnual": 1.35, "beta": 1.08,
                "dividendYieldIndicatedAnnual": 0.35,
                "currentEv/freeCashFlowTTM": 33.3, "evRevenueTTM": 9.77,
                "10DayAverageTradingVolume": 60.8,
            }}
        if path == "/quote":
            return {"c": 309.38}
        if path == "/stock/recommendation":
            return [{"strongBuy": 13, "buy": 24, "hold": 14, "sell": 3, "strongSell": 0}]
        raise AssertionError(f"unexpected path {path}")

    monkeypatch.setattr(refresh_screener, "_get_json", fake_get)

    record = refresh_screener.fetch_stock_record("AAPL", None, "2026-08-05T00:00:00+00:00")

    assert record["symbol"] == "AAPL"
    assert record["company_name"] == "Apple Inc"
    assert record["market_cap"] == 4_500_000.0 * 1_000_000
    assert record["sector"] == "Technology"  # mapped from "Technology Hardware"
    assert record["industry"] == "Technology Hardware"
    assert record["price"] == 309.38
    assert record["pe"] == 32.5
    assert record["div_yield"] == 0.35 / 100.0
    assert record["volume"] == 60.8 * 1_000_000
    assert record["upside_pct"] == round((13 + 24) / 54 * 100, 1)
    assert record["beta"] == 1.08


def test_fetch_stock_record_returns_none_when_all_endpoints_fail(monkeypatch):
    monkeypatch.setattr(refresh_screener.time, "sleep", lambda *_: None)
    monkeypatch.setattr(refresh_screener, "_get_json", lambda *a, **k: None)

    record = refresh_screener.fetch_stock_record("BADTICKER", None, "2026-08-05T00:00:00+00:00")

    assert record is None


def test_fetch_stock_record_leaves_missing_fields_as_none_not_fabricated(monkeypatch):
    monkeypatch.setattr(refresh_screener.time, "sleep", lambda *_: None)

    def fake_get(path, symbol, extra_params=None):
        if path == "/stock/profile2":
            return {"name": "Tiny Co"}  # no finnhubIndustry, no marketCapitalization
        if path == "/stock/metric":
            return {"metric": {}}  # nothing at all
        if path == "/quote":
            return {}  # no price
        if path == "/stock/recommendation":
            return None
        raise AssertionError(f"unexpected path {path}")

    monkeypatch.setattr(refresh_screener, "_get_json", fake_get)

    record = refresh_screener.fetch_stock_record("TINY", None, "2026-08-05T00:00:00+00:00")

    assert record is not None  # profile alone was enough to not fully fail
    assert record["pe"] is None
    assert record["price"] is None
    assert record["market_cap"] is None
    assert record["upside_pct"] is None
    assert record["sector"] is None
    assert record["industry"] is None


def test_analyst_consensus_pct_computes_real_percentage():
    recs = [{"strongBuy": 10, "buy": 10, "hold": 10, "sell": 0, "strongSell": 0}]
    assert refresh_screener._analyst_consensus_pct(recs) == round(20 / 30 * 100, 1)


def test_analyst_consensus_pct_returns_none_when_no_recommendations():
    assert refresh_screener._analyst_consensus_pct(None) is None
    assert refresh_screener._analyst_consensus_pct([]) is None
    assert refresh_screener._analyst_consensus_pct([{"strongBuy": 0, "buy": 0, "hold": 0, "sell": 0, "strongSell": 0}]) is None


def test_infer_tags_derived_only_from_real_fields():
    tags = refresh_screener.infer_tags(
        sector="Technology", industry="Semiconductors", pe=30.0, roe=20.0, div_yield=0.01
    )
    assert "semiconductor" in tags
    assert "growth" in tags
    assert "dividend" not in tags

    tags_dividend = refresh_screener.infer_tags(
        sector="Energy", industry="Oil & Gas", pe=10.0, roe=8.0, div_yield=0.05
    )
    assert "value" in tags_dividend
    assert "dividend" in tags_dividend


def test_save_to_db_and_init_db_round_trip(tmp_path):
    db_path = str(tmp_path / "test_screener.db")
    conn = refresh_screener.init_db(db_path)

    record = {
        "symbol": "TEST", "company_name": "Test Co", "market_cap": 1000.0,
        "sector": "Technology", "industry": "Software", "price": 100.0,
        "pe": 20.0, "peg": 1.5, "ps": 5.0, "pb": 3.0, "div_yield": 0.01,
        "eps": 5.0, "roe": 15.0, "roic": 10.0, "gross_margin": 50.0,
        "profit_margin": 20.0, "de_ratio": 0.3, "p_fcf": 20.0, "ev_sales": 5.0,
        "upside_pct": 60.0, "beta": 1.1, "volume": 1_000_000.0,
        "tags": json.dumps(["growth"]), "refreshed_at": "2026-08-05T00:00:00+00:00",
    }
    refresh_screener.save_to_db([record], conn)

    row = conn.execute("SELECT symbol, company_name, pe FROM screener_stocks WHERE symbol = 'TEST'").fetchone()
    conn.close()

    assert row == ("TEST", "Test Co", 20.0)


def test_save_to_db_handles_empty_list_without_error(tmp_path):
    db_path = str(tmp_path / "test_screener_empty.db")
    conn = refresh_screener.init_db(db_path)

    refresh_screener.save_to_db([], conn)

    count = conn.execute("SELECT COUNT(*) FROM screener_stocks").fetchone()[0]
    conn.close()
    assert count == 0
