# backend/tests/test_boardroom_stances.py
"""Tests for boardroom signals backend (wayfinder boardroom-signals ticket 04).

Rules verified (ticket 02/03):
- materialize stances จาก resolution_json (unit/due_at/qualified + validate)
- resolver ladder: alias → FRED/system → yfinance search → unresolved log
- P&L สองกลุ่ม (bp/pct) + ทิศทางกลับ
- จุดตรวจ +1/+3/+7: ยังไม่ถึงเวลา → correct=None (ไม่ใช่ 0)
- ครบกำหนด → win/loss/push ตาม push_line
- สถิติ cold-start: n<10 → ไม่โชว์ % (win_rate=None)
- สินทรัพย์ดึงราคาไม่ได้ → "—" (state unresolved/awaiting)
- **ห้ามแตะ trading_signals** (เทียบ count ก่อน/หลัง)
- ราคา/LLM ถูก stub 100% — ไม่ยิง yfinance/FRED จริง
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

import app.boardroom_stance_service as svc
from app.boardroom_service import BoardroomMeeting


def now() -> datetime:
    return datetime.now(timezone.utc)


def add_meeting(db, ended_minutes_ago: int = 60) -> BoardroomMeeting:
    m = BoardroomMeeting(
        id=f"m_{uuid.uuid4().hex[:8]}", status="completed", phase="resolution",
        current_turn=0, turn_plan="[]", agenda="ประชุมเทสต์", trigger_type="manual",
        mode="full",
        created_at=now() - timedelta(minutes=ended_minutes_ago + 10),
        updated_at=now() - timedelta(minutes=ended_minutes_ago),
        ended_at=now() - timedelta(minutes=ended_minutes_ago),
    )
    db.add(m)
    db.commit()
    return m


def make_rj(stances: list[dict]) -> dict:
    return {"plain": {"summary": "s"}, "stances": stances}


@pytest.fixture(autouse=True)
def _stub_external(monkeypatch):
    """ราคา/FRED/search ถูก stub — ไม่ยิง network จริง."""
    monkeypatch.setattr(svc, "_yf_search", lambda q: None)  # search ไม่เจอโดย default
    monkeypatch.setattr(svc, "_yf_candles", lambda t: None)
    monkeypatch.setattr(svc, "_macro_data", lambda: {"values": {}, "history": {}})
    # price_service.get_price ถูกเรียกผ่าน import ภายใน — patch ที่ module ต้นทาง
    import app.price_service
    monkeypatch.setattr(app.price_service, "get_price", lambda t: None)


# ---------------------------------------------------------------------------
# 1. Materialize — schema/unit/qualified/due_at
# ---------------------------------------------------------------------------
def test_materialize_creates_rows(db_session):
    meeting = add_meeting(db_session)
    rj = make_rj([
        {"asset": "US10Y", "stance": "long", "confidence": 65, "horizon_days": 5,
         "unit": "bp", "qualified": True, "price_at": 4.66, "reason": "r"},
        {"asset": "XAUUSD", "stance": "short", "confidence": 70, "horizon_days": 30,
         "unit": "pct", "qualified": True, "price_at": 4400},
        {"asset": "US10Y", "stance": "neutral", "confidence": 50},   # ข้าม
        {"asset": "ช้างเผือก", "stance": "long", "confidence": 80},  # ไม่มีราคา → unresolved
    ])
    n = svc.materialize_stances(db_session, meeting.id, rj, ended_at=meeting.ended_at)
    assert n == 2
    rows = db_session.query(svc.BoardroomStance).all()
    assert len(rows) == 2
    us10y = next(r for r in rows if r.asset == "US10Y")
    assert us10y.unit == "bp" and us10y.price_key == "us10y" and us10y.source == "alias"
    assert us10y.direction == "long" and us10y.qualified is True
    # due_at = ended_at + horizon_days
    expect_due = meeting.ended_at + timedelta(days=5)
    assert abs((us10y.due_at - expect_due).total_seconds()) < 60
    # unresolved log
    unresolved = db_session.query(svc.BoardroomUnresolvedAsset).all()
    assert len(unresolved) == 1 and unresolved[0].asset == "ช้างเผือก"


def test_materialize_unit_validate_and_clamp(db_session):
    meeting = add_meeting(db_session)
    rj = make_rj([
        # AI เขียน unit ผิด (US10Y ต้องเป็น bp) → ใช้ derived + flag
        {"asset": "US10Y", "stance": "long", "confidence": 60, "horizon_days": 7,
         "unit": "pct", "price_at": 4.66},
        # horizon_days เกินเพดาน → clamp 90
        {"asset": "XAUUSD", "stance": "long", "confidence": 60, "horizon_days": 365,
         "unit": "pct", "price_at": 4400},
    ])
    svc.materialize_stances(db_session, meeting.id, rj, ended_at=meeting.ended_at)
    rows = {r.asset: r for r in db_session.query(svc.BoardroomStance).all()}
    assert rows["US10Y"].unit == "bp" and rows["US10Y"].unit_mismatch is True
    assert rows["XAUUSD"].horizon_days == 90


def test_materialize_default_qualified_from_confidence(db_session):
    meeting = add_meeting(db_session)
    rj = make_rj([
        {"asset": "XAUUSD", "stance": "long", "confidence": 55, "horizon_days": 7,
         "unit": "pct", "price_at": 4400},   # conf<60 → ไม่ได้ระบุ qualified → false (มุมมอง)
    ])
    svc.materialize_stances(db_session, meeting.id, rj, ended_at=meeting.ended_at)
    row = db_session.query(svc.BoardroomStance).first()
    assert row.qualified is False


# ---------------------------------------------------------------------------
# 2. P&L สองกลุ่ม + ทิศทาง
# ---------------------------------------------------------------------------
def test_pnl_yield_bp_and_price_pct():
    # yield: 4.66 → 4.70 long = +4 bp (×100)
    assert abs(svc.pnl_score(4.70, 4.66, "bp", "long") - 4.0) < 1e-9
    # yield short ได้กำไรเมื่อลง
    assert abs(svc.pnl_score(4.60, 4.66, "bp", "short") - 6.0) < 1e-9
    # price: 4400 → 4620 long = +5%
    assert abs(svc.pnl_score(4620, 4400, "pct", "long") - 5.0) < 1e-9
    # price short เมื่อราคาลง = กำไร
    assert abs(svc.pnl_score(4180, 4400, "pct", "short") - 5.0) < 1e-9
    # ไม่มีราคา → None
    assert svc.pnl_score(None, 4400, "pct", "long") is None


def test_classify_unit():
    assert svc.classify_unit("US10Y") == "bp"
    assert svc.classify_unit("us_hy_spread") == "bp"
    assert svc.classify_unit("XAUUSD") == "pct"
    assert svc.classify_unit("TLT") == "pct"


# ---------------------------------------------------------------------------
# 3. จุดตรวจ +1/+3/+7
# ---------------------------------------------------------------------------
def test_checks_not_due_are_none(db_session):
    # history ว่าง → correct=None ทุกจุด (ยังไม่ถึงเวลา/ไม่มีข้อมูล — ไม่ใช่ 0)
    st = svc.BoardroomStance(
        id="st_1", meeting_id="m_1", asset="XAUUSD", price_key="XAUUSD",
        unit="pct", direction="long", price_at=4400,
        started_at=now() - timedelta(days=10), due_at=now() + timedelta(days=20),
        horizon_days=30, qualified=True)
    db_session.add(st)
    db_session.commit()
    checks = svc._checks_for(st)
    assert len(checks) == 3
    assert all(c["correct"] is None for c in checks)


def test_settlement_win_loss_push():
    # win: ราคาขึ้นเกิน push line (pct, 30d: 0.5×√10 ≈ 1.58%)
    score = svc.pnl_score(4500, 4400, "pct", "long")  # +2.27%
    assert svc.settle(score, "pct", 30) == "win"
    # loss
    score2 = svc.pnl_score(4300, 4400, "pct", "long")  # −2.27%
    assert svc.settle(score2, "pct", 30) == "loss"
    # push: ขยับน้อยกว่าเส้น (ทิศทางถูกแต่ไม่พอ)
    score3 = svc.pnl_score(4420, 4400, "pct", "long")  # +0.45% < 1.58%
    assert svc.settle(score3, "pct", 30) == "push"
    # bp: 30d เส้น = 4×√10 ≈ 12.6bp — ขยับ 5bp = push
    assert svc.settle(5.0, "bp", 30) == "push"
    assert svc.settle(20.0, "bp", 30) == "win"
    assert svc.settle(None, "bp", 30) is None


def test_settlement_on_read_after_due(db_session):
    # ครบกำหนดแล้ว + history มีราคาถึงวัน due → verdict คำนวณสด
    ended = now() - timedelta(days=10)
    due = ended + timedelta(days=5)
    st = svc.BoardroomStance(
        id="st_2", meeting_id="m_2", asset="XAUUSD", price_key="XAUUSD",
        unit="pct", direction="long", price_at=4400,
        started_at=ended, due_at=due, horizon_days=5, qualified=True)
    db_session.add(st)
    db_session.commit()

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(svc, "_yf_candles", lambda t: [
        {"o": 4400, "h": 4410, "l": 4390, "c": 4395, "t": (ended + timedelta(days=1)).date().isoformat()},
        {"o": 4395, "h": 4430, "l": 4390, "c": 4425, "t": (ended + timedelta(days=4)).date().isoformat()},
        {"o": 4425, "h": 4450, "l": 4420, "c": 4440, "t": (ended + timedelta(days=6)).date().isoformat()},
    ])
    res = svc._settlement_for(st)
    assert res["state"] == "settled"
    # ราคา ณ due (day5) = close ของ day4 = 4425 → +0.57% < push(5d: 0.5×√(5/3)≈0.65%) → push
    assert res["verdict"] == "push"
    monkeypatch.undo()


def test_settlement_awaiting_when_no_price(db_session):
    ended = now() - timedelta(days=10)
    st = svc.BoardroomStance(
        id="st_3", meeting_id="m_3", asset="XAUUSD", price_key="XAUUSD",
        unit="pct", direction="long", price_at=4400,
        started_at=ended, due_at=ended + timedelta(days=5), horizon_days=5, qualified=True)
    db_session.add(st)
    db_session.commit()
    res = svc._settlement_for(st)  # history ว่าง (stub) → awaiting
    assert res["state"] == "awaiting" and res["verdict"] is None


# ---------------------------------------------------------------------------
# 4. สถิติ cold-start
# ---------------------------------------------------------------------------
def test_stats_cold_start_hides_percent(db_session):
    meeting = add_meeting(db_session, ended_minutes_ago=60)
    # สร้าง 1 settled (n=1 < 10) — win_rate ต้อง None (ห้าม 100% หลอกตา)
    st = svc.BoardroomStance(
        id="st_cs", meeting_id=meeting.id, asset="XAUUSD", price_key="XAUUSD",
        unit="pct", direction="long", price_at=4400,
        started_at=meeting.ended_at, due_at=meeting.ended_at + timedelta(days=5),
        horizon_days=5, confidence=70, qualified=True)
    db_session.add(st)
    db_session.commit()
    payload = svc.build_stances_payload(db_session)
    stats = payload["stats"]
    assert stats["win_rate"] is None
    assert stats["cold_start"] is True
    assert stats["settled_count"] >= 0  # settlement อาจยัง pending (due ยังไม่ถึง)
    assert stats["pending_count"] >= 1


# ---------------------------------------------------------------------------
# 5. ห้ามแตะ trading_signals
# ---------------------------------------------------------------------------
def test_no_write_to_trading_signals(db_session):
    from sqlalchemy import text
    before = db_session.execute(text("SELECT COUNT(*) FROM trading_signals")).scalar()
    meeting = add_meeting(db_session)
    rj = make_rj([
        {"asset": "US10Y", "stance": "long", "confidence": 65, "horizon_days": 5,
         "unit": "bp", "qualified": True, "price_at": 4.66},
    ])
    svc.materialize_stances(db_session, meeting.id, rj, ended_at=meeting.ended_at)
    svc.build_stances_payload(db_session)
    after = db_session.execute(text("SELECT COUNT(*) FROM trading_signals")).scalar()
    assert before == after


# ---------------------------------------------------------------------------
# 6. Endpoint
# ---------------------------------------------------------------------------
def test_stances_endpoint(client, db_session):
    meeting = add_meeting(db_session)
    rj = make_rj([
        {"asset": "US10Y", "stance": "long", "confidence": 65, "horizon_days": 5,
         "unit": "bp", "qualified": True, "price_at": 4.66},
    ])
    svc.materialize_stances(db_session, meeting.id, rj, ended_at=meeting.ended_at)
    resp = client.get("/api/boardroom/stances")
    assert resp.status_code == 200
    body = resp.json()
    assert "stances" in body and "stats" in body
    assert len(body["stances"]) == 1
    s = body["stances"][0]
    assert s["asset"] == "US10Y" and s["unit"] == "bp"
    assert s["price_key"] == "us10y"
    assert s["state"] in ("pending", "settled", "awaiting")
    assert s["pnl"] is None or isinstance(s["pnl"], float)  # ราคา stub → ไม่เดา
    assert "win_rate" in body["stats"]
