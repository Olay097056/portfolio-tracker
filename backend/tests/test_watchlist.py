def test_create_watchlist_item(client):
    response = client.post("/watchlist", json={"ticker": "JNJ", "category": "Value"})
    assert response.status_code == 201
    body = response.json()
    assert body["ticker"] == "JNJ"
    assert body["category"] == "Value"


def test_list_watchlist_items(client):
    client.post("/watchlist", json={"ticker": "JNJ", "category": "Value"})
    client.post("/watchlist", json={"ticker": "IOVA", "category": "Growth"})

    response = client.get("/watchlist")
    assert response.status_code == 200
    tickers = [w["ticker"] for w in response.json()]
    assert tickers == ["JNJ", "IOVA"]


def test_delete_watchlist_item(client):
    created = client.post("/watchlist", json={"ticker": "JNJ"}).json()

    response = client.delete(f"/watchlist/{created['id']}")
    assert response.status_code == 204

    response = client.get("/watchlist")
    assert response.json() == []
