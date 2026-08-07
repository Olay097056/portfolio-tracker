# backend/app/screener_refresh_manager.py
"""In-process background runner + pollable status for the Stock Screener's
Finnhub refresh pipeline (scripts/refresh_screener.py), so the frontend can
trigger a refresh and show a live progress bar instead of the user having to
run the CLI script themselves and watch a terminal.

Single-process, in-memory state -- this app has one user and one SQLite file,
so a module-level dict guarded by a lock is enough. Nothing here is persisted
across a server restart; a refresh in progress when the server restarts will
just stop (the rows it already wrote to screener_stocks are unaffected).
"""

import threading
from datetime import datetime, timezone

from scripts import refresh_screener

_lock = threading.Lock()
_state = {
    "status": "idle",  # "idle" | "running" | "completed" | "error"
    "total": None,
    "completed": 0,
    "skipped": 0,
    "currentSymbol": None,
    "startedAt": None,
    "finishedAt": None,
    "errorMessage": None,
}


def get_status() -> dict:
    with _lock:
        return dict(_state)


def _set(**kwargs):
    with _lock:
        _state.update(kwargs)


def _run(limit: int | None):
    try:
        _set(
            status="running", total=None, completed=0, skipped=0,
            currentSymbol=None, startedAt=datetime.now(timezone.utc).isoformat(),
            finishedAt=None, errorMessage=None,
        )

        if not refresh_screener.FINNHUB_API_KEY:
            _set(status="error", errorMessage="FINNHUB_API_KEY is not set in backend/.env",
                 finishedAt=datetime.now(timezone.utc).isoformat())
            return

        universe = refresh_screener.fetch_universe()
        if limit:
            universe = universe[:limit]
        _set(total=len(universe))

        def on_progress(i, total, symbol, fetched, skipped):
            _set(completed=fetched, skipped=skipped, currentSymbol=symbol, total=total)

        conn = refresh_screener.init_db()
        try:
            refresh_screener.run_refresh(universe, conn, on_progress=on_progress)
        finally:
            conn.close()

        _set(status="completed", currentSymbol=None, finishedAt=datetime.now(timezone.utc).isoformat())
    except Exception as exc:  # noqa: BLE001 -- background thread: surface the error to the poller, don't crash silently
        _set(status="error", errorMessage=str(exc), finishedAt=datetime.now(timezone.utc).isoformat())


def start_refresh(limit: int | None = None) -> bool:
    """Start a refresh in the background if one isn't already running.

    Returns True if a new refresh was started, False if one was already running
    (in which case nothing changes -- the caller should report the existing status).
    """
    with _lock:
        if _state["status"] == "running":
            return False
        _state["status"] = "running"  # claim the slot before releasing the lock

    thread = threading.Thread(target=_run, args=(limit,), daemon=True)
    thread.start()
    return True
