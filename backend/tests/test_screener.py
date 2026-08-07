# backend/tests/test_screener.py
import json
from unittest.mock import patch
from app.models import ScreenerStock

def test_screener_stocks_endpoint_schema(client):
    payload = {
        "preset": "all",
        "filters": {},
        "sort": {"field": "marketCap", "order": "desc"},
        "page": 1,
        "pageSize": 20
    }
    response = client.post("/api/screener/stocks", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert "total" in data
    assert "page" in data
    assert "pageSize" in data
    assert "stocks" in data
    assert "refreshedAt" in data

    assert data["page"] == 1
    assert data["pageSize"] == 20
    assert isinstance(data["stocks"], list)
    assert len(data["stocks"]) > 0

    first_stock = data["stocks"][0]
    expected_fields = [
        "symbol", "company", "logoColor", "logoInitials", "sector", "subSector",
        "marketCap", "price", "pe", "peg", "ps", "pb", "evSales", "rsi", "roe",
        "profitMargin", "eps", "de", "grossMargin", "pFcf", "roic", "divYield",
        "upside", "tags"
    ]
    for field in expected_fields:
        assert field in first_stock, f"Missing field {field} in stock response"

    assert isinstance(first_stock["tags"], list)


def test_screener_dividend_preset_returns_high_dividend_stocks(client):
    payload = {
        "preset": "dividend",
        "filters": {},
        "sort": {"field": "marketCap", "order": "desc"},
        "page": 1,
        "pageSize": 50
    }
    response = client.post("/api/screener/stocks", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["total"] > 0
    for stock in data["stocks"]:
        # Either divYield > 0.03 (or > 3.0%) or tags include "dividend"
        has_div_yield = stock["divYield"] > 0.03
        has_tag = any(t.lower() == "dividend" for t in stock["tags"])
        assert has_div_yield or has_tag, f"Stock {stock['symbol']} does not match dividend preset rules"


def test_screener_sort_market_cap_descending(client):
    payload = {
        "preset": "all",
        "filters": {},
        "sort": {"field": "marketCap", "order": "desc"},
        "page": 1,
        "pageSize": 20
    }
    response = client.post("/api/screener/stocks", json=payload)
    assert response.status_code == 200
    data = response.json()
    stocks = data["stocks"]
    assert len(stocks) >= 2

    for i in range(len(stocks) - 1):
        cap1 = stocks[i]["marketCap"] or 0
        cap2 = stocks[i+1]["marketCap"] or 0
        assert cap1 >= cap2, f"Sorting error: {cap1} < {cap2} at indices {i}, {i+1}"


def test_screener_pagination_no_duplicates(client):
    payload_p1 = {
        "preset": "all",
        "filters": {},
        "sort": {"field": "marketCap", "order": "desc"},
        "page": 1,
        "pageSize": 10
    }
    payload_p2 = {
        "preset": "all",
        "filters": {},
        "sort": {"field": "marketCap", "order": "desc"},
        "page": 2,
        "pageSize": 10
    }

    res1 = client.post("/api/screener/stocks", json=payload_p1)
    res2 = client.post("/api/screener/stocks", json=payload_p2)

    assert res1.status_code == 200
    assert res2.status_code == 200

    p1_symbols = [s["symbol"] for s in res1.json()["stocks"]]
    p2_symbols = [s["symbol"] for s in res2.json()["stocks"]]

    assert len(p1_symbols) == 10
    assert len(p2_symbols) == 10

    # Ensure page 2 symbols do not duplicate page 1 symbols
    overlap = set(p1_symbols).intersection(set(p2_symbols))
    assert len(overlap) == 0, f"Page 2 duplicated symbols from Page 1: {overlap}"


def test_screener_queries_sqlite_db_when_populated(client, db_session):
    # Insert custom stock into db_session
    db_stock = ScreenerStock(
        symbol="TESTDIV",
        company_name="Test Dividend Inc",
        market_cap=50000000000.0,
        sector="Technology",
        industry="Software",
        price=100.0,
        pe=10.0,
        peg=0.8,
        ps=2.0,
        pb=1.5,
        div_yield=0.05,
        eps=10.0,
        roe=0.25,
        roic=0.20,
        gross_margin=0.60,
        profit_margin=0.25,
        de_ratio=0.5,
        p_fcf=12.0,
        ev_sales=2.5,
        upside_pct=15.0,
        beta=1.0,
        volume=1000000.0,
        tags=json.dumps(["dividend", "growth"])
    )
    db_session.add(db_stock)
    db_session.commit()

    payload = {
        "preset": "dividend",
        "filters": {},
        "sort": {"field": "marketCap", "order": "desc"},
        "page": 1,
        "pageSize": 20
    }
    response = client.post("/api/screener/stocks", json=payload)
    assert response.status_code == 200
    data = response.json()
    symbols = [s["symbol"] for s in data["stocks"]]
    assert "TESTDIV" in symbols


def test_screener_runs_offline_without_http_calls(client):
    with patch("requests.get") as mock_get:
        payload = {
            "preset": "ai",
            "filters": {"marketCap": "large"},
            "sort": {"field": "marketCap", "order": "desc"},
            "page": 1,
            "pageSize": 10
        }
        response = client.post("/api/screener/stocks", json=payload)
        assert response.status_code == 200
        mock_get.assert_not_called()
