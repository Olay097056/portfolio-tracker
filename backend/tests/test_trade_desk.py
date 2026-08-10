# backend/tests/test_trade_desk.py
"""Tests for trade-desk backend (wayfinder trade-desk ticket 06).

กฎที่ตรวจ (ticket 02/03):
- seed 2 ทีม A/B + config ต่าง (interval/risk band/target)
- เทิร์น = 3 คอล (ลูกทีม 2 → หัวหน้า) — หัวหน้าเคาะ + execute open/close/hold
- clamp size_pct เข้ากรอบทีม (A 5–10% / B 2–5%)
- SL/TP ปิดอัตโนมัติ (ทำงานแม้สวิตช์ปิด)
- โควตาเทิร์น/วัน + master switch + next_turn_at
- equity formula (balance + unrealized)
- ห้ามแตะ trading_signals
- stub: llm_call / ราคา / build_snapshot 100% (ห้าม API จริง)
"""

import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from app import trade_desk_service as td


# ── stubs ───────────────────────────────────────────────────────────────────
@pytest.fixture(autouse=True)
def stub_externals(monkeypatch):
    # LLM: ลูกทีมเสนอ + หัวหน้าเคาะ ตาม seat
    def fake_llm(system, user, *, temperature=0.7, max_tokens=8000):
        seat_orders = {
            "trend": {"action": "open", "market": "BTC-USD", "side": "long",
                      "size_pct": 8, "sl_pct": 3, "tp_pct": 6, "horizon_days": 5,
                      "reason": "trend up"},
            "technical": {"action": "open", "market": "TLT", "side": "long",
                          "size_pct": 7, "sl_pct": 2, "tp_pct": 5, "horizon_days": 7,
                          "reason": "breakout"},
            "macro": {"action": "open", "market": "US10Y", "side": "long",
                      "size_pct": 3, "sl_pct": 1, "tp_pct": 3, "horizon_days": 15,
                      "reason": "macro turn"},
            "contrarian": {"action": "open", "market": "CL", "side": "short",
                           "size_pct": 3, "sl_pct": 5, "tp_pct": 10, "horizon_days": 20,
                           "reason": "overextended"},
        }
        for seat, order in seat_orders.items():
            if f"นักวิเคราะห์{seat}" not in system and f"บทบาท: นักวิเคราะห์{seat}" not in system:
                continue
            return json.dumps(order), {"prompt_tokens": 500, "completion_tokens": 100}, 0.1
        # lead
        if "หัวหน้าทีม" in system:
            return json.dumps({"action": "open", "market": "BTC-USD", "side": "long",
                               "size_pct": 6, "sl_pct": 3, "tp_pct": 6,
                               "horizon_days": 5, "reason": "lead agrees"}), \
                {"prompt_tokens": 600, "completion_tokens": 120}, 0.1
        return "{}", {"prompt_tokens": 100, "completion_tokens": 10}, 0.05

    monkeypatch.setattr(td, "llm_call", fake_llm)
    monkeypatch.setattr(td, "build_snapshot", lambda db: {"model_scores": {}, "news": [],
                                                          "macro_history": {}})
    # Patch ที่ต้นทาง (macro_service) ไม่ใช่ที่ td: ค่ามหภาคเดินผ่าน
    # boardroom_stance_service._macro_data() ซึ่งเรียก macro_service.build_dashboard()
    # โดยตรง -- stub ที่ td จะดักไม่ทันและเทสต์จะยิง FRED จริง
    #
    # รูปร่างต้องตรงของจริง: {sections: [{items: [{series_id, value, available}]}]}
    # stub เดิมคืน {"values": {...}} ซึ่งเป็นรูปร่างที่ build_dashboard ไม่เคยคืน จึง
    # กลบบั๊กที่ทำให้ตลาดกลุ่ม bp เปิดไม้ไม่ได้เลย และ macro pack ของทีม B ว่างเปล่า
    from app import macro_service as _ms
    monkeypatch.setattr(_ms, "build_dashboard", lambda: {
        "sections": [{"items": [
            {"series_id": "us10y", "value": 4.66, "available": True},
            {"series_id": "us2y", "value": 4.19, "available": True},
        ]}],
    })
    monkeypatch.setattr(_ms, "fred_history_map", lambda ids: {})  # กันยิง FRED จริง
    # ราคา: คงที่ — BTC 70k, TLT 82.76, CL 78.72, US10Y 4.66
    prices = {"BTC-USD": 70_000.0, "TLT": 82.76, "CL": 78.72, "^GSPC": 7757.64,
              "^IXIC": 26690.62, "^DJI": 44_000.0, "ETH-USD": 3_500.0}

    def fake_get_prices(tickers):
        return {t: prices.get(t) for t in tickers}

    def fake_get_price(ticker):
        return prices.get(ticker)

    monkeypatch.setattr(td.price_service, "get_prices", fake_get_prices)
    monkeypatch.setattr(td.price_service, "get_price", fake_get_price)
    # resolve_price_key: รู้จักบางตัว
    def fake_resolve(asset, db=None):
        if asset.upper() in ("BTC-USD", "TLT", "CL", "^GSPC"):
            return asset.upper(), "pct", "pct"
        if asset.upper() in ("US10Y",):
            return "us10y", "bp", "bp"
        return None
    monkeypatch.setattr(td, "resolve_price_key", fake_resolve)
    yield


