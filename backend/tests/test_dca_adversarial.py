import pytest
from unittest.mock import patch
import math
from app.routers.dca import compute_dca_projection
from app.schemas import DcaCalculateRequest


def analytical_dca_fv(initial: float, monthly: float, months: int, monthly_rate: float) -> float:
    """Calculates future value using annuity due formula for verification."""
    if monthly_rate == 0:
        return initial + monthly * months
    r = monthly_rate
    # FV of initial lump sum
    fv_initial = initial * ((1.0 + r) ** months)
    # FV of monthly contributions made at start of month (annuity due)
    fv_monthly = monthly * (((1.0 + r) ** months - 1.0) / r) * (1.0 + r)
    return fv_initial + fv_monthly


def test_dca_compounding_math_precision():
    """Verify backend compounding calculation against analytical annuity due formula."""
    initial = 100000.0
    monthly = 5000.0
    duration_years = 10
    total_months = duration_years * 12
    growth_pct = 8.0
    div_yield_pct = 4.0
    tax_rate_pct = 15.0

    req = DcaCalculateRequest(
        initial_amount=initial,
        monthly_dca=monthly,
        duration_years=duration_years,
        growth_pct=growth_pct,
        div_yield_pct=div_yield_pct,
        tax_rate_pct=tax_rate_pct,
        reinvest_dividends=True,
    )
    res = compute_dca_projection(req)

    # Calculate expected monthly rate:
    # y_net = (4.0/100) * (1 - 0.15) = 0.034 -> r_div_net = 0.034 / 12
    # g = 8.0/100 = 0.08 -> r_growth = 0.08 / 12
    r_monthly = (0.08 / 12.0) + ((0.04 * 0.85) / 12.0)
    expected_fv = analytical_dca_fv(initial, monthly, total_months, r_monthly)

    assert abs(res.final_portfolio_value - round(expected_fv, 2)) <= 0.02
    assert res.total_invested == initial + monthly * total_months
    assert res.multiplier == round(res.final_portfolio_value / res.total_invested, 2)


def test_dca_tax_withholding_rates():
    """Verify 15% dividend tax withholding and custom tax rates (0%, 30%, 100%)."""
    initial = 50000.0
    monthly = 2000.0
    duration_years = 5
    div_yield = 6.0

    # 1. Standard 15% tax
    req15 = DcaCalculateRequest(
        initial_amount=initial,
        monthly_dca=monthly,
        duration_years=duration_years,
        growth_pct=0.0,
        div_yield_pct=div_yield,
        tax_rate_pct=15.0,
        reinvest_dividends=True,
    )
    res15 = compute_dca_projection(req15)

    # 2. 0% tax
    req0 = DcaCalculateRequest(
        initial_amount=initial,
        monthly_dca=monthly,
        duration_years=duration_years,
        growth_pct=0.0,
        div_yield_pct=div_yield,
        tax_rate_pct=0.0,
        reinvest_dividends=True,
    )
    res0 = compute_dca_projection(req0)

    # 3. 100% tax
    req100 = DcaCalculateRequest(
        initial_amount=initial,
        monthly_dca=monthly,
        duration_years=duration_years,
        growth_pct=0.0,
        div_yield_pct=div_yield,
        tax_rate_pct=100.0,
        reinvest_dividends=True,
    )
    res100 = compute_dca_projection(req100)

    assert res0.tax_amount == 0.0
    assert res100.accumulated_dividend == 0.0
    assert res15.tax_amount > 0.0
    assert res0.final_portfolio_value > res15.final_portfolio_value > res100.final_portfolio_value


