# backend/app/boardroom_service.py
"""ห้องประชุม AI (Boardroom) — 7-seat AI meeting engine on DeepSeek.

Mirrors the reference site's /boardroom: a multi-turn meeting where AI
personas debate real app data and only claims that pass code verification
may enter the resolution. Design decisions locked in wayfinder tickets
02/03/04/05 (see .scratch/boardroom/):

- 7 seats: เจมส์ (CEO), แมวมอง, นักเศรษฐศาสตร์มหภาค, เครดิต/บอนด์,
  เทคนิคอล, ผู้ท้าทาย A, ผู้ท้าทาย B — all DeepSeek deepseek-v4-flash,
  different personas/contexts (correlated bias accepted, mitigated by
  challenger design + code verification).
- Full mode (manual): opening → research → briefing(5 blind) → debate r1(5)
  → [evidence + external_data if data requests] → debate r2(5, only if
  contested) → verification(2) → resolution(CEO JSON).
- Short mode (auto triggers): the 5 mandatory phases only (no research /
  evidence / external_data).
- Claims are structured JSON from the seat itself (ticket 04): code
  verifies numbers against a snapshot taken at meeting open; the LLM only
  reviews logic. Verdicts: verified / partial (direction ok, magnitude off)
  / failed / unverifiable(no_data | opinion).
- Safety caps (ticket 02): 40 calls, 120s per call, 30 min per meeting,
  1 retry on transient — exceed → status failed + error.
- Memory (ticket 05): proven conclusions stored with confidence that decays
  by half-life; injected into future meetings (conf >= 60, max 10) and
  re-checked against current data by the challengers (challenged → conf*0.5,
  2 consecutive → retired).

Every LLM call counts llm_calls / tokens_in / tokens_out (principle #4).
"""

from __future__ import annotations

import json
import math
import os
import re
import secrets
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import Column, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Session

from app.database import Base
from app.news_service import DEEPSEEK_MODEL, DEEPSEEK_URL, _deepseek_key

# ---------------------------------------------------------------------------
# Safety caps (ticket 02)
# ---------------------------------------------------------------------------
CAP_MAX_CALLS = 40
CAP_CALL_TIMEOUT_S = 120
CAP_MEETING_TIMEOUT_S = 30 * 60
RETRIES = 1

# Memory (ticket 05)
MEMORY_INJECT_MIN_CONF = 60.0
MEMORY_INJECT_MAX = 10
KNOWLEDGE_INJECT_MAX = 8
MEMORY_STATEMENT_MAX_CHARS = 200
CONF0_UNANIMOUS = 85.0
CONF0_CONTESTED = 70.0
CONF0_PARTIAL = 55.0
RETIRE_CONF = 30.0
REAFFIRM_BONUS = 5.0
CHALLENGE_MULT = 0.5

# Staleness TTL by category (days) — same table the reference uses on its
# knowledge page (reverse-engineered from its chunk 7317).
CATEGORY_TTL_DAYS = {
    "policy": 60, "rates": 60, "flows": 14, "positioning": 14,
    "macro_data": 45, "ratings": 365, "liquidity": 30, "earnings": 90,
    "geopolitics": 45, "other": 90,
}

# ---------------------------------------------------------------------------
# ORM
# ---------------------------------------------------------------------------
class BoardroomMeeting(Base):
    __tablename__ = "boardroom_meetings"
    id = Column(String, primary_key=True)
    status = Column(String, nullable=False, default="running")   # running/completed/failed/cancelled
    phase = Column(String, nullable=False, default="opening")
    current_turn = Column(Integer, nullable=False, default=0)
    turn_plan = Column(Text, nullable=False, default="[]")       # JSON [{phase, seat}]
    agenda = Column(Text, nullable=False, default="")
    trigger_type = Column(String, nullable=False, default="manual")  # manual/news/model/calendar
    mode = Column(String, nullable=False, default="full")        # full/short
    resolution_md = Column(Text, nullable=True)
    resolution_json = Column(Text, nullable=True)
    snapshot = Column(Text, nullable=True)                       # data snapshot at open
    claim_until = Column(DateTime, nullable=True)
    llm_calls = Column(Integer, nullable=False, default=0)
    tokens_in = Column(Integer, nullable=False, default=0)
    tokens_out = Column(Integer, nullable=False, default=0)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    ended_at = Column(DateTime, nullable=True)


class BoardroomMessage(Base):
    __tablename__ = "boardroom_messages"
    id = Column(String, primary_key=True)
    meeting_id = Column(String, nullable=False, index=True)
    turn = Column(Integer, nullable=False)
    phase = Column(String, nullable=False)
    seat_id = Column(String, nullable=False)
    kind = Column(String, nullable=False, default="speech")  # opening/research/brief/rebuttal/attack/review/resolution/skip/error
    content_md = Column(Text, nullable=False, default="")
    evidence = Column(Text, nullable=True)                     # JSON: {stance, claims_parsed...}
    status = Column(String, nullable=False, default="ok")      # ok/skipped/error
    error = Column(Text, nullable=True)
    model_used = Column(String, nullable=True)
    tokens_in = Column(Integer, nullable=False, default=0)
    tokens_out = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))


class BoardroomClaim(Base):
    __tablename__ = "boardroom_claims"
    id = Column(String, primary_key=True)
    meeting_id = Column(String, nullable=False, index=True)
    message_id = Column(String, nullable=False)
    seat_id = Column(String, nullable=False)
    phase = Column(String, nullable=False)
    claim_text = Column(Text, nullable=False)
    metric = Column(String, nullable=True)
    expected = Column(Text, nullable=True)                     # JSON {value, unit, window_days, direction}
    verdict = Column(String, nullable=False, default="unverifiable")  # verified/partial/failed/unverifiable
    sub_reason = Column(String, nullable=True)                 # no_data | opinion | magnitude | wrong_direction | ...
    reason = Column(Text, nullable=True)
    checks = Column(Text, nullable=True)                       # JSON [{source, actual, expected, ok}]
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))


class BoardroomSeat(Base):
    __tablename__ = "boardroom_seats"
    seat_id = Column(String, primary_key=True)
    position_key = Column(String, nullable=False)
    provider = Column(String, nullable=False, default="deepseek")
    model = Column(String, nullable=False, default=DEEPSEEK_MODEL)
    name_th = Column(String, nullable=False)
    name_en = Column(String, nullable=False)
    enabled = Column(Integer, nullable=False, default=1)
    sort = Column(Integer, nullable=False, default=0)


class BoardroomMemory(Base):
    __tablename__ = "boardroom_memory"
    id = Column(String, primary_key=True)
    statement_md = Column(Text, nullable=False)
    tags = Column(Text, nullable=True)                         # JSON list
    confidence = Column(Float, nullable=False, default=0.0)
    status = Column(String, nullable=False, default="active")  # active/challenged/retired
    source_meeting_id = Column(String, nullable=True)
    category = Column(String, nullable=False, default="other")
    last_checked_meeting_id = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))


class BoardroomKnowledge(Base):
    __tablename__ = "boardroom_knowledge"
    id = Column(String, primary_key=True)
    title = Column(Text, nullable=False)
    statement = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="active")  # active/challenged/superseded/retired
    source_type = Column(String, nullable=False, default="web_research")  # web_research/model
    source_ref = Column(Text, nullable=True)
    as_of = Column(String, nullable=True)
    category = Column(String, nullable=False, default="other")
    votes = Column(Text, nullable=True)                        # JSON {by:[{seat_id,adopt,reason}], adopt, reject}
    supersedes = Column(String, nullable=True)
    superseded_by = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))


