from __future__ import annotations

import concurrent.futures
import json
import re
import time
from collections import Counter
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app import sec_13f_service

router = APIRouter(prefix="/api/investors", tags=["investors"])

SEC_CIK_REGISTRY = {
    "warren-buffett": {"cik": "0001067983", "name": "Warren Buffett", "fund": "Berkshire Hathaway Inc."},
    "cathie-wood": {"cik": "0001697748", "name": "Cathie Wood", "fund": "ARK Investment Management LLC"},
    "ray-dalio": {"cik": "0001350694", "name": "Ray Dalio", "fund": "Bridgewater Associates, LP"},
    "bill-gates": {"cik": "0001166559", "name": "Bill Gates", "fund": "Gates Foundation Trust"},
    "michael-burry": {"cik": "0001649339", "name": "Michael Burry", "fund": "Scion Asset Management, LLC"},
}


def _quarter_filing_deadline(quarter_label: str) -> str:
    match = re.match(r"Q([1-4])\s+(\d{4})", quarter_label.strip())
    if not match:
        return quarter_label
    quarter, year = int(match.group(1)), int(match.group(2))
    month, day = {1: (3, 31), 2: (6, 30), 3: (9, 30), 4: (12, 31)}[quarter]
    return (date(year, month, day) + timedelta(days=45)).isoformat()


class TopHolding(BaseModel):
    id: str
    name: str
    ticker: str | None = None
    portfolio_percent: float | None = None
    avg_buy_price: float | None = None
    current_price: float | None = None
    gain_percent: float | None = None
    activity_period: str
    activity_text: str
    sector: str | None = None
    logo_url: str | None = None
    shares: float | None = None
    reported_value_usd: float | None = None
    source_url: str | None = None


class InvestorProfile(BaseModel):
    id: str
    name: str
    slug: str
    fund_name: str
    performance_1y_pct: float | None = None
    portfolio_value_usd: str
    portfolio_value_num: float | None = None
    description: str
    avatar_url: str
    last_13f_filing: str
    filed_at: str | None = None
    data_provider: str = "SEC EDGAR"
    top_holdings: list[TopHolding]


class NewHoldingBuyer(BaseModel):
    investor_slug: str
    investor_name: str
    investor_avatar_url: str | None = None
    portfolio_percent: float | None = None
    avg_buy_price: float | None = None
    gain_percent: float | None = None
    activity_period: str


class NewHoldingStock(BaseModel):
    ticker: str | None = None
    company_name: str
    logo_url: str | None = None
    current_price: float | None = None
    activity_period: str
    buyers: list[NewHoldingBuyer]
    buyers_count: int
    reported_value_usd: float | None = None
    source_url: str | None = None


class NewHoldingsPageOut(BaseModel):
    items: list[NewHoldingStock]
    total_items: int
    total_pages: int
    current_page: int
    limit: int


_CACHE_TIMESTAMP = 0.0
_CACHED_INVESTORS: list[InvestorProfile] = []
_CACHED_NEW_HOLDINGS: list[NewHoldingStock] = []
_SEC_TICKER_MAP: dict[str, str] | None = None


def _format_usd(value: float | None) -> str:
    if value is None:
        return "—"
    if value >= 1e12:
        return f"${value / 1e12:.1f}T"
    if value >= 1e9:
        return f"${value / 1e9:.1f}B"
    if value >= 1e6:
        return f"${value / 1e6:.1f}M"
    return f"${value:,.0f}"


def _mode_period(holdings: list[TopHolding]) -> str:
    periods = [h.activity_period for h in holdings if h.activity_period]
    return f"SEC Form 13F ({Counter(periods).most_common(1)[0][0]})" if periods else "SEC Form 13F (period unavailable)"


