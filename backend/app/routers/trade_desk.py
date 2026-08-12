"""Trade desk router — POST /api/trade-desk/turn · GET /api/trade-desk/state · GET /api/trade-desk/team/{code}."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.trade_desk_service import (
    get_state, run_due_turns, run_turn, seed_team,
    TradeTeam, TradeTurn, TradePosition, TradeKnowledge,
    TradePendingOrder, TradeConstitution, TradeCoachLog,
)

router = APIRouter(prefix="/api/trade-desk", tags=["trade-desk"])


@router.get("/state")
def state(db: Session = Depends(get_db)):
    """Full trade desk state — team, positions, turns."""
    return get_state(db)


@router.post("/turn")
def manual_turn(team_code: str = Query("DEEPSEEK"), agenda: str | None = None,
                db: Session = Depends(get_db)):
    """Trigger a manual turn for a team (default: DEEPSEEK)."""
    seed_team(db)
    team = db.query(TradeTeam).filter(TradeTeam.code == team_code.upper()).first()
    if team is None:
        raise HTTPException(status_code=404, detail=f"Team '{team_code}' not found")
    try:
        turn = run_turn(db, team, trigger="manual", agenda=agenda)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)[:200])
    return {
        "turn_id": turn.id,
        "action": turn.lead_decision.get("action"),
        "market": turn.lead_decision.get("market"),
        "side": turn.lead_decision.get("side"),
        "rationale": turn.lead_decision.get("rationale", "")[:200],
        "consensus": turn.consensus,
        "tokens_in": turn.tokens_in,
        "tokens_out": turn.tokens_out,
        "cost_usd": turn.cost_usd,
    }


@router.get("/team/{team_code}")
def team_detail(team_code: str, page: int = 1, db: Session = Depends(get_db)):
    """Full team detail page — stats, mandate, constitution, analysts, meetings, orders."""
    seed_team(db)
    team = db.query(TradeTeam).filter(TradeTeam.code == team_code.upper()).first()
    if team is None:
        raise HTTPException(status_code=404, detail=f"Team '{team_code}' not found")

    open_pos_q = db.query(TradePosition).filter(
        TradePosition.team_id == team.id, TradePosition.status == "open",
    ).order_by(TradePosition.opened_at.desc()).all()
    closed_pos = db.query(TradePosition).filter(
        TradePosition.team_id == team.id, TradePosition.status == "closed",
    ).order_by(TradePosition.closed_at.desc()).limit(20).all()
    pending = db.query(TradePendingOrder).filter(
        TradePendingOrder.team_id == team.id,
    ).order_by(TradePendingOrder.created_at.desc()).limit(20).all()

    per_page = 10
    total_meetings = db.query(TradeTurn).filter(TradeTurn.team_id == team.id).count()
    meetings = db.query(TradeTurn).filter(TradeTurn.team_id == team.id).order_by(
        TradeTurn.started_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    constitutions = db.query(TradeConstitution).filter(
        TradeConstitution.team_id == team.id).order_by(
        TradeConstitution.created_at.desc()).limit(5).all()
    coach = db.query(TradeCoachLog).filter(
        TradeCoachLog.team_id == team.id).order_by(
        TradeCoachLog.created_at.desc()).limit(10).all()
    loss_kb = db.query(TradeKnowledge).filter(
        TradeKnowledge.team_id == team.id, TradeKnowledge.entry_type == "loss",
    ).order_by(TradeKnowledge.created_at.desc()).limit(10).all()
    profit_kb = db.query(TradeKnowledge).filter(
        TradeKnowledge.team_id == team.id, TradeKnowledge.entry_type == "win",
    ).order_by(TradeKnowledge.created_at.desc()).limit(10).all()

    return {
        "team": {
            "code": team.code, "name_th": team.name_th, "name_en": team.name_en,
            "status": team.status, "gen": team.gen,
            "mandate": team.mandate, "team_directive": team.team_directive,
            "lead_model": team.lead_model,
            "analyst_prompts": {k: (v or "")[:300] for k, v in (team.analyst_prompts or {}).items()},
            "capital": team.capital, "balance": team.balance, "equity": team.equity,
            "pnl_pct": round((team.equity - team.capital) / team.capital * 100, 2) if team.capital else 0,
            "margin_used": sum((p.size_pct or 0) / 100 * team.capital for p in open_pos_q),
            "live_pnl": sum(p.live_pnl or 0 for p in open_pos_q),
            "closed_pnl": sum(p.realized_pnl or 0 for p in closed_pos),
            "next_turn_at": team.next_turn_at.isoformat() if team.next_turn_at else None,
            "turns_today": team.turns_today, "cost_today_usd": team.cost_today_usd,
            "cost_total_usd": team.cost_total_usd,
        },
        "positions": {
            "open": [{"id": p.id, "symbol": p.symbol, "side": p.side,
                       "size_pct": p.size_pct, "entry_price": p.entry_price,
                       "mark_price": None, "sl_pct": p.sl_pct, "tp_pct": p.tp_pct,
                       "live_pnl": p.live_pnl,
                       "opened_at": p.opened_at.isoformat() if p.opened_at else None}
                      for p in open_pos_q],
            "closed": [{"id": p.id, "symbol": p.symbol, "side": p.side,
                         "entry_price": p.entry_price, "close_price": p.close_price,
                         "realized_pnl": p.realized_pnl, "closed_by": p.closed_by}
                        for p in closed_pos],
        },
        "pending_orders": [{"id": o.id, "symbol": o.symbol, "order_type": o.order_type,
                             "target_price": o.target_price, "size_notional": o.size_notional,
                             "status": o.status} for o in pending],
        "meetings": {
            "items": [{"id": t.id, "consensus": t.consensus, "trigger": t.trigger,
                        "analyst_count": len(t.analyst_opinions or []),
                        "tokens_in": t.tokens_in, "cost_usd": t.cost_usd}
                       for t in meetings],
            "total": total_meetings, "page": page, "per_page": per_page,
        },
        "constitutions": [{"id": c.id, "content": c.content[:500],
                            "created_at": c.created_at.isoformat() if c.created_at else None}
                           for c in constitutions],
        "coach_log": [{"id": c.id, "analyst_seat": c.analyst_seat, "log_type": c.log_type,
                        "content": c.content[:300]} for c in coach],
        "knowledge": {
            "loss": [{"symbol": k.symbol, "side": k.side, "pnl_pct": k.pnl_pct}
                      for k in loss_kb],
            "profit": [{"symbol": k.symbol, "side": k.side, "pnl_pct": k.pnl_pct}
                        for k in profit_kb],
        },
    }
