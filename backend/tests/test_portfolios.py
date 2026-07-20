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
