# backend/app/news_service.py
"""News pipeline for the Bond-crisis "ข่าวสาร" tab — mirrors the reference
site's /news page. RSS headlines (free, key-less feeds surveyed in
docs/research/rss-feeds-2026-08-09.md) are fetched in parallel, normalized to
the reference news_items shape, enriched by DeepSeek (Thai title, impact
score 0-100, category, related models — batched ~20/call with json_object),
and persisted in SQLite so pagination/filtering is server-side and
translation is paid once per item (translate-once cache).

Never fabricates: a headline that fails fetch/enrich renders unavailable.
"""

from __future__ import annotations

import email.utils
import json
import os
import re
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import httpx
from sqlalchemy import Column, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Session

from app.database import Base

# --- Sources (surveyed 2026-08-09, all free, no key) ----------------------
# Scope: STOCK/MARKET news only, per user request ("เอาแต่เกี่ยวกับหุ้นหรือ
# ข่าวที่มีผลกระทบกับหุ้น"). General-world feeds (Al Jazeera all, CNN World,
# Google News top, BP topstories) were dropped — they pulled in sports,
# celebrity and politics noise. Replaced with market-focused feeds:
# Bloomberg markets + FT markets + Google News top-business topic.
FEEDS: list[dict] = [
    {"source": "ZeroHedge", "url": "https://feeds.feedburner.com/zerohedge/feed", "category": "market"},
    {"source": "MarketWatch", "url": "http://feeds.marketwatch.com/marketwatch/topstories/", "category": "market"},
    {"source": "Reuters", "url": "https://news.google.com/rss/search?q=site%3Areuters.com&hl=en-US&gl=US&ceid=US:en", "category": "world"},
    {"source": "Google News", "url": "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en", "category": "market"},
    {"source": "CNBC", "url": "https://www.cnbc.com/id/100003114/device/rss/rss.html", "category": "market"},
    {"source": "Bloomberg", "url": "https://feeds.bloomberg.com/markets/news.rss", "category": "market"},
    {"source": "Financial Times", "url": "https://www.ft.com/rss/markets", "category": "market"},
    {"source": "Bangkok Post", "url": "https://www.bangkokpost.com/rss/data/business.xml", "category": "economy"},
]

# Reference categories + regime models the DeepSeek prompt is pinned to.
CATEGORIES = ["market", "bond", "crypto", "world", "war", "economy", "energy", "thai"]
REGIME_MODELS = ["recovery-reflation", "inflation-oil", "fed-pivot", "yield-shock", "credit-panic", "bank-run"]

ANALYSIS_MIN_IMPACT = 40  # user's cost-control pick: analysis only for impact >= 40
MIN_IMPACT_DEFAULT = 20   # user's scope pick: only stock/market-relevant news (impact >= 20)
ENRICH_BATCH_SIZE = 20    # ~20 headlines per DeepSeek call (system prompt paid once)
SUMMARY_MAX_CHARS = 600   # ZeroHedge embeds full articles; cap it
PAGE_SIZE = 20            # reference paginates 20 per page
REFRESH_TTL_SECONDS = 300  # reference refreshMs 300000

_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"}
_TIMEOUT = 20.0

# LLM gateway (switched 2026-08-11): OpenRouter -> opencode-go (opencode.ai/zen/go/v1),
# key locked to deepseek-v4-flash. Same chat-completions shape; reasoning.enabled
# is accepted (ignored) by the gateway.
DEEPSEEK_URL = "https://opencode.ai/zen/go/v1/chat/completions"
DEEPSEEK_MODEL = "deepseek-v4-flash"


def _deepseek_key() -> str | None:
    return os.environ.get("DEEPSEEK_API_KEY")


# --- ORM -------------------------------------------------------------------
class NewsItem(Base):
    """One headline, mirroring the reference news_items shape."""

    __tablename__ = "news_items"

    id = Column(String(36), primary_key=True)  # uuid4 hex
    title = Column(String(500), nullable=False)
    summary = Column(Text, nullable=True)
    url = Column(String(1000), nullable=False, unique=True)
    source = Column(String(100), nullable=False)
    category = Column(String(32), nullable=True)      # DeepSeek-assigned
    impact_score = Column(Integer, nullable=True)     # 0-100, DeepSeek-assigned
    published_at = Column(DateTime(timezone=True), nullable=True)
    title_th = Column(String(500), nullable=True)     # DeepSeek translation
    analysis_th = Column(Text, nullable=True)         # DeepSeek, only impact >= 40
    related_models = Column(String(200), nullable=True)  # JSON list
    created_at = Column(DateTime(timezone=True), nullable=False)


