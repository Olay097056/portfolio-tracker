# backend/app/routers/news.py
"""GET /api/news — paginated, sortable (date/impact), filterable (source,
impact >= N) news feed for the Bond-crisis "ข่าวสาร" tab, mirroring the
reference site's /news data access. Backed by the SQLite news pipeline."""

from __future__ import annotations

import json
import threading
import time
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app import news_service
from app.database import SessionLocal, get_db

router = APIRouter(prefix="/api/news", tags=["news"])

_CACHE_TTL_SECONDS = news_service.REFRESH_TTL_SECONDS
_cache: dict[str, tuple[float, dict]] = {}


class NewsItemOut(BaseModel):
    id: str
    title: str
    summary: str | None
    url: str
    source: str
    category: str | None
    impact_score: int | None
    published_at: str | None
    title_th: str | None
    analysis_th: str | None
    related_models: list[str]


class NewsListOut(BaseModel):
    items: list[NewsItemOut]
    count: int
    page: int
    page_size: int
    pages: int
    sources: list[str]
    updated_at: str


def _to_out(row) -> NewsItemOut:
    models: list[str] = []
    if row.related_models:
        try:
            models = json.loads(row.related_models)
        except (TypeError, ValueError):
            models = []
    return NewsItemOut(
        id=row.id,
        title=row.title,
        summary=row.summary,
        url=row.url,
        source=row.source,
        category=row.category,
        impact_score=row.impact_score,
        published_at=row.published_at.strftime("%Y-%m-%dT%H:%M:%SZ") if row.published_at else None,
        title_th=row.title_th,
        analysis_th=row.analysis_th,
        related_models=models,
    )


def _kick_off_enrichment() -> None:
    """Fire-and-forget background enrichment: the request returns as soon as
    headlines are persisted (~5s) and DeepSeek translation catches up in the
    background — a full sweep of 277 items would take ~8 minutes synchronously."""

    def _work():
        try:
            db = SessionLocal()
            try:
                news_service.enrich_pending(db, limit=40)
            finally:
                db.close()
        except Exception:
            pass  # never let background failures break the page

    threading.Thread(target=_work, daemon=True).start()


def _get_or_refresh(db: Session, force: bool = False) -> dict:
    cached = _cache.get("news")
    if not force and cached and (time.time() - cached[0] < _CACHE_TTL_SECONDS):
        return cached[1]
    try:
        news_service.refresh_news(db)
    except Exception:
        # Never fabricate: if the sweep fails, serve what the DB already has
        # (it may be empty) rather than erroring the whole page.
        pass
    else:
        _kick_off_enrichment()
    payload = {
        "sources": [s for (s,) in db.query(news_service.NewsItem.source).distinct().order_by(news_service.NewsItem.source).all()],
        "updated_at": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC"),
        "cached": not force,
    }
    _cache["news"] = (time.time(), payload)
    return payload


@router.get("", response_model=NewsListOut)
def get_news(
    page: Annotated[int, Query(ge=1)] = 1,
    sort: Annotated[str, Query(pattern="^(date|impact)$")] = "date",
    source: str | None = None,
    min_impact: Annotated[int | None, Query(ge=0, le=100)] = None,
    db: Session = Depends(get_db),
) -> NewsListOut:
    """Paginated news list. sort=date|impact, filter by source and impact >= N."""
    _get_or_refresh(db)
    query = db.query(news_service.NewsItem)
    if source:
        query = query.filter(news_service.NewsItem.source == source)
    if min_impact is not None:
        query = query.filter(
            or_(news_service.NewsItem.impact_score.is_(None),
                news_service.NewsItem.impact_score >= min_impact)
        )
    count = query.count()
    pages = max(1, (count + news_service.PAGE_SIZE - 1) // news_service.PAGE_SIZE)
    if sort == "impact":
        # impact desc, nulls last — mirrors the reference's impact ordering.
        query = query.order_by(
            news_service.NewsItem.impact_score.is_(None),
            news_service.NewsItem.impact_score.desc(),
            news_service.NewsItem.published_at.desc(),
            news_service.NewsItem.id.desc(),
        )
    else:
        query = query.order_by(
            news_service.NewsItem.published_at.desc().nullslast(),
            news_service.NewsItem.id.desc(),
        )
    rows = query.offset((page - 1) * news_service.PAGE_SIZE).limit(news_service.PAGE_SIZE).all()
    meta = _cache.get("news", (0, {}))[1]
    return NewsListOut(
        items=[_to_out(r) for r in rows],
        count=count,
        page=page,
        page_size=news_service.PAGE_SIZE,
        pages=pages,
        sources=meta.get("sources", []),
        updated_at=meta.get("updated_at", ""),
    )


@router.post("/refresh", response_model=NewsListOut)
def refresh_news(db: Session = Depends(get_db)) -> NewsListOut:
    """Invalidate the cache and sweep all feeds now."""
    _cache.clear()
    try:
        news_service.refresh_news(db)
    except Exception:
        pass
    _cache.clear()  # force a fresh payload build (sources may have changed)
    return get_news(db=db)


@router.delete("/all", status_code=204)
def delete_all_news(db: Session = Depends(get_db)) -> None:
    """Test/debug helper: wipe the news table."""
    db.query(news_service.NewsItem).delete()
    db.commit()
    _cache.clear()
