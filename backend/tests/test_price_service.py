import pytest

from app import price_service


@pytest.fixture(autouse=True)
def _clear_cache():
    price_service.clear_cache()
    price_service.clear_market_data_cache()
    yield
    price_service.clear_cache()
    price_service.clear_market_data_cache()


def test_get_price_returns_yfinance_price_and_does_not_call_twelvedata(monkeypatch):
    monkeypatch.setattr(price_service, "_fetch_from_yfinance", lambda ticker: 333.74)

    called_twelvedata = []
    monkeypatch.setattr(price_service, "_fetch_from_twelvedata", lambda ticker: called_twelvedata.append(ticker) or 999.0)

    price = price_service.get_price("AAPL")

    assert price == 333.74
    assert called_twelvedata == []


def test_get_price_falls_back_to_twelvedata_when_yfinance_fails(monkeypatch):
    monkeypatch.setattr(price_service, "_fetch_from_yfinance", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_from_twelvedata", lambda ticker: 556.53)

    price = price_service.get_price("SMH")

    assert price == 556.53


def test_get_price_returns_none_when_both_sources_fail(monkeypatch):
    monkeypatch.setattr(price_service, "_fetch_from_yfinance", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_from_twelvedata", lambda ticker: None)

    price = price_service.get_price("NOTATICKER")

    assert price is None


def test_get_price_caches_and_does_not_refetch_within_ttl(monkeypatch):
    call_count = {"n": 0}

    def fake_yfinance(ticker):
        call_count["n"] += 1
        return 100.0

    monkeypatch.setattr(price_service, "_fetch_from_yfinance", fake_yfinance)

    first = price_service.get_price("AAPL")
    second = price_service.get_price("AAPL")

    assert first == 100.0
    assert second == 100.0
    assert call_count["n"] == 1


def test_get_price_refetches_after_ttl_expires(monkeypatch):
    monkeypatch.setattr(price_service, "_fetch_from_yfinance", lambda ticker: 100.0)

    fake_time = {"t": 1000.0}
    monkeypatch.setattr(price_service.time, "monotonic", lambda: fake_time["t"])

    price_service.get_price("AAPL")

    fake_time["t"] += price_service.CACHE_TTL_SECONDS + 1

    call_count = {"n": 0}

    def fake_yfinance_second(ticker):
        call_count["n"] += 1
        return 105.0

    monkeypatch.setattr(price_service, "_fetch_from_yfinance", fake_yfinance_second)

    price = price_service.get_price("AAPL")

    assert price == 105.0
    assert call_count["n"] == 1


def test_a_failed_fetch_is_not_cached(monkeypatch):
    monkeypatch.setattr(price_service, "_fetch_from_yfinance", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_from_twelvedata", lambda ticker: None)

    price_service.get_price("BADTICKER")

    call_count = {"n": 0}

    def fake_yfinance(ticker):
        call_count["n"] += 1
        return 50.0

    monkeypatch.setattr(price_service, "_fetch_from_yfinance", fake_yfinance)

    price = price_service.get_price("BADTICKER")

    assert price == 50.0
    assert call_count["n"] == 1


def test_get_prices_returns_a_dict_keyed_by_ticker(monkeypatch):
    prices = {"AAPL": 333.74, "SMH": 556.53}
    monkeypatch.setattr(price_service, "_fetch_from_yfinance", lambda ticker: prices[ticker])

    result = price_service.get_prices(["AAPL", "SMH"])

    assert result == {"AAPL": 333.74, "SMH": 556.53}


def test_get_prices_omits_tickers_that_fail_both_sources(monkeypatch):
    def fake_yfinance(ticker):
        return 100.0 if ticker == "AAPL" else None

    monkeypatch.setattr(price_service, "_fetch_from_yfinance", fake_yfinance)
    monkeypatch.setattr(price_service, "_fetch_from_twelvedata", lambda ticker: None)

    result = price_service.get_prices(["AAPL", "BADTICKER"])

    assert result == {"AAPL": 100.0}


def test_get_prices_with_empty_list_returns_empty_dict():
    result = price_service.get_prices([])

    assert result == {}


def test_get_market_data_returns_price_yield_and_growth(monkeypatch):
    monkeypatch.setattr(price_service, "get_price", lambda ticker: 58.51)
    monkeypatch.setattr(price_service, "_fetch_dividend_yield_pct", lambda ticker: 11.1)
    monkeypatch.setattr(price_service, "_fetch_growth_rate_pct", lambda ticker: 10.0)

    result = price_service.get_market_data(["JEPQ"])

    assert result == {"JEPQ": {"price": 58.51, "dividend_yield_pct": 11.1, "growth_rate_pct": 10.0}}


def test_get_market_data_leaves_yield_and_growth_none_when_they_fail(monkeypatch):
    monkeypatch.setattr(price_service, "get_price", lambda ticker: 58.51)
    monkeypatch.setattr(price_service, "_fetch_dividend_yield_pct", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_growth_rate_pct", lambda ticker: None)

    result = price_service.get_market_data(["JEPQ"])

    assert result == {"JEPQ": {"price": 58.51, "dividend_yield_pct": None, "growth_rate_pct": None}}


def test_get_market_data_includes_ticker_even_when_price_fails(monkeypatch):
    monkeypatch.setattr(price_service, "get_price", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_dividend_yield_pct", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_growth_rate_pct", lambda ticker: None)

    result = price_service.get_market_data(["BADTICKER"])

    assert result == {"BADTICKER": {"price": None, "dividend_yield_pct": None, "growth_rate_pct": None}}


def test_get_market_data_caches_and_does_not_refetch_within_ttl(monkeypatch):
    call_count = {"n": 0}

    def fake_get_price(ticker):
        call_count["n"] += 1
        return 58.51

    monkeypatch.setattr(price_service, "get_price", fake_get_price)
    monkeypatch.setattr(price_service, "_fetch_dividend_yield_pct", lambda ticker: 11.1)
    monkeypatch.setattr(price_service, "_fetch_growth_rate_pct", lambda ticker: 10.0)

    price_service.get_market_data(["JEPQ"])
    price_service.get_market_data(["JEPQ"])

    assert call_count["n"] == 1


def test_get_market_data_does_not_cache_when_price_fails(monkeypatch):
    monkeypatch.setattr(price_service, "get_price", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_dividend_yield_pct", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_growth_rate_pct", lambda ticker: None)

    price_service.get_market_data(["BADTICKER"])

    call_count = {"n": 0}

    def fake_get_price(ticker):
        call_count["n"] += 1
        return 58.51

    monkeypatch.setattr(price_service, "get_price", fake_get_price)

    price_service.get_market_data(["BADTICKER"])

    assert call_count["n"] == 1


def test_get_market_data_with_empty_list_returns_empty_dict():
    result = price_service.get_market_data([])

    assert result == {}


def test_fetch_dividend_yield_pct_leaves_already_percentage_value_unscaled(monkeypatch):
    import yfinance

    class FakeTicker:
        def __init__(self, ticker):
            self.info = {"dividendYield": 11.1}

    monkeypatch.setattr(yfinance, "Ticker", FakeTicker)

    result = price_service._fetch_dividend_yield_pct("JEPQ")

    assert result == pytest.approx(11.1)


def test_fetch_dividend_yield_pct_does_not_scale_a_sub_one_percent_value(monkeypatch):
    # Regression test for a real bug: a prior ">1" heuristic treated any dividendYield under 1
    # as a fraction and multiplied it by 100. Real low-yield tickers (e.g. AAPL, confirmed
    # directly against a live yfinance==1.5.2 response returning 0.35 for its ~0.35% yield)
    # would have been reported as 35% instead of 0.35%.
    import yfinance

    class FakeTicker:
        def __init__(self, ticker):
            self.info = {"dividendYield": 0.35}

    monkeypatch.setattr(yfinance, "Ticker", FakeTicker)

    result = price_service._fetch_dividend_yield_pct("AAPL")

    assert result == pytest.approx(0.35)


def test_fetch_dividend_yield_pct_returns_none_when_missing(monkeypatch):
    import yfinance

    class FakeTicker:
        def __init__(self, ticker):
            self.info = {}

    monkeypatch.setattr(yfinance, "Ticker", FakeTicker)

    result = price_service._fetch_dividend_yield_pct("JEPQ")

    assert result is None


def test_fetch_dividend_yield_pct_returns_none_for_negative_value(monkeypatch):
    import yfinance

    class FakeTicker:
        def __init__(self, ticker):
            self.info = {"dividendYield": -0.5}

    monkeypatch.setattr(yfinance, "Ticker", FakeTicker)

    result = price_service._fetch_dividend_yield_pct("JEPQ")

    assert result is None
