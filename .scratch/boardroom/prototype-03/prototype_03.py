#!/usr/bin/env python3
"""
prototype_03.py — Boardroom prototype: run a REAL 7-seat AI meeting on real app
data with DeepSeek deepseek-v4-flash, measure cost/time/quality.

Wayfinder ticket 03 (`.scratch/boardroom/issues/03-prototype-cost-and-quality.md`).
THROWAWAY SCRIPT — NOT production code. Lives in .scratch/boardroom/prototype-03/.

Usage (from repo root, with backend venv):
    env -u PYTHONPATH -u VIRTUAL_ENV backend/.venv/Scripts/python.exe \\
        .scratch/boardroom/prototype-03/prototype_03.py --build-context
    ... --meeting --tag runA --mode full
    ... --baseline
    ... --summary

Meeting design follows ticket 02 (7 seats, Thai-only, 2 modes, safety caps):
    opening(CEO) -> research(scout) -> briefing(5 blind) -> debate r1(5)
    -> debate r2(5, only if contested) -> [evidence(scout)+external_data(2 challengers)
    only if data requests] -> verification(2 challengers) -> resolution(CEO JSON)

Rates (USD per 1M tokens) fetched 2026-08-09 from
https://api-docs.deepseek.com/quick_start/pricing  (deepseek-v4-flash):
    input cache hit  $0.0028   input cache miss $0.14   output $0.28
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[3] / "backend"
sys.path.insert(0, str(BACKEND))

import httpx  # noqa: E402

DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
DEEPSEEK_MODEL = "deepseek-v4-flash"

# Official rates, fetched 2026-08-09 (see module docstring).
RATES = {"input_cache_hit": 0.0028, "input_cache_miss": 0.14, "output": 0.28}

# --- safety caps (ticket 02) -------------------------------------------------
CAP_MAX_CALLS = 40          # max_llm_calls_per_meeting
CAP_CALL_TIMEOUT_S = 120    # per-call timeout
CAP_MEETING_TIMEOUT_S = 30 * 60  # force-fail a meeting stuck longer than this
RETRIES = 1                 # one retry on transient (network / 5xx)

HERE = Path(__file__).resolve().parent
RUNS = HERE / "runs"


def _load_api_key() -> str:
    """Read DEEPSEEK_API_KEY from backend/.env (never printed)."""
    env_path = BACKEND / ".env"
    if os.environ.get("DEEPSEEK_API_KEY"):
        return os.environ["DEEPSEEK_API_KEY"]
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                if k.strip() == "DEEPSEEK_API_KEY":
                    return v.strip().strip('"').strip("'")
    raise SystemExit("DEEPSEEK_API_KEY not found (backend/.env)")


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# LLM client
# ---------------------------------------------------------------------------
class LLMError(RuntimeError):
    pass


def llm_call(system: str, user: str, *, temperature: float = 0.7,
             max_tokens: int = 8000, timeout: int = CAP_CALL_TIMEOUT_S) -> dict:
    """One DeepSeek call. Returns {content, usage, latency_s, model}."""
    key = _load_api_key()
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
        "thinking": {"type": "disabled"},  # deterministic + cheaper; toggleable later
    }
    last_err: Exception | None = None
    for attempt in range(RETRIES + 1):
        t0 = time.monotonic()
        try:
            r = httpx.post(
                DEEPSEEK_URL,
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json=payload,
                timeout=timeout,
            )
        except Exception as e:  # network
            last_err = e
            time.sleep(2 * (attempt + 1))
            continue
        latency = time.monotonic() - t0
        if r.status_code == 200:
            data = r.json()
            usage = data.get("usage") or {}
            return {
                "content": (data["choices"][0]["message"]["content"] or "").strip(),
                "usage": usage,
                "latency_s": round(latency, 2),
                "model": data.get("model", DEEPSEEK_MODEL),
            }
        if 500 <= r.status_code < 600 or r.status_code in (408, 429):
            last_err = LLMError(f"HTTP {r.status_code}: {r.text[:200]}")
            time.sleep(2 * (attempt + 1))
            continue
        # 4xx (non-retryable): try without the thinking param once (older gate)
        if attempt == 0 and "thinking" in payload:
            payload.pop("thinking")
            last_err = LLMError(f"HTTP {r.status_code}: {r.text[:200]}")
            continue
        raise LLMError(f"HTTP {r.status_code}: {r.text[:300]}")
    raise LLMError(f"call failed after {RETRIES + 1} attempts: {last_err}")


def usage_cost(usage: dict) -> dict:
    """Cost in USD from a usage dict. DeepSeek reports cache hit/miss splits."""
    hit = int(usage.get("prompt_cache_hit_tokens") or 0)
    miss = int(usage.get("prompt_cache_miss_tokens")
               or max(0, int(usage.get("prompt_tokens") or 0) - hit))
    out = int(usage.get("completion_tokens") or 0)
    usd = (hit * RATES["input_cache_hit"] + miss * RATES["input_cache_miss"]
           + out * RATES["output"]) / 1_000_000
    return {
        "prompt_tokens": int(usage.get("prompt_tokens") or 0),
        "completion_tokens": out,
        "cache_hit": hit,
        "cache_miss": miss,
        "cost_usd": round(usd, 6),
    }


# ---------------------------------------------------------------------------
# Real data context (ticket 03: real app data only, never fabricated)
# ---------------------------------------------------------------------------
def build_context(force: bool = False) -> dict:
    from app import macro_service, model_service
    from app.database import SessionLocal
    from app.news_service import NewsItem

    dash = macro_service.build_dashboard(force=force)
    models = model_service.build_models()

    db = SessionLocal()
    try:
        news_rows = (
            db.query(NewsItem)
            .order_by(NewsItem.impact_score.desc(), NewsItem.published_at.desc())
            .limit(10)
            .all()
        )
        news = [
            {
                "title": n.title or "",
                "title_th": n.title_th or n.title or "",
                "impact": n.impact_score,
                "published_at": str(n.published_at or ""),
                "source": n.source or "",
            }
            for n in news_rows
        ]
    finally:
        db.close()

    # --- macro lines: every available card, honest "—" otherwise ----------
    macro_lines: list[str] = []
    for sec in dash.get("sections", []):
        for it in sec.get("items", []):
            name = it.get("name_th") or it.get("series_id")
            unit = it.get("unit") or ""
            val = it.get("value")
            if not it.get("available") or val is None:
                macro_lines.append(f"- {name} ({it['series_id']}): —")
                continue
            chg = it.get("change_val")
            chg_pct = it.get("change_pct")
            extra = ""
            if chg is not None:
                extra += f" (Δ{chg:+g}{unit})"
            elif chg_pct is not None:
                extra += f" (Δ{chg_pct:+.2f}%)"
            macro_lines.append(
                f"- {name} ({it['series_id']}): {val:g}{unit}{extra} | วันที่ {it.get('recorded_at') or '—'}"
            )

    model_lines: list[str] = []
    model_names = {m.get("model_id"): m.get("name_th") or m.get("model_id")
                   for m in models.get("meta", [])}
    for m in models.get("models", []):
        score = m.get("score")
        status = m.get("status")
        model_lines.append(
            f"- #{m.get('rank')} {model_names.get(m.get('model_id')) or m.get('model_id')}: คะแนน {score if score is not None else '—'}"
            + (f" ({status})" if status else "")
        )

    news_lines: list[str] = []
    for n in news:
        news_lines.append(
            f"- [impact {n['impact']}] {n['title_th'][:160]} ({n['source']}, {n['published_at'][:16]})"
        )

    # reference prices at meeting open (sysContext) — scan section items
    ref: dict[str, float | None] = {sid: None for sid in [
        "us10y", "us2y", "us30y", "us_hy_spread", "us_ig_spread",
        "vix", "xauusd", "dxy", "move", "usoil"]}
    for sec in dash.get("sections", []):
        for it in sec.get("items", []):
            sid = it.get("series_id")
            if sid in ref and it.get("available"):
                ref[sid] = it.get("value")

    # agenda from the real situation: top news + top model
    top_news = news[0]["title_th"][:150] if news else ""
    top_model = models["models"][0] if models.get("models") else {}
    top_model_name = model_names.get(top_model.get("model_id")) or top_model.get("model_id")
    agenda = (
        f"ประเมินทิศทางตลาดการเงินหลังเหตุการณ์ล่าสุด: \"{top_news}\" — "
        f"ระบบชี้โมเดลอันดับ 1 คือ {top_model_name} (คะแนน {top_model.get('score')}) — "
        "ห้องประชุมต้องลงมติว่าทิศทางบอนด์สหรัฐ / สเปรดเครดิต / สินทรัพย์เสี่ยง ต่อไปอย่างไร"
    )

    ctx = {
        "built_at": now_iso(),
        "agenda": agenda,
        "macro": "\n".join(macro_lines),
        "models": "\n".join(model_lines),
        "news": "\n".join(news_lines),
        "reference_prices": ref,
        "data_sources": dash.get("data_sources", []),
        "_raw_models": models.get("models", []),
    }
    return ctx


def format_syscontext(ctx: dict) -> str:
    ref = ctx["reference_prices"]
    ref_lines = " · ".join(
        f"{k.upper()}={ref[k]:g}" for k in ref if ref.get(k) is not None
    ) or "—"
    return (
        f"[ข้อมูลระบบ]\n"
        f"- วันที่ประชุม: {ctx['built_at']}\n"
        f"- วาระ: {ctx['agenda']}\n"
        f"- ราคาอ้างอิง ณ เปิดประชุม: {ref_lines}\n"
        f"- แหล่งข้อมูล: {', '.join(ctx.get('data_sources') or ['—'])}"
    )


def format_full_data(ctx: dict) -> str:
    return (
        f"[ข้อมูลระบบ]\n"
        f"- วันที่ประชุม: {ctx['built_at']}\n"
        f"- วาระ: {ctx['agenda']}\n"
        f"- ราคาอ้างอิง ณ เปิดประชุม: "
        + " · ".join(f"{k.upper()}={ctx['reference_prices'][k]:g}"
                     for k in ctx["reference_prices"] if ctx["reference_prices"].get(k) is not None)
        + "\n\n"
        f"[ตัวเลขมหภาค (จากระบบ)]\n{ctx['macro']}\n\n"
        f"[คะแนนโมเดล 6 ตัว]\n{ctx['models']}\n\n"
        f"[ข่าวล่าสุด impact สูง]\n{ctx['news']}"
    )


# ---------------------------------------------------------------------------
# Prompts (Thai-only, ticket 02 decisions)
# ---------------------------------------------------------------------------
RULES = """กติกาที่ห้ามละเมิด (สำคัญที่สุด):
1. ทุกตัวเลขต้องมาจาก [ข้อมูลระบบ] เท่านั้น — ห้ามแต่งตัวเลข ห้ามใช้ตัวเลขจากความจำของโมเดลเด็ดขาด
2. ข้อมูลใดไม่มีใน [ข้อมูลระบบ] ให้เขียน "—" หรือ "หาไม่เจอ" ตรงๆ
3. ตอบเป็นภาษาไทยเท่านั้น
4. ห้ามอ้างข้อความหรือตัวเลขที่ไม่มีจริงในบทสนทนาก่อนหน้า"""

SEATS = {
    "ceo": {"name": "เจมส์ (CEO)", "role": "ประธานที่ประชุม — เปิดวาระ ตั้งคำถาม และสรุปมติจากข้อสรุปที่ผ่านการพิสูจน์เท่านั้น"},
    "scout": {"name": "แมวมอง (วิจัยภายนอก)", "role": "ค้นข้อเท็จจริง/ตัวเลขภายนอกพร้อมแหล่งที่มา — ไม่แสดงความเห็นตลาด"},
    "macro": {"name": "นักเศรษฐศาสตร์มหภาค", "role": "เชี่ยวชาญอัตราดอกเบี้ย เงินเฟ้อ นโยบายการเงิน/การคลัง วัฏจักร — เจ้าภาพสินทรัพย์กลุ่ม yield/rate"},
    "credit": {"name": "นักวิเคราะห์เครดิต/บอนด์", "role": "เชี่ยวชาญสเปรดเครดิต HY/IG ความเสี่ยงผิดนัดชำระ สภาพคล่อง โครงสร้างตลาด — เจ้าภาพสินทรัพย์กลุ่ม spread"},
    "technical": {"name": "นักวิเคราะห์เทคนิคอล", "role": "เชี่ยวชาญแนวโน้ม โมเมนตัม ระดับสำคัญของราคา — เจ้าภาพสินทรัพย์กลุ่มราคา (ทอง น้ำมัน ETF FX)"},
    "challenger_a": {"name": "ผู้ท้าทาย A", "role": "คนค้านหลัก — เน้นโจมตีมุมข้อมูล/ตัวเลข ตรวจข้อกล่าวอ้างทุกข้อเทียบกับข้อมูลจริง"},
    "challenger_b": {"name": "ผู้ท้าทาย B", "role": "คนค้านมุมสอง — เน้นโจมตีมุมตรรกะ/สมมติฐานที่ A ยังไม่แตะ ตรวจซ้ำจากมุมอิสระ"},
}

FOCUS = {
    "macro": "ให้ความสำคัญกับอัตราดอกเบี้ย เงินเฟ้อ นโยบายเฟด เส้นอัตราผลตอบแทน ก่อนตัวเลขอื่น",
    "credit": "ให้ความสำคัญกับสเปรดเครดิต HY/IG สภาพคล่อง ความเสี่ยงเชิงระบบ ก่อนตัวเลขอื่น",
    "technical": "ให้ความสำคัญกับระดับราคา แนวโน้ม โมเมนตัม ของสินทรัพย์ที่เกี่ยวข้อง ก่อนตัวเลขอื่น",
}


def seat_system(seat_id: str, ctx: dict, *, with_full_data: bool = True,
                extra: str = "") -> str:
    seat = SEATS[seat_id]
    focus = FOCUS.get(seat_id, "")
    data_block = format_full_data(ctx) if with_full_data else format_syscontext(ctx)
    return (
        f"คุณคือ {seat['name']} — {seat['role']} ในห้องประชุม AI เพื่อวิเคราะห์ภาวะตลาดบอนด์/สินทรัพย์เสี่ยง\n"
        + (f"โฟกัส: {focus}\n" if focus else "")
        + f"\n{data_block}\n\n{RULES}\n\n{extra}"
    )


# ---------------------------------------------------------------------------
# Meeting engine (ticket 02 turn plan)
# ---------------------------------------------------------------------------
def _parse_stance(text: str) -> tuple[str | None, str | None, float | None]:
    """First 'จุดยืน:' line -> (asset, dir, confidence)."""
    for line in text.splitlines():
        if "จุดยืน:" not in line:
            continue
        m = re.search(r"จุดยืน:\s*([A-Za-z0-9_.\-/^]+)?\s*([a-zA-Z]+)", line)
        if not m:
            continue
        asset = m.group(1)
        direction = m.group(2)
        conf_m = re.search(r"(\d{1,3})\s*%", line)
        conf = float(conf_m.group(1)) if conf_m else None
        return asset, direction, conf
    return None, None, None


def _extract_claims(text: str) -> list[str]:
    claims = []
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("ข้อกล่าวอ้าง:") or s.startswith("- ข้อกล่าวอ้าง:"):
            claims.append(s.split(":", 1)[1].strip()[:200])
    return claims


def _extract_data_requests(text: str) -> list[str]:
    reqs = []
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("ขอข้อมูล:") or s.startswith("- ขอข้อมูล:"):
            reqs.append(s.split(":", 1)[1].strip()[:150])
    return reqs


class Meeting:
    def __init__(self, ctx: dict, tag: str, mode: str = "full"):
        self.ctx = ctx
        self.tag = tag
        self.mode = mode
        self.messages: list[dict] = []
        self.calls = 0
        self.usage_sum = {"prompt_tokens": 0, "completion_tokens": 0,
                          "cache_hit": 0, "cache_miss": 0}
        self.cost_usd = 0.0
        self.phase_times: list[dict] = []
        self.started_at = time.monotonic()
        self.failed = None
        self.skip_reasons: list[str] = []

    # -- helpers -----------------------------------------------------------
    def _check_caps(self):
        if self.calls >= CAP_MAX_CALLS:
            raise RuntimeError(f"เกินเพดาน {CAP_MAX_CALLS} คอล — ตัดประชุม")
        if time.monotonic() - self.started_at > CAP_MEETING_TIMEOUT_S:
            raise RuntimeError(f"ประชุมนานเกิน {CAP_MEETING_TIMEOUT_S}s — ตัดประชุม")

    def turn(self, phase: str, seat_id: str, system: str, user: str, *,
             temperature: float = 0.7, max_tokens: int = 2500,
             kind: str = "speech", allow_error_skip: bool = True) -> dict | None:
        self._check_caps()
        t0 = time.monotonic()
        try:
            res = llm_call(system, user, temperature=temperature, max_tokens=max_tokens)
        except LLMError as e:
            if not allow_error_skip:
                raise
            msg = {
                "turn": len(self.messages) + 1, "phase": phase, "seat": seat_id,
                "seat_name": SEATS[seat_id]["name"], "kind": "error",
                "content": f"⚠️ เรียกโมเดลไม่สำเร็จ — ข้ามที่นั่งนี้ ({e})",
                "error": str(e), "latency_s": None,
            }
            self.messages.append(msg)
            self.skip_reasons.append(f"{phase}/{seat_id}: {e}")
            return msg
        usage = res["usage"]
        self.calls += 1
        c = usage_cost(usage)
        for k in self.usage_sum:
            self.usage_sum[k] += c[k]
        self.cost_usd += c["cost_usd"]
        msg = {
            "turn": len(self.messages) + 1, "phase": phase, "seat": seat_id,
            "seat_name": SEATS[seat_id]["name"], "kind": kind,
            "content": res["content"],
            "tokens_in": usage.get("prompt_tokens", 0),
            "tokens_out": usage.get("completion_tokens", 0),
            "cache_hit": usage.get("prompt_cache_hit_tokens", 0),
            "cache_miss": usage.get("prompt_cache_miss_tokens", 0),
            "latency_s": res["latency_s"], "model": res["model"],
        }
        self.messages.append(msg)
        return msg

    def phase_mark(self, phase: str):
        self.phase_times.append({"phase": phase, "at_s": round(time.monotonic() - self.started_at, 1)})

    def transcript_for(self, seat_ids: list[str] | None = None,
                       phases: list[str] | None = None) -> str:
        out = []
        for m in self.messages:
            if seat_ids and m["seat"] not in seat_ids:
                continue
            if phases and m["phase"] not in phases:
                continue
            out.append(f"[{m['phase']}] {m['seat_name']}:\n{m['content']}")
        return "\n\n".join(out)

    # -- phases ------------------------------------------------------------
    def run(self):
        self.phase_mark("opening")
        ceo_sys = seat_system("ceo", self.ctx)
        self.turn("opening", "ceo", ceo_sys,
                  f"เปิดประชุม: เขียนวาระจาก {self.ctx['agenda']} และตั้งคำถามหลัก 5 ข้อที่ทีมต้องตอบให้ได้ภายในประชุมนี้\n"
                  "รูปแบบ:\nวาระ: ...\nคำถามหลัก:\n1. ...\n2. ...\n3. ...\n4. ...\n5. ...",
                  temperature=0.5, max_tokens=1500, kind="opening")

        # research phase (full mode only)
        if self.mode == "full":
            self.phase_mark("research")
            scout_sys = seat_system("scout", self.ctx)
            self.turn("research", "scout", scout_sys,
                      "รอบวิจัยภายนอก: ค้นข้อเท็จจริงภายนอกที่เกี่ยวข้องกับวาระ จากข่าวล่าสุดใน [ข่าวล่าสุด impact สูง] "
                      "และตัวเลขใน [ตัวเลขมหภาค] — สรุปเป็นรายการ:\n"
                      "R1: <ข้อเท็จจริง> — แหล่ง: <ชื่อแหล่ง>\nR2: ...\n"
                      "ถ้าข้อไหนหาไม่ได้ให้เขียน 'หาไม่เจอ' — ห้ามเดา",
                      temperature=0.4, max_tokens=2500, kind="research")

        # briefing — blind round, 5 seats, independent
        self.phase_mark("briefing")
        analysts = ["macro", "credit", "technical"]
        challengers = ["challenger_a", "challenger_b"]
        brief_msgs = {}
        for seat_id in analysts + challengers:
            with_full = seat_id in analysts  # challengers: claims+data only, no analysis
            extra = ("รอบนี้เป็นการวิเคราะห์อิสระ ยังไม่เห็นความคิดเห็นของคนอื่น — ลงจุดยืนของคุณตามข้อมูลจริง\n"
                     "รูปแบบ:\nจุดยืน: <สินทรัพย์> <long|short|neutral|ยังฟันธงไม่ได้> (ความมั่นใจ xx%)\n"
                     "เหตุผล: <อ้างตัวเลขจริงจาก [ข้อมูลระบบ]> (2-4 บรรทัด)\n"
                     "ข้อกล่าวอ้าง:\n- ข้อกล่าวอ้าง: <ข้อความ> [อ้างอิง: <ตัวเลข/ข้อมูลจริง>]\n"
                     "มุมมองเพิ่มเติม: <ความเสี่ยง/สิ่งที่ต้องจับตา> (1-2 บรรทัด)")
            msg = self.turn("briefing", seat_id,
                            seat_system(seat_id, self.ctx, with_full_data=with_full, extra=extra),
                            "รอบวิเคราะห์อิสระ — ให้จุดยืนของคุณต่อวาระ พร้อมเหตุผลที่อ้างตัวเลขจริงจาก [ข้อมูลระบบ]",
                            temperature=0.7, max_tokens=2500, kind="brief")
            if msg and msg["kind"] == "brief":
                brief_msgs[seat_id] = msg

        # consensus check -> debate rounds
        stances = {sid: _parse_stance(m["content"]) for sid, m in brief_msgs.items()}
        dirs = [s[1] for s in stances.values() if s and s[1]]
        non_neutral = [d for d in dirs if d and d.lower() not in ("neutral", "ยังฟันธงไม่ได้", "none")]
        unanimous = bool(non_neutral) and len(set(d.lower() for d in non_neutral)) == 1 and len(non_neutral) == len(dirs)
        if not dirs:
            unanimous = False

        self.phase_mark("debate_r1")
        debate_in = self.transcript_for(seat_ids=analysts + challengers, phases=["briefing"])
        for seat_id in analysts + challengers:
            sys_txt = seat_system(seat_id, self.ctx, with_full_data=seat_id in analysts)
            user_txt = (
                f"รอบโต้แย้ง รอบที่ 1 — ทุกคนเสนอจุดยืนอิสระแล้ว:\n\n{debate_in}\n\n"
                "หน้าที่ของคุณ:\n"
                "1. โจมตีจุดอ่อนของจุดยืนที่คุณไม่เห็นด้วย (อ้างตัวเลขจริงจาก [ข้อมูลระบบ] เท่านั้น)\n"
                "2. ระบุจุดที่คุณเห็นด้วย\n"
                "3. ยืนยัน/ปรับ จุดยืนของคุณ พร้อมความมั่นใจ\n"
                "รูปแบบ:\nโต้แย้ง: <ประเด็น> (อ้างตัวเลข)\nสนับสนุน: <ประเด็น>\nจุดยืน: <สินทรัพย์> <long|short|neutral|ยังฟันธงไม่ได้> (ความมั่นใจ xx%)"
            )
            self.turn("debate_r1", seat_id, sys_txt, user_txt,
                      temperature=0.8, max_tokens=2500, kind="rebuttal")

        # data requests -> evidence + external_data (conditional phases)
        all_reqs = []
        for m in self.messages:
            if m["phase"] in ("briefing", "debate_r1"):
                all_reqs += _extract_data_requests(m["content"])
        reqs = list(dict.fromkeys(all_reqs))[:4]

        if reqs:
            self.phase_mark("evidence")
            scout_sys = seat_system("scout", self.ctx)
            req_txt = "\n".join(f"- {r}" for r in reqs)
            self.turn("evidence", "scout", scout_sys,
                      f"ที่ประชุมขอข้อมูลเพิ่มเติม:\n{req_txt}\n"
                      "ค้นตัวเลขเหล่านี้จาก [ตัวเลขมหภาค] / [ข่าวล่าสุด] — ตอบ:\n"
                      "V1: <ตัวเลขที่ขอ> = <ค่า> (แหล่ง: <ชื่อ>)\nV2: ...\n"
                      "ถ้าไม่มีในข้อมูล ให้เขียน 'หาไม่เจอ' — ห้ามเดา",
                      temperature=0.4, max_tokens=2000, kind="research2")

            self.phase_mark("external_data")
            v_lines = "\n".join(
                m["content"] for m in self.messages if m["phase"] == "evidence" and m["kind"] == "research2"
            )
            for cid in challengers:
                sys_txt = seat_system(cid, self.ctx, with_full_data=True)
                self.turn("external_data", cid, sys_txt,
                          f"ตรวจสอบตัวเลขที่แมวมองค้นมา โดยค้นซ้ำจาก [ตัวเลขมหภาค] ด้วยตัวคุณเอง:\n{v_lines}\n"
                          "สำหรับแต่ละ V: verdict ตรงกัน/ไม่ตรงกัน/หาไม่เจอ + ค่าที่คุณค้นเจอ",
                          temperature=0.4, max_tokens=1500, kind="verify")
        else:
            self.skip_reasons.append("evidence/external_data: ไม่มีคำขอข้อมูล → ข้ามรอบ")

        # debate r2 — only if contested
        debate_r1_txt = self.transcript_for(phases=["debate_r1"])
        if unanimous:
            self.skip_reasons.append("debate_r2: ทุกที่นั่งเห็นตรงกัน (unanimous) → ข้ามรอบ 2")
        else:
            self.phase_mark("debate_r2")
            for seat_id in analysts + challengers:
                sys_txt = seat_system(seat_id, self.ctx, with_full_data=seat_id in analysts)
                self.turn("debate_r2", seat_id, sys_txt,
                          f"รอบโต้แย้ง รอบที่ 2 (รอบชี้ขาด) — ยังมีประเด็นเห็นต่าง:\n\n{debate_r1_txt}\n\n"
                          "โฟกัสเฉพาะประเด็นที่ยังไม่ลงตัว พยายามหาข้อสรุปด้วยหลักฐานจริง ห้ามยอมความง่ายๆ โดยไม่มีหลักฐาน",
                          temperature=0.8, max_tokens=2500, kind="attack")

        # verification — challengers check claims against real data
        self.phase_mark("verification")
        claims = []
        for m in self.messages:
            if m["phase"] in ("briefing", "debate_r1", "debate_r2") and m["kind"] != "error":
                claims += _extract_claims(m["content"])
        claims = list(dict.fromkeys(claims))[:12]
        claims_txt = "\n".join(f"- {c}" for c in claims) if claims else "(ไม่มีข้อกล่าวอ้างที่ระบุชัดเจน — ตรวจจากจุดยืนที่ทุกคนให้ไว้)"
        stance_lines = "\n".join(
            f"- {m['seat_name']}: {m['content'].splitlines()[0][:120] if m['content'].splitlines() else ''}"
            for m in self.messages if m["kind"] in ("brief", "rebuttal", "attack")
        )
        for cid in challengers:
            sys_txt = seat_system(cid, self.ctx, with_full_data=True)
            user_txt = (
                "รอบตรวจสอบ: ตรวจข้อกล่าวอ้างด้านล่างทีละข้อ เทียบกับ [ตัวเลขมหภาค] ที่เป็นข้อมูลจริง\n"
                f"ข้อกล่าวอ้าง:\n{claims_txt}\n\nจุดยืนที่ทุกคนให้ไว้:\n{stance_lines}\n\n"
                "ตอบในรูปแบบ (ทุกข้อ):\n"
                "ผลตรวจ: <ข้อความย่อ> → ผ่านการพิสูจน์ | ขัดกับข้อมูลจริง | ตรวจไม่ได้ — <เหตุผล อ้างตัวเลขจริง>"
            )
            self.turn("verification", cid, sys_txt, user_txt,
                      temperature=0.3, max_tokens=2500, kind="review")

        # resolution — CEO synthesizes JSON (mirrors resolution_json)
        self.phase_mark("resolution")
        ceo_sys = seat_system("ceo", self.ctx)
        transcript = self.transcript_for()
        user_txt = (
            f"บทสนทนาเต็มของที่ประชุม:\n\n{transcript}\n\n"
            "ลงมติ: สรุปมติจากข้อสรุปที่ผ่านการพิสูจน์เท่านั้น (ตามผลตรวจของผู้ท้าทาย) — ห้ามแต่งตัวเลข ราคาอ้างอิงใช้จาก [ราคาอ้างอิง ณ เปิดประชุม]\n"
            "ตอบเป็น JSON เท่านั้น (ห้ามมีข้อความนอก JSON):\n"
            '{"resolution_md": "<markdown ฉบับวิเคราะห์เต็ม (มีอ้างอิงตัวเลข)>",'
            '"resolution_json": {"plain": {"summary": "...", "proven": ["..."], "unproven": ["..."], "watch": ["..."], "outlook": "..."},'
            '"claim_summary": {"verified": 0, "failed": 0, "unverified": 0},'
            '"stances": [{"asset": "US10Y", "stance": "long|short|neutral|insufficient_evidence", "confidence": 0, "horizon": "short|medium|long", "horizon_days": 0, "price_at": <ตัวเลข>, "reason": "..."}],'
            '"verification": [{"claim": "...", "verdict": "true|false|?"}]}}'
        )
        res = self.turn("resolution", "ceo", ceo_sys, user_txt,
                        temperature=0.3, max_tokens=8000, kind="resolution",
                        allow_error_skip=False)
        self.phase_mark("done")

        return {
            "status": "completed",
            "mode": self.mode,
            "calls": self.calls,
            "usage": self.usage_sum,
            "cost_usd": round(self.cost_usd, 6),
            "duration_s": round(time.monotonic() - self.started_at, 1),
            "phase_times": self.phase_times,
            "skip_reasons": self.skip_reasons,
            "consensus": "unanimous" if unanimous else "contested",
            "stances": {sid: {"asset": s[0], "dir": s[1], "conf": s[2]} for sid, s in stances.items()},
            "data_requests": reqs,
        }


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------
def save_run(tag: str, ctx: dict, messages: list, summary: dict):
    out_dir = RUNS / tag
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "context.json").write_text(
        json.dumps(ctx, ensure_ascii=False, indent=1), encoding="utf-8")
    (out_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    md = [f"# Boardroom prototype run: {tag} ({summary.get('status')})\n"]
    for m in messages:
        md.append(f"\n## [{m['phase']}] {m['seat_name']} ({m.get('kind','')})\n\n{m['content']}")
    (out_dir / "transcript.md").write_text("\n".join(md), encoding="utf-8")
    (out_dir / "messages.json").write_text(
        json.dumps(messages, ensure_ascii=False, indent=1), encoding="utf-8")
    return out_dir


def run_baseline(ctx: dict, tag: str = "baseline") -> dict:
    """Single-call baseline: one DeepSeek call, same input, ask for a verdict."""
    sys_txt = (
        "คุณคือนักวิเคราะห์การลงทุนอาวุโส วิเคราะห์ภาวะตลาดบอนด์/สินทรัพย์เสี่ยง\n\n"
        + format_full_data(ctx) + "\n\n" + RULES
    )
    user_txt = (
        f"วาระ: {ctx['agenda']}\n\n"
        "สรุปสถานการณ์ปัจจุบันและให้มุมมองทิศทางตลาด (ภาษาไทย): จุดยืนรายสินทรัพย์ "
        "(long/short/neutral + ความมั่นใจ) เหตุผลอ้างตัวเลขจริง ความเสี่ยงที่ต้องจับตา"
    )
    t0 = time.monotonic()
    res = llm_call(sys_txt, user_txt, temperature=0.5, max_tokens=8000)
    usage = res["usage"]
    cost = usage_cost(usage)
    summary = {
        "status": "completed", "kind": "baseline",
        "calls": 1,
        "usage": cost,
        "cost_usd": cost["cost_usd"],
        "duration_s": round(time.monotonic() - t0, 1),
        "latency_s": res["latency_s"], "model": res["model"],
    }
    out_dir = RUNS / tag
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "context.json").write_text(json.dumps(ctx, ensure_ascii=False, indent=1), encoding="utf-8")
    (out_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    (out_dir / "transcript.md").write_text(f"# Baseline (single call)\n\n## คำตอบ\n\n{res['content']}\n", encoding="utf-8")
    (out_dir / "messages.json").write_text(json.dumps([{
        "turn": 1, "phase": "baseline", "seat": "baseline", "seat_name": "นักวิเคราะห์อาวุโส (ครั้งเดียว)",
        "kind": "brief", "content": res["content"],
        "tokens_in": usage.get("prompt_tokens", 0), "tokens_out": usage.get("completion_tokens", 0),
        "latency_s": res["latency_s"], "model": res["model"],
    }], ensure_ascii=False, indent=1), encoding="utf-8")
    return summary


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--build-context", action="store_true", help="fetch real data + save context.json")
    ap.add_argument("--meeting", action="store_true", help="run a meeting")
    ap.add_argument("--baseline", action="store_true", help="run single-call baseline")
    ap.add_argument("--tag", default="runA")
    ap.add_argument("--mode", default="full", choices=["full", "short"])
    ap.add_argument("--summary", action="store_true", help="print cost summary of saved runs")
    args = ap.parse_args()

    if args.build_context:
        ctx = build_context(force=True)
        HERE.joinpath("context.json").write_text(
            json.dumps(ctx, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"context saved: {len(ctx['macro'])} chars macro, {len(ctx['news'])} chars news")
        print("agenda:", ctx["agenda"][:200])
        print("reference:", {k: v for k, v in ctx["reference_prices"].items() if v is not None})
        return

    if args.summary:
        for tag in sorted(p.name for p in RUNS.iterdir() if (p / "summary.json").exists()):
            s = json.loads((RUNS / tag / "summary.json").read_text(encoding="utf-8"))
            print(json.dumps({**s, "tag": tag}, ensure_ascii=False))
        return

    ctx_path = HERE / "context.json"
    if not ctx_path.exists():
        raise SystemExit("run --build-context first")
    ctx = json.loads(ctx_path.read_text(encoding="utf-8"))

    if args.meeting:
        meeting = Meeting(ctx, tag=args.tag, mode=args.mode)
        try:
            summary = meeting.run()
        except RuntimeError as e:
            summary = {"status": "failed", "error": str(e), "calls": meeting.calls,
                       "usage": meeting.usage_sum, "cost_usd": round(meeting.cost_usd, 6),
                       "duration_s": round(time.monotonic() - meeting.started_at, 1),
                       "skip_reasons": meeting.skip_reasons}
        except Exception as e:  # never lose the transcript
            summary = {"status": "failed", "error": f"{type(e).__name__}: {e}",
                       "calls": meeting.calls, "usage": meeting.usage_sum,
                       "cost_usd": round(meeting.cost_usd, 6),
                       "duration_s": round(time.monotonic() - meeting.started_at, 1),
                       "skip_reasons": meeting.skip_reasons}
        out = save_run(args.tag, ctx, meeting.messages, summary)
        print(f"saved -> {out}")
        print(json.dumps(summary, ensure_ascii=False, indent=1))
        return

    if args.baseline:
        s = run_baseline(ctx, tag=args.tag or "baseline")
        print(json.dumps(s, ensure_ascii=False, indent=1))
        return


if __name__ == "__main__":
    main()