class BoardroomSeatStats(Base):
    __tablename__ = "boardroom_seat_stats"
    seat_id = Column(String, primary_key=True)
    meetings = Column(Integer, nullable=False, default=0)
    claims_total = Column(Integer, nullable=False, default=0)
    claims_verified = Column(Integer, nullable=False, default=0)
    claims_partial = Column(Integer, nullable=False, default=0)
    claims_failed = Column(Integer, nullable=False, default=0)
    stances_total = Column(Integer, nullable=False, default=0)
    stances_correct = Column(Integer, nullable=False, default=0)


# ---------------------------------------------------------------------------
# Seats (ticket 02 — 7 seats, Thai personas)
# ---------------------------------------------------------------------------
SEATS: dict[str, dict] = {
    "ceo": {
        "position_key": "ceo", "name_th": "เจมส์ (CEO)", "name_en": "James (CEO)",
        "role": "ประธานที่ประชุม — เปิดวาระ ตั้งคำถาม และสรุปมติจากข้อสรุปที่ผ่านการพิสูจน์เท่านั้น",
        "sort": 0,
    },
    "scout": {
        "position_key": "research", "name_th": "แมวมอง (วิจัยภายนอก)", "name_en": "Scout (Outside Research)",
        "role": "ค้นข้อเท็จจริง/ตัวเลขภายนอกพร้อมแหล่งที่มา — ไม่แสดงความเห็นตลาด",
        "sort": 1,
    },
    "macro": {
        "position_key": "macro", "name_th": "นักเศรษฐศาสตร์มหภาค", "name_en": "Macro Economist",
        "role": "เชี่ยวชาญอัตราดอกเบี้ย เงินเฟ้อ นโยบายการเงิน/การคลัง วัฏจักร — เจ้าภาพสินทรัพย์กลุ่ม yield/rate",
        "sort": 2,
    },
    "credit": {
        "position_key": "credit", "name_th": "นักวิเคราะห์เครดิต/บอนด์", "name_en": "Credit Analyst",
        "role": "เชี่ยวชาญสเปรดเครดิต HY/IG ความเสี่ยงผิดนัดชำระ สภาพคล่อง — เจ้าภาพสินทรัพย์กลุ่ม spread",
        "sort": 3,
    },
    "technical": {
        "position_key": "technical", "name_th": "นักวิเคราะห์เทคนิคอล", "name_en": "Technical Analyst",
        "role": "เชี่ยวชาญแนวโน้ม โมเมนตัม ระดับสำคัญของราคา — เจ้าภาพสินทรัพย์กลุ่มราคา (ทอง น้ำมัน ETF FX)",
        "sort": 4,
    },
    "challenger_a": {
        "position_key": "challenger", "name_th": "ผู้ท้าทาย A", "name_en": "Challenger A",
        "role": "คนค้านหลัก — โจมตีมุมข้อมูล/ตัวเลข ตรวจข้อกล่าวอ้างเทียบข้อมูลจริง (ค้านได้เฉพาะมีหลักฐาน หรือพูดตรงๆ ว่าไม่มีจุดอ่อน)",
        "sort": 5,
    },
    "challenger_b": {
        "position_key": "challenger", "name_th": "ผู้ท้าทาย B", "name_en": "Challenger B",
        "role": "คนค้านมุมสอง — โจมตีมุมตรรกะ/สมมติฐานที่ A ยังไม่แตะ ตรวจซ้ำจากมุมอิสระ",
        "sort": 6,
    },
}

FOCUS: dict[str, str] = {
    "macro": "ให้ความสำคัญกับอัตราดอกเบี้ย เงินเฟ้อ นโยบายเฟด เส้นอัตราผลตอบแทน ก่อนตัวเลขอื่น",
    "credit": "ให้ความสำคัญกับสเปรดเครดิต HY/IG สภาพคล่อง ความเสี่ยงเชิงระบบ ก่อนตัวเลขอื่น",
    "technical": "ให้ความสำคัญกับระดับราคา แนวโน้ม โมเมนตัม ของสินทรัพย์ที่เกี่ยวข้อง ก่อนตัวเลขอื่น",
}

RULES = """กติกาที่ห้ามละเมิด (สำคัญที่สุด):
1. ทุกตัวเลขต้องมาจาก [ข้อมูลระบบ] เท่านั้น — ห้ามแต่งตัวเลข ห้ามใช้ตัวเลขจากความจำของโมเดลเด็ดขาด
2. ข้อมูลใดไม่มีใน [ข้อมูลระบบ] ให้เขียน "—" หรือ "หาไม่เจอ" ตรงๆ
3. ตัวเลข/ระดับที่คุณตั้งเป็นฉากทัศน์สมมติ ต้องเขียน "(สมมติ)" กำกับทุกครั้ง
4. ตอบเป็นภาษาไทยเท่านั้น
5. ห้ามอ้างข้อความหรือตัวเลขที่ไม่มีจริงในบทสนทนาก่อนหน้า"""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _age_seconds(dt: datetime | None) -> float:
    if dt is None:
        return 0.0
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (_now() - dt).total_seconds()


def _parse_json_block(text: str) -> tuple[str, dict | None]:
    """Strip a trailing JSON claims block from a message; return (clean_text, json).

    Accepts a ```json ... ``` fenced block, a raw JSON object tail starting at
    the last '{"claims"' (the reference site strips the same way), or a whole
    JSON object (used for the resolution turn).
    """
    stripped = text.strip()
    if stripped.startswith("{"):
        try:
            return "", json.loads(stripped)
        except json.JSONDecodeError:
            pass
    fenced = re.findall(r"```json\s*(\{[\s\S]*?\})\s*```", text)
    if fenced:
        try:
            data = json.loads(fenced[-1])
            return re.sub(r"```json\s*\{[\s\S]*?\}\s*```\s*$", "", text).rstrip(), data
        except json.JSONDecodeError:
            pass
    idx = max(text.rfind('{"claims"'), text.rfind('{"reviews"'), text.rfind('{"stance"'))
    if idx > 0 and len(text) - idx <= 1200:
        tail = text[idx:]
        # find the matching closing brace
        depth = 0
        for i, ch in enumerate(tail):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        data = json.loads(tail[: i + 1])
                        return text[:idx].rstrip(), data
                    except json.JSONDecodeError:
                        break
    return text, None


def _parse_stance(text: str) -> tuple[str | None, str | None]:
    """First 'จุดยืน:' line -> (asset, direction)."""
    for line in text.splitlines():
        if "จุดยืน:" not in line:
            continue
        m = re.search(r"จุดยืน:\s*([A-Za-z0-9_.\-/^]+)?\s*([a-zA-Z]+)", line)
        if m:
            return m.group(1), m.group(2)
    return None, None


def _extract_lines(text: str, prefix: str) -> list[str]:
    out = []
    for line in text.splitlines():
        s = line.strip()
        if s.startswith(prefix) or s.startswith(f"- {prefix}"):
            out.append(s.split(":", 1)[1].strip()[:200])
    return out


