#!/usr/bin/env python3
"""Prototype trade-desk: 2 teams x 3 personas x 2 scenarios — real DeepSeek.

พิสูจน์: สองทีม (A สายเทรนด์ vs B สายกลับค่า) ตัดสินใจต่างกันจริงจากข้อมูลชุดเดียวกัน
+ วัดต้นทุน/เวลา/คุณภาพ (ticket 03).

รันจาก backend:  python ../.scratch/trade-desk/prototype-01/prototype_td.py
"""

import json
import os
import sys
import time
import uuid

sys.path.insert(0, os.getcwd())  # รันจาก backend — ให้ import app.* เจอ

import httpx

# ── DeepSeek ────────────────────────────────────────────────────────────────
def load_key() -> str:
    for line in open(".env", encoding="utf-8"):
        if line.startswith("DEEPSEEK_API_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("DEEPSEEK_API_KEY not found in backend/.env")

KEY = load_key()
URL = "https://api.deepseek.com/chat/completions"
MODEL = "deepseek-v4-flash"
COST_IN = 0.14 / 1e6          # cache-miss
COST_OUT = 0.28 / 1e6


def llm(system: str, user: str, temp: float = 0.4) -> tuple[str, dict, float]:
    t0 = time.time()
    r = httpx.post(URL, headers={"Authorization": f"Bearer {KEY}"},
                   json={"model": MODEL, "messages": [
                       {"role": "system", "content": system},
                       {"role": "user", "content": user},
                   ], "temperature": temp, "max_tokens": 1500,
                       "thinking": {"type": "disabled"}}, timeout=180)
    r.raise_for_status()
    data = r.json()
    content = data["choices"][0]["message"]["content"]
    usage = data.get("usage", {})
    cost = (usage.get("prompt_tokens", 0) * COST_IN +
            usage.get("completion_tokens", 0) * COST_OUT)
    return content, usage, time.time() - t0


def parse_order(content: str) -> dict:
    """JSON extraction — กัน fence/ข้อความรอบ (เลียนแบบ boardroom _parse_json_block)."""
    if not content:
        return {}
    s = content.strip()
    # 1) fenced block
    if "```" in s:
        for chunk in s.split("```"):
            if chunk.strip().startswith(("{", "json")):
                cand = chunk.strip()
                if cand.startswith("json"):
                    cand = cand[4:].strip()
                if cand.startswith("{") and cand.endswith("}"):
                    try:
                        return json.loads(cand)
                    except Exception:
                        pass
    # 2) whole-content JSON
    try:
        return json.loads(s)
    except Exception:
        pass
    # 3) first {...} block
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


# ── Data packs (real data — reuse build_snapshot) ───────────────────────────
def build_context() -> dict:
    from app import boardroom_service, price_service
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        snap = boardroom_service.build_snapshot(db)
    finally:
        db.close()
    # technical pack: ราคา/MA/RSI ของสินทรัพย์หลัก (real)
    assets = ["XAUUSD", "USOIL", "^GSPC", "^IXIC", "TLT", "BTC-USD", "USDJPY", "EURUSD"]
    quotes = {}
    for a in assets:
        p = price_service.get_price(a)
        if p:
            quotes[a] = round(p, 2)
    return {"snapshot": snap, "quotes": quotes}


def fmt_technical(ctx: dict) -> str:
    q = ctx["quotes"]
    lines = ["ราคาปัจจุบัน (yfinance):"]
    for a, p in q.items():
        lines.append(f"  {a}: {p}")
    ms = ctx["snapshot"].get("model_scores", {})
    lines.append("คะแนนโมเดล (0-100, ≥60 = สัญญาณ active):")
    for k, v in list(ms.items())[:8]:
        lines.append(f"  {k}: {v}")
    news = ctx["snapshot"].get("news", [])
    if news:
        lines.append("ข่าว top (impact ≥ 70):")
        for n in news[:3]:
            lines.append(f"  [{n.get('impact_score')}] {n.get('title_th') or n.get('title')}")
    return "\n".join(lines)


def fmt_macro(ctx: dict) -> str:
    snap = ctx["snapshot"]
    mv = snap.get("macro_values", {})
    lines = ["ตัวเลขมหภาค (FRED — ล่าสุด):"]
    for k, v in list(mv.items())[:12]:
        lines.append(f"  {k}: {v}")
    lines.append("แนวโน้มล่าสุด (จุดเปลี่ยน vs 5 จุดก่อน):")
    for k, rows in list(snap.get("macro_history", {}).items())[:4]:
        if len(rows) >= 6:
            trend = rows[-1][1] - rows[-6][1]
            lines.append(f"  {k}: Δ{trend:+.4f} (5 จุด)")
    news = snap.get("news", [])
    if news:
        lines.append("ข่าว top (impact ≥ 70):")
        for n in news[:4]:
            lines.append(f"  [{n.get('impact_score')}] {n.get('title_th') or n.get('title')}")
    return "\n".join(lines)


# ── Prompts (ticket 02 — 2 ทีม) ─────────────────────────────────────────────
def team_system(team: str, persona: str) -> str:
    if team == "A":
        base = ("คุณเป็นนักวิเคราะห์สายเทรนด์/โมเมนตัมในทีม A (Team Trend Rider) "
                "พอร์ต $10,000 เป้าหมาย MTD +5–20% กรอบเวลา 1–7 วัน ความเสี่ยงต่อไม้ 5–10% ของพอร์ต "
                "หลักการ: เข้าเมื่อเทรนด์ชัด (ราคาเหนือ MA + โมเมนตัม + คะแนนโมเดล ≥60) ตัดขาดทุนไวเมื่อเทรนด์พัง")
    else:
        base = ("คุณเป็นนักวิเคราะห์สายกลับค่า/มหภาคในทีม B (Team Mean Reverter) "
                "พอร์ต $10,000 เป้าหมาย MTD +5–20% กรอบเวลา 7–30 วัน ความเสี่ยงต่อไม้ 2–5% ของพอร์ต "
                "หลักการ: เข้าสวนทางสุดขั้ว (ค่าเบี่ยงเบนสูง + มหภาคสนับสนุนการกลับตัว) อดทนรอจังหวะ ไม่ไล่ราคา")
    if persona == "trend":
        return base + "\nบทบาท: นักวิเคราะห์เทรนด์ — ดู MA/โมเมนตัม/แนวโน้ม คะแนนโมเดล"
    if persona == "technical":
        return base + "\nบทบาท: นักวิเคราะห์เทคนิคอล — ดูแนวรับ/ต้าน รูปแบบแท่ง volume"
    if persona == "macro":
        return base + "\nบทบาท: นักวิเคราะห์มหภาค — ดู FRED (ยิลด์/เงินเฟ้อ/แรงงาน) จุดเปลี่ยน"
    return base + "\nบทบาท: นักวิเคราะห์สวนฝูง — ดูข่าว impact ตำแหน่งตลาด โอกาสกลับตัว"


def lead_system(team: str) -> str:
    t = "ทีม A (สายเทรนด์ 1–7 วัน risk 5–10%)" if team == "A" else "ทีม B (สายกลับค่า 7–30 วัน risk 2–5%)"
    return (f"คุณเป็นหัวหน้าทีมของ{t} พอร์ต $10,000 ฟังข้อเสนอลูกทีม 2 คน แล้วเคาะออเดอร์ "
            "ตอบ JSON เท่านั้น: {\"action\": \"open|close|hold\", \"market\": \"XAUUSD\", \"side\": \"long|short\", "
            "\"size_pct\": 5, \"sl_pct\": 2, \"tp_pct\": 4, \"horizon_days\": 7, \"reason\": \"...\"} "
            "size_pct = % ของพอร์ต (ต้องอยู่ในกรอบความเสี่ยงทีม) · ไม้เดิมไม่มี (พอร์ตใหม่)")


def run_turn(team: str, scenario: str, ctx: dict) -> list[dict]:
    calls = []
    if team == "A":
        personas = [("trend", fmt_technical(ctx)), ("technical", fmt_technical(ctx))]
    else:
        personas = [("macro", fmt_macro(ctx)), ("contrarian", fmt_macro(ctx))]
    for persona, pack in personas:
        content, usage, dt = llm(team_system(team, persona),
                                 f"สถานการณ์: {scenario}\n\nข้อมูล:\n{pack}\n\n"
                                 "เสนอไม้ (JSON เท่านั้น): {\"action\": \"open|hold\", \"market\": ..., "
                                 "\"side\": ..., \"size_pct\": ..., \"sl_pct\": ..., \"tp_pct\": ..., "
                                 "\"horizon_days\": ..., \"reason\": \"...\"}")
        calls.append({"seat": persona, "content": content,
                      "order": parse_order(content), "usage": usage, "sec": dt})
    # lead
    offers = "\n".join(f"[{c['seat']}] {json.dumps(c['order'], ensure_ascii=False)}"
                       for c in calls)
    content, usage, dt = llm(lead_system(team),
                             f"สถานการณ์: {scenario}\n\nข้อมูลรวม:\n{fmt_technical(ctx)}\n---\n{fmt_macro(ctx)}\n\n"
                             f"ข้อเสนอลูกทีม:\n{offers}\n\nเคาะออเดอร์ (JSON เท่านั้น)")
    calls.append({"seat": "lead", "content": content,
                  "order": parse_order(content), "usage": usage, "sec": dt})
    return calls


def cost_of(calls: list[dict]) -> tuple[float, int, int]:
    tin = sum(c["usage"].get("prompt_tokens", 0) for c in calls)
    tout = sum(c["usage"].get("completion_tokens", 0) for c in calls)
    return tin * COST_IN + tout * COST_OUT, tin, tout


# ── Main ────────────────────────────────────────────────────────────────────
def main() -> int:
    scenarios = [
        "น้ำมันช็อก: อิหร่านปิดช่องแคบฮอร์มุซ — น้ำมันดิบพุ่ง 8% ข้ามคืน เงินเฟ้อกดดัน",
        "สหรัฐอ่อน: CPI ออกสูงกว่าคาด + ตลาดแรงงานอ่อนลง — เฟดอาจลดดอกเบี้ยเร็วขึ้น",
    ]
    ctx = build_context()
    out = {"scenarios": []}
    for si, sc in enumerate(scenarios):
        row = {"scenario": sc, "teams": {}}
        for team in ("A", "B"):
            calls = run_turn(team, sc, ctx)
            cost, tin, tout = cost_of(calls)
            row["teams"][team] = {
                "calls": [{"seat": c["seat"], "order": c["order"], "sec": c["sec"],
                           "content": c["content"][:800]} for c in calls],
                "cost_usd": round(cost, 6), "tokens_in": tin, "tokens_out": tout,
                "seconds": round(sum(c["sec"] for c in calls), 1),
            }
            print(f"[S{si}][{team}] ${cost:.6f} · {tin}+{tout} tok · "
                  f"{sum(c['sec'] for c in calls):.1f}s", flush=True)
        out["scenarios"].append(row)
    OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "runs")
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "prototype_td.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"saved {OUT_DIR}/prototype_td.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
