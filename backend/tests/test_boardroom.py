# backend/tests/test_boardroom.py
"""Tests for the boardroom engine (wayfinder ticket 06).

DeepSeek is ALWAYS stubbed here — no test may hit the real API. The stub
inspects the system prompt to tell seats apart and returns canned, real
data-shaped content so the state machine, plan surgery, claim verification,
caps, token counting and resume all get exercised deterministically.
"""

from __future__ import annotations

import json

import pytest

import app.boardroom_service as br

# ---------------------------------------------------------------------------
# Test snapshot (real-data shaped; values are what the stub claims reference)
# ---------------------------------------------------------------------------
def make_snapshot() -> dict:
    return {
        "built_at": "2026-08-09T00:00:00Z",
        "macro_values": {
            "us10y": 4.69, "us2y": 4.25, "us_hy_spread": 271.0,
            "vix": 14.9, "xauusd": 4399.7, "dxy": 99.6,
        },
        "macro_history": {
            "us10y": [["2026-07-25T00:00:00", 4.6], ["2026-08-06T00:00:00", 4.69]],
            "us_hy_spread": [["2026-07-25T00:00:00", 280.0], ["2026-08-06T00:00:00", 271.0]],
        },
        "model_scores": {"inflation-oil": 65.1, "credit-panic": 17.3},
        "model_names": {"inflation-oil": "โมเดลน้ำมันพุ่ง-เงินเฟ้อ", "credit-panic": "โมเดลวิกฤตสินเชื่อ"},
        "news": [{"title_th": "อิหร่านหยุดส่งออกน้ำมัน", "impact": 90, "source": "FT", "published_at": "2026-08-07"}],
        "reference_prices": {"us10y": 4.69, "us_hy_spread": 271.0, "xauusd": 4399.7},
    }


# ---------------------------------------------------------------------------
# Stub LLM
# ---------------------------------------------------------------------------
SEAT_DIRS = {
    "นักเศรษฐศาสตร์มหภาค": "จุดยืน: US10Y long (ความมั่นใจ 65%)",
    "นักวิเคราะห์เครดิต/บอนด์": "จุดยืน: US_HY_SPREAD short (ความมั่นใจ 62%)",
    "นักวิเคราะห์เทคนิคอล": "จุดยืน: XAUUSD long (ความมั่นใจ 55%)",
    "ผู้ท้าทาย A": "จุดยืน: US10Y short (ความมั่นใจ 58%)",
    "ผู้ท้าทาย B": "จุดยืน: US10Y long (ความมั่นใจ 60%)",
}
SEAT_ALL_LONG = {k: "จุดยืน: US10Y long (ความมั่นใจ 60%)" for k in SEAT_DIRS}

CLAIMS_JSON = (
    '```json\n{"claims": ['
    '{"claim": "US10Y อยู่ที่ 4.69%", "metric": "us10y", "expected": {"value": 4.69, "unit": "%", "window_days": 0, "direction": "up"}},'
    '{"claim": "HY spread กว้างขึ้น 80bp ในสองสัปดาห์", "metric": "us_hy_spread", "expected": {"value": 80, "unit": "bps", "window_days": 14, "direction": "up"}},'
    '{"claim": "เฟดกำลังจะเปลี่ยนท่าที", "metric": null, "expected": null}'
    ']}\n```'
)

RESOLUTION_JSON = json.dumps({
    "resolution_md": "# มติที่ประชุม\n\nสรุป: บอนด์นิ่ง ทองขึ้น (สมมติ: ระดับทั้งหมดอ้างจากข้อมูลจริง)",
    "resolution_json": {
        "plain": {
            "summary": "ตลาดยังไม่ panic น้ำมันช็อกแต่บอนด์นิ่ง",
            "proven": ["US10Y อยู่ที่ 4.69% ณ เปิดประชุม", "ทองคำขึ้น +3.72% มาที่ 4399.7"],
            "unproven": ["HY จะกว้างขึ้นจากน้ำมัน"],
            "watch": ["ราคาน้ำมัน Brent"],
            "outlook": "จับตา breakeven",
        },
        "claim_summary": {"verified": 2, "failed": 1, "unverified": 1},
        "stances": [
            {"asset": "US10Y", "stance": "neutral", "confidence": 55, "horizon": "short",
             "horizon_days": 30, "price_at": 4.69, "reason": "ข้อมูลจริง"},
        ],
        "verification": [{"claim": "US10Y 4.69%", "verdict": "true"}],
    },
}, ensure_ascii=False)


