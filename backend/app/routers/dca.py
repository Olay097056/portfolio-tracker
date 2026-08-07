from fastapi import APIRouter

from app import price_service
from app.schemas import (
    DcaCalculateRequest,
    DcaCalculateResponse,
    DcaChartPoint,
    DcaStockInfoOut,
    DcaTickerItem,
    DcaYearlyMilestone,
)

router = APIRouter(prefix="/api/dca", tags=["dca"])

# Just symbol + display name -- a curated "popular tickers" shortlist, same idea as the
# frontend's own Quick Pills. No yield/growth numbers live here: those are always fetched
# live from price_service below, never guessed. A fetch failure for one ticker means that
# ticker's default_yield/default_growth come back null, not a stale hardcoded number.
POPULAR_TICKER_SYMBOLS: list[dict[str, str]] = [
    {"symbol": "NVDA", "name": "NVIDIA Corporation"},
    {"symbol": "AAPL", "name": "Apple Inc."},
    {"symbol": "MSFT", "name": "Microsoft Corporation"},
    {"symbol": "VOO", "name": "Vanguard S&P 500 ETF"},
    {"symbol": "SCHD", "name": "Schwab U.S. Dividend Equity ETF"},
    {"symbol": "JEPQ", "name": "JPMorgan Nasdaq Equity Premium Income ETF"},
    {"symbol": "SPY", "name": "SPDR S&P 500 ETF Trust"},
    {"symbol": "QQQ", "name": "Invesco QQQ Trust"},
    {"symbol": "O", "name": "Realty Income Corporation"},
    {"symbol": "TLT", "name": "iShares 20+ Year Treasury Bond ETF"},
]


@router.get("/available-tickers", response_model=list[DcaTickerItem])
def get_available_tickers():
    symbols = [t["symbol"] for t in POPULAR_TICKER_SYMBOLS]
    try:
        market_data = price_service.get_market_data(symbols)
    except Exception:
        market_data = {}

    return [
        DcaTickerItem(
            symbol=t["symbol"],
            name=t["name"],
            default_yield=market_data.get(t["symbol"], {}).get("dividend_yield_pct"),
            default_growth=market_data.get(t["symbol"], {}).get("growth_rate_pct"),
        )
        for t in POPULAR_TICKER_SYMBOLS
    ]


@router.get("/stock-info/{ticker}", response_model=DcaStockInfoOut)
def get_stock_info(ticker: str):
    ticker_clean = ticker.strip().upper()
    preset = next((t for t in POPULAR_TICKER_SYMBOLS if t["symbol"] == ticker_clean), None)

    market_data = {}
    try:
        fetched = price_service.get_market_data([ticker_clean])
        if fetched and ticker_clean in fetched:
            market_data = fetched[ticker_clean]
    except Exception:
        market_data = {}

    price = market_data.get("price")
    raw_yield = market_data.get("dividend_yield_pct")
    raw_growth = market_data.get("growth_rate_pct")

    company_name = preset["name"] if preset else ticker_clean
    if not preset:
        try:
            from app.routers.screener import FALLBACK_STOCKS
            fb_item = next((s for s in FALLBACK_STOCKS if s["symbol"] == ticker_clean), None)
            if fb_item and "company_name" in fb_item:
                company_name = fb_item["company_name"]
        except Exception:
            pass

    current_price = float(price) if price is not None else 0.0
    # No preset-number fallback here anymore -- a real fetch failure means an honest 0.0,
    # not a guessed value dressed up as this ticker's real yield/growth.
    div_yield_pct = round(float(raw_yield), 2) if raw_yield is not None else 0.0
    growth_pct = round(float(raw_growth), 2) if raw_growth is not None else 0.0

    return DcaStockInfoOut(
        symbol=ticker_clean,
        company_name=company_name,
        current_price=round(current_price, 2),
        dividend_yield_pct=div_yield_pct,
        capital_growth_pct=growth_pct,
    )


