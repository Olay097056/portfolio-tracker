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
