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


def test_create_watchlist_item_rejects_a_blank_ticker(client):
    response = client.post("/watchlist", json={"ticker": "   "})
    assert response.status_code == 400

    assert client.get("/watchlist").json() == []


def test_create_watchlist_item_uppercases_the_ticker(client):
    response = client.post("/watchlist", json={"ticker": "aapl"})
    assert response.status_code == 201
    assert response.json()["ticker"] == "AAPL"


def test_create_watchlist_item_rejects_a_duplicate_ticker(client):
    first = client.post("/watchlist", json={"ticker": "JNJ"})
    assert first.status_code == 201

    second = client.post("/watchlist", json={"ticker": "JNJ"})
    assert second.status_code == 400

    tickers = [w["ticker"] for w in client.get("/watchlist").json()]
    assert tickers == ["JNJ"]


def test_create_watchlist_item_rejects_a_duplicate_ticker_regardless_of_case(client):
    first = client.post("/watchlist", json={"ticker": "aapl"})
    assert first.status_code == 201

    second = client.post("/watchlist", json={"ticker": "AAPL"})
    assert second.status_code == 400

    tickers = [w["ticker"] for w in client.get("/watchlist").json()]
    assert tickers == ["AAPL"]
