#!/usr/bin/env python3
"""generate_html.py — render meeting transcripts (messages.json) as readable HTML.

Usage: env -u PYTHONPATH -u VIRTUAL_ENV backend/.venv/Scripts/python.exe
           .scratch/boardroom/prototype-03/generate_html.py [runA runB baseline]
"""
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RUNS = HERE / "runs"

SEAT_COLORS = {
    "ceo": "#f59e0b", "scout": "#22d3ee", "macro": "#38bdf8",
    "credit": "#34d399", "technical": "#a78bfa", "challenger_a": "#f87171",
    "challenger_b": "#fb923c", "baseline": "#94a3b8",
}
PHASE_TH = {
    "opening": "เปิดวาระ", "research": "วิจัยภายนอก", "briefing": "นำเสนอ",
    "debate_r1": "โต้แย้ง รอบ 1", "debate_r2": "โต้แย้ง รอบ 2",
    "evidence": "หาหลักฐานเพิ่ม", "external_data": "ตรวจตัวเลขภายนอก",
    "verification": "ตรวจสอบ", "resolution": "ลงมติ", "baseline": "สรุปครั้งเดียว",
}


def md_inline(text: str) -> str:
    t = html.escape(text)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", t)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    return t


def md_block(text: str) -> str:
    """Minimal markdown -> HTML for the subset the model actually writes."""
    out: list[str] = []
    lines = text.splitlines()
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        s = line.strip()
        if not s:
            i += 1
            continue
        if s.startswith("|") and i + 1 < n and set(lines[i + 1].strip().replace("|", "").replace("-", "").replace(":", "").strip()) == set():
            # table
            header = [c.strip() for c in s.strip("|").split("|")]
            i += 2
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            t = ["<table><thead><tr>" + "".join(f"<th>{md_inline(h)}</th>" for h in header) + "</tr></thead><tbody>"]
            for r in rows:
                t.append("<tr>" + "".join(f"<td>{md_inline(c)}</td>" for c in r) + "</tr>")
            t.append("</tbody></table>")
            out.append("".join(t))
            continue
        if s.startswith("###"):
            out.append(f"<h4>{md_inline(s[3:].strip())}</h4>"); i += 1; continue
        if s.startswith("##"):
            out.append(f"<h3>{md_inline(s[2:].strip())}</h3>"); i += 1; continue
        if s.startswith("#"):
            out.append(f"<h2>{md_inline(s[1:].strip())}</h2>"); i += 1; continue
        if s.startswith(">"):
            buf = []
            while i < n and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip().lstrip(">").strip())
                i += 1
            out.append(f"<blockquote>{md_inline('<br>'.join(buf))}</blockquote>")
            continue
        if re.match(r"^[-*] ", s):
            buf = []
            while i < n and re.match(r"^[-*] ", lines[i].strip()):
                buf.append(md_inline(lines[i].strip()[2:]))
                i += 1
            out.append("<ul>" + "".join(f"<li>{b}</li>" for b in buf) + "</ul>")
            continue
        if re.match(r"^\d+\.\s", s):
            buf = []
            while i < n and re.match(r"^\d+\.\s", lines[i].strip()):
                buf.append(md_inline(re.sub(r"^\d+\.\s", "", lines[i].strip())))
                i += 1
            out.append("<ol>" + "".join(f"<li>{b}</li>" for b in buf) + "</ol>")
            continue
        if s.startswith("```"):
            buf = []
            i += 1
            while i < n and not lines[i].strip().startswith("```"):
                buf.append(html.escape(lines[i]))
                i += 1
            i += 1
            out.append("<pre>" + "<br>".join(buf) + "</pre>")
            continue
        # paragraph (join consecutive non-empty non-special lines)
        buf = [md_inline(line.strip())]
        i += 1
        while i < n and lines[i].strip() and not lines[i].strip().startswith(("#", "|", ">", "```", "- ", "* ", "1.")) and not re.match(r"^\d+\.\s", lines[i].strip()):
            buf.append("<br>" + md_inline(lines[i].strip()))
            i += 1
        out.append(f"<p>{''.join(buf)}</p>")
    return "\n".join(out)


