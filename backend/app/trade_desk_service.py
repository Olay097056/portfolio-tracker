# backend/app/trade_desk_service.py
"""ทีมเทรด (paper trading) — แผน trade-desk ticket 06.

จากผัง ticket 02 + prototype 03:
- 2 ทีม: A สายเทรนด์ (เทรนด์+เทคนิคอล · 1-7 วัน · risk 5-10% · interval 4ชม.)
            B สายกลับค่า (มหภาค+สวนฝูง · 7-30 วัน · risk 2-5% · interval 12ชม.)
- เทิร์น = 3 คอล (ลูกทีม 2 เสนอ → หัวหน้าเคาะ) — หัวหน้าตัดสินเด็ดขาด + สวนลูกทีมได้
- ทีมไม่เห็นผลกัน (build_team_context กรองเฉพาะพอร์ตตัวเอง)
- piggyback: run_due_turns() เรียกตอนเปิดหน้า/API — ย้ายขึ้น pg_cron ได้ทีหลัง
- สวิตช์หลัก + โควตาเทิร์น/วัน + SL/TP ทำงานแม้สวิตช์ปิด
- reuse: llm_call (boardroom_service — thinking disabled + cost) · build_snapshot ·
          resolve_price_key (boardroom_stance_service) · price_service.get_price
"""

from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Session, relationship

from app.database import Base, get_db
from app.boardroom_service import build_snapshot, llm_call, local_midnight_utc
from app.boardroom_stance_service import resolve_price_key
from app import price_service
from app.macro_service import build_dashboard

# ── Config ──────────────────────────────────────────────────────────────────
TURN_INTERVAL_HOURS = {"A": 4, "B": 12}
DAILY_CAP_DEFAULT = 4
CAPITAL_DEFAULT = 10_000.0
WEEKLY_TARGET = {"A": 1.5, "B": 1.0}
RISK_BAND = {"A": (5.0, 10.0), "B": (2.0, 5.0)}

