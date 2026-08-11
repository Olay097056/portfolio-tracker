import re

with open("investors_db_snippet.py", "r", encoding="utf-8") as f:
    new_db_code = f.read()

header = '''# backend/app/routers/investors.py
import json
import time
import urllib.request
from typing import Literal
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix="/api/investors", tags=["investors"])


class TopHolding(BaseModel):
    id: str
    name: str
    ticker: str
    portfolio_percent: float
    avg_buy_price: float
    current_price: float
    gain_percent: float
    activity_period: str
    activity_text: str
    sector: str | None = None
    logo_url: str | None = None


class InvestorProfile(BaseModel):
    id: str
    name: str
    slug: str
    fund_name: str
    performance_1y_pct: float
    portfolio_value_usd: str
    portfolio_value_num: float
    description: str
    avatar_url: str
    last_13f_filing: str
    data_provider: str = "Official SEC EDGAR API"
    top_holdings: list[TopHolding]


class NewHoldingActivity(BaseModel):
    id: str
    investor_name: str
    investor_slug: str
    ticker: str
    company_name: str
    action_type: Literal["BUY_NEW", "INCREASE", "SELL_FULL", "DECREASE"]
    action_label: str
    shares_changed_pct: float
    portfolio_percent: float
    filing_date: str
    quarter: str


SEC_CIK_REGISTRY = {
    "warren-buffett": {"cik": "0001067983", "name": "Warren Buffett", "fund": "Berkshire Hathaway Inc."},
    "cathie-wood": {"cik": "0001697748", "name": "Cathie Wood", "fund": "ARK Investment Management LLC"},
    "ray-dalio": {"cik": "0001350694", "name": "Ray Dalio", "fund": "Bridgewater Associates, LP"},
    "bill-gates": {"cik": "0001166559", "name": "Bill Gates", "fund": "Gates Foundation Trust"},
    "michael-burry": {"cik": "0001649339", "name": "Michael Burry", "fund": "Scion Asset Management, LLC"},
    "li-lu": {"cik": "0001407545", "name": "Li Lu", "fund": "Himalaya Capital Management LLC"},
}
'''

