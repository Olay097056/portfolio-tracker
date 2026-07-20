from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Holding, Portfolio
from app.routers._deps import get_or_404
from app.schemas import HoldingCreate, HoldingOut, HoldingUpdate

router = APIRouter(prefix="/portfolios/{portfolio_id}/holdings", tags=["holdings"])


def _get_portfolio_or_404(db: Session, portfolio_id: int) -> Portfolio:
    return get_or_404(db, Portfolio, portfolio_id, "Portfolio not found")


def _validate_holding_target_allocation(
    db: Session, portfolio_id: int, incoming_pct: float | None, exclude_holding_id: int | None = None
):
    if incoming_pct is None:
        return
    query = select(Holding.target_allocation_pct).where(Holding.portfolio_id == portfolio_id)
    if exclude_holding_id:
        query = query.where(Holding.id != exclude_holding_id)
    existing = [pct for pct in db.execute(query).scalars().all() if pct is not None]
    total = sum(existing) + incoming_pct
    if total > 100:
        raise HTTPException(
            status_code=400,
            detail=f"Holding target allocations in this portfolio would total {total:.1f}%, which exceeds 100%",
        )


@router.post("", response_model=HoldingOut, status_code=201)
def create_holding(portfolio_id: int, payload: HoldingCreate, db: Session = Depends(get_db)):
    _get_portfolio_or_404(db, portfolio_id)
    _validate_holding_target_allocation(db, portfolio_id, payload.target_allocation_pct)
    holding = Holding(portfolio_id=portfolio_id, **payload.model_dump())
    db.add(holding)
    db.commit()
    db.refresh(holding)
    return holding


@router.get("", response_model=list[HoldingOut])
def list_holdings(portfolio_id: int, db: Session = Depends(get_db)):
    _get_portfolio_or_404(db, portfolio_id)
    return db.execute(select(Holding).where(Holding.portfolio_id == portfolio_id)).scalars().all()


@router.patch("/{holding_id}", response_model=HoldingOut)
def update_holding(portfolio_id: int, holding_id: int, payload: HoldingUpdate, db: Session = Depends(get_db)):
    _get_portfolio_or_404(db, portfolio_id)
    holding = get_or_404(db, Holding, holding_id, "Holding not found")
    if holding.portfolio_id != portfolio_id:
        raise HTTPException(status_code=404, detail="Holding not found")
    updates = payload.model_dump(exclude_unset=True)
    if "target_allocation_pct" in updates:
        _validate_holding_target_allocation(
            db, portfolio_id, updates["target_allocation_pct"], exclude_holding_id=holding_id
        )
    for field, value in updates.items():
        setattr(holding, field, value)
    db.commit()
    db.refresh(holding)
    return holding


@router.delete("/{holding_id}", status_code=204)
def delete_holding(portfolio_id: int, holding_id: int, db: Session = Depends(get_db)):
    _get_portfolio_or_404(db, portfolio_id)
    holding = get_or_404(db, Holding, holding_id, "Holding not found")
    if holding.portfolio_id != portfolio_id:
        raise HTTPException(status_code=404, detail="Holding not found")
    db.delete(holding)
    db.commit()
