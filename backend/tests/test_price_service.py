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
    monkeypatch.setattr(price_service, "_fetch_growth_rate_pct", lambda ticker: (10.0, 5.0))

    result = price_service.get_market_data(["JEPQ"])

    assert result == {
        "JEPQ": {"price": 58.51, "dividend_yield_pct": 11.1, "growth_rate_pct": 10.0, "growth_rate_years_used": 5.0}
    }


def test_get_market_data_leaves_yield_and_growth_none_when_they_fail(monkeypatch):
    monkeypatch.setattr(price_service, "get_price", lambda ticker: 58.51)
    monkeypatch.setattr(price_service, "_fetch_dividend_yield_pct", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_growth_rate_pct", lambda ticker: (None, None))

    result = price_service.get_market_data(["JEPQ"])

    assert result == {
        "JEPQ": {"price": 58.51, "dividend_yield_pct": None, "growth_rate_pct": None, "growth_rate_years_used": None}
    }


def test_get_market_data_includes_ticker_even_when_price_fails(monkeypatch):
    monkeypatch.setattr(price_service, "get_price", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_dividend_yield_pct", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_growth_rate_pct", lambda ticker: (None, None))

    result = price_service.get_market_data(["BADTICKER"])

    assert result == {
        "BADTICKER": {"price": None, "dividend_yield_pct": None, "growth_rate_pct": None, "growth_rate_years_used": None}
    }


def test_get_market_data_caches_and_does_not_refetch_within_ttl(monkeypatch):
    call_count = {"n": 0}

    def fake_get_price(ticker):
        call_count["n"] += 1
        return 58.51

    monkeypatch.setattr(price_service, "get_price", fake_get_price)
    monkeypatch.setattr(price_service, "_fetch_dividend_yield_pct", lambda ticker: 11.1)
    monkeypatch.setattr(price_service, "_fetch_growth_rate_pct", lambda ticker: (10.0, 5.0))

    price_service.get_market_data(["JEPQ"])
    price_service.get_market_data(["JEPQ"])

    assert call_count["n"] == 1


def test_get_market_data_does_not_cache_when_price_fails(monkeypatch):
    monkeypatch.setattr(price_service, "get_price", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_dividend_yield_pct", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_growth_rate_pct", lambda ticker: (None, None))

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


def test_fetch_dividend_yield_pct_computes_trailing_12mo_from_real_payment_history(monkeypatch):
    import pandas as pd
    import yfinance

    class FakeTicker:
        def __init__(self, ticker):
            self.info = {"regularMarketPrice": 100.0, "dividendYield": 999.0}  # ignored -- history wins
            self.dividends = pd.Series(
                [1.0, 1.0, 1.0, 1.0],
                index=pd.to_datetime(["2026-01-15", "2026-04-15", "2026-07-15", "2026-10-15"], utc=True),
            )

    monkeypatch.setattr(yfinance, "Ticker", FakeTicker)

    result = price_service._fetch_dividend_yield_pct("SOMETICKER")

    assert result == pytest.approx(4.0)  # 4.0 total paid / 100.0 price * 100


def test_fetch_dividend_yield_pct_regression_qqqi_real_history_overrides_wrong_info_field(monkeypatch):
    # Regression test for a real bug found 2026-08-05: yfinance's own `info['dividendYield']`
    # was confirmed wrong for QQQI (reported 0.09 while its real trailing payment history
    # works out to ~15%). Computing from real payment history instead of trusting that field
    # fixes this — and any other ticker with the same kind of data-quality gap — at once.
    import pandas as pd
    import yfinance

    class FakeTicker:
        def __init__(self, ticker):
            self.info = {"regularMarketPrice": 55.16, "dividendYield": 0.09}
            # These are the real trailing distributions for QQQI as of 2026-08-05, dated
            # relative to "recently" so they land inside any reasonable test run's 365-day
            # trailing window regardless of when the test suite executes.
            recent_dates = pd.date_range(end=pd.Timestamp.now(tz="UTC"), periods=13, freq="30D")
            self.dividends = pd.Series(
                [0.629, 0.641, 0.645, 0.630, 0.641, 0.636, 0.614, 0.609, 0.630, 0.659, 0.657, 0.635, 0.62],
                index=recent_dates,
            )

    monkeypatch.setattr(yfinance, "Ticker", FakeTicker)

    result = price_service._fetch_dividend_yield_pct("QQQI")

    # The exact figure isn't the point (real distributions drift over time) -- what matters is
    # that real payment history (~15%) wins over the wrong yfinance field (0.09%), not a precise
    # historical snapshot.
    assert result > 10.0
    assert result != pytest.approx(0.09, abs=0.01)  # the wrong yfinance field must not win


def test_fetch_dividend_yield_pct_excludes_payments_older_than_365_days(monkeypatch):
    import pandas as pd
    import yfinance

    class FakeTicker:
        def __init__(self, ticker):
            self.info = {"regularMarketPrice": 100.0}
            self.dividends = pd.Series(
                [1.0, 1.0, 5.0],  # the 5.0 payment is over two years old
                index=pd.to_datetime(["2026-01-15", "2026-07-15", "2023-01-01"], utc=True),
            )

    monkeypatch.setattr(yfinance, "Ticker", FakeTicker)

    result = price_service._fetch_dividend_yield_pct("SOMETICKER")

    assert result == pytest.approx(2.0)  # only the two 1.0 payments count, not the old 5.0


def test_fetch_dividend_yield_pct_returns_real_zero_when_nothing_paid_in_trailing_year(monkeypatch):
    import pandas as pd
    import yfinance

    class FakeTicker:
        def __init__(self, ticker):
            self.info = {"regularMarketPrice": 100.0, "dividendYield": 2.5}
            # A dividend was paid once, long ago (e.g. a since-suspended payout) -- real history
            # exists, so it's trusted completely, including this real 0% for the trailing year.
            self.dividends = pd.Series([1.0], index=pd.to_datetime(["2020-01-01"], utc=True))

    monkeypatch.setattr(yfinance, "Ticker", FakeTicker)

    result = price_service._fetch_dividend_yield_pct("SOMETICKER")

    assert result == 0.0


def test_fetch_dividend_yield_pct_falls_back_to_info_field_when_no_dividend_history(monkeypatch):
    import pandas as pd
    import yfinance

    class FakeTicker:
        def __init__(self, ticker):
            self.info = {"regularMarketPrice": 100.0, "dividendYield": 3.5}
            self.dividends = pd.Series([], dtype=float)

    monkeypatch.setattr(yfinance, "Ticker", FakeTicker)

    result = price_service._fetch_dividend_yield_pct("SOMETICKER")

    assert result == pytest.approx(3.5)


def test_fetch_dividend_yield_pct_returns_none_when_no_history_and_no_info_field(monkeypatch):
    import pandas as pd
    import yfinance

    class FakeTicker:
        def __init__(self, ticker):
            self.info = {"regularMarketPrice": 100.0}
            self.dividends = pd.Series([], dtype=float)

    monkeypatch.setattr(yfinance, "Ticker", FakeTicker)

    result = price_service._fetch_dividend_yield_pct("SOMETICKER")

    assert result is None


def test_fetch_dividend_yield_pct_returns_none_when_price_missing(monkeypatch):
    import pandas as pd
    import yfinance

    class FakeTicker:
        def __init__(self, ticker):
            self.info = {}
            self.dividends = pd.Series([1.0], index=pd.to_datetime(["2026-01-01"], utc=True))

    monkeypatch.setattr(yfinance, "Ticker", FakeTicker)

    result = price_service._fetch_dividend_yield_pct("SOMETICKER")

    assert result is None


def test_fetch_dividend_yield_pct_returns_none_on_exception(monkeypatch):
    import yfinance

    class FakeTicker:
        def __init__(self, ticker):
            raise Exception("network error")

    monkeypatch.setattr(yfinance, "Ticker", FakeTicker)

    result = price_service._fetch_dividend_yield_pct("SOMETICKER")

    assert result is None


def test_fetch_growth_rate_pct_reports_years_of_history_actually_used(monkeypatch):
    # Regression case for a real ticker (QQQI, listed 2024-01-30): requesting 5 years of
    # history returns whatever's actually available for a recently-listed ticker, which is
    # much less than 5 -- the caller needs this number to know the resulting rate is a real
    # calculation over a short, potentially unrepresentative window, not a long-term rate.
    import pandas as pd
    import yfinance

    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period):
            index = pd.date_range("2024-01-30", "2026-08-04", freq="D", tz="America/New_York")
            return pd.DataFrame({"Close": [34.90] + [55.16] * (len(index) - 1)}, index=index)

    monkeypatch.setattr(yfinance, "Ticker", FakeTicker)

    rate, years_used = price_service._fetch_growth_rate_pct("QQQI")

    assert years_used == pytest.approx(2.51, abs=0.01)
    assert rate > 15.0  # a real, large CAGR -- the point of this test is years_used, not the rate itself


def test_fetch_growth_rate_pct_reports_full_five_years_for_a_long_established_ticker(monkeypatch):
    import pandas as pd
    import yfinance

    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period):
            index = pd.date_range(end="2026-08-04", periods=5 * 252, freq="B", tz="America/New_York")
            return pd.DataFrame({"Close": [100.0] * (len(index) - 1) + [150.0]}, index=index)

    monkeypatch.setattr(yfinance, "Ticker", FakeTicker)

    rate, years_used = price_service._fetch_growth_rate_pct("ESTABLISHEDCO")

    assert years_used > 4.5


def test_fetch_growth_rate_pct_returns_none_none_on_exception(monkeypatch):
    import yfinance

    class FakeTicker:
        def __init__(self, ticker):
            raise Exception("network error")

    monkeypatch.setattr(yfinance, "Ticker", FakeTicker)

    rate, years_used = price_service._fetch_growth_rate_pct("SOMETICKER")

    assert rate is None
    assert years_used is None