class StubLLM:
    """Deterministic fake; inspect the system prompt to know which seat."""

    def __init__(self, dirs: dict | None = None, fail_first: int = 0):
        self.calls = 0
        self.fail_first = fail_first
        self.dirs = dirs or SEAT_DIRS

    def __call__(self, system: str, user: str, *, temperature=0.7, max_tokens=8000):
        self.calls += 1
        if self.calls <= self.fail_first:
            raise br.LLMError("stub: simulated failure")
        usage = {"prompt_tokens": 1000, "completion_tokens": 200}
        content = "—"
        if "ลงมติ" in user:
            content = RESOLUTION_JSON
            usage = {"prompt_tokens": 5000, "completion_tokens": 1200}
        elif "รอบวิเคราะห์อิสระ" in user:
            stance = "จุดยืน: US10Y long (ความมั่นใจ 60%)"
            for name, line in self.dirs.items():
                if name in system:
                    stance = line
                    break
            content = f"{stance}\nเหตุผล: อ้างตัวเลขจริงจากข้อมูล\n\n{CLAIMS_JSON}"
        elif "รอบโต้แย้ง" in user:
            content = "โต้แย้ง: ประเด็น (อ้างตัวเลข)\nสนับสนุน: บางจุด\nจุดยืน: US10Y neutral (ความมั่นใจ 50%)\nขอข้อมูล: ยอดขาดดุลการคลังสหรัฐ\n"
        elif "รอบตรวจสอบ" in user:
            content = "ไม่มีประเด็นเพิ่ม ตัวเลขตรวจด้วยโค้ดแล้ว ตรรกะสมเหตุสมผล"
        elif "ค้นตัวเลขเหล่านี้" in user:
            content = "V1: ยอดขาดดุลการคลังสหรัฐ = 929.3 (แหล่ง: ข้อมูลระบบ)\nV2: หาไม่เจอ"
        elif "ตรวจสอบตัวเลขที่แมวมองค้นมา" in user:
            content = "V1: ตรงกัน 929.3 ✓"
        elif "รอบวิจัยภายนอก" in user:
            content = "R1: อิหร่านหยุดส่งออกน้ำมัน — แหล่ง: FT\nR2: หาไม่เจอ ในข้อมูลระบบ"
        elif "เปิดประชุม" in user:
            content = "วาระ: ตามที่กำหนด\nคำถามหลัก:\n1. ...\n2. ...\n3. ...\n4. ...\n5. ..."
        return content, usage, 0.05


@pytest.fixture()
def engine(db_session):
    br.seed_seats(db_session)
    return br.BoardroomEngine(db_session)


@pytest.fixture(autouse=True)
def _stub_llm(monkeypatch):
    stub = StubLLM()
    monkeypatch.setattr(br, "llm_call", stub)
    # รอยรั่ว network: test_full_meeting_completes ไม่ส่ง snapshot → create_meeting
    # เรียก build_snapshot จริง (FRED + yfinance 60 tickers — ~140 คอล/รอบ)
    monkeypatch.setattr(br, "build_snapshot", lambda db: make_snapshot())
    return stub


def _run_to_end(engine, meeting_id: str, max_advances: int = 60) -> str:
    status = "running"
    for _ in range(max_advances):
        status = engine.advance(meeting_id)
        if status != "running":
            return status
    return status


# ---------------------------------------------------------------------------
# 1. Full meeting completes and stores resolution + stats + memory
# ---------------------------------------------------------------------------
def test_full_meeting_completes(engine, db_session):
    meeting = engine.create_meeting(
        agenda="ประเมินทิศทางบอนด์สหรัฐหลังน้ำมันช็อก", mode="full",
        snapshot=make_snapshot())
    status = _run_to_end(engine, meeting.id)
    assert status == "completed"

    db_session.refresh(meeting)
    assert meeting.status == "completed"
    assert meeting.phase == "resolution"
    # 1 opening + 1 research + 5 briefing + 5 debate_r1 + 5 debate_r2 (contested)
    # + 1 evidence + 2 external_data (stub's debate contains a data request)
    # + 2 verification + 1 resolution = 23
    assert meeting.llm_calls == 23
    assert meeting.resolution_md is not None
    rj = json.loads(meeting.resolution_json)
    assert rj["stances"][0]["price_at"] == 4.69

    msgs = (db_session.query(br.BoardroomMessage)
            .filter(br.BoardroomMessage.meeting_id == meeting.id).all())
    phases = [m.phase for m in msgs]
    assert phases.count("briefing") == 5
    assert phases.count("debate_r1") == 5
    assert phases.count("debate_r2") == 5      # contested → round 2 ran
    assert phases.count("evidence") == 1       # data request → scout searched
    assert phases.count("external_data") == 2  # both challengers re-checked
    assert phases.count("verification") == 2
    assert phases.count("resolution") == 1
    assert any(m.kind == "research" for m in msgs)

    # claims were code-verified
    claims = (db_session.query(br.BoardroomClaim)
              .filter(br.BoardroomClaim.meeting_id == meeting.id).all())
    assert len(claims) >= 3
    by_verdict = {c.verdict for c in claims}
    assert "verified" in by_verdict and "failed" in by_verdict and "unverifiable" in by_verdict

    # memory from proven conclusions
    mems = db_session.query(br.BoardroomMemory).all()
    assert len(mems) >= 1
    assert mems[0].confidence in (br.CONF0_CONTESTED,)  # r2 ran → contested

    # seat stats
    stats = db_session.query(br.BoardroomSeatStats).all()
    assert stats, "seat stats should be recorded"
    total = sum(s.claims_total for s in stats)
    assert total == len(claims)


