# backend/tests/test_screener_refresh_manager.py
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


def test_start_refresh_runs_in_background_and_completes(monkeypatch):
    monkeypatch.setattr(refresh_screener, "FINNHUB_API_KEY", "fake-key")
    monkeypatch.setattr(
        refresh_screener, "fetch_universe",
        lambda: [{"symbol": "AAA", "company_name": None}, {"symbol": "BBB", "company_name": None}],
    )
    monkeypatch.setattr(
        refresh_screener, "fetch_stock_record",
        lambda symbol, hint, now_iso: {
            "symbol": symbol, "company_name": None, "market_cap": None, "sector": None,
            "industry": None, "price": None, "pe": None, "peg": None, "ps": None, "pb": None,
            "div_yield": None, "eps": None, "roe": None, "roic": None, "gross_margin": None,
            "profit_margin": None, "de_ratio": None, "p_fcf": None, "ev_sales": None,
            "upside_pct": None, "beta": None, "volume": None, "tags": "[]", "refreshed_at": now_iso,
        },
    )
    monkeypatch.setattr(refresh_screener, "init_db", lambda: __import__("sqlite3").connect(":memory:").execute(
        "CREATE TABLE screener_stocks (symbol TEXT PRIMARY KEY, company_name TEXT, market_cap REAL, "
        "sector TEXT, industry TEXT, price REAL, pe REAL, peg REAL, ps REAL, pb REAL, div_yield REAL, "
        "eps REAL, roe REAL, roic REAL, gross_margin REAL, profit_margin REAL, de_ratio REAL, p_fcf REAL, "
        "ev_sales REAL, upside_pct REAL, beta REAL, volume REAL, tags TEXT, refreshed_at TEXT)"
    ).connection)

    started = mgr.start_refresh()
    assert started is True

    _wait_until_not_running()

    status = mgr.get_status()
    assert status["status"] == "completed"
    assert status["total"] == 2
    assert status["completed"] == 2
    assert status["skipped"] == 0
    assert status["startedAt"] is not None
    assert status["finishedAt"] is not None


def test_start_refresh_returns_false_when_already_running(monkeypatch):
    monkeypatch.setattr(refresh_screener, "FINNHUB_API_KEY", "fake-key")
    monkeypatch.setattr(refresh_screener, "fetch_universe", lambda: [{"symbol": "SLOW", "company_name": None}])

    def slow_fetch(symbol, hint, now_iso):
        time.sleep(0.3)
        return None

    monkeypatch.setattr(refresh_screener, "fetch_stock_record", slow_fetch)
    monkeypatch.setattr(refresh_screener, "init_db", lambda: __import__("sqlite3").connect(":memory:").execute(
        "CREATE TABLE screener_stocks (symbol TEXT PRIMARY KEY, refreshed_at TEXT)"
    ).connection)

    started_first = mgr.start_refresh()
    assert started_first is True

    started_second = mgr.start_refresh()
    assert started_second is False
    assert mgr.get_status()["status"] == "running"

    _wait_until_not_running()


def test_run_sets_error_status_when_universe_fetch_fails(monkeypatch):
    monkeypatch.setattr(refresh_screener, "FINNHUB_API_KEY", "fake-key")

    def boom():
        raise RuntimeError("finnhub is down")

    monkeypatch.setattr(refresh_screener, "fetch_universe", boom)

    mgr._run(limit=None)

    status = mgr.get_status()
    assert status["status"] == "error"
    assert "finnhub is down" in status["errorMessage"]


def test_run_sets_error_status_when_api_key_missing(monkeypatch):
    monkeypatch.setattr(refresh_screener, "FINNHUB_API_KEY", None)

    mgr._run(limit=None)

    status = mgr.get_status()
    assert status["status"] == "error"
    assert "FINNHUB_API_KEY" in status["errorMessage"]
