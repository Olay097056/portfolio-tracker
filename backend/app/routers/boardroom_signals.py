# backend/app/routers/boardroom_signals.py
"""GET /api/boardroom/stances — สัญญาณจากที่ประชุม (แผน boardroom-signals ticket 04).

คำนวณสดบน read (ไม่มี scheduler): P&L / จุดตรวจ +1/+3/+7 / ผลสรุป win-loss-push
จากประวัติราคา — สถิติพร้อม cold-start disclosure (ticket 02/03).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import boardroom_stance_service
from app.database import get_db

router = APIRouter(prefix="/api/boardroom", tags=["boardroom-signals"])


@router.get("/stances")
def list_stances(db: Session = Depends(get_db)):
    """รายการสัญญาณทั้งหมด + สถิติ (frontend แบ่ง: กำลังนับถอยหลัง / สรุปแล้ว / มุมมอง)."""
    return boardroom_stance_service.build_stances_payload(db)
