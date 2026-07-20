def _make_portfolio(client, name="DIME"):
    return client.post("/portfolios", json={"name": name}).json()


def test_create_holding(client):
    portfolio = _make_portfolio(client)

    response = client.post(
        f"/portfolios/{portfolio['id']}/holdings",
        json={"ticker": "AAPL", "shares": 12, "avg_cost_usd": 187.40, "target_allocation_pct": 20},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["ticker"] == "AAPL"
    assert body["portfolio_id"] == portfolio["id"]
    assert body["realized_pnl_usd"] == 0.0


def test_create_holding_rejects_target_allocation_over_100_within_portfolio(client):
    portfolio = _make_portfolio(client)
    client.post(
        f"/portfolios/{portfolio['id']}/holdings",
        json={"ticker": "AAPL", "shares": 12, "avg_cost_usd": 187.40, "target_allocation_pct": 70},
    )

    response = client.post(
        f"/portfolios/{portfolio['id']}/holdings",
        json={"ticker": "SMH", "shares": 3, "avg_cost_usd": 297.77, "target_allocation_pct": 40},
    )
    assert response.status_code == 400
    assert "100" in response.json()["detail"]


def test_create_holding_404_for_missing_portfolio(client):
    response = client.post(
        "/portfolios/999/holdings",
        json={"ticker": "AAPL", "shares": 12, "avg_cost_usd": 187.40},
    )
    assert response.status_code == 404


def test_list_holdings_for_portfolio(client):
    portfolio = _make_portfolio(client)
    client.post(f"/portfolios/{portfolio['id']}/holdings", json={"ticker": "AAPL", "shares": 12, "avg_cost_usd": 187.40})
    client.post(f"/portfolios/{portfolio['id']}/holdings", json={"ticker": "SMH", "shares": 3, "avg_cost_usd": 297.77})

    response = client.get(f"/portfolios/{portfolio['id']}/holdings")
    assert response.status_code == 200
    tickers = [h["ticker"] for h in response.json()]
    assert tickers == ["AAPL", "SMH"]


def test_update_holding_realized_pnl(client):
    portfolio = _make_portfolio(client)
    holding = client.post(
        f"/portfolios/{portfolio['id']}/holdings",
        json={"ticker": "SMH", "shares": 3.18, "avg_cost_usd": 297.77},
    ).json()

    response = client.patch(
        f"/portfolios/{portfolio['id']}/holdings/{holding['id']}", json={"realized_pnl_usd": 120.0}
    )
    assert response.status_code == 200
    assert response.json()["realized_pnl_usd"] == 120.0


def test_update_holding_target_allocation_self_only_succeeds(client):
    """Test that PATCH succeeds when updating a holding's allocation if it's the only one.

    This tests the update-exclusion path: without excluding the current holding from the
    sum, updating a holding's own target_allocation_pct would incorrectly sum the old and
    new values and potentially reject valid updates.
    """
    portfolio = _make_portfolio(client)
    holding = client.post(
        f"/portfolios/{portfolio['id']}/holdings",
        json={"ticker": "AAPL", "shares": 12, "avg_cost_usd": 187.40, "target_allocation_pct": 70},
    ).json()

    # PATCH to 90%: only holding exists in this portfolio, so no other allocations to conflict with
    # Without self-exclusion, this would incorrectly sum 70 + 90 = 160 and fail
    response = client.patch(
        f"/portfolios/{portfolio['id']}/holdings/{holding['id']}", json={"target_allocation_pct": 90}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["target_allocation_pct"] == 90


def test_delete_holding(client):
    portfolio = _make_portfolio(client)
    holding = client.post(
        f"/portfolios/{portfolio['id']}/holdings",
        json={"ticker": "AAPL", "shares": 12, "avg_cost_usd": 187.40},
    ).json()

    response = client.delete(f"/portfolios/{portfolio['id']}/holdings/{holding['id']}")
    assert response.status_code == 204

    response = client.get(f"/portfolios/{portfolio['id']}/holdings")
    assert response.json() == []