def _ticker_for_issuer(issuer: str) -> str | None:
    """Resolve a ticker from SEC's own company-ticker registry; never guess."""
    global _SEC_TICKER_MAP
    key = re.sub(r"[^A-Z0-9 ]", "", issuer.upper()).replace("  ", " ").strip()
    if not key:
        return None
    if _SEC_TICKER_MAP is None:
        try:
            _SEC_TICKER_MAP = sec_13f_service.fetch_sec_ticker_map()
        except Exception:
            _SEC_TICKER_MAP = {}
    if key in _SEC_TICKER_MAP:
        return _SEC_TICKER_MAP[key]
    ignored = {"INC", "CORP", "CORPORATION", "CO", "COMPANY", "LTD", "PLC", "DE", "THE", "HOLDINGS"}
    issuer_tokens = set(key.split()) - ignored
    candidates = [
        ticker for title, ticker in _SEC_TICKER_MAP.items()
        if issuer_tokens and issuer_tokens.issubset(set(title.split()) - ignored)
    ]
    return candidates[0] if len(candidates) == 1 else None


def _holding_from_row(slug: str, row: dict[str, Any], index: int) -> TopHolding:
    value = row.get("reported_value_usd")
    return TopHolding(
        id=f"{slug}-{row.get('cusip', index)}",
        name=str(row.get("issuer") or "Unknown issuer"),
        ticker=_ticker_for_issuer(str(row.get("issuer") or "")),
        portfolio_percent=None,
        avg_buy_price=None,
        current_price=None,
        gain_percent=None,
        activity_period=str(row.get("filing_period") or ""),
        activity_text="Reported holding",
        shares=float(row.get("shares") or 0),
        reported_value_usd=float(value) if value is not None else None,
        source_url=row.get("source_url"),
    )


def _fetch_profile(slug: str, meta: dict[str, str]) -> InvestorProfile:
    try:
        filing = sec_13f_service.fetch_latest_13f(meta["cik"])
        rows = sec_13f_service.fetch_filing_rows(filing)
        total = sum(float(r.get("reported_value_usd") or 0) for r in rows)
        holdings = [_holding_from_row(slug, row, i) for i, row in enumerate(rows)]
        holdings.sort(key=lambda h: h.reported_value_usd or 0, reverse=True)
        holdings = holdings[:20]
        for holding in holdings:
            holding.portfolio_percent = round((holding.reported_value_usd or 0) / total * 100, 2) if total else None
        return InvestorProfile(
            id=f"inv_{slug}", name=meta["name"], slug=slug, fund_name=meta["fund"],
            portfolio_value_usd=_format_usd(total), portfolio_value_num=total or None,
            description="SEC Form 13F reporting manager; holdings are a delayed quarterly snapshot.",
            avatar_url="", last_13f_filing=_mode_period(holdings),
            filed_at=filing.get("filing_date"), data_provider="SEC EDGAR", top_holdings=holdings,
        )
    except Exception:
        return InvestorProfile(
            id=f"inv_{slug}", name=meta["name"], slug=slug, fund_name=meta["fund"],
            portfolio_value_usd="—", portfolio_value_num=None,
            description="SEC filing unavailable.", avatar_url="",
            last_13f_filing="SEC Form 13F (unavailable)", data_provider="SEC EDGAR",
            top_holdings=[],
        )


def fetch_live_investors() -> list[InvestorProfile]:
    global _CACHE_TIMESTAMP, _CACHED_INVESTORS
    now = time.time()
    if _CACHED_INVESTORS and now - _CACHE_TIMESTAMP < 900:
        return _CACHED_INVESTORS
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(_fetch_profile, slug, meta) for slug, meta in SEC_CIK_REGISTRY.items()]
        profiles = [future.result() for future in futures]
    _CACHED_INVESTORS = profiles
    _CACHE_TIMESTAMP = now
    return profiles