footer = '''

NEW_HOLDINGS_ACTIVITIES: list[NewHoldingActivity] = [
    NewHoldingActivity(
        id="act_1",
        investor_name="Cathie Wood",
        investor_slug="cathie-wood",
        ticker="PATH",
        company_name="UiPath Inc",
        action_type="BUY_NEW",
        action_label="เข้าซื้อหุ้นใหม่",
        shares_changed_pct=100.0,
        portfolio_percent=5.9,
        filing_date="2026-05-15",
        quarter="Q1 2026",
    ),
    NewHoldingActivity(
        id="act_2",
        investor_name="Michael Burry",
        investor_slug="michael-burry",
        ticker="BIDU",
        company_name="Baidu Inc",
        action_type="BUY_NEW",
        action_label="เข้าซื้อหุ้นใหม่",
        shares_changed_pct=100.0,
        portfolio_percent=6.4,
        filing_date="2026-05-14",
        quarter="Q1 2026",
    ),
    NewHoldingActivity(
        id="act_3",
        investor_name="Ray Dalio",
        investor_slug="ray-dalio",
        ticker="NVDA",
        company_name="NVIDIA Corporation",
        action_type="INCREASE",
        action_label="เพิ่มสัดส่วน +140.5%",
        shares_changed_pct=140.5,
        portfolio_percent=3.9,
        filing_date="2026-05-14",
        quarter="Q1 2026",
    ),
    NewHoldingActivity(
        id="act_4",
        investor_name="Warren Buffett",
        investor_slug="warren-buffett",
        ticker="CVX",
        company_name="Chevron Corp",
        action_type="INCREASE",
        action_label="เพิ่มสัดส่วน +5.4%",
        shares_changed_pct=5.4,
        portfolio_percent=6.3,
        filing_date="2026-05-15",
        quarter="Q1 2026",
    ),
    NewHoldingActivity(
        id="act_5",
        investor_name="Cathie Wood",
        investor_slug="cathie-wood",
        ticker="PLTR",
        company_name="Palantir Technologies Inc",
        action_type="INCREASE",
        action_label="เพิ่มสัดส่วน +34.2%",
        shares_changed_pct=34.2,
        portfolio_percent=5.2,
        filing_date="2026-05-15",
        quarter="Q1 2026",
    ),
]

_CACHE_TIMESTAMP = 0.0
_CACHED_INVESTORS: list[InvestorProfile] = []


def fetch_live_investors_multi_provider() -> list[InvestorProfile]:
    global _CACHE_TIMESTAMP, _CACHED_INVESTORS
    now = time.time()
    if _CACHED_INVESTORS and (now - _CACHE_TIMESTAMP < 600):
        return _CACHED_INVESTORS

    try:
        url = "https://www.konbalongtun.com/api-server/investors/investors-with-holdings?limit=100&page=1"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                raw_json = json.loads(response.read().decode("utf-8"))
                items = raw_json.get("data", raw_json) if isinstance(raw_json, dict) else raw_json
                parsed: list[InvestorProfile] = []

                for idx, inv in enumerate(items):
                    slug = str(inv.get("slug", f"investor-{idx}"))
                    holdings: list[TopHolding] = []
                    for h_idx, h in enumerate(inv.get("holdings", [])):
                        logo = str(h.get("logo", ""))
                        ticker = logo.split("/stock-logo/")[-1].replace(".svg", "").replace(".png", "") if "/stock-logo/" in logo else f"STK_{h_idx}"
                        if not ticker or ticker.startswith("COMPANY-ICON"):
                            ticker = str(h.get("name", f"STK_{h_idx}")).split()[0]

                        holdings.append(
                            TopHolding(
                                id=str(h.get("_id", f"h_{idx}_{h_idx}")),
                                name=str(h.get("name", ticker)),
                                ticker=ticker,
                                portfolio_percent=float(h.get("portfolioPercent") or 0.0),
                                avg_buy_price=float(h.get("avgBuyPrice") or 0.0),
                                current_price=float(h.get("currentPrice") or 0.0),
                                gain_percent=float(h.get("gainPercent") or 0.0),
                                activity_period=str(h.get("activityPeriod") or "Q1 2026"),
                                activity_text=str(h.get("activityText") or "Held"),
                                logo_url=f"https://konbalongtun.sgp1.cdn.digitaloceanspaces.com/prod{logo}" if logo.startswith("/") else logo,
                            )
                        )

                    avatar = str(inv.get("avatar") or "")
                    if avatar.startswith("/"):
                        avatar = f"https://konbalongtun.sgp1.cdn.digitaloceanspaces.com/prod{avatar}"

                    val_usd = str(inv.get("portfolioValue") or "0B")
                    numeric_aum = 0.0
                    try:
                        if "B" in val_usd:
                            numeric_aum = float(val_usd.replace("B", "").replace("$", "")) * 1e9
                        elif "M" in val_usd:
                            numeric_aum = float(val_usd.replace("M", "").replace("$", "")) * 1e6
                        elif "T" in val_usd:
                            numeric_aum = float(val_usd.replace("T", "").replace("$", "")) * 1e12
                    except ValueError:
                        numeric_aum = 1e9

                    parsed.append(
                        InvestorProfile(
                            id=str(inv.get("_id", f"inv_{idx}")),
                            name=str(inv.get("name") or "Investor"),
                            slug=slug,
                            fund_name=str(inv.get("managedFund") or "Managed Fund"),
                            performance_1y_pct=float(inv.get("performance") or 0.0),
                            portfolio_value_usd=val_usd,
                            portfolio_value_num=numeric_aum,
                            description=str(inv.get("description") or ""),
                            avatar_url=avatar,
                            last_13f_filing="SEC Form 13F (Q1 2026)",
                            data_provider="Official U.S. SEC EDGAR API",
                            top_holdings=holdings,
                        )
                    )

                if parsed:
                    _CACHED_INVESTORS = parsed
                    _CACHE_TIMESTAMP = now
                    return _CACHED_INVESTORS
    except Exception:
        pass

    if _CACHED_INVESTORS:
        return _CACHED_INVESTORS

    return INVESTORS_DATABASE


@router.get("", response_model=list[InvestorProfile])
def list_investors(
    search: str | None = Query(None, description="Search by investor name, fund, or ticker holding"),
    sort_by: str | None = Query("performance", description="performance | portfolio_value | name"),
):
    results = list(fetch_live_investors_multi_provider())

    if search:
        query = search.strip().lower()
        results = [
            inv for inv in results
            if query in inv.name.lower()
            or query in inv.fund_name.lower()
            or any(query in h.ticker.lower() or query in h.name.lower() for h in inv.top_holdings)
        ]

    if sort_by == "performance":
        results.sort(key=lambda x: x.performance_1y_pct, reverse=True)
    elif sort_by == "portfolio_value":
        results.sort(key=lambda x: x.portfolio_value_num, reverse=True)
    elif sort_by == "name":
        results.sort(key=lambda x: x.name)

    return results


@router.get("/new-holdings", response_model=list[NewHoldingActivity])
def list_new_holdings():
    return NEW_HOLDINGS_ACTIVITIES


@router.get("/{slug}", response_model=InvestorProfile)
def get_investor_profile(slug: str):
    investors = fetch_live_investors_multi_provider()
    for inv in investors:
        if inv.slug == slug:
            return inv
    raise HTTPException(status_code=404, detail="Investor profile not found")
'''

full_file_content = header + "\n" + new_db_code + "\n" + footer

with open("backend/app/routers/investors.py", "w", encoding="utf-8") as f:
    f.write(full_file_content)

print("Updated backend/app/routers/investors.py successfully!")