# ---------------------------------------------------------------------------
# Claim verification (ticket 04 — code, not LLM)
# ---------------------------------------------------------------------------
def _series_value(snapshot: dict, metric: str) -> float | None:
    """Current value of a series from the meeting snapshot."""
    macro = snapshot.get("macro_values") or {}
    if metric in macro:
        return macro[metric]
    models = snapshot.get("model_scores") or {}
    if metric in models:
        return models[metric]
    return None


def verify_claim(claim: dict, snapshot: dict) -> dict:
    """Verify one structured claim against the snapshot (ticket 04 rules).

    claim: {claim, metric, expected:{value, unit, window_days, direction}}
    Returns {verdict, sub_reason, reason, checks}.
    """
    metric = (claim.get("metric") or "").strip()
    text = (claim.get("claim") or "").strip()[:400]
    exp = claim.get("expected") or {}
    direction = (exp.get("direction") or "").lower()
    unit = (exp.get("unit") or "").lower()

    # -- opinion / not a fact -------------------------------------------------
    if not metric:
        return {"verdict": "unverifiable", "sub_reason": "opinion",
                "reason": "เป็นความเห็น/การตีความ ไม่ใช่ข้อเท็จจริงที่ตรวจด้วยตัวเลขได้",
                "checks": []}

    actual = _series_value(snapshot, metric)
    if actual is None:
        return {"verdict": "unverifiable", "sub_reason": "no_data",
                "reason": f"ระบบไม่มีข้อมูล series '{metric}' (หรือไม่มีค่า ณ เวลาประชุม)",
                "checks": []}

    exp_value = exp.get("value")
    checks: list[dict] = []

    # model-score claims: tight absolute tolerance
    if metric in (snapshot.get("model_scores") or {}):
        if exp_value is None:
            return {"verdict": "unverifiable", "sub_reason": "no_data",
                    "reason": "อ้างคะแนนโมเดลโดยไม่ระบุค่า", "checks": []}
        diff = abs(float(exp_value) - actual)
        ok = diff <= 1.0
        return {"verdict": "verified" if ok else "failed",
                "sub_reason": None if ok else "wrong_value",
                "reason": f"คะแนนจริง {actual:g} vs อ้าง {exp_value:g}",
                "checks": [{"metric": metric, "actual": actual, "expected": exp_value, "ok": ok}]}

    # direction-only claim (no value) — compare against current trend
    if exp_value is None and direction:
        trend = _direction_of(snapshot, metric)
        if trend is None:
            return {"verdict": "unverifiable", "sub_reason": "no_data",
                    "reason": f"หาค่าเปลี่ยนของ '{metric}' ไม่ได้ (ไม่มี history)", "checks": []}
        ok = trend == direction
        return {"verdict": "verified" if ok else "failed",
                "sub_reason": None if ok else "wrong_direction",
                "reason": f"ทิศทางจริง {trend} vs อ้าง {direction}",
                "checks": [{"metric": metric, "actual": trend, "expected": direction, "ok": ok}]}

    if exp_value is None:
        return {"verdict": "unverifiable", "sub_reason": "no_data",
                "reason": "อ้างตัวเลขโดยไม่ระบุค่าเป้าหมาย", "checks": []}

    exp_float = float(exp_value)
    window = int(exp.get("window_days") or 0)

    if window > 0:
        # change claim over a window — compare to the snapshot's recorded change
        change = _change_over(snapshot, metric, window)
        if change is None:
            return {"verdict": "unverifiable", "sub_reason": "no_data",
                    "reason": f"history ไม่พอสำหรับ window {window} วันของ '{metric}'",
                    "checks": []}
        scale = abs(exp_float) if abs(exp_float) >= 1e-9 else 1.0
        floor = 5.0 if unit in ("bps", "bp") else 0.05
        lo = exp_float - max(0.2 * scale, floor)
        hi = exp_float + max(0.2 * scale, floor)
        ok = lo <= change <= hi
        fail_lo = exp_float - max(0.5 * scale, 2 * floor)
        fail_hi = exp_float + max(0.5 * scale, 2 * floor)
        if ok:
            verdict, sub = "verified", None
        elif change < fail_lo or change > fail_hi:
            verdict, sub = "failed", "wrong_value"
        else:
            verdict, sub = "partial", "magnitude"
        reason = f"อ้างเปลี่ยน {exp_float:g}{unit}/{window}d — จริง {change:g}{unit}"
        checks.append({"metric": metric, "actual": change, "expected": exp_float,
                       "window_days": window, "ok": ok})
        return {"verdict": verdict, "sub_reason": sub, "reason": reason, "checks": checks}

    # level claim — reference tolerance: ±2% match / ±5% mismatch (chunk 95090)
    rel = abs(actual)
    tol_lo = max(0.02 * rel, 0.02)
    tol_hi = max(0.05 * rel, 0.05)
    diff = abs(exp_float - actual)
    if diff <= tol_lo:
        verdict, sub = "verified", None
    elif diff > tol_hi:
        verdict, sub = "failed", "wrong_value"
    else:
        verdict, sub = "partial", "magnitude"
    checks.append({"metric": metric, "actual": actual, "expected": exp_float,
                   "tolerance": f"±{tol_lo:.3g}/±{tol_hi:.3g}", "ok": diff <= tol_lo})
    return {"verdict": verdict, "sub_reason": sub,
            "reason": f"อ้าง {exp_float:g}{unit} — จริง {actual:g}{unit} (diff {diff:.4g})",
            "checks": checks}


def _direction_of(snapshot: dict, metric: str) -> str | None:
    chg = _change_over(snapshot, metric, 1)
    if chg is None:
        return None
    if abs(chg) < 1e-12:
        return "flat"
    return "up" if chg > 0 else "down"


def _change_over(snapshot: dict, metric: str, days: int) -> float | None:
    """Change over the last `days` days for a metric, from the snapshot history."""
    hist = (snapshot.get("macro_history") or {}).get(metric) or []
    if len(hist) < 2:
        return None
    # hist: list of [date, value]; find the value `days` days back (or oldest)
    cutoff = _now() - timedelta(days=days)
    ref_val: float | None = None
    for date_str, val in hist:
        try:
            d = datetime.fromisoformat(str(date_str))
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            continue
        if d <= cutoff:
            ref_val = val
    if ref_val is None:
        ref_val = hist[0][1]
    latest = hist[-1][1]
    if ref_val is None or latest is None:
        return None
    return round(latest - ref_val, 6)


# ---------------------------------------------------------------------------
# Context building (real app data only — principle #2)
# ---------------------------------------------------------------------------
def build_snapshot(db: Session) -> dict:
    """Snapshot of real data at meeting open: macro values + history, model
    scores, top news. Used both as prompt context and claim-verification data."""
    from app import macro_service, model_service
    from app.news_service import NewsItem

    dash = macro_service.build_dashboard()
    models = model_service.build_models()

    macro_values: dict[str, float] = {}
    macro_history: dict[str, list] = {}
    for sec in dash.get("sections", []):
        for it in sec.get("items", []):
            sid = it.get("series_id")
            if not sid:
                continue
            if it.get("available") and it.get("value") is not None:
                macro_values[sid] = float(it["value"])
            rows = it.get("rows") or it.get("history")
            if isinstance(rows, list) and rows:
                macro_history[sid] = [[r[0], float(r[1])] for r in rows if len(r) >= 2]

    model_scores: dict[str, float] = {}
    model_names: dict[str, str] = {m.get("model_id"): m.get("name_th") or m.get("model_id")
                                   for m in models.get("meta", [])}
    for m in models.get("models", []):
        if m.get("score") is not None:
            model_scores[m["model_id"]] = float(m["score"])

    news_rows = (db.query(NewsItem)
                 .order_by(NewsItem.impact_score.desc(), NewsItem.published_at.desc())
                 .limit(10).all())
    news = [{"title_th": (n.title_th or n.title or "")[:160],
             "impact": n.impact_score, "source": n.source or "",
             "published_at": str(n.published_at or "")[:16]}
            for n in news_rows]

    return {
        "built_at": _now().isoformat(),
        "macro_values": macro_values,
        "macro_history": macro_history,
        "model_scores": model_scores,
        "model_names": model_names,
        "news": news,
        "reference_prices": {k: macro_values.get(k) for k in
                             ["us10y", "us2y", "us30y", "us_hy_spread", "us_ig_spread",
                              "vix", "xauusd", "dxy", "move", "usoil", "brent"]},
    }