def _new_holdings() -> list[NewHoldingStock]:
    changes: dict[tuple[str, str], NewHoldingStock] = {}
    for slug, meta in SEC_CIK_REGISTRY.items():
        try:
            filings = sec_13f_service.fetch_13f_filings(meta["cik"], limit=2)
            latest_rows = sec_13f_service.fetch_filing_rows(filings[0])
            previous_rows = sec_13f_service.fetch_filing_rows(filings[1]) if len(filings) > 1 else []
            previous_cusips = {str(row.get("cusip")) for row in previous_rows}
            for row in latest_rows:
                cusip = str(row.get("cusip") or "")
                if not cusip or cusip in previous_cusips:
                    continue
                key = (cusip, str(row.get("issuer") or ""))
                if key not in changes:
                    changes[key] = NewHoldingStock(
                        ticker=_ticker_for_issuer(str(row.get("issuer") or "")),
                        company_name=str(row.get("issuer") or "Unknown issuer"),
                        activity_period=str(row.get("filing_period") or ""),
                        buyers=[], buyers_count=0,
                        reported_value_usd=float(row.get("reported_value_usd") or 0),
                        source_url=row.get("source_url"),
                    )
                item = changes[key]
                item.buyers.append(NewHoldingBuyer(
                    investor_slug=slug, investor_name=meta["name"],
                    portfolio_percent=None, avg_buy_price=None, gain_percent=None,
                    activity_period=str(row.get("filing_period") or ""),
                ))
                item.buyers_count = len(item.buyers)
        except Exception:
            continue
    return sorted(changes.values(), key=lambda item: item.buyers_count, reverse=True)


@router.get("", response_model=list[InvestorProfile])
def list_investors(search: str | None = Query(None), sort_by: str | None = Query("performance")):
    results = fetch_live_investors()
    if search:
        query = search.strip().lower()
        results = [inv for inv in results if query in inv.name.lower() or query in inv.fund_name.lower() or any(query in (h.ticker or "").lower() or query in h.name.lower() for h in inv.top_holdings)]
    if sort_by == "portfolio_value":
        results.sort(key=lambda item: item.portfolio_value_num or 0, reverse=True)
    elif sort_by == "name":
        results.sort(key=lambda item: item.name)
    return results


@router.get("/status")
def get_investors_status():
    investors = fetch_live_investors()
    return {
        "last_fetched_at": time.strftime("%d/%m/%Y %H:%M:%S", time.localtime(_CACHE_TIMESTAMP)),
        "fetch_timestamp": int(_CACHE_TIMESTAMP), "investors_count": len(investors),
        "data_provider": "SEC EDGAR",
    }


@router.post("/refresh")
def force_refresh_investors():
    global _CACHE_TIMESTAMP, _CACHED_INVESTORS, _CACHED_NEW_HOLDINGS
    _CACHE_TIMESTAMP = 0.0
    _CACHED_INVESTORS = []
    _CACHED_NEW_HOLDINGS = []
    investors = fetch_live_investors()
    return {
        "status": "refreshed", "last_fetched_at": time.strftime("%d/%m/%Y %H:%M:%S"),
        "fetch_timestamp": int(_CACHE_TIMESTAMP), "investors_count": len(investors),
        "data_provider": "SEC EDGAR",
    }


@router.get("/new-holdings", response_model=NewHoldingsPageOut)
def list_new_holdings(page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100), search: str | None = Query(None)):
    global _CACHED_NEW_HOLDINGS
    if not _CACHED_NEW_HOLDINGS:
        _CACHED_NEW_HOLDINGS = _new_holdings()
    stocks = _CACHED_NEW_HOLDINGS
    if search:
        query = search.strip().lower()
        stocks = [item for item in stocks if query in item.company_name.lower() or query in (item.ticker or "").lower()]
    total_items = len(stocks)
    total_pages = max(1, (total_items + limit - 1) // limit)
    start = (page - 1) * limit
    return NewHoldingsPageOut(items=stocks[start:start + limit], total_items=total_items, total_pages=total_pages, current_page=page, limit=limit)


@router.get("/{slug}", response_model=InvestorProfile)
def get_investor_profile(slug: str):
    for investor in fetch_live_investors():
        if investor.slug == slug:
            return investor
    raise HTTPException(status_code=404, detail="Investor profile not found")
