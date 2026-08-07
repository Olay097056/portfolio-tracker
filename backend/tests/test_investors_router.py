# backend/tests/test_investors_router.py
def test_list_investors(client):
    response = client.get("/api/investors")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 5
    buffett = next((inv for inv in data if inv["slug"] == "warren-buffett"), None)
    assert buffett is not None
    assert buffett["name"] == "Warren Buffett"
    assert len(buffett["top_holdings"]) > 0


def test_list_investors_search_filter(client):
    response = client.get("/api/investors?search=Cathie")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["slug"] == "cathie-wood"


def test_get_investor_profile(client):
    response = client.get("/api/investors/ray-dalio")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Ray Dalio"
    assert data["fund_name"] == "Bridgewater Associates"


def test_get_investor_profile_not_found(client):
    response = client.get("/api/investors/non-existent-slug")
    assert response.status_code == 404


def test_list_new_holdings(client):
    response = client.get("/api/investors/new-holdings")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "ticker" in data[0]


def test_last_13f_filing_reflects_each_investor_s_own_holdings_not_one_fixed_quarter(client):
    """Every investor previously showed the literal 'SEC Form 13F (Q1 2026)' —
    a fixed guess, not derived from real data. It's now the mode of that
    investor's own holdings' activity_period, so different funds can (and do)
    show different quarters."""
    response = client.get("/api/investors")
    assert response.status_code == 200
    data = response.json()

    filings = {inv["slug"]: inv["last_13f_filing"] for inv in data}
    assert len(set(filings.values())) > 1, f"expected real per-investor variation, got: {filings}"

    # A concrete, verifiable fact: Bill Gates' own holdings' most common
    # activity_period is Q3 2025, not Q1 2026.
    bill_gates = next((inv for inv in data if inv["slug"] == "bill-gates"), None)
    assert bill_gates is not None
    assert bill_gates["last_13f_filing"] == "SEC Form 13F (Q3 2025)"


def test_data_provider_credits_konbalongtun_not_only_sec_edgar(client):
    response = client.get("/api/investors")
    assert response.status_code == 200
    data = response.json()
    for inv in data:
        assert "Konbalongtun" in inv["data_provider"]


def test_list_investors_network_fallback(client, monkeypatch):
    import urllib.request
    def mock_urlopen(*args, **kwargs):
        raise urllib.error.URLError("Server unreachable")
    
    # Invalidate cache first
    import app.routers.investors as inv_module
    inv_module._CACHE_TIMESTAMP = 0.0
    inv_module._CACHED_INVESTORS = []

    monkeypatch.setattr(urllib.request, "urlopen", mock_urlopen)

    response = client.get("/api/investors")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    names = [inv["name"] for inv in data]
    assert "Warren Buffett" in names
