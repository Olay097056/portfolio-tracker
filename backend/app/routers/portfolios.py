from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.calculations import portfolio_stats
from app.database import get_db
from app.models import Portfolio
from app.price_service import get_prices
from app.routers._deps import get_or_404
from app.schemas import (
    CashAdjustmentCreate,
    DividendRecordCreate,
    HoldingMoveCreate,
    PortfolioCreate,
    PortfolioOut,
    PortfolioSummaryOut,
    PortfolioUpdate,
    TransactionCreate,
    TransactionOut,
)

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


@router.get("/{portfolio_id}/summary", response_model=PortfolioSummaryOut)
def portfolio_summary(portfolio_id: int, db: Session = Depends(get_db)):
    portfolio = get_or_404(db, Portfolio, portfolio_id, "Portfolio not found")
    tickers = [h.ticker for h in portfolio.holdings]
    prices = get_prices(tickers)
    return portfolio_stats(portfolio, prices)


@router.post("/{portfolio_id}/cash", response_model=PortfolioOut)
def adjust_cash(portfolio_id: int, payload: CashAdjustmentCreate, db: Session = Depends(get_db)):
    portfolio = get_or_404(db, Portfolio, portfolio_id, "Portfolio not found")
    if payload.type == "CASH_DEPOSIT":
        portfolio.cash_usd += payload.amount
        tx = Transaction(
            portfolio_id=portfolio.id,
            type="CASH_DEPOSIT",
            amount_usd=payload.amount,
            note=payload.note or "Cash deposit",
        )
        db.add(tx)
    elif payload.type == "CASH_WITHDRAW":
        if payload.amount > portfolio.cash_usd:
            raise HTTPException(status_code=400, detail="Insufficient cash balance")
        portfolio.cash_usd -= payload.amount
        tx = Transaction(
            portfolio_id=portfolio.id,
            type="CASH_WITHDRAW",
            amount_usd=payload.amount,
            note=payload.note or "Cash withdrawal",
        )
        db.add(tx)
    db.commit()
    db.refresh(portfolio)
    return portfolio


@router.post("/{portfolio_id}/holdings/{holding_id}/move", response_model=PortfolioOut)
def move_holding(portfolio_id: int, holding_id: int, payload: HoldingMoveCreate, db: Session = Depends(get_db)):
    from app.models import Holding
    portfolio = get_or_404(db, Portfolio, portfolio_id, "Portfolio not found")
    target_portfolio = get_or_404(db, Portfolio, payload.target_portfolio_id, "Target portfolio not found")
    holding = get_or_404(db, Holding, holding_id, "Holding not found")
    if holding.portfolio_id != portfolio_id:
        raise HTTPException(status_code=404, detail="Holding not found in source portfolio")
    holding.portfolio_id = target_portfolio.id
    db.commit()
    db.refresh(portfolio)
    return portfolio


@router.post("/{portfolio_id}/holdings/{holding_id}/dividend", response_model=PortfolioOut)
def record_dividend(portfolio_id: int, holding_id: int, payload: DividendRecordCreate, db: Session = Depends(get_db)):
    from app.models import Holding
    portfolio = get_or_404(db, Portfolio, portfolio_id, "Portfolio not found")
    holding = get_or_404(db, Holding, holding_id, "Holding not found")
    if holding.portfolio_id != portfolio_id:
        raise HTTPException(status_code=404, detail="Holding not found in portfolio")
    portfolio.cash_usd += payload.amount_usd
    tx = Transaction(
        portfolio_id=portfolio.id,
        ticker=holding.ticker,
        type="DIVIDEND",
        amount_usd=payload.amount_usd,
        note=payload.note or f"Dividend from {holding.ticker}",
    )
    db.add(tx)
    db.commit()
    db.refresh(portfolio)
    return portfolio


@router.get("/{portfolio_id}/transactions", response_model=list[TransactionOut])
def list_transactions(portfolio_id: int, db: Session = Depends(get_db)):
    from app.models import Transaction
    get_or_404(db, Portfolio, portfolio_id, "Portfolio not found")
    return db.execute(select(Transaction).where(Transaction.portfolio_id == portfolio_id).order_by(Transaction.created_at.desc())).scalars().all()


@router.post("/{portfolio_id}/transactions", response_model=TransactionOut, status_code=201)
def create_transaction(portfolio_id: int, payload: TransactionCreate, db: Session = Depends(get_db)):
    from app.models import Transaction, Holding
    portfolio = get_or_404(db, Portfolio, portfolio_id, "Portfolio not found")
    
    if payload.type == "BUY":
        if payload.amount_usd > portfolio.cash_usd and portfolio.cash_usd > 0:
            portfolio.cash_usd = max(0.0, portfolio.cash_usd - payload.amount_usd)
        else:
            portfolio.cash_usd = max(0.0, portfolio.cash_usd - payload.amount_usd)
        
        existing_holding = db.execute(select(Holding).where(Holding.portfolio_id == portfolio_id, Holding.ticker == payload.ticker)).scalar_one_or_none()
        if existing_holding and payload.shares and payload.price:
            total_shares = existing_holding.shares + payload.shares
            total_cost = (existing_holding.shares * existing_holding.avg_cost_usd) + (payload.shares * payload.price)
            existing_holding.shares = total_shares
            existing_holding.avg_cost_usd = total_cost / total_shares
        elif payload.ticker and payload.shares and payload.price:
            new_holding = Holding(
                portfolio_id=portfolio_id,
                ticker=payload.ticker.upper(),
                shares=payload.shares,
                avg_cost_usd=payload.price,
            )
            db.add(new_holding)
            
    elif payload.type == "SELL":
        portfolio.cash_usd += payload.amount_usd
        if payload.ticker:
            existing_holding = db.execute(select(Holding).where(Holding.portfolio_id == portfolio_id, Holding.ticker == payload.ticker)).scalar_one_or_none()
            if existing_holding and payload.shares:
                if payload.shares >= existing_holding.shares:
                    realized = (payload.amount_usd - (existing_holding.shares * existing_holding.avg_cost_usd))
                    existing_holding.realized_pnl_usd += max(0.0, realized)
                    db.delete(existing_holding)
                else:
                    cost_sold = payload.shares * existing_holding.avg_cost_usd
                    existing_holding.realized_pnl_usd += (payload.amount_usd - cost_sold)
                    existing_holding.shares -= payload.shares
                    
    elif payload.type == "CASH_DEPOSIT":
        portfolio.cash_usd += payload.amount_usd
    elif payload.type == "CASH_WITHDRAW":
        portfolio.cash_usd = max(0.0, portfolio.cash_usd - payload.amount_usd)
    elif payload.type == "DIVIDEND":
        portfolio.cash_usd += payload.amount_usd

    tx = Transaction(
        portfolio_id=portfolio_id,
        ticker=payload.ticker,
        type=payload.type,
        shares=payload.shares,
        price=payload.price,
        amount_usd=payload.amount_usd,
        note=payload.note,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx
