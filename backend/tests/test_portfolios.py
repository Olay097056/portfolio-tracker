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


def test_delete_portfolio(client):
    created = client.post("/portfolios", json={"name": "DIME"}).json()

    response = client.delete(f"/portfolios/{created['id']}")
    assert response.status_code == 204

    response = client.get(f"/portfolios/{created['id']}")
    assert response.status_code == 404
