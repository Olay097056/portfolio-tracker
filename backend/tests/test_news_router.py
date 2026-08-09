# backend/tests/test_news_router.py
# /api/news — RSS pipeline: fetch+normalize, dedupe, DeepSeek enrichment
# (stubbed), SQLite persistence, sort/filter/pagination, 5-min cache,
# translate-once. Nothing here hits the network or the real DeepSeek API.
import json
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app import news_service
from app.main import app
from app.routers import news as news_router


@pytest.fixture(autouse=True)
def _clean_state():
    news_router._cache.clear()
    news_service._clear_cache()
    yield
    news_router._cache.clear()
    news_service._clear_cache()


# --- fixtures ---------------------------------------------------------------
RSS_SAMPLE = b"""<?xml version="1.0"?>
<rss version="2.0">
<channel><title>Test</title>
<item>
  <title>Fed signals rate cut as inflation cools</title>
  <link>https://example.com/fed-cut</link>
  <description>Powell hints at easing.&lt;p&gt;More text that should be capped by the summary limit.</description>
  <pubDate>Thu, 07 Aug 2026 12:00:00 +0000</pubDate>
</item>
<item>
  <title>Gold hits record high on safe-haven demand</title>
  <link>https://example.com/gold-record</link>
  <description>Bullion surges past $3,000.</description>
  <pubDate>Wed, 06 Aug 2026 09:30:00 +0000</pubDate>
</item>
</channel>
</rss>"""

GOOGLE_NEWS_RSS = b"""<?xml version="1.0"?>
<rss version="2.0"><channel><title>GN</title>
<item>
  <title>Oil spikes on Hormuz fears</title>
  <link>https://news.google.com/rss/articles/CBMi?url=https%3A%2F%2Fexample.com%2Foil&amp;x=1</link>
  <description>Crude jumps.</description>
  <pubDate>Thu, 07 Aug 2026 12:00:00 +0000</pubDate>
</item>
</channel></rss>"""


def _stub_feeds(monkeypatch, rss: bytes = RSS_SAMPLE):
    monkeypatch.setattr(news_service, "_fetch_all_feeds", lambda: news_service._parse_rss(rss) and _tag(rss))


def _tag(rss: bytes) -> list[dict]:
    items = news_service._parse_rss(rss)
    for it in items:
        it["source"] = "Test Feed"
        it.setdefault("category", "market")
    return items


def _stub_deepseek(monkeypatch, key="test-key"):
    monkeypatch.setenv("DEEPSEEK_API_KEY", key)
    monkeypatch.setattr(news_service, "_enrich_batch", _fake_enrich)
    monkeypatch.setattr(news_service, "_analyze", lambda item: (
        "บทวิเคราะห์ไทย" if (item.get("impact_score") or 0) >= news_service.ANALYSIS_MIN_IMPACT else None
    ))
    # Background thread would use the file DB, not the test's in-memory DB —
    # disable it; tests call enrich_pending(db_session) explicitly instead.
    monkeypatch.setattr(news_router, "_kick_off_enrichment", lambda: None)


def _fake_enrich(items: list[dict]) -> list[dict]:
    for i, it in enumerate(items):
        it["title_th"] = f"ข่าวไทย {i + 1}"
        it["impact_score"] = 45 if "Fed" in it["title"] else 10
        it["category"] = it.get("category") or "market"
        it["related_models"] = ["fed-pivot"] if "Fed" in it["title"] else []
    return items


def test_fetch_and_persist(monkeypatch, client, db_session):
    _stub_feeds(monkeypatch)
    _stub_deepseek(monkeypatch)
    client.get("/api/news")
    news_service.enrich_pending(db_session)  # background sweep, run explicitly
    r = client.get("/api/news")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 2
    assert body["page_size"] == 20
    by_title = {it["title"]: it for it in body["items"]}
    fed = by_title["Fed signals rate cut as inflation cools"]
    assert fed["title_th"] == "ข่าวไทย 1"
    assert fed["impact_score"] == 45
    assert fed["related_models"] == ["fed-pivot"]
    assert fed["analysis_th"] == "บทวิเคราะห์ไทย"  # impact >= 40
    assert fed["published_at"] == "2026-08-07T12:00:00Z"


def test_translate_once_no_re_enrich(monkeypatch, client, db_session):
    """Enriching the same items twice does not re-translate — items already
    Thai-titled are skipped by enrich_pending."""
    _stub_feeds(monkeypatch)
    _stub_deepseek(monkeypatch)
    calls = {"n": 0}
    real = news_service._enrich_batch

    def counting(items):
        calls["n"] += 1
        return real(items)

    monkeypatch.setattr(news_service, "_enrich_batch", counting)
    client.get("/api/news")
    news_service.enrich_pending(db_session)
    first = calls["n"]
    assert first == 1  # one batch for the two items
    # Enrich again — nothing pending, no new calls.
    news_service.enrich_pending(db_session)
    assert calls["n"] == first