# ---------------------------------------------------------------------------
# 2. Claim verification by code (ticket 04 rules)
# ---------------------------------------------------------------------------
def test_verify_claim_level():
    snap = make_snapshot()
    ok = br.verify_claim({"claim": "us10y 4.69%", "metric": "us10y",
                          "expected": {"value": 4.69, "unit": "%"}}, snap)
    assert ok["verdict"] == "verified"
    bad = br.verify_claim({"claim": "us10y 9.99%", "metric": "us10y",
                           "expected": {"value": 9.99, "unit": "%"}}, snap)
    assert bad["verdict"] == "failed"
    assert bad["sub_reason"] == "wrong_value"


def test_verify_claim_change_and_partial():
    snap = make_snapshot()
    # actual change of us_hy_spread over 14d = 271 - 280 = -9; claim +80 → way off → failed
    c = br.verify_claim({"claim": "HY +80bp/2w", "metric": "us_hy_spread",
                         "expected": {"value": 80, "unit": "bps", "window_days": 14,
                                      "direction": "up"}}, snap)
    assert c["verdict"] == "failed"
    # claim -10 (close to actual -9) → verified
    c2 = br.verify_claim({"claim": "HY -10bp/2w", "metric": "us_hy_spread",
                          "expected": {"value": -10, "unit": "bps", "window_days": 14,
                                       "direction": "down"}}, snap)
    assert c2["verdict"] == "verified"


def test_verify_claim_direction_trend_uses_history():
    """แนวโน้มย้อนหลัง (direction-only) ต้อง verify ได้จาก macro_history.

    Regression dead-read: macro_history ว่างถาวร → _direction_of คืน None →
    claims ทิศทางทั้งหมด unverifiable (boardroom-signals 07 fix)
    """
    from datetime import datetime, timedelta, timezone
    now_dt = datetime.now(timezone.utc)
    today = now_dt.date().isoformat()
    yest = (now_dt - timedelta(days=1)).date().isoformat()
    old = (now_dt - timedelta(days=10)).date().isoformat()
    snap = make_snapshot()
    snap["macro_history"] = {"us10y": [[old, 4.6], [yest, 4.69], [today, 4.72]]}  # ขึ้น
    c = br.verify_claim({"claim": "US10Y แนวโน้มขึ้น", "metric": "us10y",
                         "expected": {"direction": "up"}}, snap)
    assert c["verdict"] == "verified"
    c_bad = br.verify_claim({"claim": "US10Y แนวโน้มลง", "metric": "us10y",
                             "expected": {"direction": "down"}}, snap)
    assert c_bad["verdict"] == "failed"


def test_verify_claim_unverifiable():
    snap = make_snapshot()
    opinion = br.verify_claim({"claim": "เฟดจะเปลี่ยนท่าที", "metric": None, "expected": None}, snap)
    assert opinion["verdict"] == "unverifiable" and opinion["sub_reason"] == "opinion"
    no_data = br.verify_claim({"claim": "X อยู่ที่ 5", "metric": "no_such_series",
                               "expected": {"value": 5}}, snap)
    assert no_data["verdict"] == "unverifiable" and no_data["sub_reason"] == "no_data"


def test_verify_claim_model_score():
    snap = make_snapshot()
    ok = br.verify_claim({"claim": "โมเดลน้ำมัน 65", "metric": "inflation-oil",
                          "expected": {"value": 65.1}}, snap)
    assert ok["verdict"] == "verified"
    bad = br.verify_claim({"claim": "โมเดลน้ำมัน 90", "metric": "inflation-oil",
                           "expected": {"value": 90}}, snap)
    assert bad["verdict"] == "failed"


# ---------------------------------------------------------------------------
# 3. Safety cap cuts the meeting
# ---------------------------------------------------------------------------
def test_safety_cap(engine, db_session, monkeypatch):
    monkeypatch.setattr(br, "CAP_MAX_CALLS", 2)
    meeting = engine.create_meeting("ทดสอบเพดานคอล", snapshot=make_snapshot())
    status = _run_to_end(engine, meeting.id, max_advances=10)
    assert status == "failed"
    db_session.refresh(meeting)
    assert meeting.status == "failed"
    assert "เกินเพดาน" in (meeting.error or "")


