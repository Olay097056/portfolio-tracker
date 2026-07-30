from unittest.mock import patch


def test_get_trending_returns_all_three_lists_when_key_is_configured(client, monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "test-key")
    rows = [{"ticker": "AAPL", "name": "Apple Inc.", "price": 195.5, "change_pct": 4.2}]

    with (
        patch("app.routers.market.get_gainers", return_value=rows),
        patch("app.routers.market.get_losers", return_value=rows),
        patch("app.routers.market.get_most_active", return_value=rows),
    ):
        response = client.get("/market/trending")

    assert response.status_code == 200
    body = response.json()
    assert body["api_key_configured"] is True
    assert body["gainers"] == rows
    assert body["losers"] == rows
    assert body["most_active"] == rows


def test_get_trending_reports_missing_key_without_calling_fmp(client, monkeypatch):
    monkeypatch.delenv("FMP_API_KEY", raising=False)

    with patch("app.routers.market.get_gainers") as mock_get_gainers:
        response = client.get("/market/trending")

    assert response.status_code == 200
    body = response.json()
    assert body == {"gainers": None, "losers": None, "most_active": None, "api_key_configured": False}
    mock_get_gainers.assert_not_called()


def test_get_trending_reports_a_list_as_unavailable_when_its_own_fetch_fails(client, monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "test-key")
    rows = [{"ticker": "AAPL", "name": "Apple Inc.", "price": 195.5, "change_pct": 4.2}]

    with (
        patch("app.routers.market.get_gainers", return_value=None),
        patch("app.routers.market.get_losers", return_value=rows),
        patch("app.routers.market.get_most_active", return_value=rows),
    ):
        response = client.get("/market/trending")

    body = response.json()
    assert body["api_key_configured"] is True
    assert body["gainers"] is None
    assert body["losers"] == rows
