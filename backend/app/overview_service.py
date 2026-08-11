"""Overview dashboard service (bond-crisis-100 ticket 05).

Mirrors the reference's / (ภาพรวม) page: AI brief + regime phase + top
model + country risk + key figures + yield curve + 6 model cards.

All data is assembled from services that already exist (macro dashboard,
model scores, country risk) — nothing is re-fetched; the AI brief is the
only new computation (DeepSeek, cached in the DB-backed cache).
"""

from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone

from app import countries_service, macro_service, model_service
from app.boardroom_service import llm_call
from app.cache import cache_get, cache_set

_OVERVIEW_CACHE_KEY = "overview:dashboard"
_OVERVIEW_CACHE_TTL = 600          # 10 min — same cadence as the macro dashboard
_BRIEF_CACHE_KEY = "overview:brief"
_BRIEF_CACHE_TTL = 24 * 3600       # AI brief regenerated on demand / daily

# The reference's key-figures strip (macro_series ids in module 89547)
_KEY_FIGURES = [
    ("us10y", "ผลตอบแทนพันธบัตรสหรัฐ 10 ปี", "%"),
    ("us2y", "ผลตอบแทนพันธบัตรสหรัฐ 2 ปี", "%"),
    ("vix", "ดัชนีความผันผวน VIX", "index"),
    ("dxy", "ดัชนีดอลลาร์", "index"),
    ("xauusd", "ทองคำ", "USD"),
    ("usoil", "น้ำมันดิบ WTI", "USD"),
    ("us_hy_spread", "ส่วนต่างพันธบัตร High Yield", "bps"),
    ("us_banking_stress_index", "ดัชนีความเสี่ยงแบงก์รัน (Composite)", "index"),
]

_YIELD_TENORS = ["us13w", "us1y", "us2y", "us5y", "us10y", "us20y", "us30y"]
_TENOR_LABELS = {"us13w": "13W", "us1y": "1Y", "us2y": "2Y", "us5y": "5Y",
                 "us10y": "10Y", "us20y": "20Y", "us30y": "30Y"}


def _card_value(cards: dict, sid: str) -> float | None:
    card = cards.get(sid) or {}
    for key in ("value", "current"):
        v = card.get(key)
        if v is not None:
            try:
                return float(v)
            except (TypeError, ValueError):
                return None
    return None


def _key_figures(cards: dict) -> list[dict]:
    out = []
    for sid, label, unit in _KEY_FIGURES:
        out.append({
            "series_id": sid,
            "name_th": label,
            "value": _card_value(cards, sid),
            "unit": unit,
            "change_pct": (cards.get(sid) or {}).get("change_pct"),
            "change_val": (cards.get(sid) or {}).get("change_val"),
        })
    return out


def _yield_curve(cards: dict) -> list[dict]:
    out = []
    for sid in _YIELD_TENORS:
        out.append({
            "tenor": _TENOR_LABELS[sid],
            "yield": _card_value(cards, sid),
        })
    return out


def _regime(models_payload: dict) -> dict | None:
    """Top-ranked model -> phase/confidence/transition zone (reference Qw map)."""
    models = models_payload.get("models") or []
    if not models:
        return None
    top = models[0]
    meta = next((m for m in models_payload.get("meta", []) if m["model_id"] == top["model_id"]), {})
    second = models[1] if len(models) > 1 else None
    return {
        "phase": meta.get("phase") or "normal",
        "phase_th": meta.get("regime_th"),
        "phase_en": meta.get("regime_en"),
        "top_model_id": top["model_id"],
        "top_model_name_th": meta.get("name_th"),
        "top_model_name_en": meta.get("name_en"),
        "top_model_score": top.get("score"),
        "top_model_status": top.get("status"),
        "top_model_trade_direction": meta.get("trade_direction"),
        "top_model_color": meta.get("color"),
        "confidence": top.get("confidence"),
        "gap_to_second": round((top.get("score") or 0) - (second.get("score") or 0), 1)
        if second else None,
        "is_transition_zone": bool(top.get("score")) and bool(second)
        and (top.get("score") - (second.get("score") or 0)) < 5.0,
        # reference triggers: top conditions (name from indicator, score 0-100)
        "triggers": [
            {"name": c.get("name", ""), "strength": round(c["score"], 0)}
            for c in (top.get("conditions") or [])[:4]
            if c.get("score") is not None
        ],
        "updated_at": models_payload.get("updated_at"),
    }


def _top_countries(risks: list[dict], limit: int = 7) -> list[dict]:
    ordered = sorted(risks, key=lambda r: (r.get("score") or 0), reverse=True)
    return [
        {"country_code": r["code"], "score": r.get("score"),
         "level": r.get("level")}
        for r in ordered[:limit]
    ]


