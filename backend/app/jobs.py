"""Central job runner — single pg_cron entrypoint (vercel-supabase plan ticket 07).

Serverless (Vercel) kills a function the moment the response ends, so the old
fire-and-forget daemon threads (boardroom meeting runner, news enrich sweep,
trade-desk due turns) die mid-flight. grilling 03 decided: ONE cron tick
(pg_cron -> pg_net -> POST /api/jobs/run-due-turns) every 10 minutes, and the
tick itself checks what is due for every subsystem.

Design notes:
- `job_runs` table acts as the overlap lock: a tick INSERTs a running row
  first (or aborts if one is already running) and marks it finished at the
  end. If a tick crashes mid-way, the row stays `running` and the next tick
  sees it and skips — the 10-min cadence means a wedged lock heals on its
  own by just waiting for the next tick (heartbeat column reserved for a
  future watchdog).
- Per-tick caps (grilling 03): <= 3 LLM turns across boardroom+trade-desk,
  news enrich <= 40 items, all within Vercel's 300s maxDuration.
- Everything is idempotent per subsystem: boardroom advance checks status,
  trade-desk checks next_turn_at/master_on/daily cap, news enrich is
  translate-once — a skipped tick is harmless, the next tick continues.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal


class JobRun(Base):
    __tablename__ = "job_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_name = Column(String, nullable=False, default="run-due-turns")
    started_at = Column(DateTime, nullable=False)
    finished_at = Column(DateTime, nullable=True)
    status = Column(String, nullable=False, default="running")  # running/finished/failed
    heartbeat_at = Column(DateTime, nullable=True)
    detail = Column(Text, nullable=True)  # JSON summary of what the tick did


def _now_utc_naive():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _try_acquire_lock(db: Session) -> JobRun | None:
    """Insert a running job_runs row; None if one is already running (overlap).

    A running row older than WEDGED_LOCK_TTL_SECONDS is treated as wedged: the
    serverless function that owned it was killed (Vercel maxDuration) before it
    could mark the run finished. Without this the lock would be held forever —
    every later tick returns skipped and the worker dies silently. The old row
    is marked failed (with a note) and the new tick takes over.
    """
    now = _now_utc_naive()
    running = (
        db.query(JobRun)
        .filter(JobRun.status == "running")
        .order_by(JobRun.started_at.desc())
        .first()
    )
    if running is not None:
        age = (now - running.started_at).total_seconds()
        if age < WEDGED_LOCK_TTL_SECONDS:
            return None
        running.status = "failed"
        running.finished_at = now
        running.detail = json.dumps(
            {"error": f"wedged lock taken over after {int(age)}s"}, ensure_ascii=False)
        db.commit()
    run = JobRun(job_name="run-due-turns", started_at=now, status="running")
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def _finish(db: Session, run: JobRun, status: str, detail: dict) -> None:
    run.status = status
    run.finished_at = _now_utc_naive()
    run.detail = json.dumps(detail, ensure_ascii=False)
    db.commit()


# ── per-tick caps (grilling 03) ──────────────────────────────────────────────
MAX_LLM_TURNS_PER_TICK = 3
# News enrich is one DeepSeek call per item (~5-8s): 40 items
# would blow past Vercel's 300s maxDuration (measured 2026-08-11: a 40-item
# tick was killed at ~250s). 15 items + prewarm + the rest of the tick stays
# inside the budget; the queue drains over consecutive ticks.
NEWS_ENRICH_LIMIT_PER_TICK = 15
# A running row older than this is considered wedged (the Vercel function was
# killed mid-tick — serverless maxDuration) and the lock is taken over. Must be
# > the cron cadence (10 min) so a legitimately slow tick isn't stolen.
WEDGED_LOCK_TTL_SECONDS = 20 * 60

# The tick must finish and write its job_runs row BEFORE Vercel kills the
# function at maxDuration (300s in vercel.json). Without a budget the tick ran
# until it was killed mid-phase, so the row stayed "running" forever and every
# following tick took over a wedged lock and died the same way — production
# logged 11 hours of consecutive failures this way (2026-08-12 12:10 onward).
# 240s leaves 60s to write the row and return.
TICK_BUDGET_SECONDS = 240
# A phase is only entered when at least this much budget is left; one LLM call
# costs up to CAP_CALL_TIMEOUT_S * (RETRIES + 1) + backoff = 122s.
PHASE_MIN_SECONDS = 130


def run_due_turns(db: Session) -> dict:
    """One full tick: pre-warm caches, then advance every due subsystem.

    Callable both from the /api/jobs/run-due-turns endpoint (pg_cron) and from
    request paths that used to piggyback work (boardroom meeting create, news
    refresh, trade-desk state) — the job_runs lock makes concurrent entry
    harmless: whoever wins the lock does the work, the loser returns skipped.
    """
    run = _try_acquire_lock(db)
    if run is None:
        return {"skipped": "job_already_running"}

    detail: dict = {"prewarm": None, "boardroom": None, "trade_desk": None, "summaries": None, "news": None}

    from app import boardroom_service as _br

    deadline_token = _br.set_tick_deadline(time.monotonic() + TICK_BUDGET_SECONDS)

    def _has_time(phase: str) -> bool:
        """Enter a phase only if it could finish inside the budget."""
        left = _br.tick_time_left() or 0.0
        if left >= PHASE_MIN_SECONDS:
            return True
        detail[phase] = {"skipped": "out_of_time", "seconds_left": round(left, 1)}
        return False

    try:
        # 1. Pre-warm macro/market caches (Postgres cache_entries, ticket 06) so
        #    the dashboard is warm even on a cold function. Cheap when fresh.
        from app import macro_service

        try:
            dash = macro_service.build_dashboard(force=False)
            # FRED series ids only (the _SERIES meta maps internal keys like
            # "us10y" -> FRED id "DGS10"; hitting FRED with internal keys 404s)
            fred_ids = [m.get("fred") for m in macro_service._SERIES.values()
                        if m.get("fred")]
            detail["prewarm"] = {"dashboard": "ok" if dash else "empty",
                                 "fred": len(macro_service.fred_history_map(fred_ids))}
        except Exception as exc:  # never let prewarm fail the whole tick
            detail["prewarm"] = {"error": str(exc)[:200]}

        # 2. Boardroom: trigger check + advance running meetings (<=3 LLM turns).
        from app import boardroom_service

        if _has_time("boardroom"):
            try:
                trigger = boardroom_service.check_triggers(db)
                advanced = boardroom_service.advance_running_meetings(
                  db, max_llm_turns=MAX_LLM_TURNS_PER_TICK)
                detail["boardroom"] = {"trigger": trigger.get("skip_reason") or (
                  "triggered" if trigger.get("triggered") else "checked"),
                  "advanced_turns": advanced}
            except Exception as exc:
                detail["boardroom"] = {"error": str(exc)[:200]}

        # 3. Trade-desk: settle pending orders (never calls LLM), then run due turns.
        from app import trade_desk_service as td

        if _has_time("trade_desk"):
            try:
                td.seed_team(db)
                team = db.query(td.TradeTeam).filter(
                  td.TradeTeam.code == "DEEPSEEK").first()
                settled = []
                if team is not None:
                  settled = td.settle_pending_orders(db, team)
                due = td.run_due_turns(db)
                detail["trade_desk"] = {
                  "settled": len(settled),
                  "result": [r.get("skipped") or r.get("action")
                             for r in due if isinstance(r, dict)],
                }
            except Exception as exc:
                detail["trade_desk"] = {"error": str(exc)[:200]}

        # 3.5 Trade-desk: weekly target + daily/monthly summaries (1 LLM call/period
        #     each — idempotent via UNIQUE(team_id, kind, period); master-off skips all).
        if _has_time("summaries"):
            try:
                team = db.query(td.TradeTeam).filter(
                  td.TradeTeam.code == "DEEPSEEK").first()
                if team is not None:
                  wk = td.ensure_weekly_target(db, team)
                  day = td.ensure_daily_summary(db, team)
                  mon = td.ensure_monthly_summary(db, team)
                  detail["summaries"] = {"weekly": wk, "daily": day, "monthly": mon}
                else:
                  detail["summaries"] = {"skipped": "no_team"}
            except Exception as exc:
                detail["summaries"] = {"error": str(exc)[:200]}

        # 4. News: enrich pending (<=40) — refresh happens on-demand via the
        #    news endpoint (fast fetch), enrichment is the slow LLM part.
        from app import news_service

        if _has_time("news"):
            try:
                enriched = news_service.enrich_pending(db, limit=NEWS_ENRICH_LIMIT_PER_TICK)
                detail["news"] = {"enriched": enriched}
            except Exception as exc:
                detail["news"] = {"error": str(exc)[:200]}

        detail["seconds_left"] = round(_br.tick_time_left() or 0.0, 1)
        _finish(db, run, "finished", detail)
        return detail
    except Exception as exc:
        _finish(db, run, "failed", {"error": str(exc)[:500]})
        return {"error": str(exc)[:500]}
    finally:
        _br.reset_tick_deadline(deadline_token)