# ── ORM ─────────────────────────────────────────────────────────────────────
class TradeTeam(Base):
    __tablename__ = "trade_teams"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code = Column(String(8), unique=True, nullable=False)   # "A" / "B"
    name_th = Column(String(64))
    name_en = Column(String(64))
    status = Column(String(16), default="active")           # active/probation/paused
    capital = Column(Float, default=CAPITAL_DEFAULT)
    balance = Column(Float, default=CAPITAL_DEFAULT)
    weekly_target_pct = Column(Float, default=1.5)
    monthly_floor_pct = Column(Float, default=5.0)
    monthly_stretch_pct = Column(Float, default=20.0)
    interval_hours = Column(Integer, default=4)
    next_turn_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    directive_md = Column(Text, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class TradePosition(Base):
    __tablename__ = "trade_positions"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id = Column(String(36), ForeignKey("trade_teams.id"), index=True)
    market = Column(String(32))        # price_key (e.g. BTC-USD, ^GSPC, us10y)
    unit = Column(String(8), default="pct")   # pct / bp
    side = Column(String(8))           # long / short
    size = Column(Float)               # จำนวนหน่วย
    margin_usd = Column(Float)
    entry_px = Column(Float)
    sl_pct = Column(Float, default=0.0)
    tp_pct = Column(Float, default=0.0)
    status = Column(String(16), default="open")   # open / closed / sl / tp
    opened_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    closed_at = Column(DateTime, nullable=True)
    close_px = Column(Float, nullable=True)
    realized_pnl = Column(Float, default=0.0)


class TradeTurn(Base):
    __tablename__ = "trade_turns"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id = Column(String(36), ForeignKey("trade_teams.id"), index=True)
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    ended_at = Column(DateTime, nullable=True)
    tokens_in = Column(Integer, default=0)
    tokens_out = Column(Integer, default=0)
    cost_usd = Column(Float, default=0.0)
    lead_decision = Column(Text, default="{}")     # JSON ของหัวหน้า
    seat_orders = Column(Text, default="[]")       # JSON ของลูกทีม


class TradeSnapshot(Base):
    __tablename__ = "trade_snapshots"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id = Column(String(36), ForeignKey("trade_teams.id"), index=True)
    equity = Column(Float)
    snapped_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class TradeSettings(Base):
    __tablename__ = "trade_settings"
    id = Column(Integer, primary_key=True)          # single row: id=1
    master_on = Column(Boolean, default=True)
    per_team_daily_cap = Column(Integer, default=DAILY_CAP_DEFAULT)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# ── Settings / seed ─────────────────────────────────────────────────────────
def get_settings(db: Session) -> TradeSettings:
    s = db.get(TradeSettings, 1)
    if s is None:
        s = TradeSettings(id=1, master_on=True, per_team_daily_cap=DAILY_CAP_DEFAULT)
        db.add(s)
        db.commit()
    return s


def set_settings(db: Session, *, master_on: bool | None = None,
                 per_team_daily_cap: int | None = None) -> TradeSettings:
    s = get_settings(db)
    if master_on is not None:
        s.master_on = master_on
    if per_team_daily_cap is not None:
        s.per_team_daily_cap = max(0, int(per_team_daily_cap))
    s.updated_at = datetime.now(timezone.utc)
    db.commit()
    return s


def seed_teams(db: Session) -> None:
    specs = {
        "A": dict(name_th="ทีม A · สายเทรนด์", name_en="Team Trend Rider",
                  weekly_target_pct=1.5, interval_hours=4),
        "B": dict(name_th="ทีม B · สายกลับค่า", name_en="Team Mean Reverter",
                  weekly_target_pct=1.0, interval_hours=12),
    }
    for code, sp in specs.items():
        if not db.query(TradeTeam).filter(TradeTeam.code == code).first():
            db.add(TradeTeam(code=code, **sp, status="active"))
    db.commit()


# ── Prices / equity ─────────────────────────────────────────────────────────
COST_IN_PER_TOKEN = 0.14 / 1e6      # $0.14/1M (cache-miss — v4-flash)
COST_OUT_PER_TOKEN = 0.28 / 1e6     # $0.28/1M


def turn_cost(tokens_in: int, tokens_out: int) -> float:
    return tokens_in * COST_IN_PER_TOKEN + tokens_out * COST_OUT_PER_TOKEN
def current_price(price_key: str, unit: str = "pct") -> float | None:
    """ราคาปัจจุบัน: pct → yfinance · bp → macro ล่าสุด (FRED daily)."""
    if unit == "pct":
        return price_service.get_price(price_key)
    try:
        dash = build_dashboard()
        mv = dash.get("values") or {}
        if price_key in mv:
            v = mv[price_key]
            return float(v) if v is not None else None
    except Exception:
        pass
    return None


def team_equity(db: Session, team: TradeTeam) -> float:
    """equity = balance + Σ(margin + unrealized) — สูตรต้นฉบับ (module 50726)."""
    eq = team.balance
    for p in db.query(TradePosition).filter(
            TradePosition.team_id == team.id, TradePosition.status == "open").all():
        mark = current_price(p.market, p.unit)
        if mark is None:
            continue
        dirn = 1 if p.side == "long" else -1
        eq += p.margin_usd + dirn * p.size * (mark - p.entry_px)
    return eq


# ── SL/TP (ทำงานแม้สวิตช์ปิด — ตามต้นฉบับ) ───────────────────────────────────
def check_sl_tp(db: Session) -> list[str]:
    closed = []
    for p in db.query(TradePosition).filter(TradePosition.status == "open").all():
        mark = current_price(p.market, p.unit)
        if mark is None:
            continue
        hit = None
        if p.side == "long":
            if p.sl_pct and mark <= p.entry_px * (1 - p.sl_pct / 100):
                hit = "sl"
            elif p.tp_pct and mark >= p.entry_px * (1 + p.tp_pct / 100):
                hit = "tp"
        else:
            if p.sl_pct and mark >= p.entry_px * (1 + p.sl_pct / 100):
                hit = "sl"
            elif p.tp_pct and mark <= p.entry_px * (1 - p.tp_pct / 100):
                hit = "tp"
        if hit:
            _close_position(db, p, mark, hit)
            closed.append(f"{p.market}:{hit}")
    if closed:
        db.commit()
    return closed


def _close_position(db: Session, p: TradePosition, px: float, how: str) -> None:
    dirn = 1 if p.side == "long" else -1
    pnl = dirn * p.size * (px - p.entry_px)
    p.status = how
    p.close_px = px
    p.closed_at = datetime.now(timezone.utc)
    p.realized_pnl = pnl
    team = db.get(TradeTeam, p.team_id)
    team.balance += p.margin_usd + pnl
    db.flush()


# ── Context (data pack ตามสาย — ทีมเห็นเฉพาะพอร์ตตัวเอง) ─────────────────────
def _macro_values() -> dict:
    try:
        dash = build_dashboard()
        return dash.get("values") or {}
    except Exception:
        return {}


def build_team_context(db: Session, team: TradeTeam, scenario: str = "") -> str:
    snap = build_snapshot(db)
    lines = []
    if team.code == "A":   # technical pack
        quotes = price_service.get_prices(
            ["^GSPC", "^IXIC", "^DJI", "TLT", "BTC-USD", "ETH-USD"])
        lines.append("ราคาปัจจุบัน (yfinance):")
        for k, v in quotes.items():
            if v:
                lines.append(f"  {k}: {v}")
        ms = snap.get("model_scores", {})
        lines.append("คะแนนโมเดล (0-100, ≥60 = สัญญาณ active):")
        for k, v in list(ms.items())[:8]:
            lines.append(f"  {k}: {v}")
    else:                  # macro pack
        mv = _macro_values()
        lines.append("ตัวเลขมหภาค (FRED — ล่าสุด):")
        for k, v in list(mv.items())[:12]:
            lines.append(f"  {k}: {v}")
        for k, rows in list(snap.get("macro_history", {}).items())[:4]:
            if len(rows) >= 6:
                lines.append(f"  {k}: Δ{rows[-1][1] - rows[-6][1]:+.4f} (5 จุด)")
    news = snap.get("news", [])
    if news:
        lines.append("ข่าว top (impact ≥ 70):")
        for n in news[:4]:
            lines.append(f"  [{n.get('impact_score')}] {n.get('title_th') or n.get('title')}")
    # portfolio ตัวเอง (decision 05: ไม่เห็นทีมอื่น)
    lines.append("พอร์ตของเรา:")
    lines.append(f"  เงินสด ${team.balance:,.0f} · capital ${team.capital:,.0f}")
    eq = team_equity(db, team)
    lines.append(f"  equity ~${eq:,.0f} (P&L {((eq - team.capital) / team.capital * 100):+.2f}%)")
    open_pos = db.query(TradePosition).filter(
        TradePosition.team_id == team.id, TradePosition.status == "open").all()
    if open_pos:
        for p in open_pos:
            lines.append(f"  ไม้: {p.market} {p.side} size={p.size:.4f} @{p.entry_px} "
                         f"SL {p.sl_pct}% TP {p.tp_pct}%")
    else:
        lines.append("  ไม้: ไม่มี (พอร์ตว่าง)")
    if scenario:
        lines.insert(0, f"สถานการณ์: {scenario}")
    return "\n".join(lines)


# ── Prompts (จาก prototype 03 — schema ใช้ได้จริง) ───────────────────────────
def _persona_prompt(team: TradeTeam, seat: str) -> str:
    if team.code == "A":
        base = ("คุณเป็นนักวิเคราะห์สายเทรนด์/โมเมนตัมในทีม A (Team Trend Rider) "
                f"พอร์ต ${team.capital:,.0f} เป้าหมาย MTD +5–20% กรอบเวลา 1–7 วัน "
                "ความเสี่ยงต่อไม้ 5–10% ของพอร์ต หลักการ: เข้าเมื่อเทรนด์ชัด "
                "(ราคาเหนือ MA + โมเมนตัม + คะแนนโมเดล ≥60) ตัดขาดทุนไวเมื่อเทรนด์พัง")
    else:
        base = ("คุณเป็นนักวิเคราะห์สายกลับค่า/มหภาคในทีม B (Team Mean Reverter) "
                f"พอร์ต ${team.capital:,.0f} เป้าหมาย MTD +5–20% กรอบเวลา 7–30 วัน "
                "ความเสี่ยงต่อไม้ 2–5% ของพอร์ต หลักการ: เข้าสวนทางสุดขั้ว "
                "(ค่าเบี่ยงเบนสูง + มหภาคสนับสนุนการกลับตัว) อดทนรอจังหวะ ไม่ไล่ราคา")
    role = {"trend": "นักวิเคราะห์เทรนด์ — ดู MA/โมเมนตัม/แนวโน้ม คะแนนโมเดล",
            "technical": "นักวิเคราะห์เทคนิคอล — ดูแนวรับ/ต้าน รูปแบบแท่ง volume",
            "macro": "นักวิเคราะห์มหภาค — ดู FRED (ยิลด์/เงินเฟ้อ/แรงงาน) จุดเปลี่ยน",
            "contrarian": "นักวิเคราะห์สวนฝูง — ดูข่าว impact ตำแหน่งตลาด โอกาสกลับตัว"}[seat]
    return base + "\nบทบาท: " + role


def _lead_prompt(team: TradeTeam) -> str:
    desc = ("ทีม A (สายเทรนด์ 1–7 วัน risk 5–10%)" if team.code == "A"
            else "ทีม B (สายกลับค่า 7–30 วัน risk 2–5%)")
    low, high = RISK_BAND[team.code]
    return (f"คุณเป็นหัวหน้าทีมของ{desc} พอร์ต ${team.capital:,.0f} ฟังข้อเสนอลูกทีม 2 คน "
            f"แล้วเคาะออเดอร์ — size_pct ต้องอยู่ในกรอบ {low}–{high}% ของพอร์ต "
            "ตอบ JSON เท่านั้น: {\"action\": \"open|close|hold\", \"market\": \"BTC-USD\", "
            "\"side\": \"long|short\", \"size_pct\": 5, \"sl_pct\": 2, \"tp_pct\": 4, "
            "\"horizon_days\": 7, \"reason\": \"...\"} — close ต้องระบุ market ของไม้ที่เปิดอยู่")


_ORDER_SCHEMA = ("ตอบ JSON เท่านั้น: {\"action\": \"open|hold\", \"market\": \"BTC-USD\", "
                 "\"side\": \"long|short\", \"size_pct\": 5, \"sl_pct\": 2, \"tp_pct\": 4, "
                 "\"horizon_days\": 7, \"reason\": \"...\"}")


def parse_json_block(content: str) -> dict:
    """Robust JSON extraction — กัน fence/ข้อความรอบ (บทเรียน prototype 03)."""
    if not content:
        return {}
    s = content.strip()
    if "```" in s:
        for chunk in s.split("```"):
            c = chunk.strip()
            if c.startswith("json"):
                c = c[4:].strip()
            if c.startswith("{") and c.endswith("}"):
                try:
                    return json.loads(c)
                except Exception:
                    pass
    try:
        return json.loads(s)
    except Exception:
        pass
    for i in range(len(s)):
        if s[i] == "{":
            depth = 0
            for j in range(i, len(s)):
                if s[j] == "{":
                    depth += 1
                elif s[j] == "}":
                    depth -= 1
                    if depth == 0:
                        try:
                            return json.loads(s[i:j + 1])
                        except Exception:
                            break
    return {}


# ── Turn ────────────────────────────────────────────────────────────────────
def turns_today(db: Session, team_id: str) -> int:
    midnight = local_midnight_utc()
    return db.query(TradeTurn).filter(
        TradeTurn.team_id == team_id, TradeTurn.started_at >= midnight).count()


def _seat_order(team: TradeTeam, seat: str, ctx: str) -> dict:
    content, usage, _ = llm_call(_persona_prompt(team, seat),
                                 f"{ctx}\n\nเสนอไม้ ({_ORDER_SCHEMA})",
                                 temperature=0.4, max_tokens=1500)
    return {"seat": seat, "order": parse_json_block(content), "usage": usage}


def _execute_order(db: Session, team: TradeTeam, order: dict, now: datetime) -> dict:
    action = (order.get("action") or "hold").lower()
    market = order.get("market")
    side = (order.get("side") or "long").lower()
    try:
        size_pct = float(order.get("size_pct") or 0)
    except (TypeError, ValueError):
        size_pct = 0.0
    low, high = RISK_BAND[team.code]
    size_pct = min(max(size_pct, low), high)     # clamp เข้ากรอบทีม
    result = {"action": action, "market": market, "side": side, "size_pct": size_pct}

    if action == "close":
        pos = db.query(TradePosition).filter(
            TradePosition.team_id == team.id, TradePosition.status == "open",
            TradePosition.market == str(market).upper()).first()
        if pos:
            mark = current_price(pos.market, pos.unit)
            if mark:
                _close_position(db, pos, mark, "closed")
                result["closed"] = f"{pos.market} @{mark:.4f}"
        return result

    if action != "open" or not market or size_pct <= 0:
        return result

    resolved = resolve_price_key(str(market), db)
    if not resolved:
        result["skipped"] = "no_price_source"
        return result
    price_key, unit, _group = resolved
    entry = current_price(price_key, unit)
    if entry is None:
        result["skipped"] = "no_current_price"
        return result

    margin = team.balance * size_pct / 100
    if margin <= 0:
        return result
    size = margin / entry
    pos = TradePosition(
        team_id=team.id, market=price_key, unit=unit, side=side, size=size,
        margin_usd=margin, entry_px=entry,
        sl_pct=float(order.get("sl_pct") or 0), tp_pct=float(order.get("tp_pct") or 0))
    db.add(pos)
    team.balance -= margin
    result["opened"] = f"{price_key} {side} size={size:.4f} @{entry:.4f} margin=${margin:,.0f}"
    return result


def run_turn(db: Session, team: TradeTeam, *, manual: bool = False,
             scenario: str = "") -> dict | None:
    """1 เทิร์น = ลูกทีม 2 เสนอ → หัวหน้าเคาะ → execute → snapshot."""
    settings = get_settings(db)
    if not settings.master_on:
        return {"skipped": "master_off"}
    # SQLite คืน naive datetime — เปรียบเทียบกับ naive UTC (กัน aware/naive mismatch)
    if not manual and team.next_turn_at and team.next_turn_at > datetime.utcnow():
        return {"skipped": "not_due"}
    if settings.per_team_daily_cap > 0 and turns_today(db, team.id) >= settings.per_team_daily_cap:
        return {"skipped": "daily_cap"}

    now = datetime.now(timezone.utc)
    ctx = build_team_context(db, team, scenario)
    seats = ["trend", "technical"] if team.code == "A" else ["macro", "contrarian"]

    calls = [_seat_order(team, seat, ctx) for seat in seats]
    offers = "\n".join(f"[{c['seat']}] {json.dumps(c['order'], ensure_ascii=False)}"
                       for c in calls)
    content, usage, _ = llm_call(_lead_prompt(team),
                                 f"{ctx}\n\nข้อเสนอลูกทีม:\n{offers}\n\nเคาะออเดอร์ (JSON เท่านั้น)",
                                 temperature=0.4, max_tokens=1500)
    lead = parse_json_block(content)

    tokens_in = (sum(c["usage"].get("prompt_tokens", 0) for c in calls)
                 + usage.get("prompt_tokens", 0))
    tokens_out = (sum(c["usage"].get("completion_tokens", 0) for c in calls)
                  + usage.get("completion_tokens", 0))
    executed = _execute_order(db, team, lead, now)
    check_sl_tp(db)
    eq = team_equity(db, team)
    db.add(TradeSnapshot(team_id=team.id, equity=eq))
    team.next_turn_at = now + timedelta(hours=team.interval_hours)
    db.add(TradeTurn(
        team_id=team.id, tokens_in=tokens_in, tokens_out=tokens_out,
        cost_usd=turn_cost(tokens_in, tokens_out),
        ended_at=datetime.now(timezone.utc),
        lead_decision=json.dumps(lead, ensure_ascii=False),
        seat_orders=json.dumps([c["order"] for c in calls], ensure_ascii=False)))
    db.commit()
    return {"team": team.code, "lead": lead, "executed": executed, "equity": eq}


def run_due_turns(db: Session, scenario: str = "") -> list[dict]:
    """ฟังก์ชันเดียวที่ย้ายขึ้น pg_cron ได้ — ตรวจ master/โควตา/next_turn → รันเทิร์นที่ครบ."""
    settings = get_settings(db)
    if not settings.master_on:
        return [{"skipped": "master_off"}]
    out = []
    for team in db.query(TradeTeam).order_by(TradeTeam.code).all():
        out.append(run_turn(db, team, scenario=scenario))
    return out


def run_due_turns_background(scenario: str = "") -> None:
    """รันใน background thread (piggyback ตอนเปิดหน้า — ไม่บล็อก request)."""
    def _work():
        db = next(get_db())
        try:
            seed_teams(db)
            run_due_turns(db, scenario)
        finally:
            db.close()
    threading.Thread(target=_work, daemon=True).start()


# ── State (สำหรับ UI) ───────────────────────────────────────────────────────
def build_state(db: Session) -> dict:
    seed_teams(db)
    settings = get_settings(db)
    teams = []
    for team in db.query(TradeTeam).order_by(TradeTeam.code).all():
        eq = team_equity(db, team)
        pnl = ((eq - team.capital) / team.capital * 100) if team.capital else 0.0
        open_pos = db.query(TradePosition).filter(
            TradePosition.team_id == team.id, TradePosition.status == "open").all()
        margin = sum(p.margin_usd for p in open_pos)
        teams.append({
            "id": team.id, "code": team.code, "name_th": team.name_th,
            "name_en": team.name_en, "status": team.status,
            "capital": team.capital, "balance": team.balance, "equity": round(eq, 2),
            "pnl_pct": round(pnl, 2), "margin_used": round(margin, 2),
            "mtd_pct": round(pnl, 2), "weekly_target_pct": team.weekly_target_pct,
            "monthly_floor_pct": team.monthly_floor_pct,
            "monthly_stretch_pct": team.monthly_stretch_pct,
            "interval_hours": team.interval_hours,
            "next_turn_at": team.next_turn_at.isoformat() if team.next_turn_at else None,
            "directive_md": team.directive_md or "",
            "turns_today": turns_today(db, team.id),
            "positions": [{
                "market": p.market, "side": p.side, "size": round(p.size, 4),
                "entry_px": p.entry_px, "sl_pct": p.sl_pct, "tp_pct": p.tp_pct,
                "status": p.status, "realized_pnl": round(p.realized_pnl, 2),
            } for p in open_pos],
        })
    return {
        "master_on": settings.master_on,
        "per_team_daily_cap": settings.per_team_daily_cap,
        "teams": teams,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
