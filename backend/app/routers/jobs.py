"""POST /api/jobs/run-due-turns — single pg_cron entrypoint (vercel-supabase 07).

pg_cron (Supabase) -> pg_net -> this endpoint every 10 minutes. The endpoint
itself is just the HTTP shell: all work lives in app/jobs.run_due_turns(),
which any request path can also call (the job_runs lock makes concurrent
entry harmless).
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import jobs
from app.database import get_db

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.post("/run-due-turns")
def run_due_turns(db: Session = Depends(get_db)):
    """One full tick of all due background work (idempotent, lock-guarded).

    Called by pg_cron via pg_net every 10 minutes; safe to call from request
    paths too — if a tick is already running, this returns skipped.
    """
    return jobs.run_due_turns(db)


@router.get("/status")
def job_status(db: Session = Depends(get_db)):
    """Recent job runs (for the office 3D "งานระบบล่าสุด" panel)."""
    runs = (
        db.query(jobs.JobRun)
        .order_by(jobs.JobRun.started_at.desc())
        .limit(10)
        .all()
    )
    return {
        "recent_runs": [
            {
                "id": r.id,
                "job_name": r.job_name,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "finished_at": r.finished_at.isoformat() if r.finished_at else None,
                "status": r.status,
                "detail": r.detail,
            }
            for r in runs
        ],
        "running": any(r.status == "running" for r in runs),
    }
