from datetime import timezone

from app.models import Portfolio, Holding, WatchlistItem


def test_harness_runs():
    assert 1 + 1 == 2


def test_portfolio_holding_round_trip(db_session):
    portfolio = Portfolio(name="DIME", cash_usd=250.0, target_allocation_pct=70.0)
    db_session.add(portfolio)
    db_session.commit()
    db_session.refresh(portfolio)

    holding = Holding(
        portfolio_id=portfolio.id,
        ticker="AAPL",
        shares=12,
        avg_cost_usd=187.40,
        target_allocation_pct=20.0,
    )
    db_session.add(holding)
    db_session.commit()
    db_session.refresh(holding)

    watchlist_item = WatchlistItem(ticker="JNJ", category="Value")
    db_session.add(watchlist_item)
    db_session.commit()

    assert portfolio.holdings[0].ticker == "AAPL"
    assert holding.realized_pnl_usd == 0.0
    assert watchlist_item.category == "Value"


def test_created_at_round_trips_with_timezone_info(db_session):
    """Verify that timezone-aware timestamps survive a round trip through the DB."""
    portfolio = Portfolio(name="DIME")
    db_session.add(portfolio)
    db_session.commit()
    db_session.refresh(portfolio)

    assert portfolio.created_at.tzinfo is not None
    assert portfolio.created_at.utcoffset() == timezone.utc.utcoffset(None)


from app.calculations import (
    severity_for_deviation,
    holding_stats,
    portfolio_stats,
)


def test_severity_for_deviation_bands():
    assert severity_for_deviation(0) == "green"
    assert severity_for_deviation(5) == "green"
    assert severity_for_deviation(5.1) == "yellow"
    assert severity_for_deviation(-9.9) == "yellow"
    assert severity_for_deviation(10.1) == "red"
    assert severity_for_deviation(-15) == "red"


def test_holding_stats_computes_value_pct_pnl():
    holding = Holding(
        ticker="AAPL", shares=12, avg_cost_usd=187.40,
        target_allocation_pct=20.0, realized_pnl_usd=0.0,
    )
    stats = holding_stats(holding, current_price=333.74, portfolio_holdings_value=9732.85)

    assert stats["value"] == 12 * 333.74
    assert round(stats["current_pct"], 2) == round(stats["value"] / 9732.85 * 100, 2)
    assert round(stats["deviation_pp"], 2) == round(stats["current_pct"] - 20.0, 2)
    assert stats["severity"] in ("green", "yellow", "red")
    assert round(stats["unrealized_pnl"], 2) == round((333.74 - 187.40) * 12, 2)


def test_portfolio_stats_totals_value_cash_and_pnl():
    portfolio = Portfolio(name="DIME", cash_usd=250.0, target_allocation_pct=70.0)
    portfolio.holdings = [
        Holding(ticker="AAPL", shares=12, avg_cost_usd=187.40, target_allocation_pct=20.0, realized_pnl_usd=0.0),
        Holding(ticker="SMH", shares=3.18, avg_cost_usd=297.77, target_allocation_pct=25.0, realized_pnl_usd=120.0),
    ]
    prices = {"AAPL": 333.74, "SMH": 556.53}

    stats = portfolio_stats(portfolio, prices)

    holdings_value = 12 * 333.74 + 3.18 * 556.53
    assert round(stats["holdings_value"], 2) == round(holdings_value, 2)
    assert round(stats["total_value"], 2) == round(holdings_value + 250.0, 2)
    assert round(stats["realized_pnl"], 2) == 120.0
    assert len(stats["holdings"]) == 2
    assert stats["holdings"][0]["ticker"] == "AAPL"
