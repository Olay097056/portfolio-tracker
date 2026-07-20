from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.calculations import portfolio_stats
from app.database import get_db
from app.models import Portfolio
from app.routers._deps import get_or_404
from app.schemas import PortfolioCreate, PortfolioOut, PortfolioSummaryOut, PortfolioUpdate, PriceMap

router = APIRouter(prefix="/portfolios", tags=["portfolios"])


def _validate_total_target_allocation(db: Session, incoming_pct: float | None, exclude_id: int | None = None):
    if incoming_pct is None:
        return
    query = select(Portfolio.target_allocation_pct).where(Portfolio.id != exclude_id) if exclude_id else select(
        Portfolio.target_allocation_pct
    )
    existing = [pct for pct in db.execute(query).scalars().all() if pct is not None]
    total = sum(existing) + incoming_pct
    if total > 100:
        raise HTTPException(
            status_code=400,
            detail=f"Portfolio target allocations would total {total:.1f}%, which exceeds 100%",
        )


@router.post("", response_model=PortfolioOut, status_code=201)
def create_portfolio(payload: PortfolioCreate, db: Session = Depends(get_db)):
    _validate_total_target_allocation(db, payload.target_allocation_pct)
    portfolio = Portfolio(**payload.model_dump())
    db.add(portfolio)
    db.commit()
    db.refresh(portfolio)
    return portfolio


@router.get("", response_model=list[PortfolioOut])
def list_portfolios(db: Session = Depends(get_db)):
    return db.execute(select(Portfolio)).scalars().all()


@router.get("/{portfolio_id}", response_model=PortfolioOut)
def get_portfolio(portfolio_id: int, db: Session = Depends(get_db)):
    return get_or_404(db, Portfolio, portfolio_id, "Portfolio not found")


@router.patch("/{portfolio_id}", response_model=PortfolioOut)
def update_portfolio(portfolio_id: int, payload: PortfolioUpdate, db: Session = Depends(get_db)):
    portfolio = get_or_404(db, Portfolio, portfolio_id, "Portfolio not found")
    updates = payload.model_dump(exclude_unset=True)
    if "target_allocation_pct" in updates:
        _validate_total_target_allocation(db, updates["target_allocation_pct"], exclude_id=portfolio_id)
    for field, value in updates.items():
        setattr(portfolio, field, value)
    db.commit()
    db.refresh(portfolio)
    return portfolio


@router.delete("/{portfolio_id}", status_code=204)
def delete_portfolio(portfolio_id: int, db: Session = Depends(get_db)):
    portfolio = get_or_404(db, Portfolio, portfolio_id, "Portfolio not found")
    db.delete(portfolio)
    db.commit()


@router.post("/{portfolio_id}/summary", response_model=PortfolioSummaryOut)
def portfolio_summary(portfolio_id: int, payload: PriceMap, db: Session = Depends(get_db)):
    portfolio = get_or_404(db, Portfolio, portfolio_id, "Portfolio not found")
    return portfolio_stats(portfolio, payload.prices)