@pytest.fixture
def seeded(db_session):
    td.seed_teams(db_session)
    return db_session


# ── tests ───────────────────────────────────────────────────────────────────
def test_seed_two_teams_with_config(seeded):
    teams = {t.code: t for t in seeded.query(td.TradeTeam).all()}
    assert set(teams) == {"A", "B"}
    assert teams["A"].interval_hours == 4 and teams["B"].interval_hours == 12
    assert teams["A"].capital == 10_000.0
    assert td.RISK_BAND["A"] == (5.0, 10.0) and td.RISK_BAND["B"] == (2.0, 5.0)


def test_turn_opens_position_and_deducts_margin(seeded):
    team = seeded.query(td.TradeTeam).filter(td.TradeTeam.code == "A").first()
    r = td.run_turn(seeded, team, manual=True)
    assert r and "executed" in r and "opened" in r["executed"]
    pos = seeded.query(td.TradePosition).filter(td.TradePosition.team_id == team.id).all()
    assert len(pos) == 1
    p = pos[0]
    assert p.market == "BTC-USD" and p.side == "long"
    assert abs(p.margin_usd - 10_000 * 0.06) < 1   # lead size 6% — clamp 5-10%
    assert abs(team.balance - (10_000 - p.margin_usd)) < 1
    snap = seeded.query(td.TradeSnapshot).filter(td.TradeSnapshot.team_id == team.id).all()
    assert len(snap) == 1


def test_size_clamped_to_team_band(seeded):
    # lead สั่ง size 25% → clamp 10% (ทีม A)
    team = seeded.query(td.TradeTeam).filter(td.TradeTeam.code == "A").first()
    order = {"action": "open", "market": "BTC-USD", "side": "long", "size_pct": 25,
             "sl_pct": 3, "tp_pct": 6}
    r = td._execute_order(seeded, team, order, datetime.now(timezone.utc))
    seeded.commit()   # autoflush=False ใน db_session — commit เอง (run_turn commit อยู่แล้ว)
    assert r["size_pct"] == 10.0
    pos = seeded.query(td.TradePosition).filter(td.TradePosition.team_id == team.id).first()
    assert abs(pos.margin_usd - 1_000) < 1


