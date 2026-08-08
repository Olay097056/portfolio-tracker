# backend/tests/test_compare_service.py
# Unit-level checks on how the Compare tool turns Finnhub + yfinance responses into
# display metrics. Pure functions only -- nothing here touches the network.
from datetime import date, datetime, timedelta, timezone

from app import compare_service as cs


def _bundle(info=None, closes=None, highs=None, lows=None, volumes=None, dates=None):
    return {
        "info": info or {},
        "closes": closes or [],
        "highs": highs or [],
        "lows": lows or [],
        "volumes": volumes or [],
        "dates": dates or [],
    }


def test_finnhub_market_cap_is_scaled_from_millions(monkeypatch):
    """Finnhub reports marketCapitalization/enterpriseValue in millions. Left unscaled,
    Apple's $4.5T cap would render as $4.5M -- off by a factor of a million."""
    monkeypatch.setattr(cs, "_api_key", lambda: "test-key")
    monkeypatch.setattr(
        cs, "_get_json", lambda path, params: {"metric": {"marketCapitalization": 4_567_980, "enterpriseValue": 4_612_780}}
    )

    metric = cs.fetch_finnhub_metrics("AAPL")

    assert metric["marketCapitalization"] == 4_567_980_000_000
    assert metric["enterpriseValue"] == 4_612_780_000_000


def test_fetch_returns_empty_without_an_api_key(monkeypatch):
    monkeypatch.setattr(cs, "_api_key", lambda: None)
    assert cs.fetch_finnhub_metrics("AAPL") == {}
    assert cs.fetch_finnhub_profile("AAPL") == {}
    assert cs.search_finnhub_symbols("AAPL", 8) == []


def test_search_drops_foreign_venue_listings(monkeypatch):
    """Finnhub's global search returns the same company on many exchanges ("AAPL.MX").
    A US-listing comparison tool shouldn't offer those -- their fundamentals come back
    near-empty."""
    monkeypatch.setattr(cs, "_api_key", lambda: "test-key")
    monkeypatch.setattr(
        cs,
        "_get_json",
        lambda path, params: {
            "result": [
                {"displaySymbol": "AAPL", "description": "APPLE INC"},
                {"displaySymbol": "AAPL.MX", "description": "APPLE INC"},
                {"displaySymbol": "AAPL.SW", "description": "APPLE INC"},
            ]
        },
    )

    results = cs.search_finnhub_symbols("AAPL", 8)

    assert [r["symbol"] for r in results] == ["AAPL"]


def test_search_respects_limit(monkeypatch):
    monkeypatch.setattr(cs, "_api_key", lambda: "test-key")
    monkeypatch.setattr(
        cs,
        "_get_json",
        lambda path, params: {"result": [{"displaySymbol": f"S{i}", "description": f"Stock {i}"} for i in range(20)]},
    )

    assert len(cs.search_finnhub_symbols("S", 3)) == 3


def test_multi_year_performance_uses_calendar_dates_not_a_nominal_252_day_count():
    """A 10y history is ~2,515 trading rows, just short of the 2,520 a "252 days x 10"
    lookback assumes -- which silently blanked the Perf 10Y row. Anchoring on the real
    calendar anniversary fixes that."""
    today = date(2026, 8, 8)
    # A shade over 10 calendar years, so the series genuinely spans the 10Y window.
    dates = [today - timedelta(days=i) for i in range(3700, -1, -1)]
    closes = [100.0] * len(dates)
    closes[-1] = 200.0  # doubled over the window

    assert cs._change_since_years_ago(closes, dates, 10) == 100.0
    assert cs._change_since_years_ago(closes, dates, 3) == 100.0


def test_multi_year_performance_is_absent_when_history_is_too_short():
    today = date(2026, 8, 8)
    dates = [today - timedelta(days=i) for i in range(30, -1, -1)]
    closes = [100.0] * len(dates)

    assert cs._change_since_years_ago(closes, dates, 10) is None


def test_ytd_measures_from_the_first_bar_of_the_current_year():
    dates = [date(2025, 12, 30), date(2025, 12, 31), date(2026, 1, 2), date(2026, 8, 8)]
    closes = [50.0, 80.0, 100.0, 130.0]

    assert cs._ytd_change(closes, dates) == 30.0


