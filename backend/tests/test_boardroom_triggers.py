# backend/tests/test_boardroom_triggers.py
"""Tests for the auto-trigger engine (wayfinder ticket 10).

Rules from ticket 08, verified here:
- ข่าว: impact ≥ 70 ใน 24 ชม. → ประชุม mode=short, วาระจากข่าว top
- โมเดล: ข้ามเกณฑ์ 40/60 หรือ Δ ≥ 8 จุดใน 6 ชม.
- เพดาน: daily_cap 6/วัน (รวม manual) · cooldown 60 นาที (auto) · dedupe key 6 ชม.
- ทุกการประเมินเขียน boardroom_trigger_log — หน้า tab เห็น "ชนเพดาน"
- ห้ามยิง FRED / DeepSeek / thread จริงในเทสต์
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

import app.boardroom_service as br
from app.news_service import NewsItem


def now() -> datetime:
    return datetime.now(timezone.utc)


def add_news(db, *, impact: int, title: str = "ทดสอบข่าวแรง", minutes_ago: int = 5,
             related: str | None = "[\"inflation-oil\"]") -> NewsItem:
    item = NewsItem(
        id=uuid.uuid4().hex, title=title, url=f"https://t/{uuid.uuid4().hex}",
        source="test", impact_score=impact, published_at=now() - timedelta(minutes=minutes_ago),
        title_th=title, related_models=related, created_at=now(),
    )
    db.add(item)
    db.commit()
    return item


def add_history(db, model_id: str, score: float, minutes_ago: int) -> None:
    from app.routers.models import ModelScoreHistory
    db.add(ModelScoreHistory(
        id=uuid.uuid4().hex, model_id=model_id, score=score,
        recorded_at=now() - timedelta(minutes=minutes_ago)))
    db.commit()


def add_meeting(db, *, key: str | None = None, minutes_ago: int = 0,
                trigger_type: str = "manual", status: str = "completed") -> None:
    m = br.BoardroomMeeting(
        id=f"m_{uuid.uuid4().hex[:8]}", status=status, phase="resolution",
        current_turn=0, turn_plan="[]", agenda="ประชุมเทสต์", trigger_type=trigger_type,
        mode="full", trigger_key=key,
        created_at=now() - timedelta(minutes=minutes_ago),
        updated_at=now() - timedelta(minutes=minutes_ago),
    )
    db.add(m)
    db.commit()


@pytest.fixture(autouse=True)
def _stub_side_effects(monkeypatch):
    # no FRED snapshot fetch, no background threads, no real LLM
    monkeypatch.setattr(br, "build_snapshot", lambda db: {"macro_values": {}, "model_scores": {}})
    # check_triggers advances via the job loop helper (ticket 07) — stub it out
    monkeypatch.setattr(br, "advance_running_meetings", lambda db, max_llm_turns: 0)
    stub = lambda *a, **k: ("—", {"prompt_tokens": 1, "completion_tokens": 1}, 0.01)
    monkeypatch.setattr(br, "llm_call", stub)
    br.seed_seats(None) if False else None  # (engine seeds via create_meeting path)


# ---------------------------------------------------------------------------
# ข่าว
# ---------------------------------------------------------------------------
def test_news_trigger_opens_short_meeting(db_session):
    add_news(db_session, impact=90, title="อิหร่านหยุดส่งออกน้ำมัน")
    res = br.check_triggers(db_session)
    assert res["triggered"] is True
    assert res["meeting_id"]
    assert "อิหร่านหยุดส่งออกน้ำมัน" in res["reason"]
    meeting = db_session.get(br.BoardroomMeeting, res["meeting_id"])
    assert meeting is not None
    assert meeting.trigger_type == "news"
    assert meeting.mode == "short"
    assert meeting.trigger_key and meeting.trigger_key.startswith("news") is False
    log = db_session.query(br.BoardroomTriggerLog).first()
    assert log is not None and log.skipped is False and log.meeting_id == meeting.id


def test_news_low_impact_skips(db_session):
    add_news(db_session, impact=50, title="ข่าวธรรมดา")
    res = br.check_triggers(db_session)
    assert res["triggered"] is False
    assert res["skip_reason"] == "no_candidate"
    assert db_session.query(br.BoardroomMeeting).count() == 0
    log = db_session.query(br.BoardroomTriggerLog).first()
    assert log.skipped is True and log.skip_reason == "no_candidate"


def test_news_already_evaluated_batches(db_session):
    # ข่าว 40 นาทีที่แล้ว + เคยประเมิน (log 30 นาทีที่แล้ว) → batch: ไม่เปิดซ้ำ
    add_news(db_session, impact=95, title="ข่าวเดิม", minutes_ago=40)
    db_session.add(br.BoardroomTriggerLog(
        id="tlog_1", checked_at=now() - timedelta(minutes=30),
        trigger_type="news", reason="เคยประเมิน", skipped=True, skip_reason="no_candidate"))
    db_session.commit()
    res = br.check_triggers(db_session)
    assert res["triggered"] is False
    assert res["skip_reason"] == "no_candidate"


# ---------------------------------------------------------------------------
# โมเดล
# ---------------------------------------------------------------------------
def test_model_crossing_threshold_opens(db_session):
    add_history(db_session, "credit-panic", 39.5, 120)
    add_history(db_session, "credit-panic", 61.0, 0)
    res = br.check_triggers(db_session)
    assert res["triggered"] is True
    assert res["meeting_id"]
    meeting = db_session.get(br.BoardroomMeeting, res["meeting_id"])
    assert meeting.trigger_type == "model"
    assert "ข้ามเกณฑ์" in meeting.agenda
    assert meeting.trigger_key == "model:credit-panic:40"


def test_model_delta_without_crossing_opens(db_session):
    add_history(db_session, "fed-pivot", 48.0, 120)
    add_history(db_session, "fed-pivot", 56.0, 0)   # Δ=8 ไม่ข้ามเกณฑ์
    res = br.check_triggers(db_session)
    assert res["triggered"] is True
    meeting = db_session.get(br.BoardroomMeeting, res["meeting_id"])
    assert meeting.trigger_type == "model"
    assert meeting.trigger_key == "model:fed-pivot:delta"


def test_model_no_move_skips(db_session):
    add_history(db_session, "fed-pivot", 48.0, 120)
    add_history(db_session, "fed-pivot", 49.0, 0)
    res = br.check_triggers(db_session)
    assert res["triggered"] is False and res["skip_reason"] == "no_candidate"


def test_model_history_too_old_skips(db_session):
    add_history(db_session, "fed-pivot", 40.0, 60 * 20)   # 20 ชม.ที่แล้ว — เกินกรอบ
    add_history(db_session, "fed-pivot", 55.0, 60 * 19)
    res = br.check_triggers(db_session)
    assert res["triggered"] is False and res["skip_reason"] == "no_candidate"


# ---------------------------------------------------------------------------
# เพดาน / cooldown / dedupe
# ---------------------------------------------------------------------------
def test_duplicate_news_key_skips(db_session):
    add_meeting(db_session, key="ข่าวเดิม", minutes_ago=60)   # ประชุมเพิ่งจบ (1 ชม.)
    add_news(db_session, impact=90, title="ข่าวเดิม")          # key ตรงกัน
    res = br.check_triggers(db_session)
    assert res["triggered"] is False
    assert res["skip_reason"] == "duplicate"


def test_daily_cap_skips(db_session):
    for _ in range(6):
        add_meeting(db_session)                                 # 6 ประชุมวันนี้ (manual)
    add_news(db_session, impact=90, title="ข่าวแรงมาก")
    res = br.check_triggers(db_session)
    assert res["triggered"] is False
    assert res["skip_reason"] == "daily_cap"
    log = db_session.query(br.BoardroomTriggerLog).first()
    assert log.skip_reason == "daily_cap"


def test_cooldown_skips(db_session):
    add_meeting(db_session, minutes_ago=10)                     # ประชุมล่าสุด 10 นาที
    add_news(db_session, impact=90, title="ข่าวแรง")
    res = br.check_triggers(db_session)
    assert res["triggered"] is False
    assert res["skip_reason"] == "cooldown"


def test_check_rate_limit_10min(db_session):
    add_news(db_session, impact=90, title="ข่าวแรก")
    first = br.check_triggers(db_session)
    assert first["triggered"] is True
    second = br.check_triggers(db_session)                      # เรียกซ้ำทันที
    assert second["triggered"] is False
    assert second["skip_reason"] == "check_cooldown"
    # rate-limit ไม่เขียน log ใหม่ — เหลือเฉพาะ log ของการเปิดครั้งแรก
    assert db_session.query(br.BoardroomTriggerLog).count() == 1


# ---------------------------------------------------------------------------
# endpoints
# ---------------------------------------------------------------------------
def test_trigger_check_endpoint(client, db_session, monkeypatch):
    monkeypatch.setattr(br, "start_meeting_background", lambda db, mid: None)
    add_news(db_session, impact=90, title="ข่าว endpoint")
    resp = client.post("/api/boardroom/triggers/check")
    assert resp.status_code == 200
    body = resp.json()
    assert body["triggered"] is True
    assert body["meeting_id"]
    assert body["skip_reason"] is None


def test_meetings_list_includes_trigger_stats(client, db_session, monkeypatch):
    monkeypatch.setattr(br, "start_meeting_background", lambda db, mid: None)
    add_news(db_session, impact=90, title="ข่าว list")
    # trigger เกิดจาก job loop (ticket 07 — ไม่มี piggyback บน GET) → เรียก check ตรงๆ ก่อน
    resp = client.post("/api/boardroom/triggers/check")
    assert resp.status_code == 200
    resp = client.get("/api/boardroom/meetings")
    assert resp.status_code == 200
    body = resp.json()
    assert "today_meetings" in body
    assert "trigger_log_today" in body
    assert body["today_meetings"] >= 1
    # trigger log ของการตรวจนี้ปรากฏ (ข้าม/เปิด)
    assert any(not l["skipped"] for l in body["trigger_log_today"])