def test_equity_formula(seeded):
    team = seeded.query(td.TradeTeam).filter(td.TradeTeam.code == "A").first()
    td.run_turn(seeded, team, manual=True)
    pos = seeded.query(td.TradePosition).filter(td.TradePosition.team_id == team.id).first()
    # ราคา BTC เท่าเดิม → unrealized 0 → equity = capital
    assert abs(td.team_equity(seeded, team) - 10_000.0) < 1


def test_sl_hit_closes_position(seeded):
    team = seeded.query(td.TradeTeam).filter(td.TradeTeam.code == "A").first()
    td.run_turn(seeded, team, manual=True)
    # BTC ร่วง > SL 3% → ปิด sl
    td.prices = None
    import app.trade_desk_service as tdm
    monkey = pytest.MonkeyPatch()
    monkey.setattr(tdm.price_service, "get_price",
                   lambda t: 65_000.0 if t == "BTC-USD" else 82.76)
    closed = tdm.check_sl_tp(seeded)
    assert closed == ["BTC-USD:sl"]
    pos = seeded.query(td.TradePosition).filter(td.TradePosition.team_id == team.id).first()
    assert pos.status == "sl" and pos.realized_pnl < 0


def test_tp_hit_closes_position(seeded):
    team = seeded.query(td.TradeTeam).filter(td.TradeTeam.code == "A").first()
    td.run_turn(seeded, team, manual=True)
    import app.trade_desk_service as tdm
    monkey = pytest.MonkeyPatch()
    monkey.setattr(tdm.price_service, "get_price",
                   lambda t: 76_000.0 if t == "BTC-USD" else 82.76)
    closed = tdm.check_sl_tp(seeded)
    assert closed == ["BTC-USD:tp"]


def test_sl_tp_works_when_master_off(seeded):
    team = seeded.query(td.TradeTeam).filter(td.TradeTeam.code == "A").first()
    # เปิดไม้ก่อน (master ยัง on)
    td.run_turn(seeded, team, manual=True)
    # ปิดสวิตช์ → เทิร์นใหม่ถูกบล็อก
    td.set_settings(seeded, master_on=False)
    assert td.run_turn(seeded, team, manual=True)["skipped"] == "master_off"
    # SL/TP ยังทำงาน
    import app.trade_desk_service as tdm
    monkey = pytest.MonkeyPatch()
    monkey.setattr(tdm.price_service, "get_price",
                   lambda t: 60_000.0 if t == "BTC-USD" else 82.76)
    assert tdm.check_sl_tp(seeded)


def test_daily_cap_blocks(seeded):
    td.set_settings(seeded, per_team_daily_cap=1)
    team = seeded.query(td.TradeTeam).filter(td.TradeTeam.code == "A").first()
    assert td.run_turn(seeded, team, manual=True).get("executed")
    r = td.run_turn(seeded, team, manual=True)
    assert r["skipped"] == "daily_cap"


def test_next_turn_at_scheduling(seeded):
    team = seeded.query(td.TradeTeam).filter(td.TradeTeam.code == "A").first()
    before = team.next_turn_at
    td.run_turn(seeded, team, manual=True)
    after = seeded.query(td.TradeTeam).filter(td.TradeTeam.code == "A").first().next_turn_at
    assert after > before
    assert abs((after - before).total_seconds() - 4 * 3600) < 60


def test_not_due_skips(seeded):
    team = seeded.query(td.TradeTeam).filter(td.TradeTeam.code == "A").first()
    team.next_turn_at = datetime.now(timezone.utc) + timedelta(hours=1)
    seeded.commit()
    r = td.run_turn(seeded, team)   # ไม่ manual
    assert r["skipped"] == "not_due"


def test_run_due_turns_checks_master(seeded):
    td.set_settings(seeded, master_on=False)
    assert td.run_due_turns(seeded)[0]["skipped"] == "master_off"