# --- RSS fetch + normalize -------------------------------------------------
def _parse_rss(raw: bytes) -> list[dict]:
    """Parse RSS 2.0/Atom via stdlib xml. Returns normalized items."""
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return []
    out = []
    for node in root.iter():
        tag = node.tag.split("}", 1)[-1]
        if tag not in ("item", "entry"):
            continue

        def local_children() -> dict[str, str]:
            """Map local-name -> text for direct children of this item/entry,
            working across namespaces (Atom)."""
            found: dict[str, str] = {}
            for child in node:
                lname = child.tag.split("}", 1)[-1]
                text = (child.text or "").strip()
                if lname in ("title", "description", "summary", "content",
                             "pubDate", "published", "updated"):
                    if text and lname not in found:
                        found[lname] = text
            return found

        kids = local_children()
        title = kids.get("title", "")
        if not title:
            continue
        # RSS uses <link>text</link>; Atom uses <link href="..."/>.
        link = ""
        for child in node:
            lname = child.tag.split("}", 1)[-1]
            if lname == "link":
                link = (child.text or "").strip() or (child.get("href") or "").strip()
                break
        if not link:
            continue
        # RSS 2.0 uses description; Atom uses summary; CNN World uses content.
        summary = kids.get("description") or kids.get("summary") or kids.get("content")
        pub_raw = kids.get("pubDate") or kids.get("published") or kids.get("updated")
        published = None
        if pub_raw:
            try:
                published = email.utils.parsedate_to_datetime(pub_raw)
                if published.tzinfo is None:
                    published = published.replace(tzinfo=timezone.utc)
            except (TypeError, ValueError):
                # Atom uses ISO 8601 (2026-08-05T10:00:00Z) — parsedate only
                # handles RFC-822.
                try:
                    published = datetime.fromisoformat(pub_raw.replace("Z", "+00:00"))
                    if published.tzinfo is None:
                        published = published.replace(tzinfo=timezone.utc)
                except ValueError:
                    published = None
        out.append({
            "title": re.sub(r"\s+", " ", title).strip()[:500],
            "summary": re.sub(r"\s+", " ", summary).strip()[:SUMMARY_MAX_CHARS] or None,
            "url": link.strip(),
            "published_at": published,
        })
    return out


def _canonical_url(url: str) -> str:
    """Dedupe key. Google News RSS links are redirect URLs with query params —
    strip the redirect noise so one story from two feeds dedupes."""
    from urllib.parse import unquote

    if "news.google.com" in url:
        m = re.search(r"[?&]url=([^&]+)", url)
        if m:
            return unquote(m.group(1))
        # no embedded url param — keep as-is
        return url.split("&")[0]
    return url.split("?")[0]


def _fetch_feed(spec: dict) -> list[dict]:
    try:
        with httpx.Client(timeout=_TIMEOUT, follow_redirects=True, headers=_HEADERS) as client:
            r = client.get(spec["url"])
        if r.status_code != 200 or not r.content:
            return []
        items = _parse_rss(r.content)
        for it in items:
            it["source"] = spec["source"]
            it.setdefault("category", spec.get("category"))
        return items
    except Exception:
        return []  # per-source failure isolation


def _fetch_all_feeds() -> list[dict]:
    with ThreadPoolExecutor(max_workers=8) as pool:
        batches = list(pool.map(_fetch_feed, FEEDS))
    return [it for batch in batches for it in batch]


