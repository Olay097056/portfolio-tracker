# backend/app/country_ai_service.py
"""DeepSeek-generated AI situation brief + deep-dive report for a country,
mirroring the reference's /countries/:code AI panels (their edge function is
login-gated; we substitute DeepSeek — same API, same max_tokens 8000 lesson).

- brief: AI สรุปสถานการณ์ — short Thai situation summary + คำแนะนำ (numbered)
  + จินตนาการ scenarios — generated from the country's live yield/fx data.
- report: AI สรุปเชิงลึก — deep-dive ~14 topics on demand (user clicks).

Stored in SQLite `country_briefs` / `country_reports` (generated_at,
model_used); regenerated on demand. Never fabricates: a failed call leaves
the stored copy (or nothing) — the UI shows the reference's noReport copy.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import httpx
from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.orm import declarative_base

from app import countries_service
from app.news_service import DEEPSEEK_MODEL, DEEPSEEK_URL, _deepseek_key

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
except ImportError:
    pass

Base = declarative_base()

AI_MODEL = DEEPSEEK_MODEL  # deepseek-v4-flash


class CountryBrief(Base):
    __tablename__ = "country_briefs"
    id = Column(Integer, primary_key=True)
    country_code = Column(String(4), index=True, nullable=False)
    brief_md = Column(Text, nullable=False)
    recommendations = Column(Text, nullable=True)  # JSON list
    scenarios = Column(Text, nullable=True)        # JSON list
    model_used = Column(String(32), nullable=False)
    generated_at = Column(DateTime(timezone=True), nullable=False)


class CountryReport(Base):
    __tablename__ = "country_reports"
    id = Column(Integer, primary_key=True)
    country_code = Column(String(4), index=True, nullable=False)
    report_md = Column(Text, nullable=False)
    model_used = Column(String(32), nullable=False)
    generated_at = Column(DateTime(timezone=True), nullable=False)


def _call_deepseek(system: str, user: str, max_tokens: int = 8000) -> str | None:
    """One DeepSeek call; returns the raw content string or None on failure."""
    key = _deepseek_key()
    if not key:
        return None
    try:
        r = httpx.post(
            DEEPSEEK_URL,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": AI_MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "temperature": 0.2,
                "max_tokens": max_tokens,
                "response_format": {"type": "json_object"},
                "reasoning": {"enabled": False},  # OpenRouter — ปิด reasoning
            },
            timeout=240,
        )
        if r.status_code != 200:
            return None
        content = r.json()["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        return content
    except Exception:
        return None


def _country_context(code: str) -> str:
    """Compact live data snapshot of a country for the AI prompt."""
    detail = countries_service.build_country_detail(code)
    if not detail:
        return ""
    c = detail["country"]
    curve = ", ".join(f"{p['tenor']} {p['value']:.2f}%" for p in detail["yield_curve"][:8])
    risk = detail["risk"]
    comps = risk.get("components") or {}
    comps_txt = ", ".join(f"{k}={v}" for k, v in comps.items()) if comps else "—"
    fx = detail.get("mini_cards") or []
    fx_txt = ""
    if fx and fx[0].get("value") is not None:
        fx_txt = f", FX {fx[0]['value']} ({fx[0].get('change_pct')}% 3M)"
    return (
        f"ประเทศ: {c['name_th']} ({c['code']}), data tier: {c['data_tier']}\n"
        f"10Y: {next((p['value'] for p in detail['yield_curve'] if p['tenor'] == '10Y'), '—')}%"
        f"{fx_txt}, bps vs US: {detail.get('bps_vs_us')}\n"
        f"yield curve: {curve}\n"
        f"risk score: {risk.get('score')} ({risk.get('level')}), components: {comps_txt}"
    )


def generate_brief(code: str) -> dict | None:
    """Generate an AI สรุปสถานการณ์ brief for a country (Thai)."""
    ctx = _country_context(code)
    if not ctx:
        return None
    system = (
        "คุณเป็นนักวิเคราะห์ตราสารหนี้/มหภาคภาษาไทยสำหรับผู้ลงทุนรายย่อย "
        "จากข้อมูลประเทศนี้ ให้สร้าง 'AI สรุปสถานการณ์' สั้นๆ ภาษาไทย "
        "Return ONLY JSON: {\"brief_md\": \"ย่อหน้า 3-5 บรรทัดสรุปสถานการณ์ความเสี่ยงของประเทศนี้\""
        ", \"recommendations\": [\"คำแนะนำเชิงปฏิบัติ 2-4 ข้อ\"], "
        "\"scenarios\": [\"สถานการณ์ที่อาจเกิดขึ้น 2-3 ข้อ\"]}. "
        "ไม่มี markdown หัวข้อ ใช้ข้อมูลที่ให้เท่านั้น ห้ามแต่งตัวเลข"
    )
    content = _call_deepseek(system, ctx)
    if not content:
        return None
    try:
        d = json.loads(content)
        return {
            "brief_md": d.get("brief_md", ""),
            "recommendations": d.get("recommendations", []),
            "scenarios": d.get("scenarios", []),
            "model_used": AI_MODEL,
        }
    except (json.JSONDecodeError, TypeError):
        return None


def generate_report(code: str) -> dict | None:
    """Generate a deep-dive report (~14 หัวข้อ) for a country on demand."""
    ctx = _country_context(code)
    if not ctx:
        return None
    system = (
        "คุณเป็นนักวิเคราะห์ตราสารหนี้/มหภาคภาษาไทย วิเคราะห์เชิงลึกประเทศนี้เป็น "
        "รายงาน Markdown ภาษาไทย (หัวข้อ ##) ประมาณ 14 หัวข้อ: สรุปภาพรวม, ระดับ Yield, "
        "โมเมนตัม Yield, อัตราแลกเปลี่ยน, เส้นอัตราผลตอบแทน, เงินเฟ้อ, นโยบายการเงิน, "
        "การคลัง, หนี้สาธารณะ, ดุลบัญชีเดินสะพัด, ทุนสำรอง, ความเสี่ยงเครดิต/เรตติ้ง, "
        "ความเสี่ยงธนาคาร, ตัวชี้วัดตลาด (VIX), แนวโน้มและมุมมอง. "
        "Return ONLY JSON: {\"report_md\": \"...markdown เต็ม...\"}. "
        "ใช้ข้อมูลที่ให้เท่านั้น ห้ามแต่งตัวเลข ถ้าไม่มีข้อมูลให้เขียนว่า 'ไม่มีข้อมูล'"
    )
    content = _call_deepseek(system, ctx, max_tokens=8000)
    if not content:
        return None
    try:
        d = json.loads(content)
        return {"report_md": d.get("report_md", ""), "model_used": AI_MODEL}
    except (json.JSONDecodeError, TypeError):
        return None


# --- SQLite persistence ----------------------------------------------------
def _session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    data_dir = os.environ.get("PORTFOLIO_DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
    os.makedirs(data_dir, exist_ok=True)
    engine = create_engine(f"sqlite:///{os.path.join(data_dir, 'bondcrisis.db')}")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def get_brief(code: str) -> dict | None:
    s = _session()
    try:
        row = s.query(CountryBrief).filter(CountryBrief.country_code == code.upper()).order_by(CountryBrief.generated_at.desc()).first()
        if not row:
            return None
        return {
            "brief_md": row.brief_md,
            "recommendations": json.loads(row.recommendations or "[]"),
            "scenarios": json.loads(row.scenarios or "[]"),
            "model_used": row.model_used,
            "generated_at": row.generated_at.strftime("%d/%m/%Y %H:%M"),
        }
    finally:
        s.close()


def save_brief(code: str, brief: dict) -> None:
    s = _session()
    try:
        s.add(CountryBrief(
            country_code=code.upper(),
            brief_md=brief["brief_md"],
            recommendations=json.dumps(brief.get("recommendations", []), ensure_ascii=False),
            scenarios=json.dumps(brief.get("scenarios", []), ensure_ascii=False),
            model_used=brief["model_used"],
            generated_at=datetime.now(timezone.utc),
        ))
        s.commit()
    finally:
        s.close()


def get_report(code: str) -> dict | None:
    s = _session()
    try:
        row = s.query(CountryReport).filter(CountryReport.country_code == code.upper()).order_by(CountryReport.generated_at.desc()).first()
        if not row:
            return None
        return {
            "report_md": row.report_md,
            "model_used": row.model_used,
            "generated_at": row.generated_at.strftime("%d/%m/%Y %H:%M"),
        }
    finally:
        s.close()


def save_report(code: str, report: dict) -> None:
    s = _session()
    try:
        s.add(CountryReport(
            country_code=code.upper(),
            report_md=report["report_md"],
            model_used=report["model_used"],
            generated_at=datetime.now(timezone.utc),
        ))
        s.commit()
    finally:
        s.close()