def format_snapshot(snapshot: dict, memory_lines: list[str], knowledge_lines: list[str]) -> str:
    mv = snapshot.get("macro_values") or {}
    mn = snapshot.get("model_names") or {}
    ms = snapshot.get("model_scores") or {}
    news = snapshot.get("news") or []

    macro = "\n".join(
        f"- {sid}: {v:g}" for sid, v in sorted(mv.items())
    ) or "- (ไม่มีข้อมูล)"
    models = "\n".join(
        f"- {mn.get(mid, mid)} ({mid}): คะแนน {v:g}" for mid, v in sorted(ms.items(), key=lambda x: -x[1])
    ) or "- (ไม่มีข้อมูล)"
    news_txt = "\n".join(
        f"- [impact {n['impact']}] {n['title_th']} ({n['source']}, {n['published_at']})" for n in news
    ) or "- (ไม่มีข่าว)"
    mem = "\n".join(f"- M{i + 1}: {line}" for i, line in enumerate(memory_lines)) or "- ยังไม่มี"
    kb = "\n".join(f"- K{i + 1}: {line}" for i, line in enumerate(knowledge_lines)) or "- ยังไม่มี"

    ref = snapshot.get("reference_prices") or {}
    ref_txt = " · ".join(f"{k.upper()}={v:g}" for k, v in ref.items() if v is not None) or "—"

    return (
        f"[ข้อมูลระบบ]\n"
        f"- วันที่ประชุม: {snapshot.get('built_at', '')}\n"
        f"- ราคาอ้างอิง ณ เปิดประชุม: {ref_txt}\n"
        f"- สมองส่วนกลาง (M):\n{mem}\n"
        f"- คลังความรู้ (K):\n{kb}\n\n"
        f"[ตัวเลขมหภาค (จากระบบ)]\n{macro}\n\n"
        f"[คะแนนโมเดล 6 ตัว]\n{models}\n\n"
        f"[ข่าวล่าสุด impact สูง]\n{news_txt}"
    )


def load_injections(db: Session) -> tuple[list[str], list[str]]:
    """Memory (conf>=60, active, top 10) + knowledge (active, top 8)."""
    from sqlalchemy import desc
    mems = (db.query(BoardroomMemory)
            .filter(BoardroomMemory.status.in_(["active", "challenged"]))
            .order_by(desc(BoardroomMemory.confidence))
            .limit(MEMORY_INJECT_MAX).all())
    memory_lines = []
    for m in mems:
        conf = decayed_confidence(m.confidence, m.created_at, m.category)
        if conf < MEMORY_INJECT_MIN_CONF:
            continue
        memory_lines.append(f"{m.statement_md[:120]} (ความมั่นใจ {conf:.0f}%)")
    kbs = (db.query(BoardroomKnowledge)
           .filter(BoardroomKnowledge.status == "active")
           .order_by(BoardroomKnowledge.created_at.desc())
           .limit(KNOWLEDGE_INJECT_MAX).all())
    knowledge_lines = [f"{k.title}: {k.statement[:120]} (ณ {k.as_of or '—'})" for k in kbs]
    return memory_lines, knowledge_lines


# ---------------------------------------------------------------------------
# Memory decay (ticket 05 — deterministic formula)
# ---------------------------------------------------------------------------
def category_ttl_days(category: str) -> int:
    return CATEGORY_TTL_DAYS.get(category, CATEGORY_TTL_DAYS["other"])


def half_life_days(category: str) -> float:
    return category_ttl_days(category) / 2.0


def decayed_confidence(conf0: float, created_at: datetime, category: str) -> float:
    age_days = max(0.0, (_now() - created_at).total_seconds() / 86400.0)
    hl = half_life_days(category)
    return conf0 * (0.5 ** (age_days / hl))


def expires_at_for(as_of: str | None, category: str) -> datetime:
    base = _now()
    if as_of:
        try:
            base = datetime.fromisoformat(as_of)
        except ValueError:
            pass
    return base + timedelta(days=category_ttl_days(category))


# ---------------------------------------------------------------------------
# LLM caller (reuses the news_service pattern — principle: reuse, don't fork)
# ---------------------------------------------------------------------------
class LLMError(RuntimeError):
    pass


def llm_call(system: str, user: str, *, temperature: float = 0.7,
             max_tokens: int = 8000) -> tuple[str, dict, float]:
    """One DeepSeek call. Returns (content, usage, latency_s)."""
    key = _deepseek_key()
    if not key:
        raise LLMError("DEEPSEEK_API_KEY not set")
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": user}],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
        "thinking": {"type": "disabled"},
    }
    last_err: Exception | None = None
    for attempt in range(RETRIES + 1):
        t0 = time.monotonic()
        try:
            r = httpx.post(DEEPSEEK_URL,
                           headers={"Authorization": f"Bearer {key}",
                                    "Content-Type": "application/json"},
                           json=payload, timeout=CAP_CALL_TIMEOUT_S)
        except Exception as e:
            last_err = e
            time.sleep(2 * (attempt + 1))
            continue
        latency = time.monotonic() - t0
        if r.status_code == 200:
            data = r.json()
            usage = data.get("usage") or {}
            return (data["choices"][0]["message"]["content"] or "").strip(), usage, latency
        if 500 <= r.status_code < 600 or r.status_code in (408, 429):
            last_err = LLMError(f"HTTP {r.status_code}: {r.text[:200]}")
            time.sleep(2 * (attempt + 1))
            continue
        if attempt == 0 and "thinking" in payload:
            payload.pop("thinking")
            last_err = LLMError(f"HTTP {r.status_code}: {r.text[:200]}")
            continue
        raise LLMError(f"HTTP {r.status_code}: {r.text[:300]}")
    raise LLMError(f"call failed after {RETRIES + 1} attempts: {last_err}")


# ---------------------------------------------------------------------------
# The engine
# ---------------------------------------------------------------------------
def _seat_prompt(seat_id: str, snapshot: dict, memory_lines: list[str],
                 knowledge_lines: list[str], extra: str = "") -> str:
    seat = SEATS[seat_id]
    focus = FOCUS.get(seat_id, "")
    data_block = format_snapshot(snapshot, memory_lines, knowledge_lines)
    return (
        f"คุณคือ {seat['name_th']} — {seat['role']} ในห้องประชุม AI เพื่อวิเคราะห์ภาวะตลาดบอนด์/สินทรัพย์เสี่ยง\n"
        + (f"โฟกัส: {focus}\n" if focus else "")
        + f"\n{data_block}\n\n{RULES}\n\n{extra}"
    )