# --- DeepSeek enrichment ---------------------------------------------------
def _enrich_batch(items: list[dict]) -> list[dict]:
    """One DeepSeek call per batch: Thai title + impact + category + models."""
    key = _deepseek_key()
    if not key:
        for it in items:
            it["title_th"] = None
            it["impact_score"] = None
            it["category"] = None
            it["related_models"] = []
        return items
    system = (
        "You are a financial news analyst. Translate each headline into natural Thai "
        "(title_th), assign an impact score 0-100 (how much it could move US bond/equity "
        f"markets; 0 = noise, 100 = regime-changing), pick ONE category from "
        f"{json.dumps(CATEGORIES, ensure_ascii=False)}, and list related regime models "
        f"from {json.dumps(REGIME_MODELS)} (empty list if none). "
        "Return ONLY a JSON object with key 'items' = array, same order as input, each: "
        '{"title_th": "...", "impact_score": 0-100, "category": "...", "related_models": ["..."]}. '
        "No markdown, no commentary."
    )
    titles = [it["title"] for it in items]
    user = "Headlines:\n" + "\n".join(f"{i + 1}. {t}" for i, t in enumerate(titles))
    try:
        r = httpx.post(
            DEEPSEEK_URL,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": DEEPSEEK_MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "temperature": 0.2,
                "max_tokens": 8000,
                "response_format": {"type": "json_object"},
                "reasoning": {"enabled": False},  # gateway — ปิด reasoning
            },
            timeout=180,
        )
        if r.status_code != 200:
            return [dict(it, title_th=None, impact_score=None, category=None, related_models=[]) for it in items]
        content = r.json()["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        enriched = json.loads(content).get("items", [])
        if len(enriched) != len(items):
            enriched = enriched[:len(items)]
        for it, en in zip(items, enriched + [{}] * max(0, len(items) - len(enriched))):
            it["title_th"] = (en.get("title_th") or None)
            it["impact_score"] = en.get("impact_score")
            it["category"] = en.get("category") or it.get("category")
            it["related_models"] = en.get("related_models") or []
        return items
    except Exception:
        return [dict(it, title_th=None, impact_score=None, category=None, related_models=[]) for it in items]


def _analyze(item: dict) -> str | None:
    """Short Thai analysis for high-impact items (user: impact >= 40 only)."""
    key = _deepseek_key()
    if not key or not item.get("title"):
        return None
    try:
        r = httpx.post(
            DEEPSEEK_URL,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": DEEPSEEK_MODEL,
                "messages": [
                    {"role": "system", "content": (
                        "You are a Thai fixed-income/macro analyst. Write a SHORT Thai analysis "
                        "(max 120 words) of this headline for retail investors: what it means, "
                        "which US bond/equity/commodity markets it could move, and why. "
                        "Plain prose, no markdown, no headers."
                    )},
                    {"role": "user", "content": json.dumps({
                        "title_en": item.get("title"),
                        "title_th": item.get("title_th"),
                        "category": item.get("category"),
                        "impact_score": item.get("impact_score"),
                    }, ensure_ascii=False)},
                ],
                "temperature": 0.4,
                "max_tokens": 400,
            },
            timeout=120,
        )
        if r.status_code != 200:
            return None
        return r.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        return None


# --- Pipeline --------------------------------------------------------------
def refresh_news(db: Session) -> dict:
    """Fetch feeds, dedupe against DB + within sweep, persist new items as-is.

    IMPORTANT: this only fetches + persists (fast, ~5s) — DeepSeek enrichment
    runs in a background thread via enrich_pending() so the page never waits
    ~8 minutes for 277 headlines to be translated. New items appear with
    English titles and null Thai fields until the background sweep catches up.

    Returns a summary dict for the caller (new / total counts).
    """
    import uuid

    raw = _fetch_all_feeds()

    # Existing URLs (canonicalized) — translate-once: already-enriched items
    # are never re-enriched.
    existing = {row.url for row in db.query(NewsItem.url).all()}

    seen: set[str] = set()
    fresh: list[dict] = []
    for it in raw:
        canon = _canonical_url(it["url"])
        if canon in existing or canon in seen:
            continue
        seen.add(canon)
        it["_canon"] = canon
        fresh.append(it)

    now = datetime.now(timezone.utc)
    for it in fresh:
        db.add(NewsItem(
            id=uuid.uuid4().hex,
            title=it["title"],
            summary=it.get("summary"),
            url=it["_canon"],
            source=it.get("source", ""),
            category=it.get("category"),
            impact_score=None,
            published_at=it.get("published_at"),
            title_th=None,
            analysis_th=None,
            related_models=None,
            created_at=now,
        ))
    db.commit()
    return {"fetched": len(raw), "new": len(fresh), "total": existing_total(db)}


def enrich_pending(db: Session, limit: int = 40) -> int:
    """Enrich up to `limit` items that still lack a Thai title (background
    sweep, translate-once: already-enriched items are skipped). Returns the
    number of items enriched this round."""
    pending = (
        db.query(NewsItem)
        .filter(NewsItem.title_th.is_(None))
        .order_by(NewsItem.published_at.desc().nullslast())
        .limit(limit)
        .all()
    )
    if not pending:
        return 0
    for i in range(0, len(pending), ENRICH_BATCH_SIZE):
        chunk = pending[i:i + ENRICH_BATCH_SIZE]
        dicts = [{"title": c.title, "category": c.category, "source": c.source} for c in chunk]
        _enrich_batch(dicts)
        for card, en in zip(chunk, dicts):
            card.title_th = en.get("title_th")
            card.impact_score = en.get("impact_score")
            card.category = en.get("category") or card.category
            card.related_models = json.dumps(en.get("related_models") or [], ensure_ascii=False) if en.get("related_models") else None
            if (en.get("impact_score") or 0) >= ANALYSIS_MIN_IMPACT:
                card.analysis_th = _analyze({"title": card.title, "title_th": card.title_th,
                                             "category": card.category, "impact_score": en.get("impact_score")})
    db.commit()
    return len(pending)


def existing_total(db: Session) -> int:
    return db.query(NewsItem).count()
