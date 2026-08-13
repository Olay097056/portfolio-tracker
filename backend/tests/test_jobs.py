"""Tests for the central job loop (app/jobs.py — vercel-supabase plan ticket 07).

Covers: one tick advances every due subsystem, the job_runs table acts as an
overlap lock (a second concurrent tick is skipped), and failure in one
subsystem doesn't kill the tick.
"""
import pytest

from app import jobs
from app.jobs import JobRun


@pytest.fixture(autouse=True)
def _stub_subsystems(monkeypatch):
    """No real network / LLM: stub every subsystem the tick touches."""
    import app.boardroom_service as br
    import app.macro_service as ms
    import app.news_service as ns
    import app.trade_desk_service as td

    monkeypatch.setattr(ms, "build_dashboard", lambda force=False: {"ok": True})
    monkeypatch.setattr(ms, "fred_history_map", lambda ids: {i: [] for i in ids})
    monkeypatch.setattr(br, "check_triggers", lambda db: {
        "checked_at": "x", "triggered": False, "skipped": True, "skip_reason": "no_candidate"})
    monkeypatch.setattr(br, "advance_running_meetings", lambda db, max_llm_turns: 0)
    monkeypatch.setattr(td, "seed_team", lambda db: None)
    monkeypatch.setattr(td, "run_due_turns", lambda db: [{"skipped": "not_due"}])
    monkeypatch.setattr(ns, "enrich_pending", lambda db, limit: 0)


def _running_count(db) -> int:
    return db.query(JobRun).filter(JobRun.status == "running").count()


def test_tick_runs_all_subsystems_and_finishes(db_session, monkeypatch):
    import app.boardroom_service as br
    import app.macro_service as ms
    import app.news_service as ns
    import app.trade_desk_service as td

    calls: dict[str, int] = {}

    def counting(label):
        def make(fn):
            def wrapper(*a, **k):
                calls[label] = calls.get(label, 0) + 1
                return fn(*a, **k)
            return wrapper
        return make

    # wrap each subsystem with a counter (same signature, same result)
    monkeypatch.setattr(ms, "build_dashboard", counting("prewarm")(ms.build_dashboard))
    monkeypatch.setattr(ms, "fred_history_map", counting("fred")(ms.fred_history_map))
    monkeypatch.setattr(br, "check_triggers", counting("trigger")(br.check_triggers))
    monkeypatch.setattr(br, "advance_running_meetings",
                        counting("advance")(br.advance_running_meetings))
    monkeypatch.setattr(ns, "enrich_pending", counting("news")(ns.enrich_pending))
    monkeypatch.setattr(td, "seed_team", counting("seed")(td.seed_team))
    monkeypatch.setattr(td, "run_due_turns", counting("trade")(td.run_due_turns))

    out = jobs.run_due_turns(db_session)
    assert out.get("prewarm") is not None
    assert out.get("boardroom") is not None
    assert out.get("trade_desk") is not None
    assert out.get("news") is not None
    # every subsystem was called exactly once
    assert calls["prewarm"] == 1 and calls["trigger"] == 1 and calls["advance"] == 1
    assert calls["seed"] == 1 and calls["trade"] == 1 and calls["news"] == 1
    # the run row is finished, not left running
    assert _running_count(db_session) == 0
    last = db_session.query(JobRun).order_by(JobRun.id.desc()).first()
    assert last.status == "finished"
    assert last.finished_at is not None


def test_overlap_lock_skips_second_tick(db_session, monkeypatch):
    import app.macro_service as ms

    # simulate a tick already in flight (crashed mid-run, row left running)
    db_session.add(JobRun(job_name="run-due-turns", started_at=jobs._now_utc_naive(),
                          status="running"))
    db_session.commit()

    out = jobs.run_due_turns(db_session)
    assert out == {"skipped": "job_already_running"}
    # the crashed row is untouched — next tick (10 min later) still sees it,
    # which is fine: the cadence heals wedged locks by waiting.
    assert _running_count(db_session) == 1


