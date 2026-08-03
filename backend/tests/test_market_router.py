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


def test_get_chart_returns_points_and_zones_for_a_ticker(client):
    points = [{"time": "2026-01-02", "close": 100.0}, {"time": "2026-01-05", "close": 101.5}]
    zones = [{"price": 95.0, "kind": "support", "strength": 3, "source": "auto"}]

    with patch("app.routers.market.get_chart_data", return_value={"points": points, "zones": zones}):
        response = client.get("/market/chart?ticker=VTI&range=1Y")

    assert response.status_code == 200
    assert response.json() == {
        "points": points,
        "zones": [{"id": None, "price": 95.0, "kind": "support", "strength": 3, "source": "auto"}],
    }


def test_get_chart_reports_unavailable_when_fetch_fails(client):
    with patch("app.routers.market.get_chart_data", return_value=None):
        response = client.get("/market/chart?ticker=BADTICKER&range=1Y")

    assert response.status_code == 200
    assert response.json() == {"points": None, "zones": []}


def test_get_chart_passes_ticker_and_range_through(client):
    with patch(
        "app.routers.market.get_chart_data", return_value={"points": [], "zones": []}
    ) as mock_get_chart_data:
        client.get("/market/chart?ticker=VTI&range=1Y")

    mock_get_chart_data.assert_called_once_with("VTI", "1Y")


def test_get_chart_accepts_all_seven_ranges(client):
    for range_ in ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y"]:
        with patch(
            "app.routers.market.get_chart_data", return_value={"points": [], "zones": []}
        ) as mock_get_chart_data:
            response = client.get(f"/market/chart?ticker=VTI&range={range_}")
        assert response.status_code == 200, f"range={range_} failed: {response.json()}"
        mock_get_chart_data.assert_called_once_with("VTI", range_)


def test_get_chart_preserves_integer_time_for_intraday_points(client):
    points = [{"time": 1735808400, "close": 100.0}]

    with patch("app.routers.market.get_chart_data", return_value={"points": points, "zones": []}):
        response = client.get("/market/chart?ticker=VTI&range=1D")

    assert response.status_code == 200
    body = response.json()
    assert body["points"][0]["time"] == 1735808400
    assert isinstance(body["points"][0]["time"], int)


def test_get_chart_rejects_an_invalid_range(client):
    response = client.get("/market/chart?ticker=VTI&range=3Y")

    assert response.status_code == 422


def test_get_chart_returns_manual_zones_once_frozen_ignoring_auto(client):
    freeze_response = client.post(
        "/market/chart/zones/freeze",
        json={"ticker": "VTI", "range": "1Y", "zones": [{"kind": "support", "price": 90.0}]},
    )
    assert freeze_response.status_code == 200

    # A different auto result is mocked here specifically to prove it's ignored once manual
    # zones exist for this pair — if the read path fell through to auto anyway, this assertion
    # would fail with the auto zone's price (99.0) instead of the frozen manual one (90.0).
    auto_zones = [{"price": 99.0, "kind": "resistance", "strength": 5, "source": "auto"}]
    with patch(
        "app.routers.market.get_chart_data", return_value={"points": [], "zones": auto_zones}
    ):
        response = client.get("/market/chart?ticker=VTI&range=1Y")

    body = response.json()
    assert len(body["zones"]) == 1
    assert body["zones"][0]["price"] == 90.0
    assert body["zones"][0]["source"] == "manual"
    assert body["zones"][0]["id"] is not None


def test_post_freeze_creates_the_given_zones_as_manual(client):
    response = client.post(
        "/market/chart/zones/freeze",
        json={
            "ticker": "VTI",
            "range": "1Y",
            "zones": [{"kind": "support", "price": 90.0}, {"kind": "resistance", "price": 110.0}],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert all(zone["source"] == "manual" for zone in body)
    assert all(zone["id"] is not None for zone in body)
    assert all(zone["strength"] is None for zone in body)
    assert {(zone["kind"], zone["price"]) for zone in body} == {("support", 90.0), ("resistance", 110.0)}


def test_post_freeze_accepts_a_freestyle_zone(client):
    response = client.post(
        "/market/chart/zones/freeze",
        json={"ticker": "VTI", "range": "1Y", "zones": [{"kind": "freestyle", "price": 100.0}]},
    )

    assert response.status_code == 200
    assert response.json()[0]["kind"] == "freestyle"


def test_post_zones_adds_one_manual_zone(client):
    response = client.post(
        "/market/chart/zones", json={"ticker": "VTI", "range": "1Y", "kind": "freestyle", "price": 105.0}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["kind"] == "freestyle"
    assert body["price"] == 105.0
    assert body["source"] == "manual"
    assert body["strength"] is None
    assert body["id"] is not None


def test_patch_zone_updates_the_price(client):
    created = client.post(
        "/market/chart/zones", json={"ticker": "VTI", "range": "1Y", "kind": "support", "price": 90.0}
    ).json()

    response = client.patch(f"/market/chart/zones/{created['id']}", json={"price": 92.5})

    assert response.status_code == 200
    assert response.json()["price"] == 92.5
    assert response.json()["id"] == created["id"]


def test_patch_zone_returns_404_for_unknown_id(client):
    response = client.patch("/market/chart/zones/999999", json={"price": 100.0})

    assert response.status_code == 404


def test_delete_zone_removes_it(client):
    created = client.post(
        "/market/chart/zones", json={"ticker": "VTI", "range": "1Y", "kind": "support", "price": 90.0}
    ).json()

    response = client.delete(f"/market/chart/zones/{created['id']}")
    assert response.status_code == 204

    with patch("app.routers.market.get_chart_data", return_value={"points": [], "zones": []}):
        follow_up = client.get("/market/chart?ticker=VTI&range=1Y")
    assert follow_up.json()["zones"] == []


def test_delete_zone_returns_404_for_unknown_id(client):
    response = client.delete("/market/chart/zones/999999")

    assert response.status_code == 404


def test_delete_all_zones_reverts_the_pair_to_auto(client):
    client.post("/market/chart/zones/freeze", json={"ticker": "VTI", "range": "1Y", "zones": [{"kind": "support", "price": 90.0}]})

    response = client.delete("/market/chart/zones?ticker=VTI&range=1Y")
    assert response.status_code == 204

    auto_zones = [{"price": 99.0, "kind": "resistance", "strength": 5, "source": "auto"}]
    with patch(
        "app.routers.market.get_chart_data", return_value={"points": [], "zones": auto_zones}
    ):
        follow_up = client.get("/market/chart?ticker=VTI&range=1Y")
    assert follow_up.json()["zones"][0]["price"] == 99.0
    assert follow_up.json()["zones"][0]["source"] == "auto"


def test_delete_all_zones_only_affects_the_given_ticker_and_range(client):
    client.post("/market/chart/zones/freeze", json={"ticker": "VTI", "range": "1Y", "zones": [{"kind": "support", "price": 90.0}]})
    client.post("/market/chart/zones/freeze", json={"ticker": "VTI", "range": "5Y", "zones": [{"kind": "support", "price": 80.0}]})

    client.delete("/market/chart/zones?ticker=VTI&range=1Y")

    with patch("app.routers.market.get_chart_data", return_value={"points": [], "zones": []}):
        response = client.get("/market/chart?ticker=VTI&range=5Y")
    assert len(response.json()["zones"]) == 1
    assert response.json()["zones"][0]["price"] == 80.0