def test_team_a_uses_technical_b_macro(seeded):
    team_a = seeded.query(td.TradeTeam).filter(td.TradeTeam.code == "A").first()
    ctx_a = td.build_team_context(seeded, team_a)
    assert "คะแนนโมเดล" in ctx_a and "ตัวเลขมหภาค" not in ctx_a
    team_b = seeded.query(td.TradeTeam).filter(td.TradeTeam.code == "B").first()
    ctx_b = td.build_team_context(seeded, team_b)
    assert "ตัวเลขมหภาค" in ctx_b and "คะแนนโมเดล" not in ctx_b
    # ไม่เห็นทีมอื่น
    assert "ทีม B" not in ctx_a


def test_state_shape(seeded):
    st = td.build_state(seeded)
    assert st["master_on"] is True and st["per_team_daily_cap"] == 4
    assert {t["code"] for t in st["teams"]} == {"A", "B"}
    t = st["teams"][0]
    for k in ("equity", "pnl_pct", "margin_used", "next_turn_at", "turns_today",
              "positions", "weekly_target_pct"):
        assert k in t


def test_turn_records_cost_and_ended_at(seeded):
    team = seeded.query(td.TradeTeam).filter(td.TradeTeam.code == "A").first()
    td.run_turn(seeded, team, manual=True)
    t = seeded.query(td.TradeTurn).filter(td.TradeTurn.team_id == team.id).first()
    assert t.tokens_in > 0 and t.tokens_out > 0
    assert t.cost_usd > 0
    assert t.ended_at is not None
    # ตรงอัตรา $0.14/1M in + $0.28/1M out
    expect = t.tokens_in * 0.14 / 1e6 + t.tokens_out * 0.28 / 1e6
    assert abs(t.cost_usd - expect) < 1e-9


def test_no_write_to_trading_signals(seeded):
    td.run_turn(seeded, seeded.query(td.TradeTeam).filter(td.TradeTeam.code == "A").first(),
                manual=True)
    td.run_turn(seeded, seeded.query(td.TradeTeam).filter(td.TradeTeam.code == "B").first(),
                manual=True)
    n = seeded.execute(text("SELECT COUNT(*) FROM trading_signals")).scalar()
    assert n == 0


def test_bp_market_price_reads_the_real_dashboard_contract(monkeypatch):
    """ราคากลุ่ม bp ต้องอ่านจาก sections[].items[] ตามที่ build_dashboard คืนจริง.

    Regression: โค้ดเดิมอ่าน build_dashboard()["values"] ซึ่งเป็นคีย์ที่ไม่มีอยู่จริง
    -- current_price(..., "bp") จึงคืน None เสมอ แปลว่าตลาด yield/spread เปิดไม้
    ไม่ได้เลย (skipped: no_current_price) ไม่เข้า equity และไม่ถูก SL/TP เงียบสนิท
    เทสต์เดิมไม่จับเพราะ stub คืน {"values": {...}} ซึ่งของจริงไม่เคยคืน."""
    from app import macro_service as _ms

    monkeypatch.setattr(_ms, "build_dashboard", lambda: {
        "yield_curve": {}, "gold_cme": {}, "updated_at": "", "data_sources": [],
        "sections": [{"items": [
            {"series_id": "us10y", "value": 4.66, "available": True},
            {"series_id": "us_hy_spread", "value": 3.12, "available": True},
            {"series_id": "us2y", "value": None, "available": False},
        ]}],
    })
    monkeypatch.setattr(_ms, "fred_history_map", lambda ids: {})  # กันยิง FRED จริง

    assert td.current_price("us10y", "bp") == 4.66
    assert td.current_price("us_hy_spread", "bp") == 3.12
    assert td.current_price("us2y", "bp") is None        # available=False → ไม่แต่งค่า
    assert td.current_price("nope", "bp") is None
    # macro pack ของทีม B ต้องไม่ว่าง ไม่งั้นทีมสายมหภาคตัดสินใจโดยไม่มีข้อมูล
    assert td._macro_values() == {"us10y": 4.66, "us_hy_spread": 3.12}
