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


def test_quarter_filing_deadline_uses_real_45_day_sec_rule():
    """SEC 13F filings are due 45 calendar days after quarter-end -- a real regulatory
    rule, not a made-up number. Q1 2026 ends 2026-03-31, +45 days = 2026-05-15."""
    from app.routers.investors import _quarter_filing_deadline

    assert _quarter_filing_deadline("Q1 2026") == "2026-05-15"
    assert _quarter_filing_deadline("Q4 2025") == "2026-02-14"


def test_quarter_filing_deadline_falls_back_on_unparseable_label():
    from app.routers.investors import _quarter_filing_deadline

    assert _quarter_filing_deadline("unknown") == "unknown"


def test_list_new_holdings_live_fetch_flattens_buyers_per_stock(client, monkeypatch):
    """konbalongtun's /new-holdings API groups by stock with a buyers[] list per stock
    (real shape confirmed 2026-08-07). This must flatten to one row per (stock, buyer)
    pair, extract the ticker from the logo filename, and mark every row as a genuine
    new position -- not fabricate fields the source API doesn't provide."""
    import json
    import urllib.request
    import app.routers.investors as inv_module

    fake_payload = {
        "success": True,
        "data": [
            {
                "name": "Sunbelt Rentals Holdings Inc",
                "logo": "/stock-logo/BXSL.svg",
                "currentPrice": 5292,
                "activityPeriod": "Q1 2026",
                "buyers": [
                    {
                        "investorSlug": "ken-griffin",
                        "investorName": "Ken Griffin",
                        "portfolioPercent": 1,
                        "avgBuyPrice": None,
                        "gainPercent": 0,
                        "activityPeriod": "Q1 2026",
                    },
                    {
                        "investorSlug": "tom-russo",
                        "investorName": "Tom Russo",
                        "portfolioPercent": 78.9,
                        "avgBuyPrice": None,
                        "gainPercent": 0,
                        "activityPeriod": "Q1 2026",
                    },
                ],
                "buyersCount": 2,
            }
        ],
        "pagination": {"totalItems": 1, "totalPages": 1, "currentPage": 1, "limit": 50},
    }

    class FakeResponse:
        status = 200
        def read(self):
            return json.dumps(fake_payload).encode("utf-8")
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False

    def mock_urlopen(*args, **kwargs):
        return FakeResponse()

    inv_module._NEW_HOLDINGS_CACHE_TIMESTAMP = 0.0
    inv_module._CACHED_NEW_HOLDINGS = []
    monkeypatch.setattr(urllib.request, "urlopen", mock_urlopen)

    response = client.get("/api/investors/new-holdings")
    assert response.status_code == 200
    data = response.json()

    assert len(data) == 2
    slugs = {row["investor_slug"] for row in data}
    assert slugs == {"ken-griffin", "tom-russo"}
    for row in data:
        assert row["ticker"] == "BXSL"
        assert row["company_name"] == "Sunbelt Rentals Holdings Inc"
        assert row["action_type"] == "BUY_NEW"
        assert row["shares_changed_pct"] == 100.0
        assert row["quarter"] == "Q1 2026"
        assert row["filing_date"] == "2026-05-15"


def test_list_new_holdings_network_fallback(client, monkeypatch):
    import urllib.request
    import app.routers.investors as inv_module

    def mock_urlopen(*args, **kwargs):
        raise urllib.error.URLError("Server unreachable")

    inv_module._NEW_HOLDINGS_CACHE_TIMESTAMP = 0.0
    inv_module._CACHED_NEW_HOLDINGS = []
    monkeypatch.setattr(urllib.request, "urlopen", mock_urlopen)

    response = client.get("/api/investors/new-holdings")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    assert "ticker" in data[0]
