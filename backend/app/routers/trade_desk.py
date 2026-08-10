# backend/app/routers/trade_desk.py
"""GET /api/trade-desk/state · POST /api/trade-desk/turn · POST /api/trade-desk/settings

piggyback: GET state → ตรวจ SL/TP + run_due_turns ใน background thread
(ย้ายขึ้น pg_cron ได้โดยไม่แก้ engine — decision 02/07)
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app import trade_desk_service as td

router = APIRouter(prefix="/api/trade-desk", tags=["trade-desk"])


class SettingsIn(BaseModel):
    master_on: bool | None = None
    per_team_daily_cap: int | None = None


@router.get("/state")
def get_state(db: Session = Depends(get_db)):
    """เปิดหน้า → ตรวจ SL/TP + เทิร์นที่ครบกำหนด (background) แล้วคืน state."""
    td.check_sl_tp(db)
    td.run_due_turns_background()
    return td.build_state(db)


@router.post("/turn")
def manual_turn(team_code: str, db: Session = Depends(get_db)):
    """ปุ่ม 'เปิดเทิร์นเลย' — รันเทิร์นทันที (นับโควตา)."""
    td.seed_teams(db)
    team = db.query(td.TradeTeam).filter(td.TradeTeam.code == team_code.upper()).first()
    if not team:
        return {"error": "team_not_found"}
    return td.run_turn(db, team, manual=True)


@router.post("/settings")
def update_settings(body: SettingsIn, db: Session = Depends(get_db)):
    return td.set_settings(db, master_on=body.master_on,
                           per_team_daily_cap=body.per_team_daily_cap)