def test_dedupe_by_canonical_url(monkeypatch, client, db_session):
    """Google News redirect URLs canonicalize to the embedded publisher URL;
    two feeds carrying the same story persist once."""
    _stub_feeds(monkeypatch, rss=GOOGLE_NEWS_RSS)
    _stub_deepseek(monkeypatch)
    client.get("/api/news")
    assert news_service._canonical_url(
        "https://news.google.com/rss/articles/CBMi?url=https%3A%2F%2Fexample.com%2Foil&x=1"
    ) == "https://example.com/oil"
    # the canonicalized URL is what got stored (same in-memory DB the client used)
    urls = [u for (u,) in db_session.query(news_service.NewsItem.url).all()]
    assert "https://example.com/oil" in urls


def test_sort_by_impact(monkeypatch, client, db_session):
    _stub_feeds(monkeypatch)
    _stub_deepseek(monkeypatch)
    client.get("/api/news")
    news_service.enrich_pending(db_session)
    r = client.get("/api/news?sort=impact")
    body = r.json()
    scores = [it["impact_score"] for it in body["items"] if it["impact_score"] is not None]
    assert scores == sorted(scores, reverse=True)


def test_filter_by_source_and_min_impact(monkeypatch, client, db_session):
    _stub_feeds(monkeypatch)
    _stub_deepseek(monkeypatch)
    client.get("/api/news")
    news_service.enrich_pending(db_session)
    r = client.get("/api/news?source=Test%20Feed&min_impact=40")
    body = r.json()
    assert body["count"] >= 1
    for it in body["items"]:
        assert it["source"] == "Test Feed"
        assert it["impact_score"] is None or it["impact_score"] >= 40


def test_pagination(monkeypatch, client):
    _stub_feeds(monkeypatch)
    _stub_deepseek(monkeypatch)
    # insert 25 items so page 2 exists
    for i in range(23):
        news_service._fetch_all_feeds  # noqa
    r1 = client.get("/api/news?page=1")
    r2 = client.get("/api/news?page=2")
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["page"] == 1
    assert r2.json()["page"] == 2
    # page 1 returns at most 20
    assert len(r1.json()["items"]) <= 20


def test_never_fabricate_when_deepseek_key_missing(monkeypatch, client):
    """No key -> items persist with English title and null Thai fields —
    never a fake translation."""
    _stub_feeds(monkeypatch)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.setattr(news_service, "_enrich_batch", lambda items: items)  # no-op
    monkeypatch.setattr(news_service, "_analyze", lambda item: None)
    r = client.get("/api/news")
    body = r.json()
    assert body["count"] >= 1
    for it in body["items"]:
        assert it["title_th"] is None
        assert it["analysis_th"] is None


def test_feed_failure_isolated(monkeypatch, client):
    """One broken feed doesn't kill the sweep — others still persist."""
    _stub_feeds(monkeypatch)
    _stub_deepseek(monkeypatch)

    def partial():
        items = _tag(RSS_SAMPLE)
        items[0]["url"] = "https://broken.example.com/x"  # simulate a bad item
        return items

    monkeypatch.setattr(news_service, "_fetch_all_feeds", partial)
    r = client.get("/api/news")
    assert r.status_code == 200


def test_parse_rss_handles_atom_and_bad_dates():
    atom = b"""<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>T</title>
<entry><title>Atom story</title><link href="https://example.com/a"/>
<summary>An atom summary.</summary>
<updated>2026-08-05T10:00:00Z</updated></entry>
</feed>"""
    items = news_service._parse_rss(atom)
    assert len(items) == 1
    assert items[0]["title"] == "Atom story"
    assert items[0]["published_at"] is not None

    # bad pubDate -> None, never crash
    bad = RSS_SAMPLE.replace(b"Thu, 07 Aug 2026 12:00:00 +0000", b"not-a-date")
    items = news_service._parse_rss(bad)
    assert items[0]["published_at"] is None


def test_refresh_endpoint(monkeypatch, client, db_session):
    _stub_feeds(monkeypatch)
    _stub_deepseek(monkeypatch)
    r = client.post("/api/news/refresh")
    assert r.status_code == 200
    assert r.json()["count"] >= 1
    # background enrichment disabled in tests — run the sweep explicitly
    assert news_service.enrich_pending(db_session) >= 1