def test_absent_values_render_as_none_never_zero():
    assert cs._plain(None) is None
    assert cs._pct(None) is None
    assert cs._shares(None) is None
    assert cs._epoch_to_date(None) is None
    assert cs._epoch_to_date(0) is None


def test_share_counts_render_in_billions_and_millions():
    assert cs._shares(14_690_000_000) == "14.69B"
    assert cs._shares(146_550_000) == "146.55M"
    assert cs._shares(4_200) == "4,200"


def test_week52_cell_pairs_the_level_with_distance_from_it():
    assert cs._week52_cell(344.57, 313.33) == "344.57 -9.07%"
    assert cs._week52_cell(201.50, 313.33) == "201.50 +55.50%"
    # No current price to compare against -> the level alone, not an invented distance.
    assert cs._week52_cell(344.57, None) == "344.57"


def test_pair_renders_whichever_halves_exist():
    assert cs._pair(17.91, 6.89) == "17.91% 6.89%"
    assert cs._pair(17.91, None) == "17.91%"
    assert cs._pair(None, None) is None


def test_earnings_date_is_marked_when_it_is_only_an_estimate():
    stamp = int(datetime(2026, 7, 30, 12, 0, tzinfo=timezone.utc).timestamp())

    confirmed = cs._earnings_date_cell({"earningsTimestamp": stamp, "isEarningsDateEstimate": False})
    estimated = cs._earnings_date_cell({"earningsTimestamp": stamp, "isEarningsDateEstimate": True})

    assert "(est.)" not in confirmed
    assert estimated.endswith("(est.)")


def test_yfinance_fraction_ratios_are_scaled_to_percent():
    """yfinance gives ownership/margins as fractions (0.6594); Finnhub gives percent
    (65.94). Mixing the two scales in one column would be badly misleading."""
    metrics = cs.build_metrics({}, {}, _bundle(info={"heldPercentInstitutions": 0.65941, "profitMargins": 0.2762}))

    assert metrics["inst_own"] == "65.94%"
    assert metrics["profit_margin"] == "27.62%"


def test_finnhub_percent_metrics_are_preferred_over_yfinance_and_not_double_scaled():
    metrics = cs.build_metrics(
        {"netProfitMarginTTM": 27.62},
        {},
        _bundle(info={"profitMargins": 0.2762}),
    )

    assert metrics["profit_margin"] == "27.62%"


def test_etf_falls_back_to_net_assets_for_the_market_cap_cell():
    metrics = cs.build_metrics({}, {}, _bundle(info={"totalAssets": 1_686_884_319_232}))
    assert metrics["market_cap"] == "1,686,884,319,232"


def test_technicals_are_computed_from_the_real_price_series():
    closes = [float(100 + i) for i in range(260)]
    highs = [c + 1 for c in closes]
    lows = [c - 1 for c in closes]

    metrics = cs.build_metrics({}, {}, _bundle(closes=closes, highs=highs, lows=lows))

    # A monotonically rising series must read as above every moving average.
    assert metrics["rsi14"] is not None
    assert metrics["sma20"].startswith("+") or float(metrics["sma20"].rstrip("%")) > 0
    assert float(metrics["sma200"].rstrip("%")) > 0
    assert metrics["atr14"] is not None


def test_technicals_are_absent_when_there_is_no_price_history():
    metrics = cs.build_metrics({}, {}, _bundle())

    assert metrics["rsi14"] is None
    assert metrics["sma200"] is None
    assert metrics["atr14"] is None
    assert metrics["perf_10y"] is None


def test_identity_prefers_fund_category_when_a_sector_is_absent():
    identity = cs.build_identity("VOO", {}, _bundle(info={"category": "Large Blend", "regularMarketPrice": 710.71}))
    assert identity["sector"] == "Large Blend"

    identity_stock = cs.build_identity("AAPL", {}, _bundle(info={"sector": "Technology"}))
    assert identity_stock["sector"] == "Technology"


def test_identity_upside_is_absent_without_a_target_price():
    identity = cs.build_identity("VOO", {}, _bundle(info={"regularMarketPrice": 710.71}))
    assert identity["analyst_target_upside_pct"] is None


def test_has_usable_data_distinguishes_an_all_null_row():
    assert cs.has_usable_data({"pe_ratio": "35.43", "roe": None}) is True
    assert cs.has_usable_data({"pe_ratio": None, "roe": None}) is False