def build_overview() -> dict:
    """Assemble the / overview payload from existing services (10-min cache)."""
    cached = cache_get(_OVERVIEW_CACHE_KEY)
    if cached is not None:
        return cached

    dash = macro_service.build_dashboard()
    # macro dashboard exposes sections (grouped cards) — flatten to a map
    cards: dict[str, dict] = {}
    for section in dash.get("sections", []):
        for item in section.get("items", []):
            cards[item["series_id"]] = item
    models_payload = model_service.build_models()

    risks_raw = []
    try:
        countries_payload = countries_service.build_countries()
        risks_raw = countries_payload.get("countries") or []
    except Exception:
        risks_raw = []

    brief = cache_get(_BRIEF_CACHE_KEY)

    payload = {
        "regime": _regime(models_payload),
        "models": [
            {
                "rank": m.get("rank"),
                "model_id": m["model_id"],
                "name_th": next((x["name_th"] for x in models_payload.get("meta", [])
                                 if x["model_id"] == m["model_id"]), m["model_id"]),
                "short_th": next((x["short_th"] for x in models_payload.get("meta", [])
                                  if x["model_id"] == m["model_id"]), ""),
                "score": m.get("score"),
                "status": m.get("status"),
                "confidence": m.get("confidence"),
                "color": next((x["color"] for x in models_payload.get("meta", [])
                               if x["model_id"] == m["model_id"]), "#38bdf8"),
            }
            for m in (models_payload.get("models") or [])
        ],
        "key_figures": _key_figures(cards),
        "yield_curve": _yield_curve(cards),
        "country_risk": {
            "top": _top_countries(risks_raw),
            "total": len(risks_raw),
        },
        "warnings": [],
        "brief": brief,
        "updated_at": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC"),
        "data_sources": dash.get("data_sources", []),
    }
    cache_set(_OVERVIEW_CACHE_KEY, payload, _OVERVIEW_CACHE_TTL)
    return payload


# ---------------------------------------------------------------------------
# AI brief (mirrors the reference's /functions/v1/ai-brief edge function)
# ---------------------------------------------------------------------------

_BRIEF_SYSTEM = (
    "คุณคือนักวิเคราะห์ตลาดพันธบัตรและมหภาค เขียนสรุปสถานการณ์ตลาดเป็นภาษาไทย "
    "แบบนักข่าวการเงินผู้ช่ำชอง อ้างตัวเลขจริงจากข้อมูลที่ให้ สั้นกระชับ 5-7 ประโยค "
    "ตอบเป็น JSON เท่านั้น รูปแบบ: "
    '{"brief_md": "...", "recommendations": ["...", "...", "..."], '
    '"scenarios": ["...", "...", "..."], "key_events": [{"date": "YYYY-MM-DD", '
    '"title": "...", "impact": "High|Medium|Low", "country": "USD", '
    '"forecast": "...", "previous": "..."}]}'
)


def _brief_context(overview: dict) -> str:
    lines = []
    regime = overview.get("regime") or {}
    lines.append(f"Regime: {regime.get('phase_th')} (confidence {regime.get('confidence')}%)")
    for f in overview.get("key_figures", []):
        v = f.get("value")
        lines.append(f"{f['name_th']}: {v if v is not None else '—'} {f.get('unit', '')}")
    top = (overview.get("models") or [{}])[0]
    lines.append(f"โมเดลอันดับ 1: {top.get('name_th')} {top.get('score')}/100 ({top.get('status')})")
    return "\n".join(lines)


def generate_brief(force: bool = False) -> dict:
    """Create a fresh AI brief (DeepSeek) and cache it for 24h."""
    if not force:
        cached = cache_get(_BRIEF_CACHE_KEY)
        if cached is not None:
            return cached

    overview = build_overview()
    context = _brief_context(overview)
    content, usage, latency = llm_call(_BRIEF_SYSTEM, context, temperature=0.5, max_tokens=2000)

    # Robust JSON extraction: fence -> whole-object -> first balanced block
    brief = _parse_brief_json(content)
    if brief is None:
        raise RuntimeError("AI brief returned unparseable JSON")

    brief["model_used"] = "deepseek-v4-flash"
    brief["generated_at"] = datetime.now(timezone.utc).isoformat()
    brief["_usage"] = usage
    brief["_latency_s"] = round(latency, 1)
    cache_set(_BRIEF_CACHE_KEY, brief, _BRIEF_CACHE_TTL)
    # invalidate the dashboard payload so it carries the fresh brief
    cache_set(_OVERVIEW_CACHE_KEY, overview, -1)
    return brief


def _parse_brief_json(content: str) -> dict | None:
    content = content.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.S)
    if fence:
        content = fence.group(1)
    try:
        return json.loads(content)
    except Exception:
        pass
    start, end = content.find("{"), content.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(content[start:end + 1])
        except Exception:
            return None
    return None
