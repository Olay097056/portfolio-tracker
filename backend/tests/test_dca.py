from unittest.mock import patch


def test_get_available_tickers_returns_ticker_list(client):
    # Mocked so this never makes a real yfinance call -- the endpoint itself fetches real
    # data for each symbol, but the test only needs to verify the response shape.
    with patch("app.routers.dca.price_service.get_market_data", return_value={}):
        response = client.get("/api/dca/available-tickers")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 5

    symbols = [item["symbol"] for item in data]
    assert "NVDA" in symbols
    assert "AAPL" in symbols
    assert "SCHD" in symbols
    assert "VOO" in symbols
    assert "JEPQ" in symbols

    for item in data:
        assert "symbol" in item
        assert "name" in item
        assert "default_yield" in item
        assert "default_growth" in item


def test_get_stock_info_with_mocked_market_data(client):
    with patch(
        "app.routers.dca.price_service.get_market_data",
        return_value={
            "AAPL": {
                "price": 224.23,
                "dividend_yield_pct": 0.55,
                "growth_rate_pct": 10.50,
            }
        },
    ):
        response = client.get("/api/dca/stock-info/AAPL")

    assert response.status_code == 200
    data = response.json()
    assert data["symbol"] == "AAPL"
    assert data["company_name"] == "Apple Inc."
    assert data["current_price"] == 224.23
    assert data["dividend_yield_pct"] == 0.55
    assert data["capital_growth_pct"] == 10.50


def test_get_stock_info_handles_unknown_ticker(client):
    with patch("app.routers.dca.price_service.get_market_data", return_value={}):
        response = client.get("/api/dca/stock-info/UNKNOWN123")

    assert response.status_code == 200
    data = response.json()
    assert data["symbol"] == "UNKNOWN123"
    assert data["current_price"] == 0.0
    assert data["dividend_yield_pct"] == 0.0
    assert data["capital_growth_pct"] == 0.0


def test_calculate_dca_returns_correct_projection(client):
    payload = {
        "ticker": "AAPL",
        "initial_amount": 100000.0,
        "monthly_dca": 5000.0,
        "duration_years": 10,
        "div_yield_pct": 3.5,
        "growth_pct": 7.0,
        "tax_rate_pct": 15.0,
        "reinvest_dividends": True,
        "currency": "THB",
    }
    response = client.post("/api/dca/calculate", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["total_invested"] == 700000.0
    assert data["final_portfolio_value"] == 1301295.23
    assert data["multiplier"] == 1.86
    assert data["accumulated_dividend"] > 0.0
    assert data["tax_amount"] > 0.0
    assert data["capital_gain"] > 0.0

    assert round(data["total_return"], 2) == round(data["final_portfolio_value"] - data["total_invested"], 2)
    assert round(data["capital_gain"] + data["accumulated_dividend"], 2) == data["total_return"]

    assert len(data["chart_data"]) == 10
    assert len(data["yearly_milestones"]) == 10
    assert data["chart_data"][0]["year"] == 1
    assert data["chart_data"][-1]["year"] == 10
    assert data["yearly_milestones"][-1]["portfolio_value"] == data["final_portfolio_value"]


def test_calculate_dca_zero_investment_handles_gracefully(client):
    payload = {
        "initial_amount": 0.0,
        "monthly_dca": 0.0,
        "duration_years": 5,
        "div_yield_pct": 5.0,
        "growth_pct": 8.0,
    }
    response = client.post("/api/dca/calculate", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["total_invested"] == 0.0
    assert data["final_portfolio_value"] == 0.0
    assert data["multiplier"] == 0.0
    assert data["accumulated_dividend"] == 0.0
    assert data["total_return"] == 0.0
    assert data["capital_gain"] == 0.0
    assert data["tax_amount"] == 0.0


def test_calculate_dca_zero_yield_and_growth(client):
    payload = {
        "initial_amount": 10000.0,
        "monthly_dca": 1000.0,
        "duration_years": 2,
        "div_yield_pct": 0.0,
        "growth_pct": 0.0,
    }
    response = client.post("/api/dca/calculate", json=payload)
    assert response.status_code == 200
    data = response.json()

    # 10000 + 1000 * 24 = 34000
    assert data["total_invested"] == 34000.0
    assert data["final_portfolio_value"] == 34000.0
    assert data["multiplier"] == 1.0
    assert data["accumulated_dividend"] == 0.0
    assert data["tax_amount"] == 0.0
    assert data["final_monthly_dividend"] == 0.0
    assert data["final_monthly_growth"] == 0.0


def test_calculate_dca_reinvest_false(client):
    payload = {
        "initial_amount": 50000.0,
        "monthly_dca": 2000.0,
        "duration_years": 3,
        "div_yield_pct": 4.0,
        "growth_pct": 6.0,
        "reinvest_dividends": False,
    }
    response = client.post("/api/dca/calculate", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["total_invested"] == 122000.0
    assert data["accumulated_dividend"] > 0.0
    assert round(data["total_return"], 2) == round(data["capital_gain"] + data["accumulated_dividend"], 2)
