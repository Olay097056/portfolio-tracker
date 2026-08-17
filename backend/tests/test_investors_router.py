import app.routers.investors as inv_module


def _row(issuer, cusip, value, period, source="https://www.sec.gov/Archives/test.xml"):
    return {
        "issuer": issuer, "cusip": cusip, "title_of_class": "COM",
        "reported_value_usd": value, "shares": 1000,
        "share_type": "SH", "put_call": None, "filing_period": period,
        "source_url": source, "filing_date": "2026-08-14",
    }


def _fake_sec(monkeypatch):
    rows = {
        "0001067983": [_row("APPLE INC", "A", 1000, "2026-06-30"), _row("ALLY FINL INC", "B", 500, "2026-06-30")],
        "0001697748": [_row("NVIDIA CORP", "C", 900, "2026-06-30")],
        "0001350694": [_row("MICROSOFT CORP", "D", 800, "2026-06-30")],
        "0001166559": [_row("COCA COLA CO", "E", 700, "2026-06-30")],
        "0001649339": [_row("AMAZON COM INC", "F", 600, "2026-06-30")],
    }
    def latest(cik):
        return {"cik": cik, "filing_date": "2026-08-14", "reporting_period": "2026-06-30", "accession_number": f"{cik}-latest"}
    def filing_rows(filing):
        if filing["accession_number"].endswith("previous"):
            return []
        return rows[filing["cik"]]
    def filings(cik, limit=2):
        return [latest(cik), {**latest(cik), "accession_number": f"{cik}-previous", "reporting_period": "2026-03-31"}]
    monkeypatch.setattr(inv_module.sec_13f_service, "fetch_latest_13f", latest)
    monkeypatch.setattr(inv_module.sec_13f_service, "fetch_filing_rows", filing_rows)
    monkeypatch.setattr(inv_module.sec_13f_service, "fetch_13f_filings", filings)
    inv_module._CACHE_TIMESTAMP = 0
    inv_module._CACHED_INVESTORS = []
    inv_module._CACHED_NEW_HOLDINGS = []
    inv_module._SEC_TICKER_MAP = {
        "APPLE INC": "AAPL", "NVIDIA CORP": "NVDA", "MICROSOFT CORP": "MSFT",
        "COCA COLA CO": "KO", "AMAZON COM INC": "AMZN",
    }


def test_list_investors_is_sec_first(client, monkeypatch):
    _fake_sec(monkeypatch)
    response = client.get("/api/investors")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 5
    buffett = next(inv for inv in data if inv["slug"] == "warren-buffett")
    assert buffett["data_provider"] == "SEC EDGAR"
    assert buffett["top_holdings"][0]["ticker"] == "AAPL"
    assert buffett["top_holdings"][0]["source_url"].startswith("https://www.sec.gov/")


def test_investor_search_and_profile(client, monkeypatch):
    _fake_sec(monkeypatch)
    assert client.get("/api/investors?search=Cathie").json()[0]["slug"] == "cathie-wood"
    profile = client.get("/api/investors/ray-dalio").json()
    assert profile["fund_name"] == "Bridgewater Associates, LP"
    assert profile["last_13f_filing"] == "SEC Form 13F (2026-06-30)"


def test_new_holdings_is_derived_from_two_sec_filings(client, monkeypatch):
    _fake_sec(monkeypatch)
    data = client.get("/api/investors/new-holdings").json()
    assert data["total_items"] == 6
    assert data["items"][0]["buyers"][0]["investor_name"] in {
        "Warren Buffett", "Cathie Wood", "Ray Dalio", "Bill Gates", "Michael Burry"
    }
    assert data["items"][0]["source_url"].startswith("https://www.sec.gov/")


def test_refresh_status_names_only_real_provider(client, monkeypatch):
    _fake_sec(monkeypatch)
    response = client.post("/api/investors/refresh")
    assert response.status_code == 200
    assert response.json()["data_provider"] == "SEC EDGAR"


def test_quarter_filing_deadline_uses_sec_rule():
    assert inv_module._quarter_filing_deadline("Q1 2026") == "2026-05-15"
    assert inv_module._quarter_filing_deadline("unknown") == "unknown"


def test_sec_failure_is_explicit_not_fabricated(client, monkeypatch):
    def fail(_cik):
        raise RuntimeError("SEC unavailable")
    monkeypatch.setattr(inv_module.sec_13f_service, "fetch_latest_13f", fail)
    inv_module._CACHE_TIMESTAMP = 0
    inv_module._CACHED_INVESTORS = []
    data = client.get("/api/investors").json()
    assert data[0]["top_holdings"] == []
    assert data[0]["portfolio_value_num"] is None
    assert data[0]["portfolio_value_usd"] == "—"