def build_turn_plan(mode: str) -> list[dict]:
    """Ticket 02 turn plan. evidence/external_data turns are appended later
    only when the meeting actually produced data requests."""
    analysts = ["macro", "credit", "technical"]
    challengers = ["challenger_a", "challenger_b"]
    turns: list[dict] = []
    turns.append({"phase": "opening", "seat": "ceo", "kind": "opening"})
    if mode == "full":
        turns.append({"phase": "research", "seat": "scout", "kind": "research"})
    for s in analysts + challengers:
        turns.append({"phase": "briefing", "seat": s, "kind": "brief"})
    for s in analysts + challengers:
        turns.append({"phase": "debate_r1", "seat": s, "kind": "rebuttal"})
    # debate_r2 / evidence / external_data are conditionally inserted by the engine
    for c in challengers:
        turns.append({"phase": "verification", "seat": c, "kind": "review"})
    turns.append({"phase": "resolution", "seat": "ceo", "kind": "resolution"})
    return turns


class BoardroomEngine:
    """Runs one turn per advance() call — testable, resumable."""

    def __init__(self, db: Session):
        self.db = db

    # -- lifecycle ---------------------------------------------------------
    def create_meeting(self, agenda: str, trigger_type: str = "manual",
                       mode: str = "full",
                       snapshot: dict | None = None) -> BoardroomMeeting:
        if snapshot is None:
            snapshot = build_snapshot(self.db)
        meeting = BoardroomMeeting(
            id=_new_id("m"),
            status="running",
            phase="opening",
            current_turn=0,
            turn_plan=json.dumps(build_turn_plan(mode), ensure_ascii=False),
            agenda=agenda[:2000],
            trigger_type=trigger_type,
            mode=mode,
            snapshot=json.dumps(snapshot, ensure_ascii=False),
            claim_until=_now() + timedelta(minutes=5),
        )
        self.db.add(meeting)
        self.db.commit()
        return meeting

    def advance(self, meeting_id: str) -> str:
        """Run the next pending turn. Returns the new meeting status."""
        meeting = self.db.get(BoardroomMeeting, meeting_id)
        if meeting is None:
            raise KeyError(meeting_id)
        if meeting.status != "running":
            return meeting.status

        if _age_seconds(meeting.created_at) > CAP_MEETING_TIMEOUT_S:
            return self._fail(meeting, "ประชุมนานเกินเพดานเวลา (30 นาที) — ตัดประชุม")
        if meeting.llm_calls >= CAP_MAX_CALLS:
            return self._fail(meeting, f"เกินเพดาน {CAP_MAX_CALLS} คอล — ตัดประชุม")

        plan = json.loads(meeting.turn_plan)
        turn_idx = meeting.current_turn
        if turn_idx >= len(plan):
            return self._finish(meeting)

        turn = plan[turn_idx]
        phase, seat_id, kind = turn["phase"], turn["seat"], turn["kind"]

        # skip turn (e.g. unanimous → no debate round 2): advance silently
        if kind == "skip" or seat_id == "_skip_":
            meeting.phase = phase
            meeting.current_turn += 1
            meeting.updated_at = _now()
            self.db.commit()
            return meeting.status

        meeting.phase = phase
        snapshot = json.loads(meeting.snapshot)
        memory_lines, knowledge_lines = load_injections(self.db)

        try:
            if kind == "opening":
                content = self._turn_opening(meeting, snapshot, memory_lines, knowledge_lines)
            elif kind == "research":
                content = self._turn_research(meeting, snapshot, memory_lines, knowledge_lines)
            elif kind == "brief":
                content = self._turn_brief(meeting, snapshot, memory_lines, knowledge_lines, seat_id, phase)
            elif kind == "rebuttal":
                content = self._turn_debate(meeting, snapshot, memory_lines, knowledge_lines, seat_id, phase)
            elif kind == "attack":
                content = self._turn_debate(meeting, snapshot, memory_lines, knowledge_lines, seat_id, phase)
            elif kind == "research2":
                content = self._turn_evidence(meeting, snapshot, memory_lines, knowledge_lines)
            elif kind == "verify":
                content = self._turn_external_verify(meeting, snapshot, memory_lines, knowledge_lines, seat_id)
            elif kind == "review":
                content = self._turn_verify(meeting, snapshot, memory_lines, knowledge_lines, seat_id)
            elif kind == "resolution":
                content = self._turn_resolution(meeting, snapshot, memory_lines, knowledge_lines)
            else:
                content = "—"
        except LLMError as e:
            return self._fail(meeting, f"เรียกโมเดลไม่สำเร็จ ({e})")

        # conditional plan surgery after briefing / debate rounds
        if phase == "briefing" and seat_id == "challenger_b":
            self._after_briefing(meeting)
        if phase == "debate_r1" and seat_id == "challenger_b":
            self._after_debate_r1(meeting)

        meeting.current_turn += 1
        meeting.updated_at = _now()
        self.db.commit()
        return meeting.status

    # -- turn implementations ----------------------------------------------
    def _system(self, meeting, snapshot, memory_lines, knowledge_lines, seat_id, extra=""):
        return _seat_prompt(seat_id, snapshot, memory_lines, knowledge_lines, extra)

    def _call(self, meeting, system: str, user: str, *, temperature=0.7,
              max_tokens=2500) -> tuple[str, dict]:
        content, usage, _ = llm_call(system, user, temperature=temperature, max_tokens=max_tokens)
        meeting.llm_calls += 1
        meeting.tokens_in += int(usage.get("prompt_tokens") or 0)
        meeting.tokens_out += int(usage.get("completion_tokens") or 0)
        return content, usage

    def _store_message(self, meeting, turn: dict, content: str, *,
                       status="ok", error=None, evidence=None,
                       tokens_in=0, tokens_out=0, model_used=None) -> BoardroomMessage:
        msg = BoardroomMessage(
            id=_new_id("msg"),
            meeting_id=meeting.id,
            turn=meeting.current_turn,
            phase=turn["phase"],
            seat_id=turn["seat"],
            kind=turn["kind"],
            content_md=content,
            evidence=json.dumps(evidence, ensure_ascii=False) if evidence else None,
            status=status,
            error=error,
            model_used=model_used,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
        )
        self.db.add(msg)
        self.db.flush()
        return msg

    def _turn_opening(self, meeting, snapshot, memory_lines, knowledge_lines) -> str:
        sys = self._system(meeting, snapshot, memory_lines, knowledge_lines, "ceo")
        content, usage = self._call(
            meeting, sys,
            f"เปิดประชุม: เขียนวาระจาก {meeting.agenda} และตั้งคำถามหลัก 5 ข้อที่ทีมต้องตอบให้ได้ภายในประชุมนี้\n"
            "รูปแบบ:\nวาระ: ...\nคำถามหลัก:\n1. ...\n2. ...\n3. ...\n4. ...\n5. ...",
            temperature=0.5, max_tokens=1500)
        self._store_message(meeting, {"phase": "opening", "seat": "ceo", "kind": "opening"},
                            content, tokens_in=usage.get("prompt_tokens", 0),
                            tokens_out=usage.get("completion_tokens", 0),
                            model_used=DEEPSEEK_MODEL)
        return content

    def _turn_research(self, meeting, snapshot, memory_lines, knowledge_lines) -> str:
        sys = self._system(meeting, snapshot, memory_lines, knowledge_lines, "scout")
        content, usage = self._call(
            meeting, sys,
            "รอบวิจัยภายนอก: ค้นข้อเท็จจริงภายนอกที่เกี่ยวข้องกับวาระ จากข่าวล่าสุดใน [ข่าวล่าสุด impact สูง] "
            "และตัวเลขใน [ตัวเลขมหภาค] — สรุปเป็นรายการ:\n"
            "R1: <ข้อเท็จจริง> — แหล่ง: <ชื่อแหล่ง>\nR2: ...\n"
            "ถ้าข้อไหนหาไม่ได้ให้เขียน 'หาไม่เจอ' — ห้ามเดา",
            temperature=0.4, max_tokens=2500)
        self._store_message(meeting, {"phase": "research", "seat": "scout", "kind": "research"},
                            content, tokens_in=usage.get("prompt_tokens", 0),
                            tokens_out=usage.get("completion_tokens", 0),
                            model_used=DEEPSEEK_MODEL)
        return content

    def _turn_brief(self, meeting, snapshot, memory_lines, knowledge_lines, seat_id, phase) -> str:
        is_analyst = seat_id in ("macro", "credit", "technical")
        extra = ("รอบนี้เป็นการวิเคราะห์อิสระ ยังไม่เห็นความคิดเห็นของคนอื่น — ลงจุดยืนของคุณตามข้อมูลจริง\n"
                 "รูปแบบ:\nจุดยืน: <สินทรัพย์> <long|short|neutral|ยังฟันธงไม่ได้> (ความมั่นใจ xx%)\n"
                 "เหตุผล: <อ้างตัวเลขจริงจาก [ข้อมูลระบบ]> (2-4 บรรทัด)\n"
                 "ข้อกล่าวอ้าง:\n- ข้อกล่าวอ้าง: <ข้อความ>\n\n"
                 "ต่อท้ายข้อความด้วย JSON บล็อก (ห้ามมีอย่างอื่นนอก JSON):\n"
                 '```json\n{"claims": [{"claim": "...", "metric": "<series_id ในข้อมูลระบบ หรือ null ถ้าเป็นความเห็น>", "expected": {"value": <ตัวเลข>, "unit": "bps|%|pts|USD", "window_days": <0=ระดับปัจจุบัน หรือ N วัน>, "direction": "up|down"}}]}\n```\n'
                 "คำเตือน: metric ต้องเป็นชื่อ series ใน [ตัวเลขมหภาค]/[คะแนนโมเดล] เท่านั้น ถ้าไม่ใช่ตัวเลขในระบบ ให้ metric เป็น null")
        sys = self._system(meeting, snapshot, memory_lines, knowledge_lines, seat_id, extra)
        content, usage = self._call(meeting, sys,
                                    "รอบวิเคราะห์อิสระ — ให้จุดยืนของคุณต่อวาระ พร้อมเหตุผลที่อ้างตัวเลขจริงจาก [ข้อมูลระบบ]",
                                    temperature=0.7, max_tokens=2500)
        clean, claims_data = _parse_json_block(content)
        msg = self._store_message(meeting, {"phase": phase, "seat": seat_id, "kind": "brief"},
                                  clean, tokens_in=usage.get("prompt_tokens", 0),
                                  tokens_out=usage.get("completion_tokens", 0),
                                  model_used=DEEPSEEK_MODEL,
                                  evidence={"stance": _parse_stance(clean),
                                            "raw_claims": claims_data})
        self._verify_message_claims(meeting, msg, claims_data)
        return content

    def _turn_debate(self, meeting, snapshot, memory_lines, knowledge_lines, seat_id, phase) -> str:
        is_analyst = seat_id in ("macro", "credit", "technical")
        prior = self._transcript(meeting, phases=["opening", "research", "briefing", "debate_r1", "debate_r2"])
        round_no = "2 (รอบชี้ขาด)" if phase == "debate_r2" else "1"
        sys = self._system(meeting, snapshot, memory_lines, knowledge_lines, seat_id)
        content, usage = self._call(
            meeting, sys,
            f"รอบโต้แย้ง รอบที่ {round_no} — สิ่งที่พูดกันมาก่อน:\n\n{prior[:6000]}\n\n"
            "หน้าที่ของคุณ:\n"
            "1. โจมตีจุดอ่อนของจุดยืนที่คุณไม่เห็นด้วย (อ้างตัวเลขจริงจาก [ข้อมูลระบบ] เท่านั้น)\n"
            "2. ระบุจุดที่คุณเห็นด้วย\n"
            "3. ยืนยัน/ปรับ จุดยืนของคุณ พร้อมความมั่นใจ\n"
            "รูปแบบ:\nโต้แย้ง: <ประเด็น> (อ้างตัวเลข)\nสนับสนุน: <ประเด็น>\nจุดยืน: <สินทรัพย์> <long|short|neutral|ยังฟันธงไม่ได้> (ความมั่นใจ xx%)\n\n"
            "ถ้ามีตัวเลขที่อยากให้ทีมหาเพิ่ม ระบุบรรทัด: ขอข้อมูล: <ตัวเลข/เมตริกที่ต้องการ>\n"
            "ต่อท้ายด้วย JSON บล็อก claims (เหมือนรอบนำเสนอ):\n"
            '```json\n{"claims": [{"claim": "...", "metric": "...", "expected": {...}}]}\n```',
            temperature=0.8, max_tokens=2500)
        clean, claims_data = _parse_json_block(content)
        msg = self._store_message(meeting, {"phase": phase, "seat": seat_id, "kind": "attack" if phase == "debate_r2" else "rebuttal"},
                                  clean, tokens_in=usage.get("prompt_tokens", 0),
                                  tokens_out=usage.get("completion_tokens", 0),
                                  model_used=DEEPSEEK_MODEL,
                                  evidence={"stance": _parse_stance(clean), "raw_claims": claims_data})
        self._verify_message_claims(meeting, msg, claims_data)
        return content

    def _turn_evidence(self, meeting, snapshot, memory_lines, knowledge_lines) -> str:
        """Scout answers the data requests from the real snapshot (หาไม่เจอ if absent)."""
        msgs = (self.db.query(BoardroomMessage)
                .filter(BoardroomMessage.meeting_id == meeting.id,
                        BoardroomMessage.phase.in_(["briefing", "debate_r1", "debate_r2"]))
                .all())
        reqs = []
        for m in msgs:
            for r in _extract_lines(m.content_md, "ขอข้อมูล"):
                if r not in reqs:
                    reqs.append(r)
        req_txt = "\n".join(f"- {r}" for r in reqs[:6])
        sys = self._system(meeting, snapshot, memory_lines, knowledge_lines, "scout")
        content, usage = self._call(
            meeting, sys,
            f"ที่ประชุมขอข้อมูลเพิ่มเติม:\n{req_txt}\n"
            "ค้นตัวเลขเหล่านี้จาก [ตัวเลขมหภาค] / [ข่าวล่าสุด] — ตอบ:\n"
            "V1: <ตัวเลขที่ขอ> = <ค่า> (แหล่ง: <ชื่อ>)\nV2: ...\n"
            "ถ้าไม่มีในข้อมูล ให้เขียน 'หาไม่เจอ' — ห้ามเดา",
            temperature=0.4, max_tokens=2000)
        self._store_message(meeting, {"phase": "evidence", "seat": "scout", "kind": "research2"},
                            content, tokens_in=usage.get("prompt_tokens", 0),
                            tokens_out=usage.get("completion_tokens", 0),
                            model_used=DEEPSEEK_MODEL)
        return content

    def _turn_external_verify(self, meeting, snapshot, memory_lines, knowledge_lines, seat_id) -> str:
        """Challenger re-checks the scout's V-numbers against the real snapshot."""
        ev = (self.db.query(BoardroomMessage)
              .filter(BoardroomMessage.meeting_id == meeting.id,
                      BoardroomMessage.kind == "research2")
              .all())
        v_lines = "\n".join(m.content_md for m in ev) or "(ไม่มีรายการ)"
        sys = self._system(meeting, snapshot, memory_lines, knowledge_lines, seat_id)
        content, usage = self._call(
            meeting, sys,
            f"ตรวจสอบตัวเลขที่แมวมองค้นมา โดยค้นซ้ำจาก [ตัวเลขมหภาค] ด้วยตัวคุณเอง:\n{v_lines}\n"
            "สำหรับแต่ละ V: verdict ตรงกัน/ไม่ตรงกัน/หาไม่เจอ + ค่าที่คุณค้นเจอ",
            temperature=0.4, max_tokens=1500)
        self._store_message(meeting, {"phase": "external_data", "seat": seat_id, "kind": "verify"},
                            content, tokens_in=usage.get("prompt_tokens", 0),
                            tokens_out=usage.get("completion_tokens", 0),
                            model_used=DEEPSEEK_MODEL)
        return content

    def _turn_verify(self, meeting, snapshot, memory_lines, knowledge_lines, seat_id) -> str:
        """Challenger reviews LOGIC of claims; numbers were already code-verified."""
        claims = (self.db.query(BoardroomClaim)
                  .filter(BoardroomClaim.meeting_id == meeting.id)
                  .order_by(BoardroomClaim.created_at).all())
        if not claims:
            content = "ไม่มีข้อกล่าวอ้างที่ระบุชัดเจนในประชุมนี้ — ข้ามการตรวจ"
            self._store_message(meeting, {"phase": "verification", "seat": seat_id, "kind": "review"},
                                content, status="ok")
            return content
        lines = []
        for c in claims:
            v = {"verified": "✅ ผ่านการพิสูจน์", "partial": "🔶 ทิศทางถูก-ขนาดคลาดเคลื่อน",
                 "failed": "❌ ขัดกับข้อมูลจริง", "unverifiable": "❔ ตรวจไม่ได้"}.get(c.verdict, c.verdict)
            lines.append(f"- ({v}) {c.claim_text[:150]} [{c.metric or 'ความเห็น'}] — {c.reason or ''}")
        sys = self._system(meeting, snapshot, memory_lines, knowledge_lines, seat_id)
        content, usage = self._call(
            meeting, sys,
            "รอบตรวจสอบ: ระบบตรวจตัวเลขด้วยโค้ดแล้ว ผลตามด้านล่าง — ตรวจเฉพาะ ตรรกะ/ความสมเหตุสมผล/การตีความ ที่โค้ดจับไม่ได้:\n"
            + "\n".join(lines) + "\n\n"
            "ตอบ:\n- ข้อใดเป็นการตีความเกินข้อมูล → ระบุ\n- ข้อใดมีตรรกะผิด → ระบุ\n- ที่เหลือ → 'ไม่มีประเด็นเพิ่ม'\n"
            "ห้ามทวนตัวเลขที่ระบบตรวจแล้ว (ตัวเลขตรวจด้วยโค้ดแล้ว)",
            temperature=0.3, max_tokens=2500)
        self._store_message(meeting, {"phase": "verification", "seat": seat_id, "kind": "review"},
                            content, tokens_in=usage.get("prompt_tokens", 0),
                            tokens_out=usage.get("completion_tokens", 0),
                            model_used=DEEPSEEK_MODEL)
        return content

    def _turn_resolution(self, meeting, snapshot, memory_lines, knowledge_lines) -> str:
        prior = self._transcript(meeting)
        sys = self._system(meeting, snapshot, memory_lines, knowledge_lines, "ceo")
        content, usage = self._call(
            meeting, sys,
            f"บทสนทนาเต็มของที่ประชุม:\n\n{prior[:12000]}\n\n"
            "ลงมติ: สรุปมติจากข้อสรุปที่ผ่านการพิสูจน์เท่านั้น (ตามผลตรวจของผู้ท้าทายและระบบ) — ห้ามแต่งตัวเลข ราคาอ้างอิงใช้จาก [ราคาอ้างอิง ณ เปิดประชุม]\n"
            "ตอบเป็น JSON เท่านั้น (ห้ามมีข้อความนอก JSON):\n"
            '{"resolution_md": "<markdown ฉบับวิเคราะห์เต็ม (มีอ้างอิงตัวเลข)>",'
            '"resolution_json": {"plain": {"summary": "...", "proven": ["..."], "unproven": ["..."], "watch": ["..."], "outlook": "..."},'
            '"claim_summary": {"verified": 0, "failed": 0, "unverified": 0},'
            '"stances": [{"asset": "US10Y", "stance": "long|short|neutral|insufficient_evidence", "confidence": 0, "horizon": "short|medium|long", "horizon_days": 0, "price_at": <ตัวเลขจากข้อมูลจริง>, "reason": "..."}],'
            '"verification": [{"claim": "...", "verdict": "true|false|?"}]}}',
            temperature=0.3, max_tokens=8000)
        clean, data = _parse_json_block(content)
        self._store_message(meeting, {"phase": "resolution", "seat": "ceo", "kind": "resolution"},
                            clean, tokens_in=usage.get("prompt_tokens", 0),
                            tokens_out=usage.get("completion_tokens", 0),
                            model_used=DEEPSEEK_MODEL,
                            evidence={"resolution": data})
        if data:
            meeting.resolution_md = (data.get("resolution_md") or clean)
            meeting.resolution_json = json.dumps(data.get("resolution_json") or {},
                                                 ensure_ascii=False)
            self._after_resolution(meeting, data.get("resolution_json") or {})
        else:
            meeting.resolution_md = clean
            meeting.resolution_json = "{}"
        return content

    # -- verification of claims (ticket 04) ---------------------------------
    def _verify_message_claims(self, meeting, msg, claims_data: dict | None):
        claims = (claims_data or {}).get("claims") or []
        for c in claims[:3]:  # max 3 per message
            result = verify_claim(c, json.loads(meeting.snapshot))
            self.db.add(BoardroomClaim(
                id=_new_id("c"),
                meeting_id=meeting.id,
                message_id=msg.id,
                seat_id=msg.seat_id,
                phase=msg.phase,
                claim_text=(c.get("claim") or "")[:400],
                metric=(c.get("metric") or "").strip() or None,
                expected=json.dumps(c.get("expected") or {}, ensure_ascii=False) if c.get("expected") else None,
                verdict=result["verdict"],
                sub_reason=result["sub_reason"],
                reason=result["reason"],
                checks=json.dumps(result["checks"], ensure_ascii=False),
            ))
        self.db.flush()

    # -- conditional plan surgery -------------------------------------------
    def _after_briefing(self, meeting):
        """Insert debate_r2 turns (or a skip turn when unanimous) before verification."""
        plan = json.loads(meeting.turn_plan)
        insert_at = None
        for i, t in enumerate(plan):
            if t["phase"] == "verification":
                insert_at = i
                break
        if insert_at is None:
            return
        brief_msgs = (self.db.query(BoardroomMessage)
                      .filter(BoardroomMessage.meeting_id == meeting.id,
                              BoardroomMessage.phase == "briefing")
                      .all())
        stances = [_parse_stance(m.content_md) for m in brief_msgs]
        dirs = [d for _, d in stances if d]
        non_neutral = [d.lower() for d in dirs if d.lower() not in ("neutral", "ยังฟันธงไม่ได้")]
        unanimous = bool(non_neutral) and len(set(non_neutral)) == 1 and len(non_neutral) == len(dirs)
        if unanimous:
            plan[insert_at:insert_at] = [{"phase": "debate_r2", "seat": "_skip_", "kind": "skip"}]
        else:
            plan[insert_at:insert_at] = [
                {"phase": "debate_r2", "seat": s, "kind": "attack"}
                for s in ["macro", "credit", "technical", "challenger_a", "challenger_b"]
            ]
        meeting.turn_plan = json.dumps(plan, ensure_ascii=False)

    def _after_debate_r1(self, meeting):
        """Insert evidence/external_data turns if data requests exist."""
        plan = json.loads(meeting.turn_plan)
        msgs = (self.db.query(BoardroomMessage)
                .filter(BoardroomMessage.meeting_id == meeting.id,
                        BoardroomMessage.phase.in_(["briefing", "debate_r1"]))
                .all())
        reqs = []
        for m in msgs:
            for r in _extract_lines(m.content_md, "ขอข้อมูล"):
                if r not in reqs:
                    reqs.append(r)
        if not reqs:
            return
        # insert the three conditional turns right before the first verification turn
        insert_at = None
        for i, t in enumerate(plan):
            if t["phase"] == "verification":
                insert_at = i
                break
        if insert_at is None:
            return
        plan[insert_at:insert_at] = [
            {"phase": "evidence", "seat": "scout", "kind": "research2"},
            {"phase": "external_data", "seat": "challenger_a", "kind": "verify"},
            {"phase": "external_data", "seat": "challenger_b", "kind": "verify"},
        ]
        meeting.turn_plan = json.dumps(plan, ensure_ascii=False)

    # -- resolution side effects ---------------------------------------------
    def _after_resolution(self, meeting, rj: dict):
        """Store memory notes from proven conclusions + update seat stats."""
        plan = json.loads(meeting.turn_plan)
        skipped_r2 = any(t.get("seat") == "_skip_" for t in plan)
        conf0 = CONF0_UNANIMOUS if skipped_r2 else CONF0_CONTESTED
        plain = rj.get("plain") or {}
        proven = plain.get("proven") or []
        category = "other"
        for text in proven[:MEMORY_INJECT_MAX]:
            stmt = str(text).strip().replace("\n", " ")[:MEMORY_STATEMENT_MAX_CHARS]
            if not stmt:
                continue
            self.db.add(BoardroomMemory(
                id=_new_id("mem"),
                statement_md=stmt,
                tags=json.dumps([meeting.agenda[:60]], ensure_ascii=False),
                confidence=conf0,
                status="active",
                source_meeting_id=meeting.id,
                category=category,
                expires_at=expires_at_for(None, category),
            ))
        # seat stats: count claims per seat
        claims = (self.db.query(BoardroomClaim)
                  .filter(BoardroomClaim.meeting_id == meeting.id).all())
        by_seat: dict[str, dict] = {}
        for c in claims:
            d = by_seat.setdefault(c.seat_id, {"total": 0, "verified": 0, "partial": 0, "failed": 0})
            d["total"] += 1
            if c.verdict == "verified":
                d["verified"] += 1
            elif c.verdict == "partial":
                d["partial"] += 1
            elif c.verdict == "failed":
                d["failed"] += 1
        for seat_id, d in by_seat.items():
            st = self.db.get(BoardroomSeatStats, seat_id)
            if st is None:
                st = BoardroomSeatStats(seat_id=seat_id)
                self.db.add(st)
            st.meetings = (st.meetings or 0) + 1
            st.claims_total = (st.claims_total or 0) + d["total"]
            st.claims_verified = (st.claims_verified or 0) + d["verified"]
            st.claims_partial = (st.claims_partial or 0) + d["partial"]
            st.claims_failed = (st.claims_failed or 0) + d["failed"]
        self.db.flush()

    def _transcript(self, meeting, phases: list[str] | None = None) -> str:
        q = (self.db.query(BoardroomMessage)
             .filter(BoardroomMessage.meeting_id == meeting.id)
             .order_by(BoardroomMessage.turn))
        msgs = q.all()
        out = []
        for m in msgs:
            if phases and m.phase not in phases:
                continue
            if m.status == "error":
                continue
            name = SEATS.get(m.seat_id, {}).get("name_th", m.seat_id)
            out.append(f"[{m.phase}] {name}:\n{m.content_md}")
        return "\n\n".join(out)

    def _finish(self, meeting) -> str:
        meeting.status = "completed"
        meeting.phase = "resolution"
        meeting.ended_at = _now()
        meeting.claim_until = None
        meeting.updated_at = _now()
        self.db.commit()
        return "completed"

    def _fail(self, meeting, error: str) -> str:
        meeting.status = "failed"
        meeting.error = error
        meeting.ended_at = _now()
        meeting.claim_until = None
        meeting.updated_at = _now()
        self.db.commit()
        return "failed"

    def resume(self, meeting_id: str) -> str:
        meeting = self.db.get(BoardroomMeeting, meeting_id)
        if meeting is None:
            raise KeyError(meeting_id)
        if meeting.status != "failed":
            return meeting.status
        meeting.status = "running"
        meeting.error = None
        meeting.claim_until = _now() + timedelta(minutes=5)
        meeting.updated_at = _now()
        self.db.commit()
        return "running"