def compute_dca_projection(req: DcaCalculateRequest) -> DcaCalculateResponse:
    initial = max(0.0, float(req.initial_amount))
    monthly_dca = max(0.0, float(req.monthly_dca))
    duration_years = max(1, int(req.duration_years))

    div_yield_pct = max(0.0, float(req.div_yield_pct))
    growth_pct = max(0.0, float(req.growth_pct))
    tax_rate_pct = max(0.0, float(req.tax_rate_pct))

    y_gross = div_yield_pct / 100.0
    tax_rate = tax_rate_pct / 100.0
    y_net = y_gross * (1.0 - tax_rate)
    g = growth_pct / 100.0

    r_div_gross = y_gross / 12.0
    r_div_net = y_net / 12.0
    r_growth = g / 12.0

    reinvest = req.reinvest_dividends
    r_monthly = (r_growth + r_div_net) if reinvest else r_growth

    total_months = duration_years * 12

    v_balance = initial
    k_invested = initial

    accumulated_gross_div = 0.0
    accumulated_tax = 0.0
    accumulated_net_div = 0.0

    chart_data: list[DcaChartPoint] = []
    yearly_milestones: list[DcaYearlyMilestone] = []

    for m in range(1, total_months + 1):
        v_start = v_balance + monthly_dca
        k_invested += monthly_dca

        d_gross_m = v_start * r_div_gross
        tax_m = d_gross_m * tax_rate
        d_net_m = d_gross_m - tax_m

        accumulated_gross_div += d_gross_m
        accumulated_tax += tax_m
        accumulated_net_div += d_net_m

        v_end = v_start * (1.0 + r_monthly)
        v_balance = v_end

        if m % 12 == 0:
            year_num = m // 12
            val_round = round(v_balance, 2)
            inv_round = round(k_invested, 2)

            chart_data.append(
                DcaChartPoint(
                    year=year_num,
                    portfolio_value=val_round,
                    total_invested=inv_round,
                )
            )

            m_div = round((v_balance * y_net) / 12.0, 2)
            m_growth = round((v_balance * g) / 12.0, 2)
            m_tot = round(m_div + m_growth, 2)

            yearly_milestones.append(
                DcaYearlyMilestone(
                    year=year_num,
                    portfolio_value=val_round,
                    total_invested=inv_round,
                    monthly_dividend=m_div,
                    monthly_growth=m_growth,
                    monthly_total=m_tot,
                )
            )

    final_portfolio_value = round(v_balance, 2)
    total_invested = round(k_invested, 2)
    multiplier = round(final_portfolio_value / total_invested, 2) if total_invested > 0 else 0.0
    accumulated_dividend = round(accumulated_net_div, 2)
    tax_amount = round(accumulated_tax, 2)

    if reinvest:
        total_return = round(final_portfolio_value - total_invested, 2)
        capital_gain = round(total_return - accumulated_dividend, 2)
    else:
        capital_gain = round(final_portfolio_value - total_invested, 2)
        total_return = round(capital_gain + accumulated_dividend, 2)

    final_monthly_dividend = round((final_portfolio_value * y_net) / 12.0, 2)
    final_monthly_growth = round((final_portfolio_value * g) / 12.0, 2)
    final_monthly_total = round(final_monthly_dividend + final_monthly_growth, 2)

    return DcaCalculateResponse(
        final_portfolio_value=final_portfolio_value,
        multiplier=multiplier,
        total_invested=total_invested,
        accumulated_dividend=accumulated_dividend,
        capital_gain=capital_gain,
        total_return=total_return,
        tax_amount=tax_amount,
        final_monthly_dividend=final_monthly_dividend,
        final_monthly_growth=final_monthly_growth,
        final_monthly_total=final_monthly_total,
        chart_data=chart_data,
        yearly_milestones=yearly_milestones,
    )


@router.post("/calculate", response_model=DcaCalculateResponse)
def calculate_dca(req: DcaCalculateRequest):
    return compute_dca_projection(req)
