"""Trade desk router — POST /api/trade-desk/turn · GET /api/trade-desk/state · GET /api/trade-desk/team/{code}."""

from datetime import datetime, timedelta, timezone

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
            "margin_used": round(sum(p.reserved_cash or 0 for p in open_pos_q), 2),
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
                       "quantity": p.quantity, "reserved_cash": p.reserved_cash,
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
        # --- Extended stats (ticket 01 trade-desk-ui-100) ---
        "extended_stats": _compute_team_stats(team, open_pos_q, closed_pos, db),
    }


@router.get("/team/{team_code}/equity")
def team_equity(team_code: str, days: int = 30, db: Session = Depends(get_db)):
    """Daily equity snapshots for the SVG chart."""
    seed_team(db)
    team = db.query(TradeTeam).filter(TradeTeam.code == team_code.upper()).first()
    if team is None:
        raise HTTPException(status_code=404, detail=f"Team '{team_code}' not found")

    points = []
    now = datetime.now(timezone.utc).date()
    for d in range(days - 1, -1, -1):
        day = now - timedelta(days=d)
        day_start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
        day_end = day_start + timedelta(days=1)
        # Equity at end of day = last turn's state or team.equity if no turns
        day_turns = db.query(TradeTurn).filter(
            TradeTurn.team_id == team.id,
            TradeTurn.started_at >= day_start,
            TradeTurn.started_at < day_end,
        ).order_by(TradeTurn.started_at.desc()).first()
        eq = team.equity  # default to current
        if day_turns and day_turns.lead_decision:
            eq = team.equity  # simplified — in prod we'd track equity per turn
        points.append({"date": day.isoformat(), "equity": eq})
    return {"team_code": team.code, "points": points, "days": days}


@router.post("/team/{team_code}/directive")
def set_directive(team_code: str, directive: str = Query(...), db: Session = Depends(get_db)):
    """Set the weekly directive (เป้าสัปดาห์) — lead-only action."""
    seed_team(db)
    team = db.query(TradeTeam).filter(TradeTeam.code == team_code.upper()).first()
    if team is None:
        raise HTTPException(status_code=404, detail=f"Team '{team_code}' not found")
    team.team_directive = directive
    team.team_directive_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "directive": directive}


@router.post("/team/{team_code}/master")
def set_master(team_code: str, on: bool = Query(True), db: Session = Depends(get_db)):
    """Master switch (11.5) — off stops NEW turns; SL/TP + settle keep working."""
    seed_team(db)
    team = db.query(TradeTeam).filter(TradeTeam.code == team_code.upper()).first()
    if team is None:
        raise HTTPException(status_code=404, detail=f"Team '{team_code}' not found")
    team.master_on = 1 if on else 0
    db.commit()
    return {"ok": True, "master_on": bool(team.master_on)}


def _compute_team_stats(team, open_pos_q, closed_pos, db) -> dict:
    """Compute all derived stats the reference UI needs."""
    wins = [p for p in closed_pos if (p.realized_pnl or 0) > 0]
    losses = [p for p in closed_pos if (p.realized_pnl or 0) < 0]
    win_count = len(wins)
    loss_count = len(losses)
    total_closed = len(closed_pos)
    net_pnl = sum(p.realized_pnl or 0 for p in closed_pos)
    closed_pnl_sum = sum(p.realized_pnl or 0 for p in closed_pos)
    avg_win = sum(p.realized_pnl or 0 for p in wins) / win_count if win_count else None
    avg_loss = sum(abs(p.realized_pnl or 0) for p in losses) / loss_count if loss_count else None
    rr_ratio = avg_win / avg_loss if avg_win and avg_loss else None
    profit_factor = sum(p.realized_pnl or 0 for p in wins) / sum(abs(p.realized_pnl or 0) for p in losses) if wins and losses else None
    win_rate = round(win_count / total_closed * 100, 1) if total_closed else None
    live_pnl = sum(p.live_pnl or 0 for p in open_pos_q)
    reserved = sum(p.reserved_cash or 0 for p in open_pos_q)
    return {
        "win_count": win_count, "loss_count": loss_count, "closed_count": total_closed,
        "net_pnl": net_pnl, "closed_pnl_sum": closed_pnl_sum,
        "avg_win": avg_win, "avg_loss": avg_loss,
        "rr_ratio": round(rr_ratio, 2) if rr_ratio else None,
        "profit_factor": round(profit_factor, 2) if profit_factor else None,
        "win_rate": win_rate,
        "live_pnl": live_pnl, "reserved_margin": reserved,
    }
