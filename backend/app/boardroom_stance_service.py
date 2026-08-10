# backend/app/boardroom_stance_service.py
"""สัญญาณจากที่ประชุม (boardroom signals) — ticket 02/03 ของแผน boardroom-signals.

อ่านจุดยืน (stances) จาก resolution_json ของประชุม → resolve แหล่งราคาจริง
(ladder 5 ชั้น) → คำนวณ P&L สด / จุดตรวจ +1/+3/+7 / ผลสรุป win-loss-push
on-read จากประวัติราคา (ไม่มี scheduler) → สถิติพร้อม cold-start disclosure.

หลัก:
- แยกจาก trading_signals เด็ดขาด (ตาราง boardroom_stances ของตัวเอง)
- ห้ามเดาราคา — ดึงไม่ได้ = "—" / "ยังไม่ถึงเวลา" / "ตรวจไม่ได้"
- reuse price_service / macro_service / yfinance ที่มีอยู่ ไม่เขียน fetcher ใหม่
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import Column, DateTime, Float, Integer, String, Text, Boolean
from sqlalchemy.orm import Session

from app.database import Base


# ---------------------------------------------------------------------------
# ORM
# ---------------------------------------------------------------------------
class BoardroomStance(Base):
    """หนึ่งจุดยืน (stance) จากมติ — materialize ตอนประชุมจบ (engine hook)."""

    __tablename__ = "boardroom_stances"

    id = Column(String, primary_key=True)
    meeting_id = Column(String, nullable=False, index=True)
    stance_index = Column(Integer, nullable=False, default=0)
    asset = Column(String(64), nullable=False)          # ชื่อที่ AI เขียน
    price_key = Column(String(64), nullable=True)        # แหล่งราคาจริงที่ resolve (ticker / series_id)
    source = Column(String(16), nullable=True)           # alias/yfinance/ticker/fred/system
    unit = Column(String(8), nullable=False, default="pct")   # bp/pct (หลัง validate)
    direction = Column(String(8), nullable=False)        # long/short
    price_at = Column(Float, nullable=True)              # ราคา/ค่าเข้า (จากมติ)
    started_at = Column(DateTime, nullable=False)        # เริ่มนับ (meeting ended)
    due_at = Column(DateTime, nullable=True)             # ended_at + horizon_days (clamp 1-90)
    horizon_days = Column(Integer, nullable=False, default=7)
    confidence = Column(Float, nullable=True)
    consensus = Column(String(16), nullable=True)        # unanimous/contested
    qualified = Column(Boolean, nullable=False, default=True)  # false = "มุมมอง"
    reason = Column(Text, nullable=True)
    unit_mismatch = Column(Boolean, nullable=False, default=False)  # AI เขียน unit ผิด
    created_at = Column(DateTime, nullable=False,
                        default=lambda: datetime.now(timezone.utc))


class BoardroomUnresolvedAsset(Base):
    """สินทรัพย์ที่หาแหล่งราคาไม่เจอ — re-resolve ทุกครั้งที่เปิดหน้า."""

    __tablename__ = "boardroom_unresolved_assets"

    id = Column(String, primary_key=True)
    asset = Column(String(64), nullable=False, index=True)
    meeting_id = Column(String, nullable=True)
    attempts = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False,
                        default=lambda: datetime.now(timezone.utc))
    last_tried_at = Column(DateTime, nullable=True)


# ---------------------------------------------------------------------------
# Asset classification (mirror reference module 18551)
# ---------------------------------------------------------------------------
_YIELD_RE = re.compile(r"^(US|TH|JP|VN|FR|EA)\d{1,3}[YW]$")
_SPREAD_KEYS = {"US_HY_SPREAD", "US_IG_SPREAD", "US_SOFR_EFFR_SPREAD",
                "FR_OAT_BUND_SPREAD", "LA_MOFL_SPREAD"}


def classify_unit(asset: str) -> str:
    """bp สำหรับ yield/spread · pct สำหรับราคา (reference j$/jD)."""
    up = asset.upper()
    if up in _SPREAD_KEYS or _YIELD_RE.match(up):
        return "bp"
    return "pct"


# ---------------------------------------------------------------------------
# Alias map (fast-path ~68 ตัว — ticket 03 ข้อ 2)
# ---------------------------------------------------------------------------
ALIAS_MAP: dict[str, str] = {
    # ทอง/น้ำมัน
    "gold": "XAUUSD", "ทอง": "XAUUSD", "ทองคำ": "XAUUSD", "xauusd": "XAUUSD",
    "oil": "USOIL", "น้ำมัน": "USOIL", "wti": "USOIL", "brent": "USOIL", "usoil": "USOIL",
    # ดัชนีสหรัฐ
    "s&p": "^GSPC", "s&p500": "^GSPC", "spx": "^GSPC", "^gspc": "^GSPC",
    "nasdaq": "^IXIC", "^ixic": "^IXIC", "nas100": "NAS100",
    "dow": "^DJI", "^dji": "^DJI", "russell": "^RUT", "^rut": "^RUT",
    "us500": "US500",
    # ETF
    "tlt": "TLT", "hyg": "HYG", "lqd": "LQD", "kre": "KRE", "xlf": "XLF",
    "spy": "SPY", "qqq": "QQQ", "iwm": "IWM", "gld": "GLD", "slv": "SLV", "uso": "USO",
    # FX
    "dxy": "DX-Y.NYB", "dx-y.nyb": "DX-Y.NYB", "ดอลลาร์": "DX-Y.NYB",
    "eurusd": "EURUSD", "usdjpy": "USDJPY", "usdthb": "USDTHB", "jpy=x": "JPY=X",
    # คริปโต
    "btc": "BTC-USD", "bitcoin": "BTC-USD", "btc-usd": "BTC-USD",
    "eth": "ETH-USD", "ethereum": "ETH-USD", "eth-usd": "ETH-USD",
    # ยีลด์ (FRED — macro keys)
    "us10y": "us10y", "tnx": "us10y", "^tnx": "us10y", "dgs10": "us10y",
    "us2y": "us2y", "dgs2": "us2y",
    "us30y": "us30y", "dgs30": "us30y",
    "us5y": "us5y", "dgs5": "us5y",
    # สเปรด (FRED)
    "hy spread": "us_hy_spread", "us_hy_spread": "us_hy_spread",
    "ig spread": "us_ig_spread", "us_ig_spread": "us_ig_spread",
    # อื่นๆ
    "vix": "^VIX", "^vix": "^VIX",
    # หุ้นสหรัฐ (19)
    "aapl": "AAPL", "apple": "AAPL", "แอปเปิล": "AAPL",
    "msft": "MSFT", "microsoft": "MSFT", "ไมโครซอฟท์": "MSFT",
    "nvda": "NVDA", "nvidia": "NVDA", "เอ็นวิเดีย": "NVDA",
    "googl": "GOOGL", "goog": "GOOGL", "google": "GOOGL", "alphabet": "GOOGL",
    "amzn": "AMZN", "amazon": "AMZN", "แอมะซอน": "AMZN",
    "meta": "META", "facebook": "META",
    "tsla": "TSLA", "tesla": "TSLA", "เทสลา": "TSLA",
    "nflx": "NFLX", "netflix": "NFLX",
    "amd": "AMD",
    "tsm": "TSM", "taiwan semi": "TSM",
    "baba": "BABA", "alibaba": "BABA",
    "jpm": "JPM", "jpmorgan": "JPM",
    "bac": "BAC", "bank of america": "BAC",
    "xom": "XOM", "exxon": "XOM",
    "v": "V", "visa": "V",
    "wmt": "WMT", "walmart": "WMT",
    "ko": "KO", "coca-cola": "KO", "coca cola": "KO",
    "jnj": "JNJ", "johnson": "JNJ",
    "intc": "INTC", "intel": "INTC",
}

# FRED/macro series (unit = bp) — ใช้ macro_service เป็นแหล่ง
MACRO_SERIES = {"us10y", "us2y", "us30y", "us5y", "us_hy_spread", "us_ig_spread"}

# Push line (ticket 02 ข้อ 1 — สูตร reference $p)
PUSH_BP = 4.0
PUSH_PCT = 0.5
CHECK_DAYS = (1, 3, 7)
HORIZON_MAX_DAYS = 90
COLD_START_MIN = 10          # settled < 10 → ไม่โชว์ %
COLD_START_FULL = 50         # ≥ 50 → % + เศษส่วน (advisory tier)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt) -> datetime:
    if dt is None:
        return _now()
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def clamp_horizon(days: Any) -> int:
    try:
        d = int(float(days))
    except (TypeError, ValueError):
        d = 7
    return max(1, min(d, HORIZON_MAX_DAYS))


# ---------------------------------------------------------------------------
# Ladder resolve (ticket 03 ข้อ 1)
# ---------------------------------------------------------------------------
def _yf_search(query: str) -> str | None:
    """yfinance search → best ticker (ชั้น 2 ของ ladder)."""
    import yfinance as yf
    try:
        res = yf.Search(query, max_results=5)
        for q in (res.quotes or []):
            t = q.get("symbol")
            qt = q.get("quoteType", "")
            if t and qt in ("EQUITY", "ETF", "INDEX", "CURRENCY", "FUTURE", "CRYPTOCURRENCY"):
                return str(t)
    except Exception:
        pass
    return None


def resolve_price_key(asset: str, db: Session | None = None) -> tuple[str, str, str] | None:
    """(price_key, source, unit) — ladder: alias → yfinance search → FRED/system.

    ชั้น FRED/system: ถ้า asset ตรง macro series keys ที่รู้จัก (เช่น AI เขียน
    us10y/US10Y/DGS10) → ใช้ series_id. ตัวที่เหลือ (ไม่ใช่ alias) ตกชั้น search.
    """
    key = asset.strip().lower()
    if key in ALIAS_MAP:
        pk = ALIAS_MAP[key]
        return pk, "alias", classify_unit(pk)
    up = asset.strip().upper()
    if up in MACRO_SERIES:
        return up, "system", "bp"
    if _YIELD_RE.match(up) or up in _SPREAD_KEYS:
        # yield/spread ชื่อตรงตาม pattern แต่ไม่มี series ในระบบ → หา FRED ไม่ได้ (ไม่มี key)
        return None
    ticker = _yf_search(asset.strip())
    if ticker:
        return ticker, "yfinance", "pct"
    return None


# ---------------------------------------------------------------------------
# ราคา/ประวัติ (reuse price_service / macro_service / yfinance)
# ---------------------------------------------------------------------------
def _macro_data() -> dict[str, Any]:
    """{values: {series_id: value}, history: {series_id: [[date, value]]}} — FRED.

    history มาจาก macro_service.fred_history_map() (cache 6 ชม.) — เดิมอ่าน
    items.rows/history ที่ไม่มีอยู่จริง → ว่างถาวร (dead-read fix 2026-08-10)
    """
    from app import macro_service
    out: dict[str, Any] = {"values": {}, "history": {}}
    dash = macro_service.build_dashboard()
    fred_ids: dict[str, str] = {}   # series_id ภายใน → FRED id
    for sec in dash.get("sections", []):
        for it in sec.get("items", []):
            sid = it.get("series_id")
            if not sid:
                continue
            if it.get("available") and it.get("value") is not None:
                out["values"][sid] = float(it["value"])
            cfg = macro_service._SERIES.get(sid) or {}
            if cfg.get("fred"):
                fred_ids[sid] = cfg["fred"]
    if fred_ids:
        inv = {frid: sid for sid, frid in fred_ids.items()}
        for frid, rows in macro_service.fred_history_map(list(fred_ids.values())).items():
            sid = inv.get(frid, frid)
            out["history"][sid] = [[str(r[0]), float(r[1])] for r in rows]
    return out


def _yf_candles(ticker: str) -> list[dict] | None:
    """60 daily candles [{o,h,l,c,t}], oldest first (reuse signals_service)."""
    from app.signals_service import _yf_candles as yf_c
    try:
        return yf_c(ticker)
    except Exception:
        return None


def current_price(price_key: str, unit: str) -> tuple[float | None, str | None]:
    """(ราคาปัจจุบัน, quote_at) — bp → macro (FRED รายวัน) · pct → yfinance."""
    if unit == "bp":
        md = _macro_data()
        val = md["values"].get(price_key)
        return (val, None) if val is not None else (None, None)
    from app import price_service
    try:
        price = price_service.get_price(price_key)
        return (price, None) if price is not None else (None, None)
    except Exception:
        return None, None


def price_history(price_key: str, unit: str) -> list[tuple[str, float]]:
    """[(date, value)] เก่ามาก่อน — bp → FRED history · pct → yfinance candles."""
    if unit == "bp":
        md = _macro_data()
        rows = md["history"].get(price_key) or []
        return [(str(r[0]), float(r[1])) for r in rows]
    candles = _yf_candles(price_key) or []
    return [(c["t"], float(c["c"])) for c in candles]


def _price_at_date(history: list[tuple[str, float]], target: datetime) -> float | None:
    """close ของวันซื้อขายล่าสุด ≤ target (วันหยุดเลื่อน — ตาม ticket 02)."""
    best: tuple[str, float] | None = None
    for date_str, val in history:
        try:
            d = datetime.fromisoformat(date_str[:10])
        except ValueError:
            continue
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        if d <= target and (best is None or d > datetime.fromisoformat(best[0][:10]).replace(tzinfo=timezone.utc)):
            best = (date_str, val)
    return best[1] if best else None


# ---------------------------------------------------------------------------
# P&L / settlement (ticket 02/03)
# ---------------------------------------------------------------------------
def pnl_score(current: float | None, price_at: float | None, unit: str,
              direction: str) -> float | None:
    """P&L ตามกลุ่ม (reference m$ × direction) — เดิมพันทิศทาง series ตรงๆ."""
    if current is None or price_at is None or not direction:
        return None
    raw = (current - price_at) * 100 if unit == "bp" else (
        (current - price_at) / abs(price_at) * 100 if price_at else None)
    if raw is None:
        return None
    return raw * (1 if direction == "long" else -1)


def push_line(unit: str, horizon_days: int) -> float:
    import math
    base = PUSH_BP if unit == "bp" else PUSH_PCT
    return base * math.sqrt(max(1, horizon_days) / 3.0)


def settle(score: float | None, unit: str, horizon_days: int) -> str | None:
    """win/loss/push — score ต้องเกิน push_line (ticket 02 ข้อ 1)."""
    if score is None:
        return None
    line = push_line(unit, horizon_days)
    if score > line:
        return "win"
    if score < -line:
        return "loss"
    return "push"


# ---------------------------------------------------------------------------
# Materialize (engine hook — เรียกตอนประชุมจบ)
# ---------------------------------------------------------------------------
def materialize_stances(db: Session, meeting_id: str, rj: dict,
                        ended_at: datetime | None = None) -> int:
    """อ่าน stances จาก resolution_json → เขียน boardroom_stances + unresolved log.

    ใช้ได้กับมติจากเครื่องยนต์ของเรา (schema ใหม่มี unit/due_at/qualified) และ
    มติเก่า (derive แทน). คืนจำนวนสัญญาณที่ materialize.
    """
    stances = (rj or {}).get("stances") or []
    started = _as_utc(ended_at)
    count = 0
    for i, s in enumerate(stances):
        asset = str(s.get("asset") or "").strip()
        stance_dir = str(s.get("stance") or "").lower()
        if not asset or stance_dir in ("neutral", "insufficient_evidence"):
            continue
        resolved = resolve_price_key(asset, db)
        if resolved is None:
            db.add(BoardroomUnresolvedAsset(
                id=_new_id("u"), asset=asset[:60], meeting_id=meeting_id, attempts=1,
                last_tried_at=_now()))
            db.commit()
            continue
        price_key, source, derived_unit = resolved
        # unit: AI เขียน (bp/pct) — validate ตรงกับ derived (ticket 03 ข้อ 5)
        ai_unit = str(s.get("unit") or "").lower()
        unit = ai_unit if ai_unit in ("bp", "pct") else derived_unit
        mismatch = bool(ai_unit in ("bp", "pct")) and ai_unit != derived_unit
        if mismatch:
            unit = derived_unit  # derived เป็น authoritative — กันกลับทิศ
        hd = clamp_horizon(s.get("horizon_days") or 7)
        due_raw = s.get("due_at")
        if due_raw:
            try:
                due = datetime.fromisoformat(str(due_raw).replace("Z", "+00:00"))
            except ValueError:
                due = started + timedelta(days=hd)
        else:
            due = started + timedelta(days=hd)
        qual = s.get("qualified")
        if qual is None:
            qual = (s.get("confidence") or 0) >= 60  # default จาก conf (semantics brSigViewsDesc)
        db.add(BoardroomStance(
            id=_new_id("st"), meeting_id=meeting_id, stance_index=i,
            asset=asset[:60], price_key=price_key, source=source,
            unit=unit, direction=stance_dir,
            price_at=_to_float(s.get("price_at")),
            started_at=started, due_at=due, horizon_days=hd,
            confidence=_to_float(s.get("confidence")),
            consensus=str(s.get("consensus") or ""),
            qualified=bool(qual),
            reason=(str(s.get("reason") or ""))[:400],
            unit_mismatch=mismatch,
        ))
        count += 1
    db.commit()
    return count


def _to_float(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# On-read: สัญญาณ + สถิติ (ไม่มี scheduler — คำนวณสดจากประวัติ)
# ---------------------------------------------------------------------------
def _checks_for(st: BoardroomStance) -> list[dict]:
    """จุดตรวจ +1/+3/+7: {k, correct(bool|null), change_pct, unit}."""
    hist = price_history(st.price_key, st.unit)
    out = []
    for n in CHECK_DAYS:
        target = _as_utc(st.started_at) + timedelta(days=n)
        px = _price_at_date(hist, target)
        if px is None:
            out.append({"k": f"d{n}", "correct": None, "change_pct": None, "unit": st.unit})
            continue
        score = pnl_score(px, st.price_at, st.unit, st.direction)
        verdict = settle(score, st.unit, st.horizon_days)
        out.append({"k": f"d{n}", "correct": True if verdict == "win" else
                    (False if verdict == "loss" else None),
                    "change_pct": score, "unit": st.unit})
    return out


def _settlement_for(st: BoardroomStance) -> dict | None:
    """ผลสรุปตอนครบกำหนด — คำนวณสด (deterministic)."""
    now = _now()
    due = _as_utc(st.due_at)
    if now < due:
        return None
    hist = price_history(st.price_key, st.unit)
    px = _price_at_date(hist, due)
    if px is None:
        return {"verdict": None, "state": "awaiting"}  # ราคายังมาไม่ถึง/ดึงไม่ได้
    score = pnl_score(px, st.price_at, st.unit, st.direction)
    return {"verdict": settle(score, st.unit, st.horizon_days),
            "change_pct": score, "price": px, "state": "settled"}


def _dd_for(st: BoardroomStance, candles: list[dict]) -> float | None:
    """Max adverse excursion (reference module 26079 IQ) — % จากราคาเข้า, ≤ 0."""
    if not candles or not st.price_at:
        return None
    start = _as_utc(st.started_at).date().isoformat()
    due = _as_utc(st.due_at).date().isoformat()
    extremes = []
    for c in candles:
        t = str(c.get("t") or "")[:10]
        if t > start and t <= due:
            extremes.append(c)
    if not extremes:
        return None
    if st.direction == "long":
        worst = min(float(c["l"]) for c in extremes if c.get("l") is not None)
        dd = (worst - st.price_at) / st.price_at * 100
    else:
        worst = max(float(c["h"]) for c in extremes if c.get("h") is not None)
        dd = (st.price_at - worst) / st.price_at * 100
    return min(0.0, dd)


def build_stances_payload(db: Session) -> dict:
    """GET /api/boardroom/stances — สัญญาณทั้งหมด + สถิติ (cold-start disclosure)."""
    # re-resolve (ticket 03): ลองใหม่กับ unresolved — แคป 10/ครั้ง
    _re_resolve(db)

    stances = (db.query(BoardroomStance)
               .order_by(BoardroomStance.started_at.desc()).all())

    # ราคาปัจจุบันทีละตัว (กลุ่ม bp ใช้ macro ชุดเดียว — fetch ครั้งเดียว)
    macro_vals: dict[str, float] = {}
    if any(s.unit == "bp" for s in stances):
        macro_vals = _macro_data()["values"]

    rows = []
    settled_rows = []
    for st in stances:
        if st.unit == "bp":
            cur = macro_vals.get(st.price_key)
            quote_at = None
        else:
            from app import price_service
            cur = price_service.get_price(st.price_key) if st.price_key else None
            quote_at = None
        live = pnl_score(cur, st.price_at, st.unit, st.direction)
        settle_res = _settlement_for(st)
        checks = _checks_for(st)
        candles = _yf_candles(st.price_key) if st.unit == "pct" and st.price_key else None
        dd = _dd_for(st, candles or [])
        state = (settle_res or {}).get("state", "pending") if settle_res else "pending"
        if state == "awaiting" and st.price_key is None:
            state = "unresolved"
        rows.append({
            "id": st.id, "meeting_id": st.meeting_id, "asset": st.asset,
            "price_key": st.price_key, "source": st.source, "unit": st.unit,
            "direction": st.direction, "price_at": st.price_at,
            "current": cur, "pnl": live, "dd": dd,
            "due_at": st.due_at.isoformat() if st.due_at else None,
            "started_at": st.started_at.isoformat(),
            "horizon_days": st.horizon_days, "confidence": st.confidence,
            "consensus": st.consensus, "qualified": st.qualified,
            "reason": st.reason, "unit_mismatch": st.unit_mismatch,
            "state": state, "verdict": (settle_res or {}).get("verdict"),
            "checks": checks,
        })
        if st.qualified and settle_res and settle_res.get("verdict") in ("win", "loss", "push"):
            settled_rows.append({
                "asset": st.asset, "unit": st.unit, "verdict": settle_res["verdict"],
                "realized": settle_res.get("change_pct"),
            })

    stats = _compute_stats(rows, settled_rows)
    return {"stances": rows, "stats": stats}


def _re_resolve(db: Session) -> None:
    """Re-resolve unresolved (alias โต/แหล่งใหม่) — แคป 10 ครั้ง/เรียก."""
    pending = (db.query(BoardroomUnresolvedAsset)
               .order_by(BoardroomUnresolvedAsset.created_at.desc()).limit(10).all())
    for u in pending:
        resolved = resolve_price_key(u.asset, db)
        if resolved is None:
            u.attempts = (u.attempts or 0) + 1
            u.last_tried_at = _now()
            continue
        # เจอแล้ว → ไปแก้ stances ที่อ้าง asset นี้ (ยังไม่ due — ยังนับผลได้)
        sts = (db.query(BoardroomStance)
               .filter(BoardroomStance.asset == u.asset,
                       BoardroomStance.price_key.is_(None)).all())
        pk, source, unit = resolved
        for st in sts:
            st.price_key = pk
            st.source = source
            if st.unit != unit and st.unit_mismatch is False:
                st.unit = unit
        db.delete(u)
    db.commit()


def _compute_stats(rows: list[dict], settled_rows: list[dict]) -> dict:
    """win rate + P&L เฉลี่ย (แยกกลุ่ม pct/bp) + track record + checks summary."""
    wins = sum(1 for r in settled_rows if r["verdict"] == "win")
    losses = sum(1 for r in settled_rows if r["verdict"] == "loss")
    pushes = sum(1 for r in settled_rows if r["verdict"] == "push")
    n = wins + losses
    win_rate = round(wins / n * 100) if n >= COLD_START_MIN else None
    if n >= COLD_START_MIN and n < COLD_START_FULL:
        win_rate_display = f"{win_rate}% ({wins}W/{losses}L)"
    elif n >= COLD_START_FULL:
        win_rate_display = f"{win_rate}% ({wins}W/{losses}L)"
    else:
        win_rate_display = None

    def _avg(group_rows: list[dict], field: str):
        vals = [r[field] for r in group_rows if r.get(field) is not None]
        return (sum(vals) / len(vals), len(vals)) if vals else (None, 0)

    live_pct, live_pct_n = _avg([r for r in rows if r["qualified"] and r["unit"] == "pct"
                                 and r["state"] in ("pending",)], "pnl")
    live_bp, live_bp_n = _avg([r for r in rows if r["qualified"] and r["unit"] == "bp"
                               and r["state"] in ("pending",)], "pnl")
    real_pct, real_pct_n = _avg([r for r in settled_rows if r["unit"] == "pct"], "realized")
    real_bp, real_bp_n = _avg([r for r in settled_rows if r["unit"] == "bp"], "realized")

    # track record รายสินทรัพย์ (เฉพาะ settled qualified)
    by_asset: dict[str, dict] = {}
    for r in settled_rows:
        a = by_asset.setdefault(r["asset"], {"wins": 0, "losses": 0, "pushes": 0,
                                             "sum": 0.0, "cnt": 0, "unit": r["unit"]})
        if r["verdict"] == "win":
            a["wins"] += 1
        elif r["verdict"] == "loss":
            a["losses"] += 1
        else:
            a["pushes"] += 1
        if r["realized"] is not None:
            a["sum"] += r["realized"]
            a["cnt"] += 1
    track = []
    for asset, a in by_asset.items():
        nn = a["wins"] + a["losses"]
        track.append({
            "asset": asset, "unit": a["unit"], "wins": a["wins"], "losses": a["losses"],
            "pushes": a["pushes"],
            "win_pct": round(a["wins"] / nn * 100) if nn >= COLD_START_MIN else None,
            "avg": (a["sum"] / a["cnt"]) if a["cnt"] else None,
        })
    track.sort(key=lambda t: -(t["wins"] + t["losses"]))

    # checks summary d1/d3/d7 (judged < 10 → รอข้อมูลเพิ่ม)
    checks_summary = []
    for k in ("d1", "d3", "d7"):
        judged = wins_k = 0
        for r in rows:
            if not r["qualified"]:
                continue
            for c in r["checks"]:
                if c["k"] == k and c["correct"] is not None:
                    judged += 1
                    if c["correct"]:
                        wins_k += 1
        checks_summary.append({
            "k": k, "judged": judged,
            "pct": round(wins_k / judged * 100) if judged >= COLD_START_MIN else None,
            "wins": wins_k,
        })

    return {
        "pending_count": sum(1 for r in rows if r["qualified"] and r["state"] == "pending"),
        "settled_count": n,
        "win_rate": win_rate,
        "win_rate_display": win_rate_display,
        "wins": wins, "losses": losses, "pushes": pushes,
        "n": n, "cold_start": n < COLD_START_MIN,
        "pnl_live": {"pct": live_pct, "bp": live_bp, "pct_n": live_pct_n, "bp_n": live_bp_n},
        "pnl_realized": {"pct": real_pct, "bp": real_bp, "pct_n": real_pct_n, "bp_n": real_bp_n},
        "track_record": track,
        "checks_summary": checks_summary,
    }
