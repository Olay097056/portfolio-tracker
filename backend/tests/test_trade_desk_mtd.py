"""Tests for MTD computation via trade_snapshots (ticket 03 reference-parity).

The key assertion: mtd_pnl_pct must differ from pnl_pct when the team's
starting capital and the month-start snapshot equity are different numbers.
"""

from datetime import datetime, timezone

from app.trade_desk_service import (
    TradeTeam, TradeSnapshot, get_state, DEFAULT_CAPITAL,
)


def _make_team(db, capital=9000.0, equity=10800.0):
    team = TradeTeam(
        code="DEEPSEEK", name_th="MTD Test", name_en="MTD Test",
        capital=capital, balance=capital, equity=equity,
        created_at=datetime(2026, 6, 15, tzinfo=timezone.utc),  # started last month
    )
    db.add(team)
    db.commit()
    db.refresh(team)
    return team


class TestMtdComputation:
    def test_mtd_uses_snapshot_equity_not_capital(self, db_session):
        """Snapshot equity 10000 at month start, current 10800, capital 9000.
        MTD must be 8.00% (from snapshot), NOT 20.00% (from capital = pnl_pct)."""
        team = _make_team(db_session)
        # snapshot at END of last month (before this month started)
        snap_time = datetime(2026, 7, 31, 23, 59, tzinfo=timezone.utc)
        db_session.add(TradeSnapshot(
            team_id=team.id, equity=10000.0, snapped_at=snap_time))
        db_session.commit()

        state = get_state(db_session)
        t = state["teams"][0]
        assert t["pnl_pct"] == 20.0       # (10800-9000)/9000 = 20%
        assert t["mtd_pnl_pct"] == 8.0    # (10800-10000)/10000 = 8%
        assert t["mtd_pnl_pct"] != t["pnl_pct"]  # the whole point

    def test_mtd_null_when_no_snapshot_and_team_older_than_month(self, db_session):
        """Team created in a previous month but no snapshot before this month
        → cannot compute MTD → null."""
        team = _make_team(db_session)
        # no snapshot inserted
        state = get_state(db_session)
        t = state["teams"][0]
        assert t["mtd_pnl_pct"] is None

    def test_mtd_capital_when_team_started_this_month(self, db_session):
        """Team created this month → equity_start = capital."""
        team = TradeTeam(
            code="DEEPSEEK", name_th="MTD T2", name_en="MTD T2",
            capital=10000.0, balance=10000.0, equity=10800.0,
            created_at=datetime(2026, 8, 5, tzinfo=timezone.utc),  # this month
        )
        db_session.add(team)
        db_session.commit()
        state = get_state(db_session)
        t = state["teams"][0]
        assert t["mtd_pnl_pct"] == 8.0  # (10800-10000)/10000
