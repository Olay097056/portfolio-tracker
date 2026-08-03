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


def test_get_chart_returns_points_for_a_ticker(client):
    points = [{"time": "2026-01-02", "close": 100.0}, {"time": "2026-01-05", "close": 101.5}]

    with patch("app.routers.market.get_chart_data", return_value=points):
        response = client.get("/market/chart?ticker=VTI&range=1Y")

    assert response.status_code == 200
    assert response.json() == {"points": points}


def test_get_chart_reports_unavailable_when_fetch_fails(client):
    with patch("app.routers.market.get_chart_data", return_value=None):
        response = client.get("/market/chart?ticker=BADTICKER&range=1Y")

    assert response.status_code == 200
    assert response.json() == {"points": None}


def test_get_chart_passes_ticker_and_range_through(client):
    with patch("app.routers.market.get_chart_data", return_value=[]) as mock_get_chart_data:
        client.get("/market/chart?ticker=VTI&range=1Y")

    mock_get_chart_data.assert_called_once_with("VTI", "1Y")


def test_get_chart_accepts_all_seven_ranges(client):
    for range_ in ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y"]:
        with patch("app.routers.market.get_chart_data", return_value=[]) as mock_get_chart_data:
            response = client.get(f"/market/chart?ticker=VTI&range={range_}")
        assert response.status_code == 200, f"range={range_} failed: {response.json()}"
        mock_get_chart_data.assert_called_once_with("VTI", range_)


def test_get_chart_rejects_an_invalid_range(client):
    response = client.get("/market/chart?ticker=VTI&range=3Y")

    assert response.status_code == 422
