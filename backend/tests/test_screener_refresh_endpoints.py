# backend/tests/test_screener_refresh_endpoints.py
import time

import pytest

from app import screener_refresh_manager as mgr
from scripts import refresh_screener


@pytest.fixture(autouse=True)
def _reset_state():
    mgr._state.update({
        "status": "idle", "total": None, "completed": 0, "skipped": 0,
        "currentSymbol": None, "startedAt": None, "finishedAt": None, "errorMessage": None,
    })
    yield
    mgr._state.update({
        "status": "idle", "total": None, "completed": 0, "skipped": 0,
        "currentSymbol": None, "startedAt": None, "finishedAt": None, "errorMessage": None,
    })


def _wait_until_not_running(timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if mgr.get_status()["status"] != "running":
            return
        time.sleep(0.02)
    raise AssertionError("refresh did not finish within timeout")


def test_refresh_status_starts_idle(client):
    response = client.get("/api/screener/refresh-status")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "idle"
    assert body["total"] is None
    assert body["completed"] == 0


def test_post_refresh_starts_a_run_and_returns_202(client, monkeypatch):
    monkeypatch.setattr(refresh_screener, "FINNHUB_API_KEY", "fake-key")
    monkeypatch.setattr(refresh_screener, "fetch_universe", lambda: [{"symbol": "AAA", "company_name": None}])
    monkeypatch.setattr(refresh_screener, "fetch_stock_record", lambda symbol, hint, now_iso: None)
    monkeypatch.setattr(refresh_screener, "init_db", lambda: __import__("sqlite3").connect(":memory:").execute(
        "CREATE TABLE screener_stocks (symbol TEXT PRIMARY KEY, refreshed_at TEXT)"
    ).connection)

    response = client.post("/api/screener/refresh", json={})
    assert response.status_code == 202
    assert response.json()["status"] == "running"

    _wait_until_not_running()


def test_post_refresh_returns_409_when_already_running(client, monkeypatch):
    monkeypatch.setattr(refresh_screener, "FINNHUB_API_KEY", "fake-key")
    monkeypatch.setattr(refresh_screener, "fetch_universe", lambda: [{"symbol": "SLOW", "company_name": None}])

    def slow_fetch(symbol, hint, now_iso):
        time.sleep(0.3)
        return None

    monkeypatch.setattr(refresh_screener, "fetch_stock_record", slow_fetch)
    monkeypatch.setattr(refresh_screener, "init_db", lambda: __import__("sqlite3").connect(":memory:").execute(
        "CREATE TABLE screener_stocks (symbol TEXT PRIMARY KEY, refreshed_at TEXT)"
    ).connection)

    first = client.post("/api/screener/refresh", json={})
    assert first.status_code == 202

    second = client.post("/api/screener/refresh", json={})
    assert second.status_code == 409
    assert second.json()["detail"]["status"]["status"] == "running"

    _wait_until_not_running()


def test_post_refresh_reports_error_status_when_api_key_missing(client, monkeypatch):
    monkeypatch.setattr(refresh_screener, "FINNHUB_API_KEY", None)

    response = client.post("/api/screener/refresh", json={})
    assert response.status_code == 202

    _wait_until_not_running()

    status = client.get("/api/screener/refresh-status").json()
    assert status["status"] == "error"
    assert "FINNHUB_API_KEY" in status["errorMessage"]