def test_dca_reinvest_toggle_behavior():
    """Verify portfolio and return math differences between reinvest=True vs False."""
    req_reinvest = DcaCalculateRequest(
        initial_amount=10000.0,
        monthly_dca=1000.0,
        duration_years=5,
        growth_pct=5.0,
        div_yield_pct=5.0,
        tax_rate_pct=15.0,
        reinvest_dividends=True,
    )
    req_no_reinvest = DcaCalculateRequest(
        initial_amount=10000.0,
        monthly_dca=1000.0,
        duration_years=5,
        growth_pct=5.0,
        div_yield_pct=5.0,
        tax_rate_pct=15.0,
        reinvest_dividends=False,
    )

    res_in = compute_dca_projection(req_reinvest)
    res_no = compute_dca_projection(req_no_reinvest)

    # Portfolio value when reinvesting must be higher than non-reinvesting
    assert res_in.final_portfolio_value > res_no.final_portfolio_value

    # Check return relation integrity: total_return = capital_gain + accumulated_dividend
    assert round(res_in.capital_gain + res_in.accumulated_dividend, 2) == res_in.total_return
    assert round(res_no.capital_gain + res_no.accumulated_dividend, 2) == res_no.total_return


def test_dca_boundary_edge_cases():
    """Test 0% edge cases, zero investments, lump sum only, DCA only."""
    # 0 investment
    res_zero = compute_dca_projection(DcaCalculateRequest(initial_amount=0, monthly_dca=0, duration_years=5))
    assert res_zero.final_portfolio_value == 0.0
    assert res_zero.total_invested == 0.0
    assert res_zero.multiplier == 0.0
    assert res_zero.accumulated_dividend == 0.0
    assert res_zero.total_return == 0.0

    # Lump sum only (0 DCA)
    res_lump = compute_dca_projection(DcaCalculateRequest(initial_amount=50000, monthly_dca=0, duration_years=5, growth_pct=10.0))
    assert res_lump.total_invested == 50000.0
    assert res_lump.final_portfolio_value > 50000.0
    assert res_lump.multiplier > 1.0

    # DCA only (0 initial)
    res_dca = compute_dca_projection(DcaCalculateRequest(initial_amount=0, monthly_dca=5000, duration_years=5, growth_pct=10.0))
    assert res_dca.total_invested == 300000.0
    assert res_dca.final_portfolio_value > 300000.0
    assert res_dca.multiplier > 1.0

    # 0% growth & 0% yield
    res_flat = compute_dca_projection(DcaCalculateRequest(initial_amount=10000, monthly_dca=1000, duration_years=2, growth_pct=0, div_yield_pct=0))
    assert res_flat.total_invested == 34000.0
    assert res_flat.final_portfolio_value == 34000.0
    assert res_flat.multiplier == 1.0
    assert res_flat.accumulated_dividend == 0.0
    assert res_flat.capital_gain == 0.0
    assert res_flat.total_return == 0.0


def test_dca_sanitization_negative_inputs():
    """Verify robustness against negative values and duration <= 0."""
    req_neg = DcaCalculateRequest(
        initial_amount=-10000.0,
        monthly_dca=-500.0,
        duration_years=0,
        div_yield_pct=-5.0,
        growth_pct=-10.0,
        tax_rate_pct=-15.0,
    )
    res = compute_dca_projection(req_neg)

    # Should clamp initial/monthly/yield/growth/tax to 0 and duration to min 1 year
    assert res.total_invested == 0.0
    assert res.final_portfolio_value == 0.0
    assert res.multiplier == 0.0
    assert len(res.chart_data) == 1
    assert len(res.yearly_milestones) == 1


def test_dca_extreme_high_growth_and_yield():
    """Stress test with high growth rates (e.g. 500% per year) and high yields over 30 years."""
    req_high = DcaCalculateRequest(
        initial_amount=10000.0,
        monthly_dca=1000.0,
        duration_years=30,
        growth_pct=500.0,
        div_yield_pct=100.0,
        tax_rate_pct=15.0,
    )
    res = compute_dca_projection(req_high)

    assert math.isfinite(res.final_portfolio_value)
    assert not math.isnan(res.final_portfolio_value)
    assert res.final_portfolio_value > res.total_invested
    assert res.multiplier > 1.0
    assert len(res.chart_data) == 30
    assert len(res.yearly_milestones) == 30