# ---------------------------------------------------------------------------
# 4. Token counting
# ---------------------------------------------------------------------------
def test_token_counting(engine, db_session):
    meeting = engine.create_meeting("ทดสอบนับโทเคน", snapshot=make_snapshot())
    _run_to_end(engine, meeting.id)
    db_session.refresh(meeting)
    msgs = (db_session.query(br.BoardroomMessage)
            .filter(br.BoardroomMessage.meeting_id == meeting.id).all())
    assert meeting.tokens_in == sum(m.tokens_in for m in msgs) > 0
    assert meeting.tokens_out == sum(m.tokens_out for m in msgs) > 0


# ---------------------------------------------------------------------------
# 5. Resume after a mid-meeting failure continues from the same turn
# ---------------------------------------------------------------------------
def test_resume_continues(engine, db_session, monkeypatch):
    stub = StubLLM(fail_first=1)  # first call (opening) fails
    monkeypatch.setattr(br, "llm_call", stub)
    meeting = engine.create_meeting("ทดสอบ resume", snapshot=make_snapshot())
    status = engine.advance(meeting.id)
    assert status == "failed"
    db_session.refresh(meeting)
    assert meeting.error is not None
    assert meeting.current_turn == 0  # failed before completing the turn

    status = engine.resume(meeting.id)
    assert status == "running"
    db_session.refresh(meeting)
    assert meeting.status == "running"

    status = _run_to_end(engine, meeting.id)
    assert status == "completed"
    db_session.refresh(meeting)
    assert meeting.resolution_md is not None


# ---------------------------------------------------------------------------
# 6. Unanimous briefing skips debate round 2
# ---------------------------------------------------------------------------
def test_unanimous_skips_debate_r2(engine, db_session, monkeypatch):
    stub = StubLLM(dirs=SEAT_ALL_LONG)
    monkeypatch.setattr(br, "llm_call", stub)
    meeting = engine.create_meeting("ทดสอบ unanimous", snapshot=make_snapshot())
    status = _run_to_end(engine, meeting.id)
    assert status == "completed"
    db_session.refresh(meeting)
    # 1 opening + 1 research + 5 briefing + 5 debate_r1 + 0 debate_r2 (skip)
    # + 1 evidence + 2 external_data + 2 verification + 1 resolution = 18
    assert meeting.llm_calls == 18
    msgs = (db_session.query(br.BoardroomMessage)
            .filter(br.BoardroomMessage.meeting_id == meeting.id).all())
    assert not any(m.phase == "debate_r2" for m in msgs)  # skip turn stores no message


# ---------------------------------------------------------------------------
# 7. Short mode has no research phase
# ---------------------------------------------------------------------------
def test_short_mode(engine, db_session):
    meeting = engine.create_meeting("ทดสอบโหมดสั้น", mode="short", snapshot=make_snapshot())
    status = _run_to_end(engine, meeting.id)
    assert status == "completed"
    db_session.refresh(meeting)
    msgs = (db_session.query(br.BoardroomMessage)
            .filter(br.BoardroomMessage.meeting_id == meeting.id).all())
    assert not any(m.phase == "research" for m in msgs)


# ---------------------------------------------------------------------------
# 8. Endpoints (stub everything; drive advance manually — no background thread)
# ---------------------------------------------------------------------------
def test_endpoints(client, db_session, monkeypatch):
    # the background runner must not fire with the real API during tests
    monkeypatch.setattr(br, "start_meeting_background", lambda db, mid: None)
    resp = client.post("/api/boardroom/meetings", json={
        "agenda": "ประเมินทิศทางหลังน้ำมันช็อก (test)", "trigger_type": "manual", "mode": "full"})
    assert resp.status_code == 201
    meeting_id = resp.json()["id"]

    resp = client.get("/api/boardroom/meetings")
    assert resp.status_code == 200
    assert any(m["id"] == meeting_id for m in resp.json()["meetings"])

    resp = client.get(f"/api/boardroom/meetings/{meeting_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "running"
    assert len(body["seats"]) == 7

    # drive the meeting to completion with the stubbed LLM
    engine = br.BoardroomEngine(db_session)
    _run_to_end(engine, meeting_id)
    db_session.refresh(engine.db.get(br.BoardroomMeeting, meeting_id))

    resp = client.get(f"/api/boardroom/meetings/{meeting_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "completed"
    assert body["resolution_md"] is not None
    assert len(body["messages"]) >= 15
    assert len(body["claims"]) >= 3

    # resume on a non-failed meeting → 409
    resp = client.post(f"/api/boardroom/meetings/{meeting_id}/resume")
    assert resp.status_code == 409

    # 404 path
    assert client.get("/api/boardroom/meetings/nope").status_code == 404
