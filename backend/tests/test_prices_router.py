from unittest.mock import patch


def test_get_prices_returns_fetched_prices(client):
    with patch("app.routers.prices.get_prices", return_value={"AAPL": 333.74, "SMH": 556.53}) as mock_get_prices:
        response = client.get("/prices", params={"tickers": "AAPL,SMH"})

    assert response.status_code == 200
    assert response.json() == {"prices": {"AAPL": 333.74, "SMH": 556.53}}
    mock_get_prices.assert_called_once_with(["AAPL", "SMH"])


def test_get_prices_with_no_tickers_param_returns_empty(client):
    response = client.get("/prices")

    assert response.status_code == 200
    assert response.json() == {"prices": {}}


def test_get_prices_strips_whitespace_around_tickers(client):
    with patch("app.routers.prices.get_prices", return_value={}) as mock_get_prices:
        client.get("/prices", params={"tickers": " AAPL , SMH "})

    mock_get_prices.assert_called_once_with(["AAPL", "SMH"])