# ---------------------------------------------------------------------------
# Background runner (single-process: one meeting at a time)
# ---------------------------------------------------------------------------
_runner_lock = threading.Lock()
_active_meeting: dict[str, bool] = {}


def start_meeting_background(db: Session, meeting_id: str) -> None:
    """Advance the meeting until done in a daemon thread (or fail)."""
    def _run():
        with _runner_lock:
            try:
                engine = BoardroomEngine(db)
                while True:
                    status = engine.advance(meeting_id)
                    if status != "running":
                        break
                    time.sleep(0.5)
            except Exception:
                # mark failed so the UI isn't stuck on 'running' forever
                try:
                    m = db.get(BoardroomMeeting, meeting_id)
                    if m and m.status == "running":
                        m.status = "failed"
                        m.error = "internal engine error"
                        m.updated_at = _now()
                        db.commit()
                except Exception:
                    pass
            finally:
                _active_meeting.pop(meeting_id, None)

    _active_meeting[meeting_id] = True
    t = threading.Thread(target=_run, daemon=True)
    t.start()


def seed_seats(db: Session) -> None:
    """Idempotent seed of the 7 seats."""
    for sid, cfg in SEATS.items():
        if db.get(BoardroomSeat, sid) is None:
            db.add(BoardroomSeat(
                seat_id=sid,
                position_key=cfg["position_key"],
                provider="deepseek",
                model=DEEPSEEK_MODEL,
                name_th=cfg["name_th"],
                name_en=cfg["name_en"],
                enabled=1,
                sort=cfg["sort"],
            ))
    db.commit()
