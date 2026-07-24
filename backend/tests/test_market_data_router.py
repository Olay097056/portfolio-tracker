from unittest.mock import patch


def test_get_market_data_returns_fetched_data(client):
    with patch(
        "app.routers.market_data.get_market_data",
        return_value={"JEPQ": {"price": 58.51, "dividend_yield_pct": 11.1, "growth_rate_pct": 10.0}},
    ) as mock_get_market_data:
        response = client.get("/market-data", params={"tickers": "JEPQ"})

    assert response.status_code == 200
    assert response.json() == {
        "market_data": {"JEPQ": {"price": 58.51, "dividend_yield_pct": 11.1, "growth_rate_pct": 10.0}}
    }
    mock_get_market_data.assert_called_once_with(["JEPQ"])


def test_get_market_data_with_no_tickers_param_returns_empty(client):
    response = client.get("/market-data")

    assert response.status_code == 200
    assert response.json() == {"market_data": {}}


def test_get_market_data_strips_whitespace_around_tickers(client):
    with patch("app.routers.market_data.get_market_data", return_value={}) as mock_get_market_data:
        client.get("/market-data", params={"tickers": " JEPQ , QQQI "})

    mock_get_market_data.assert_called_once_with(["JEPQ", "QQQI"])