def test_tick_heals_after_finished(db_session, monkeypatch):
    """A finished row does NOT block the next tick."""
    out = jobs.run_due_turns(db_session)
    assert out.get("boardroom") is not None
    # second tick runs again (no running row anymore)
    out2 = jobs.run_due_turns(db_session)
    assert out2.get("boardroom") is not None
    assert _running_count(db_session) == 0


def test_wedged_lock_taken_over_after_ttl(db_session, monkeypatch):
    """A running row older than WEDGED_LOCK_TTL_SECONDS is wedged (the Vercel
    function was killed mid-tick) — the next tick marks it failed and takes
    over instead of skipping forever."""
    import datetime as _dt

    db_session.add(JobRun(job_name="run-due-turns",
                          started_at=jobs._now_utc_naive()
                          - _dt.timedelta(seconds=jobs.WEDGED_LOCK_TTL_SECONDS + 60),
                          status="running"))
    db_session.commit()

    out = jobs.run_due_turns(db_session)
    assert "skipped" not in out  # took over, ran the tick
    assert _running_count(db_session) == 0  # new run finished
    wedged = db_session.query(JobRun).filter(JobRun.status == "failed").first()
    assert wedged is not None and "wedged" in wedged.detail


def test_subsystem_failure_does_not_kill_tick(db_session, monkeypatch):
    import app.boardroom_service as br

    def boom(db):
        raise RuntimeError("deepseek down")
    monkeypatch.setattr(br, "advance_running_meetings", boom)

    out = jobs.run_due_turns(db_session)
    # boardroom reports the error, other subsystems still ran
    assert "error" in out["boardroom"]
    assert out["news"] is not None and out.get("trade_desk") is not None
    last = db_session.query(JobRun).order_by(JobRun.id.desc()).first()
    assert last.status == "finished"  # tick survives; only the subsystem failed


# ---------------------------------------------------------------------------
# Tick budget (production incident 2026-08-12: 11h of consecutive failures)
# ---------------------------------------------------------------------------
def test_slow_phase_does_not_prevent_the_run_from_finishing(db_session, monkeypatch):
    """A slow phase must cost the LATER phases, never the job_runs row.

    Before the budget existed the tick ran until Vercel killed the function at
    maxDuration, so `_finish` never executed: the row stayed `running`, the
    next tick took over a "wedged" lock, and the cycle repeated every 10
    minutes. Here phase 2 burns the whole budget; the run must still end
    `finished`, with the later phases marked out_of_time rather than silently
    skipped.
    """
    import app.boardroom_service as br

    def burn_budget(db, max_llm_turns):
        # pretend the phase took the entire budget
        br.set_tick_deadline(0.0)
        return 1

    monkeypatch.setattr(br, "advance_running_meetings", burn_budget)

    out = jobs.run_due_turns(db_session)

    row = db_session.query(JobRun).order_by(JobRun.id.desc()).first()
    assert row.status == "finished", f"row ค้างสถานะ {row.status} — Vercel จะฆ่าแล้ว lock ค้าง"
    assert row.finished_at is not None
    assert _running_count(db_session) == 0

    for phase in ("trade_desk", "summaries", "news"):
        assert out[phase] == {"skipped": "out_of_time", "seconds_left": 0.0} or \
            out[phase].get("skipped") == "out_of_time", f"{phase} ควรถูกข้ามพร้อมเหตุผล: {out[phase]}"


def test_llm_call_refuses_to_start_past_the_deadline(monkeypatch):
    """llm_call is the choke point every expensive phase goes through."""
    import app.boardroom_service as br

    called = []
    monkeypatch.setattr(br.httpx, "post", lambda *a, **k: called.append(1))

    token = br.set_tick_deadline(0.0)  # already expired
    try:
        with pytest.raises(br.TickDeadlineExceeded):
            br.llm_call("system", "user")
    finally:
        br.reset_tick_deadline(token)

    assert called == [], "ยิง HTTP ทั้งที่เลยเวลาแล้ว"


def test_no_deadline_armed_means_no_restriction(monkeypatch):
    """Interactive paths (manual meeting/turn) must not inherit a tick budget."""
    import app.boardroom_service as br

    assert br.tick_time_left() is None
    br.check_tick_deadline()  # must not raise
