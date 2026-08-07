def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_create_portfolio(client):
    response = client.post("/portfolios", json={"name": "DIME", "cash_usd": 250, "target_allocation_pct": 70})
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "DIME"
    assert body["cash_usd"] == 250
    assert "id" in body


def test_list_portfolios(client):
    client.post("/portfolios", json={"name": "DIME", "target_allocation_pct": 70})
    client.post("/portfolios", json={"name": "Speculative", "target_allocation_pct": 30})

    response = client.get("/portfolios")
    assert response.status_code == 200
    names = [p["name"] for p in response.json()]
    assert names == ["DIME", "Speculative"]


def test_create_portfolio_rejects_target_allocation_over_100_total(client):
    client.post("/portfolios", json={"name": "DIME", "target_allocation_pct": 70})
    response = client.post("/portfolios", json={"name": "Speculative", "target_allocation_pct": 40})

    assert response.status_code == 400
    assert "100" in response.json()["detail"]


def test_update_portfolio_name_and_cash(client):
    created = client.post("/portfolios", json={"name": "DIME", "target_allocation_pct": 70}).json()

    response = client.patch(f"/portfolios/{created['id']}", json={"name": "DIME Core", "cash_usd": 500})
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "DIME Core"
    assert body["cash_usd"] == 500


def test_update_portfolio_target_allocation_rejects_exceeding_100_total(client):
    """Test that PATCH rejects a total allocation that would exceed 100%."""
    dime = client.post("/portfolios", json={"name": "DIME", "target_allocation_pct": 70}).json()
    client.post("/portfolios", json={"name": "Speculative", "target_allocation_pct": 20})

    # PATCH DIME to 90%: existing (Speculative 20%) + incoming (90%) = 110% > 100%, should fail
    response = client.patch(f"/portfolios/{dime['id']}", json={"target_allocation_pct": 90})
    assert response.status_code == 400
    assert "100" in response.json()["detail"]


def test_update_portfolio_target_allocation_self_only_succeeds(client):
    """Test that PATCH succeeds when updating a portfolio's allocation if it's the only one."""
    portfolio = client.post("/portfolios", json={"name": "Retirement", "target_allocation_pct": 70}).json()

    # PATCH to 90%: only portfolio exists, so no other allocations to conflict with
    # Without self-exclusion, this would incorrectly sum 70 + 90 = 160 and fail
    response = client.patch(f"/portfolios/{portfolio['id']}", json={"target_allocation_pct": 90})
    assert response.status_code == 200
    body = response.json()
    assert body["target_allocation_pct"] == 90


def test_delete_portfolio(client):
    created = client.post("/portfolios", json={"name": "DIME"}).json()

    response = client.delete(f"/portfolios/{created['id']}")
    assert response.status_code == 204

    response = client.get(f"/portfolios/{created['id']}")
    assert response.status_code == 404


def test_portfolio_summary_fetches_prices_server_side(client):
    from unittest.mock import patch

    portfolio = client.post("/portfolios", json={"name": "DIME", "cash_usd": 250, "target_allocation_pct": 70}).json()
    client.post(
        f"/portfolios/{portfolio['id']}/holdings",
        json={"ticker": "AAPL", "shares": 12, "avg_cost_usd": 187.40, "target_allocation_pct": 20},
    )

    with patch("app.routers.portfolios.get_prices", return_value={"AAPL": 333.74}) as mock_get_prices:
        response = client.get(f"/portfolios/{portfolio['id']}/summary")

    assert response.status_code == 200
    body = response.json()
    assert round(body["holdings_value"], 2) == round(12 * 333.74, 2)
    assert round(body["total_value"], 2) == round(12 * 333.74 + 250, 2)
    assert body["holdings"][0]["ticker"] == "AAPL"
    mock_get_prices.assert_called_once_with(["AAPL"])


def test_portfolio_summary_404_for_missing_portfolio(client):
    response = client.get("/portfolios/999/summary")
    assert response.status_code == 404


def test_portfolio_summaries_are_isolated_across_portfolios(client):
    """Two portfolios, each with their own holding, must not leak values into each other's summary."""
    from unittest.mock import patch

    portfolio_a = client.post("/portfolios", json={"name": "DIME", "cash_usd": 100}).json()
    portfolio_b = client.post("/portfolios", json={"name": "Speculative", "cash_usd": 50}).json()

    client.post(
        f"/portfolios/{portfolio_a['id']}/holdings",
        json={"ticker": "AAPL", "shares": 10, "avg_cost_usd": 100},
    )
    client.post(
        f"/portfolios/{portfolio_b['id']}/holdings",
        json={"ticker": "SMH", "shares": 5, "avg_cost_usd": 200},
    )

    with patch("app.routers.portfolios.get_prices", return_value={"AAPL": 150, "SMH": 300}) as mock_get_prices:
        response_a = client.get(f"/portfolios/{portfolio_a['id']}/summary")
        response_b = client.get(f"/portfolios/{portfolio_b['id']}/summary")
    assert response_a.status_code == 200
    assert response_b.status_code == 200
    body_a = response_a.json()
    body_b = response_b.json()

    # Portfolio A only reflects its own AAPL holding.
    assert round(body_a["holdings_value"], 2) == round(10 * 150, 2)
    assert round(body_a["total_value"], 2) == round(10 * 150 + 100, 2)
    assert [h["ticker"] for h in body_a["holdings"]] == ["AAPL"]

    # Portfolio B only reflects its own SMH holding, unaffected by A's holding/prices.
    assert round(body_b["holdings_value"], 2) == round(5 * 300, 2)
    assert round(body_b["total_value"], 2) == round(5 * 300 + 50, 2)
    assert [h["ticker"] for h in body_b["holdings"]] == ["SMH"]

    # Verify get_prices was called with the correct per-portfolio ticker lists.
    mock_get_prices.assert_any_call(["AAPL"])
    mock_get_prices.assert_any_call(["SMH"])


