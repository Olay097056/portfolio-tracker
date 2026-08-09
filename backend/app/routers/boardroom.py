# backend/app/routers/boardroom.py
"""GET/POST /api/boardroom/* — ห้องประชุม AI (Bond-crisis "ห้องประชุม" tab).

Endpoints (wayfinder ticket 06):
  POST /api/boardroom/meetings           — open a meeting (runs engine in background)
  GET  /api/boardroom/meetings           — list (live + archive)
  GET  /api/boardroom/meetings/{id}      — detail: meeting + messages + claims + seats
  POST /api/boardroom/meetings/{id}/resume — resume a failed meeting
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app import boardroom_service
from app.database import SessionLocal, get_db

router = APIRouter(prefix="/api/boardroom", tags=["boardroom"])


class MeetingCreate(BaseModel):
    agenda: str = Field(..., min_length=10, max_length=2000)
    trigger_type: str = Field("manual", pattern="^(manual|news|model|calendar)$")
    mode: str = Field("full", pattern="^(full|short)$")


class MeetingOut(BaseModel):
    id: str
    status: str
    phase: str
    current_turn: int
    agenda: str
    trigger_type: str
    mode: str
    llm_calls: int
    tokens_in: int
    tokens_out: int
    error: str | None
    created_at: str | None
    updated_at: str | None
    ended_at: str | None


class MessageOut(BaseModel):
    id: str
    turn: int
    phase: str
    seat_id: str
    seat_name: str | None
    kind: str
    content_md: str
    status: str
    error: str | None
    tokens_in: int
    tokens_out: int
    created_at: str | None


class ClaimOut(BaseModel):
    id: str
    seat_id: str
    phase: str
    claim_text: str
    metric: str | None
    verdict: str
    sub_reason: str | None
    reason: str | None
    checks: str | None


class SeatOut(BaseModel):
    seat_id: str
    position_key: str
    provider: str
    model: str
    name_th: str
    name_en: str
    enabled: int
    sort: int


class MeetingDetailOut(MeetingOut):
    resolution_md: str | None
    resolution_json: str | None
    messages: list[MessageOut]
    claims: list[ClaimOut]
    seats: list[SeatOut]


class MeetingListOut(BaseModel):
    meetings: list[MeetingOut]


def _dt_str(dt) -> str | None:
    return dt.isoformat() if dt else None


def _meeting_out(m) -> MeetingOut:
    return MeetingOut(
        id=m.id, status=m.status, phase=m.phase, current_turn=m.current_turn,
        agenda=m.agenda, trigger_type=m.trigger_type, mode=m.mode,
        llm_calls=m.llm_calls, tokens_in=m.tokens_in, tokens_out=m.tokens_out,
        error=m.error, created_at=_dt_str(m.created_at), updated_at=_dt_str(m.updated_at),
        ended_at=_dt_str(m.ended_at),
    )


@router.post("/meetings", response_model=MeetingOut, status_code=201)
def create_meeting(payload: MeetingCreate, db: Session = Depends(get_db)):
    engine = boardroom_service.BoardroomEngine(db)
    meeting = engine.create_meeting(
        agenda=payload.agenda, trigger_type=payload.trigger_type, mode=payload.mode)
    boardroom_service.seed_seats(db)
    boardroom_service.start_meeting_background(db, meeting.id)
    db.refresh(meeting)
    return _meeting_out(meeting)


@router.get("/meetings", response_model=MeetingListOut)
def list_meetings(db: Session = Depends(get_db)):
    meetings = (db.query(boardroom_service.BoardroomMeeting)
                .order_by(desc(boardroom_service.BoardroomMeeting.created_at))
                .limit(50).all())
    return {"meetings": [_meeting_out(m) for m in meetings]}


@router.get("/meetings/{meeting_id}", response_model=MeetingDetailOut)
def get_meeting(meeting_id: str, db: Session = Depends(get_db)):
    meeting = db.get(boardroom_service.BoardroomMeeting, meeting_id)
    if meeting is None:
        raise HTTPException(404, "meeting not found")
    messages = (db.query(boardroom_service.BoardroomMessage)
                .filter(boardroom_service.BoardroomMessage.meeting_id == meeting_id)
                .order_by(boardroom_service.BoardroomMessage.turn).all())
    claims = (db.query(boardroom_service.BoardroomClaim)
              .filter(boardroom_service.BoardroomClaim.meeting_id == meeting_id)
              .order_by(boardroom_service.BoardroomClaim.created_at).all())
    seats = (db.query(boardroom_service.BoardroomSeat)
             .order_by(boardroom_service.BoardroomSeat.sort).all())
    out = _meeting_out(meeting)
    return MeetingDetailOut(
        **out.model_dump(),
        resolution_md=meeting.resolution_md,
        resolution_json=meeting.resolution_json,
        messages=[MessageOut(
            id=m.id, turn=m.turn, phase=m.phase, seat_id=m.seat_id,
            seat_name=boardroom_service.SEATS.get(m.seat_id, {}).get("name_th", m.seat_id),
            kind=m.kind, content_md=m.content_md, status=m.status, error=m.error,
            tokens_in=m.tokens_in, tokens_out=m.tokens_out,
            created_at=_dt_str(m.created_at)) for m in messages],
        claims=[ClaimOut(
            id=c.id, seat_id=c.seat_id, phase=c.phase, claim_text=c.claim_text,
            metric=c.metric, verdict=c.verdict, sub_reason=c.sub_reason,
            reason=c.reason, checks=c.checks) for c in claims],
        seats=[SeatOut(
            seat_id=s.seat_id, position_key=s.position_key, provider=s.provider,
            model=s.model, name_th=s.name_th, name_en=s.name_en,
            enabled=s.enabled, sort=s.sort) for s in seats],
    )


@router.post("/meetings/{meeting_id}/resume", response_model=MeetingOut)
def resume_meeting(meeting_id: str, db: Session = Depends(get_db)):
    engine = boardroom_service.BoardroomEngine(db)
    status = engine.resume(meeting_id)
    if status != "running":
        meeting = db.get(boardroom_service.BoardroomMeeting, meeting_id)
        if meeting is None:
            raise HTTPException(404, "meeting not found")
        if meeting.status != "failed":
            raise HTTPException(409, f"meeting is {meeting.status}, not failed")
        raise HTTPException(500, "resume failed")
    boardroom_service.start_meeting_background(db, meeting_id)
    meeting = db.get(boardroom_service.BoardroomMeeting, meeting_id)
    return _meeting_out(meeting)
