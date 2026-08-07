# backend/tests/test_stock_search.py
# Shared typeahead endpoint (GET /api/screener/search) backing the ticker-autocomplete
# dropdown used across the app -- Add Holding, Watchlist, DCA/Passive Income calculators,
# Dashboard symbol search, Investor Tracker's two search bars, Batch Transaction. The test
# DB has no screener_stocks rows seeded (see conftest.py) unless a test explicitly inserts
# some, so most requests here exercise the FALLBACK_STOCKS-only path.
from app.models import ScreenerStock


def test_search_by_ticker_prefix(client):
    response = client.get("/api/screener/search?q=NVD")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    assert data[0]["symbol"] == "NVDA"
    assert data[0]["company_name"] == "NVIDIA Corporation"


def test_search_by_company_name_substring(client):
    response = client.get("/api/screener/search?q=Microsoft")
    data = response.json()
    symbols = [row["symbol"] for row in data]
    assert "MSFT" in symbols


def test_search_is_case_insensitive(client):
    response = client.get("/api/screener/search?q=nvda")
    data = response.json()
    assert any(row["symbol"] == "NVDA" for row in data)


def test_search_ranks_ticker_prefix_matches_above_name_matches(client):
    # "A" is a ticker-prefix match for AAPL/AMZN/AVGO/etc AND a name-substring match for
    # almost every company name in English -- prefix matches must sort first regardless.
    response = client.get("/api/screener/search?q=A&limit=20")
    data = response.json()
    symbols = [row["symbol"] for row in data]
    prefix_matches = [s for s in symbols if s.startswith("A")]
    if prefix_matches:
        first_prefix_idx = symbols.index(prefix_matches[0])
        # every prefix match should appear before any non-prefix match
        non_prefix_before = [s for s in symbols[:first_prefix_idx] if not s.startswith("A")]
        assert non_prefix_before == []


def test_search_respects_limit(client):
    response = client.get("/api/screener/search?q=A&limit=3")
    data = response.json()
    assert len(data) <= 3


def test_search_no_match_returns_empty_list(client):
    response = client.get("/api/screener/search?q=ZZZZ_NOT_A_REAL_TICKER")
    assert response.status_code == 200
    assert response.json() == []


def test_search_requires_nonempty_query(client):
    response = client.get("/api/screener/search?q=")
    assert response.status_code == 422


def test_search_missing_query_param_is_422(client):
    response = client.get("/api/screener/search")
    assert response.status_code == 422


def test_search_merges_db_rows_with_fallback_stocks_not_either_or(client, db_session):
    """Real-world bug this guards against: the live screener_stocks DB (populated via the
    refresh job) turned out to contain ~986 small/mid-cap rows and ZERO of this app's own
    well-known tickers (AAPL, NVDA, VOO, ...) -- confirmed 2026-08-07. A naive "DB if
    populated, else fallback" branch (like POST /stocks uses) would make the typeahead
    silently stop finding NVDA, AAPL, etc. the moment the DB has ANY rows at all. Both
    sources must always be searched and merged."""
    db_session.add(ScreenerStock(symbol="XMTR", company_name="Xometry Inc", market_cap=1e9))
    db_session.commit()

    # A DB-only small-cap row still surfaces...
    db_only = client.get("/api/screener/search?q=XMTR").json()
    assert any(row["symbol"] == "XMTR" for row in db_only)

    # ...and a well-known ticker that only exists in FALLBACK_STOCKS still surfaces too,
    # even though the DB now has rows (db_count > 0).
    fallback_still_found = client.get("/api/screener/search?q=NVDA").json()
    assert any(row["symbol"] == "NVDA" for row in fallback_still_found)


def test_search_db_row_wins_over_fallback_on_symbol_overlap(client, db_session):
    # NVDA exists in both FALLBACK_STOCKS and (here) the DB, with a different company_name --
    # the DB's real, potentially-fresher data should win, and NVDA must appear only once.
    db_session.add(ScreenerStock(symbol="NVDA", company_name="NVIDIA Corp (live DB)", market_cap=3e12))
    db_session.commit()

    data = client.get("/api/screener/search?q=NVDA").json()
    nvda_rows = [row for row in data if row["symbol"] == "NVDA"]
    assert len(nvda_rows) == 1
    assert nvda_rows[0]["company_name"] == "NVIDIA Corp (live DB)"