def test_dca_durations_1_to_30_years_consistency():
    """Verify consistency across 1-year and 30-year projections."""
    for years in [1, 5, 10, 15, 20, 25, 30]:
        req = DcaCalculateRequest(
            initial_amount=10000.0,
            monthly_dca=1000.0,
            duration_years=years,
            growth_pct=7.5,
            div_yield_pct=3.5,
        )
        res = compute_dca_projection(req)

        assert len(res.chart_data) == years
        assert len(res.yearly_milestones) == years
        assert res.chart_data[-1].year == years
        assert res.yearly_milestones[-1].year == years
        assert res.chart_data[-1].portfolio_value == res.final_portfolio_value
        assert res.yearly_milestones[-1].portfolio_value == res.final_portfolio_value


def test_dca_stock_info_endpoint_fallbacks_and_exceptions(client):
    """Test stock-info endpoint with preset tickers, fallback stocks, unknown tickers, and API exceptions."""
    # Preset ticker (NVDA)
    with patch("app.routers.dca.price_service.get_market_data", return_value={"NVDA": {"price": 125.0, "dividend_yield_pct": 0.52, "growth_rate_pct": 13.0}}):
        resp = client.get("/api/dca/stock-info/NVDA")
        assert resp.status_code == 200
        data = resp.json()
        assert data["symbol"] == "NVDA"
        assert data["company_name"] == "NVIDIA Corporation"
        assert data["current_price"] == 125.0

    # Lowercase ticker (nvda)
    with patch("app.routers.dca.price_service.get_market_data", return_value={"NVDA": {"price": 125.0, "dividend_yield_pct": 0.52, "growth_rate_pct": 13.0}}):
        resp = client.get("/api/dca/stock-info/nvda")
        assert resp.status_code == 200
        data = resp.json()
        assert data["symbol"] == "NVDA"

    # Unknown ticker with empty market data
    with patch("app.routers.dca.price_service.get_market_data", return_value={}):
        resp = client.get("/api/dca/stock-info/UNKNOWN999")
        assert resp.status_code == 200
        data = resp.json()
        assert data["symbol"] == "UNKNOWN999"
        assert data["company_name"] == "UNKNOWN999"
        assert data["current_price"] == 0.0
        assert data["dividend_yield_pct"] == 0.0
        assert data["capital_growth_pct"] == 0.0

    # Exception during market data fetch: the company name still resolves from the curated
    # symbol list (name is never fabricated data, just a static label), but yield/growth get
    # an honest 0.0 -- never a guessed preset number standing in for real-but-unfetchable data.
    with patch("app.routers.dca.price_service.get_market_data", side_effect=Exception("Network error")):
        resp = client.get("/api/dca/stock-info/AAPL")
        assert resp.status_code == 200
        data = resp.json()
        assert data["symbol"] == "AAPL"
        assert data["company_name"] == "Apple Inc."
        assert data["dividend_yield_pct"] == 0.0
        assert data["capital_growth_pct"] == 0.0


def test_dca_available_tickers_endpoint(client):
    """Verify /api/dca/available-tickers endpoint output format and data integrity, with
    price_service mocked so this never makes a real network call and never assumes real
    market data is always positive (growth rates are real numbers and can be negative)."""
    fake_data = {
        "NVDA": {"price": 125.0, "dividend_yield_pct": 0.52, "growth_rate_pct": 13.0},
        "AAPL": {"price": 230.0, "dividend_yield_pct": 0.55, "growth_rate_pct": -8.1},
    }
    with patch("app.routers.dca.price_service.get_market_data", return_value=fake_data):
        resp = client.get("/api/dca/available-tickers")

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 5

    symbols = set()
    for item in data:
        assert "symbol" in item
        assert "name" in item
        assert "default_yield" in item
        assert "default_growth" in item
        assert item["symbol"] not in symbols, f"Duplicate symbol found: {item['symbol']}"
        symbols.add(item["symbol"])

    nvda = next(item for item in data if item["symbol"] == "NVDA")
    assert nvda["default_yield"] == 0.52
    assert nvda["default_growth"] == 13.0

    aapl = next(item for item in data if item["symbol"] == "AAPL")
    assert aapl["default_growth"] == -8.1  # a real negative growth rate must pass through, not be clamped or hidden

    # A ticker price_service didn't return anything for gets null, not a guessed number.
    missing_from_fake_data = next(item for item in data if item["symbol"] not in fake_data)
    assert missing_from_fake_data["default_yield"] is None
    assert missing_from_fake_data["default_growth"] is None
