"""Trade desk router — POST /api/trade-desk/turn · GET /api/trade-desk/state."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.trade_desk_service import get_state, run_due_turns, run_turn, seed_team, TradeTeam

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
