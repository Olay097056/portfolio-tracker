"""Ticket 09 tests — weekly target + daily/monthly summaries idempotence.

The tick runs 144x/day server-side. Without a DB-backed dedupe each summary
would cost 144 LLM calls/day. UNIQUE(team_id, kind, period) + pre-check
must yield exactly ONE call per period.

Mandatory tests (per ticket):
1. 100 ticks same day → daily summary LLM = 1 call
2. next day → +1 call (not 0)
3. 100 ticks same week → weekly target = 1 call
4. master_on=0 → first tick of week, 0 LLM calls
5. master_on=1 → 1 call; rest of the week 0 calls
6. directive text is present in the context when setting the target
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from app.trade_desk_service import (
    TradeTeam, TradeTurn,
    ensure_weekly_target, ensure_daily_summary, ensure_monthly_summary,
)

# a fixed "today" for deterministic periods
TODAY = datetime(2026, 8, 12, 10, 0, tzinfo=timezone.utc)  # Wednesday
TOMORROW = TODAY + timedelta(days=1)
NEXT_WEEK = TODAY + timedelta(days=7)


def _make_team(db, master_on=1, directive=None):
    team = TradeTeam(
        code="DEEPSEEK", name_th="T9", name_en="T9",
        capital=10000.0, balance=10000.0, equity=10000.0,
        weekly_target_pct=1.5, master_on=master_on,
        team_directive=directive,
        created_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
    )
    db.add(team)
    db.commit()
    db.refresh(team)
    return team


def _add_turn(db, team, at, action="hold"):
    t = TradeTurn(
        team_id=team.id, agenda="test", consensus="consensus",
        lead_decision={"action": action}, trigger="scheduled",
        started_at=at, finished_at=at,
        tokens_in=10, tokens_out=5, cost_usd=0.000001,
    )
    db.add(t)
    db.commit()
    return t


def _fake_llm(system, user, **kwargs):
    return ('{"weekly_target_pct": 2.5, "monthly_floor_pct": 5.0, '
            '"monthly_stretch_pct": 20.0, "rationale": "ตลาดผันผวน"}',
            {"prompt_tokens": 100, "completion_tokens": 50}, 0.1)


@pytest.fixture()
def fast_base_context(monkeypatch):
    """Isolate the slow cold-cache services the base context loads on every target.

    build_markets downloads all 503 S&P constituents from yfinance (~12s),
    build_dashboard re-fetches 31 FRED series (~5-6s) and fetch_cnn hits the
    CNN Fear & Greed page — all network-bound and irrelevant to these tests'
    mechanics. Cache is cleared per test by conftest, so each call pays the
    full cold start without this fixture.
    """
    monkeypatch.setattr(
        "app.stock_universe_service.build_markets",
        lambda force=False: {"markets": [], "total": 0, "by_sector": {}, "updated_at": None},
    )
    monkeypatch.setattr(
        "app.macro_service.build_dashboard",
        lambda force=False: {"sections": [], "updated_at": None},
    )
    monkeypatch.setattr("app.model_service.build_models", lambda: {"models": []})
    monkeypatch.setattr("app.fear_greed_service.fetch_cnn", lambda: None)


class TestDailySummaryIdempotence:
    def test_100_ticks_same_day_one_call(self, db_session):
        team = _make_team(db_session)
        _add_turn(db_session, team, TODAY)
        calls = []
        with patch("app.trade_desk_service.llm_call",
                   side_effect=lambda s, u, **k: (calls.append(1) or _fake_llm(s, u, **k))):
            for _ in range(100):
                ensure_daily_summary(db_session, team, now=TODAY)
        assert len(calls) == 1, f"daily summary called LLM {len(calls)} times for 100 ticks!"

    def test_next_day_adds_one_more_call(self, db_session):
        team = _make_team(db_session)
        _add_turn(db_session, team, TODAY)
        _add_turn(db_session, team, TOMORROW)
        calls = []
        with patch("app.trade_desk_service.llm_call",
                   side_effect=lambda s, u, **k: (calls.append(1) or _fake_llm(s, u, **k))):
            ensure_daily_summary(db_session, team, now=TODAY)
            for _ in range(50):
                ensure_daily_summary(db_session, team, now=TODAY)   # same day → skip
            ensure_daily_summary(db_session, team, now=TOMORROW)     # new day → +1
            for _ in range(50):
                ensure_daily_summary(db_session, team, now=TOMORROW)
        assert len(calls) == 2, f"expected 2 calls (one/day), got {len(calls)}"

    def test_no_activity_no_llm_call(self, db_session):
        team = _make_team(db_session)  # no turns today
        calls = []
        with patch("app.trade_desk_service.llm_call",
                   side_effect=lambda s, u, **k: (calls.append(1) or _fake_llm(s, u, **k))):
            r = ensure_daily_summary(db_session, team, now=TODAY)
        assert r["skipped"] == "no_activity"
        assert calls == [], "no-activity summary must not call LLM"


class TestWeeklyTargetIdempotence:
    def test_100_ticks_same_week_one_call(self, db_session, fast_base_context):
        team = _make_team(db_session)
        calls = []
        with patch("app.trade_desk_service.llm_call",
                   side_effect=lambda s, u, **k: (calls.append(1) or _fake_llm(s, u, **k))):
            for _ in range(100):
                ensure_weekly_target(db_session, team, now=TODAY)
        assert len(calls) == 1, f"weekly target called LLM {len(calls)} times for 100 ticks!"

    def test_next_week_adds_one_more_call(self, db_session, fast_base_context):
        team = _make_team(db_session)
        calls = []
        with patch("app.trade_desk_service.llm_call",
                   side_effect=lambda s, u, **k: (calls.append(1) or _fake_llm(s, u, **k))):
            ensure_weekly_target(db_session, team, now=TODAY)
            ensure_weekly_target(db_session, team, now=NEXT_WEEK)
        assert len(calls) == 2

    def test_target_written_to_team(self, db_session, fast_base_context):
        team = _make_team(db_session)
        with patch("app.trade_desk_service.llm_call", side_effect=_fake_llm):
            r = ensure_weekly_target(db_session, team, now=TODAY)
        db_session.refresh(team)
        assert r["set"] is True
        assert team.weekly_target_pct == 2.5

    def test_directive_in_context_when_setting_target(self, db_session, fast_base_context):
        """User directive must be visible to the LLM when it sets the target."""
        team = _make_team(db_session, directive="งดเทรดตอนข่าว FOMC")
        captured = {}
        def spy(system, user, **k):
            captured["user"] = user
            return _fake_llm(system, user, **k)
        with patch("app.trade_desk_service.llm_call", side_effect=spy):
            ensure_weekly_target(db_session, team, now=TODAY)
        assert "งดเทรดตอนข่าว FOMC" in captured["user"], "directive missing from target-setting context!"


class TestMasterSwitchGatesSummaries:
    def test_master_off_zero_llm_calls_first_tick_of_week(self, db_session, fast_base_context):
        team = _make_team(db_session, master_on=0)
        calls = []
        with patch("app.trade_desk_service.llm_call",
                   side_effect=lambda s, u, **k: (calls.append(1) or _fake_llm(s, u, **k))):
            r = ensure_weekly_target(db_session, team, now=TODAY)
            ensure_daily_summary(db_session, team, now=TODAY)
            ensure_monthly_summary(db_session, team, now=TODAY)
        assert r["skipped"] == "master_off_or_inactive"
        assert calls == [], f"master off leaked {len(calls)} LLM calls!"

    def test_master_on_one_call_then_week_rest_zero(self, db_session, fast_base_context):
        team = _make_team(db_session, master_on=1)
        calls = []
        with patch("app.trade_desk_service.llm_call",
                   side_effect=lambda s, u, **k: (calls.append(1) or _fake_llm(s, u, **k))):
            ensure_weekly_target(db_session, team, now=TODAY)      # 1 call
            for _ in range(100):
                ensure_weekly_target(db_session, team, now=TODAY)  # 0 more
        assert len(calls) == 1, f"expected 1 call, got {len(calls)}"


class TestMonthlySummaryIdempotence:
    def test_one_call_per_month(self, db_session):
        team = _make_team(db_session)
        _add_turn(db_session, team, TODAY)
        calls = []
        with patch("app.trade_desk_service.llm_call",
                   side_effect=lambda s, u, **k: (calls.append(1) or _fake_llm(s, u, **k))):
            for _ in range(100):
                ensure_monthly_summary(db_session, team, now=TODAY)
        assert len(calls) == 1, f"monthly summary called LLM {len(calls)} times!"