def render(tag: str) -> Path:
    msgs = json.loads((RUNS / tag / "messages.json").read_text(encoding="utf-8"))
    summary = json.loads((RUNS / tag / "summary.json").read_text(encoding="utf-8"))
    ctx = json.loads((RUNS / tag / "context.json").read_text(encoding="utf-8"))

    cards = []
    for m in msgs:
        seat = m["seat"]
        color = SEAT_COLORS.get(seat, "#94a3b8")
        phase_th = PHASE_TH.get(m["phase"], m["phase"])
        kind = m.get("kind", "")
        meta = []
        if m.get("tokens_in") is not None:
            meta.append(f"tok {m['tokens_in']:,}→{m.get('tokens_out', 0):,}")
        if m.get("latency_s"):
            meta.append(f"{m['latency_s']:.0f}s")
        if m.get("error"):
            meta.append("⚠️ error")
        body = md_block(m["content"]) if m.get("kind") != "error" else f'<p class="err">{html.escape(m["content"])}</p>'
        cards.append(
            f'<div class="msg"><div class="avatar" style="background:{color}"></div>'
            f'<div class="bubble"><div class="head">'
            f'<span class="name" style="color:{color}">{html.escape(m["seat_name"])}</span>'
            f'<span class="phase">{phase_th}</span><span class="kind">{kind}</span>'
            f'<span class="meta">{html.escape(" · ".join(meta))}</span></div>{body}</div></div>'
        )

    st = summary
    header = (
        f"<h1>🏛️ ห้องประชุม AI — {tag}</h1>"
        f'<p class="sub">{html.escape(ctx.get("agenda", ""))}</p>'
        f'<div class="stats">{st.get("status")} · {st.get("calls")} คอล · '
        f'${st.get("cost_usd", 0):.4f} · {st.get("duration_s", 0) / 60:.1f} นาที · '
        f'consensus: {st.get("consensus", "-")}</div>'
    )
    page = f"""<!DOCTYPE html>
<html lang="th"><head><meta charset="utf-8">
<title>Boardroom transcript — {tag}</title>
<style>
 body{{background:#0b1220;color:#e2e8f0;font-family:'Segoe UI','Tahoma',sans-serif;max-width:900px;margin:0 auto;padding:20px;line-height:1.6}}
 h1{{font-size:20px;color:#f8fafc}} .sub{{color:#94a3b8;font-size:13px;margin-top:-8px}}
 .stats{{background:#111a2e;border:1px solid #1e293b;border-radius:8px;padding:8px 12px;font-size:12px;color:#7dd3fc;margin:12px 0 20px}}
 .msg{{display:flex;gap:10px;margin-bottom:14px}}
 .avatar{{width:34px;height:34px;border-radius:50%;flex-shrink:0;margin-top:2px;border:2px solid #1e293b}}
 .bubble{{background:#111a2e;border:1px solid #1e293b;border-radius:12px;padding:10px 14px;flex:1;min-width:0}}
 .head{{display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap}}
 .name{{font-weight:700;font-size:13px}} .phase{{background:#1e293b;border-radius:999px;padding:1px 8px;font-size:10px;color:#cbd5e1}}
 .kind{{font-size:10px;color:#64748b}} .meta{{margin-left:auto;font-size:10px;color:#64748b}}
 .bubble p{{margin:4px 0}} .bubble h2{{font-size:15px;margin:10px 0 4px;color:#fbbf24}}
 .bubble h3{{font-size:14px;margin:8px 0 4px;color:#fbbf24}} .bubble h4{{font-size:13px;margin:8px 0 4px;color:#93c5fd}}
 .bubble ul,.bubble ol{{margin:6px 0;padding-left:22px}} .bubble li{{margin:2px 0}}
 .bubble blockquote{{border-left:3px solid #f59e0b;margin:8px 0;padding:2px 10px;color:#fcd34d;background:#1c1917;border-radius:0 6px 6px 0}}
 .bubble table{{border-collapse:collapse;margin:8px 0;font-size:12px;width:100%}}
 .bubble th{{background:#1e293b;color:#7dd3fc;padding:5px 8px;border:1px solid #334155;text-align:left}}
 .bubble td{{padding:5px 8px;border:1px solid #263449}}
 .bubble code{{background:#0f172a;padding:1px 5px;border-radius:4px;font-size:12px;color:#a5b4fc}}
 .bubble pre{{background:#0f172a;padding:10px;border-radius:8px;overflow-x:auto;font-size:12px}}
 .err{{color:#fca5a5}}
 .footer{{margin-top:30px;color:#475569;font-size:11px;text-align:center}}
</style></head><body>{header}{''.join(cards)}
<div class="footer">prototype-03 · deepseek-v4-flash · transcript auto-render</div></body></html>"""
    out = RUNS / tag / "transcript.html"
    out.write_text(page, encoding="utf-8")
    return out


if __name__ == "__main__":
    tags = sys.argv[1:] or ["runA", "runB", "baseline"]
    for tag in tags:
        try:
            p = render(tag)
            print(f"rendered -> {p}")
        except FileNotFoundError as e:
            print(f"[{tag}] ข้าม: {e}")