def test_rebalance_targets_happy_path(client):
    dime = client.post("/portfolios", json={"name": "DIME", "target_allocation_pct": 70}).json()
    spec = client.post("/portfolios", json={"name": "Speculative", "target_allocation_pct": 30}).json()

    response = client.patch(
        "/portfolios/rebalance-targets",
        json={"updates": [{"id": dime["id"], "target_allocation_pct": 60}, {"id": spec["id"], "target_allocation_pct": 40}]},
    )
    assert response.status_code == 200
    by_id = {p["id"]: p for p in response.json()}
    assert by_id[dime["id"]]["target_allocation_pct"] == 60
    assert by_id[spec["id"]]["target_allocation_pct"] == 40

    # Persisted, not just returned.
    assert client.get(f"/portfolios/{dime['id']}").json()["target_allocation_pct"] == 60
    assert client.get(f"/portfolios/{spec['id']}").json()["target_allocation_pct"] == 40


def test_rebalance_targets_rejects_sum_not_100_and_changes_nothing(client):
    dime = client.post("/portfolios", json={"name": "DIME", "target_allocation_pct": 70}).json()
    spec = client.post("/portfolios", json={"name": "Speculative", "target_allocation_pct": 30}).json()

    response = client.patch(
        "/portfolios/rebalance-targets",
        json={"updates": [{"id": dime["id"], "target_allocation_pct": 60}, {"id": spec["id"], "target_allocation_pct": 30}]},
    )
    assert response.status_code == 400
    assert "100" in response.json()["detail"]

    # Neither portfolio's target changed — atomicity, not just the response code.
    assert client.get(f"/portfolios/{dime['id']}").json()["target_allocation_pct"] == 70
    assert client.get(f"/portfolios/{spec['id']}").json()["target_allocation_pct"] == 30


def test_rebalance_targets_rejects_unknown_id_and_changes_nothing(client):
    dime = client.post("/portfolios", json={"name": "DIME", "target_allocation_pct": 70}).json()
    client.post("/portfolios", json={"name": "Speculative", "target_allocation_pct": 30})

    response = client.patch(
        "/portfolios/rebalance-targets",
        json={"updates": [{"id": dime["id"], "target_allocation_pct": 60}, {"id": 999999, "target_allocation_pct": 40}]},
    )
    assert response.status_code == 404

    # DIME's target is unchanged even though it was a valid id in the same batch.
    assert client.get(f"/portfolios/{dime['id']}").json()["target_allocation_pct"] == 70


def test_rebalance_targets_leaves_portfolios_outside_the_batch_untouched(client):
    dime = client.post("/portfolios", json={"name": "DIME", "target_allocation_pct": 50}).json()
    untouched = client.post("/portfolios", json={"name": "Untouched", "target_allocation_pct": 50}).json()

    response = client.patch(
        "/portfolios/rebalance-targets",
        json={"updates": [{"id": dime["id"], "target_allocation_pct": 100}]},
    )
    assert response.status_code == 200

    assert client.get(f"/portfolios/{dime['id']}").json()["target_allocation_pct"] == 100
    assert client.get(f"/portfolios/{untouched['id']}").json()["target_allocation_pct"] == 50


def test_adjust_cash_deposit(client):
    """POST /portfolios/{id}/cash was never covered by a test — it had a
    NameError (Transaction never imported) that made every deposit/withdraw
    fail with a 500 in real use, undetected until now."""
    portfolio = client.post("/portfolios", json={"name": "DIME"}).json()

    response = client.post(f"/portfolios/{portfolio['id']}/cash", json={"type": "CASH_DEPOSIT", "amount": 125, "note": "Payday"})
    assert response.status_code == 200
    assert response.json()["cash_usd"] == 125

    tx_response = client.get(f"/portfolios/{portfolio['id']}/transactions")
    assert tx_response.status_code == 200
    txs = tx_response.json()
    assert len(txs) == 1
    assert txs[0]["type"] == "CASH_DEPOSIT"
    assert txs[0]["amount_usd"] == 125
    assert txs[0]["note"] == "Payday"


def test_adjust_cash_withdraw(client):
    portfolio = client.post("/portfolios", json={"name": "DIME", "cash_usd": 500}).json()

    response = client.post(f"/portfolios/{portfolio['id']}/cash", json={"type": "CASH_WITHDRAW", "amount": 200})
    assert response.status_code == 200
    assert response.json()["cash_usd"] == 300

    txs = client.get(f"/portfolios/{portfolio['id']}/transactions").json()
    assert len(txs) == 1
    assert txs[0]["type"] == "CASH_WITHDRAW"
    assert txs[0]["amount_usd"] == 200


def test_adjust_cash_withdraw_rejects_insufficient_balance(client):
    portfolio = client.post("/portfolios", json={"name": "DIME", "cash_usd": 50}).json()

    response = client.post(f"/portfolios/{portfolio['id']}/cash", json={"type": "CASH_WITHDRAW", "amount": 200})
    assert response.status_code == 400
    assert "insufficient" in response.json()["detail"].lower()

    # Balance and transaction log both unchanged after the rejected withdrawal.
    assert client.get(f"/portfolios/{portfolio['id']}").json()["cash_usd"] == 50
    assert client.get(f"/portfolios/{portfolio['id']}/transactions").json() == []
