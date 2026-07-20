# backend/app/calculations.py
from app.models import Holding, Portfolio

GREEN_MAX_PP = 5.0
YELLOW_MAX_PP = 10.0


def severity_for_deviation(deviation_pp: float) -> str:
    """Rebalance severity band for a percentage-point deviation (PRD.md section 8)."""
    abs_dev = abs(deviation_pp)
    if abs_dev > YELLOW_MAX_PP:
        return "red"
    if abs_dev > GREEN_MAX_PP:
        return "yellow"
    return "green"


def holding_stats(holding: Holding, current_price: float, portfolio_holdings_value: float) -> dict:
    value = holding.shares * current_price
    current_pct = (value / portfolio_holdings_value * 100) if portfolio_holdings_value else 0.0
    target_pct = holding.target_allocation_pct or 0.0
    deviation_pp = current_pct - target_pct
    unrealized_pnl = (current_price - holding.avg_cost_usd) * holding.shares
    return {
        "ticker": holding.ticker,
        "shares": holding.shares,
        "avg_cost_usd": holding.avg_cost_usd,
        "current_price": current_price,
        "value": value,
        "current_pct": current_pct,
        "target_pct": target_pct,
        "deviation_pp": deviation_pp,
        "severity": severity_for_deviation(deviation_pp),
        "unrealized_pnl": unrealized_pnl,
        "realized_pnl": holding.realized_pnl_usd,
    }


def portfolio_stats(portfolio: Portfolio, prices: dict[str, float]) -> dict:
    holdings_value = sum(h.shares * prices.get(h.ticker, 0.0) for h in portfolio.holdings)
    total_value = holdings_value + portfolio.cash_usd
    unrealized_pnl = sum(
        (prices.get(h.ticker, 0.0) - h.avg_cost_usd) * h.shares for h in portfolio.holdings
    )
    realized_pnl = sum(h.realized_pnl_usd for h in portfolio.holdings)
    holdings = [
        holding_stats(h, prices.get(h.ticker, 0.0), holdings_value) for h in portfolio.holdings
    ]
    return {
        "id": portfolio.id,
        "name": portfolio.name,
        "cash_usd": portfolio.cash_usd,
        "target_allocation_pct": portfolio.target_allocation_pct,
        "holdings_value": holdings_value,
        "total_value": total_value,
        "unrealized_pnl": unrealized_pnl,
        "realized_pnl": realized_pnl,
        "holdings": holdings,
    }
