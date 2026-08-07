# backend/app/routers/screener.py
from datetime import datetime, timezone
import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, and_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ScreenerStock
from app import screener_refresh_manager

router = APIRouter(prefix="/api/screener", tags=["screener"])


class RefreshRequest(BaseModel):
    limit: Optional[int] = None  # only for testing a partial refresh; omit for the full universe


@router.post("/refresh", status_code=202)
def start_screener_refresh(req: RefreshRequest = RefreshRequest()):
    started = screener_refresh_manager.start_refresh(limit=req.limit)
    status = screener_refresh_manager.get_status()
    if not started:
        raise HTTPException(status_code=409, detail={"message": "A refresh is already running", "status": status})
    return status


@router.get("/refresh-status")
def get_screener_refresh_status():
    return screener_refresh_manager.get_status()

class SortParams(BaseModel):
    field: Optional[str] = "marketCap"
    order: Optional[str] = "desc"

class ScreenerRequest(BaseModel):
    preset: Optional[str] = "all"
    filters: Optional[Dict[str, Any]] = Field(default_factory=dict)
    sort: Optional[Dict[str, Any]] = Field(default_factory=dict)
    page: int = 1
    pageSize: int = 20

# 51 Fallback stocks matching frontend/src/data/screenerStocks.ts, used only when
# screener_stocks is empty (i.e. `python -m backend.scripts.refresh_screener` has
# never been run). This is static demo data, not a live fetch -- the timestamp
# below is a fixed "written on" date, not `datetime.now()`, so the response never
# claims to be fresher than it is.
FALLBACK_DATA_ASOF = "2026-08-04T00:00:00+00:00"

FALLBACK_STOCKS = [
    {
        "symbol": "NVDA",
        "company_name": "NVIDIA Corporation",
        "logo_color": "#76B900",
        "logo_initials": "NV",
        "sector": "Technology",
        "industry": "Semiconductors",
        "market_cap": 2.97e12,
        "price": 120.0,
        "pe": 72.5,
        "peg": 1.15,
        "ps": 34.2,
        "pb": 48.5,
        "ev_sales": 33.8,
        "rsi": 68,
        "roe": 115.2,
        "profit_margin": 55.4,
        "eps": 2.45,
        "de_ratio": 0.17,
        "gross_margin": 75.3,
        "p_fcf": 68.4,
        "roic": 54.2,
        "div_yield": 0.03,
        "upside_pct": 22.5,
        "tags": ["AI", "Semiconductor", "Growth", "Robotics"],
    },
    {
        "symbol": "GOOGL",
        "company_name": "Alphabet Inc. (Class A)",
        "logo_color": "#4285F4",
        "logo_initials": "GA",
        "sector": "Communication Services",
        "industry": "Internet",
        "market_cap": 2.18e12,
        "price": 175.0,
        "pe": 24.5,
        "peg": 1.25,
        "ps": 6.8,
        "pb": 6.8,
        "ev_sales": 6.5,
        "rsi": 54,
        "roe": 28.5,
        "profit_margin": 25.8,
        "eps": 6.85,
        "de_ratio": 0.11,
        "gross_margin": 56.5,
        "p_fcf": 26.2,
        "roic": 22.8,
        "div_yield": 0.46,
        "upside_pct": 15.8,
        "tags": ["AI", "Growth", "Cloud", "Quantum"],
    },
    {
        "symbol": "GOOG",
        "company_name": "Alphabet Inc. (Class C)",
        "logo_color": "#34A853",
        "logo_initials": "GC",
        "sector": "Communication Services",
        "industry": "Internet",
        "market_cap": 2.16e12,
        "price": 176.0,
        "pe": 24.2,
        "peg": 1.22,
        "ps": 6.7,
        "pb": 6.7,
        "ev_sales": 6.4,
        "rsi": 53,
        "roe": 28.5,
        "profit_margin": 25.8,
        "eps": 6.85,
        "de_ratio": 0.11,
        "gross_margin": 56.5,
        "p_fcf": 26.0,
        "roic": 22.8,
        "div_yield": 0.46,
        "upside_pct": 15.5,
        "tags": ["AI", "Growth", "Cloud"],
    },
    {
        "symbol": "MSFT",
        "company_name": "Microsoft Corporation",
        "logo_color": "#00A4EF",
        "logo_initials": "MS",
        "sector": "Technology",
        "industry": "Software",
        "market_cap": 3.3e12,
        "price": 445.0,
        "pe": 36.4,
        "peg": 2.1,
        "ps": 13.5,
        "pb": 12.8,
        "ev_sales": 13.2,
        "rsi": 52,
        "roe": 38.4,
        "profit_margin": 36.2,
        "eps": 11.8,
        "de_ratio": 0.42,
        "gross_margin": 69.8,
        "p_fcf": 42.1,
        "roic": 28.6,
        "div_yield": 0.67,
        "upside_pct": 14.2,
        "tags": ["AI", "Growth", "Cloud", "Quantum"],
    },
    {
        "symbol": "AMZN",
        "company_name": "Amazon.com, Inc.",
        "logo_color": "#FF9900",
        "logo_initials": "AM",
        "sector": "Consumer Discretionary",
        "industry": "E-Commerce",
        "market_cap": 1.93e12,
        "price": 185.0,
        "pe": 42.1,
        "peg": 1.35,
        "ps": 3.2,
        "pb": 8.5,
        "ev_sales": 3.4,
        "rsi": 78,
        "roe": 20.8,
        "profit_margin": 6.5,
        "eps": 4.4,
        "de_ratio": 0.62,
        "gross_margin": 47.6,
        "p_fcf": 35.8,
        "roic": 14.5,
        "div_yield": 0.0,
        "upside_pct": 18.0,
        "tags": ["AI", "Growth", "Cloud", "Robotics"],
    },
    {
        "symbol": "META",
        "company_name": "Meta Platforms, Inc.",
        "logo_color": "#0668E1",
        "logo_initials": "ME",
        "sector": "Communication Services",
        "industry": "Internet",
        "market_cap": 1.29e12,
        "price": 500.0,
        "pe": 26.8,
        "peg": 1.1,
        "ps": 8.9,
        "pb": 7.2,
        "ev_sales": 8.5,
        "rsi": 62,
        "roe": 33.5,
        "profit_margin": 34.2,
        "eps": 18.5,
        "de_ratio": 0.25,
        "gross_margin": 81.5,
        "p_fcf": 25.4,
        "roic": 26.2,
        "div_yield": 0.39,
        "upside_pct": 16.4,
        "tags": ["AI", "Growth"],
    },
    {
        "symbol": "TSLA",
        "company_name": "Tesla, Inc.",
        "logo_color": "#CC0000",
        "logo_initials": "TS",
        "sector": "Consumer Discretionary",
        "industry": "Automotive",
        "market_cap": 6.7e11,
        "price": 210.0,
        "pe": 62.0,
        "peg": 3.5,
        "ps": 7.0,
        "pb": 10.2,
        "ev_sales": 6.8,
        "rsi": 32,
        "roe": 18.2,
        "profit_margin": 11.2,
        "eps": 3.4,
        "de_ratio": 0.18,
        "gross_margin": 18.2,
        "p_fcf": 72.0,
        "roic": 12.8,
        "div_yield": 0.0,
        "upside_pct": 24.0,
        "tags": ["AI", "Growth", "Robotics"],
    },
    {
        "symbol": "AAPL",
        "company_name": "Apple Inc.",
        "logo_color": "#A2AAAD",
        "logo_initials": "AA",
        "sector": "Technology",
        "industry": "Consumer Electronics",
        "market_cap": 3.45e12,
        "price": 225.0,
        "pe": 33.2,
        "peg": 2.8,
        "ps": 8.8,
        "pb": 46.2,
        "ev_sales": 8.9,
        "rsi": 58,
        "roe": 147.2,
        "profit_margin": 26.4,
        "eps": 6.8,
        "de_ratio": 1.82,
        "gross_margin": 46.2,
        "p_fcf": 30.5,
        "roic": 56.4,
        "div_yield": 0.44,
        "upside_pct": 10.5,
        "tags": ["AI", "Growth"],
    },
    {
        "symbol": "TSM",
        "company_name": "Taiwan Semiconductor Manufacturing",
        "logo_color": "#E31B23",
        "logo_initials": "TS",
        "sector": "Technology",
        "industry": "Semiconductors",
        "market_cap": 8.56e11,
        "price": 165.0,
        "pe": 28.5,
        "peg": 1.2,
        "ps": 11.2,
        "pb": 6.4,
        "ev_sales": 10.8,
        "rsi": 65,
        "roe": 29.8,
        "profit_margin": 39.8,
        "eps": 6.2,
        "de_ratio": 0.28,
        "gross_margin": 53.2,
        "p_fcf": 28.2,
        "roic": 24.6,
        "div_yield": 1.35,
        "upside_pct": 21.0,
        "tags": ["AI", "Semiconductor"],
    },
    {
        "symbol": "AVGO",
        "company_name": "Broadcom Inc.",
        "logo_color": "#CC0000",
        "logo_initials": "AV",
        "sector": "Technology",
        "industry": "Semiconductors",
        "market_cap": 7.0e11,
        "price": 160.0,
        "pe": 34.0,
        "peg": 1.4,
        "ps": 14.5,
        "pb": 11.8,
        "ev_sales": 15.2,
        "rsi": 53,
        "roe": 38.5,
        "profit_margin": 38.2,
        "eps": 4.8,
        "de_ratio": 1.42,
        "gross_margin": 68.5,
        "p_fcf": 31.0,
        "roic": 22.4,
        "div_yield": 1.4,
        "upside_pct": 19.2,
        "tags": ["AI", "Semiconductor"],
    },
    {
        "symbol": "AMD",
        "company_name": "Advanced Micro Devices, Inc.",
        "logo_color": "#ED1C24",
        "logo_initials": "AM",
        "sector": "Technology",
        "industry": "Semiconductors",
        "market_cap": 2.3e11,
        "price": 140.0,
        "pe": 110.0,
        "peg": 2.4,
        "ps": 10.2,
        "pb": 4.2,
        "ev_sales": 9.8,
        "rsi": 29,
        "roe": 4.8,
        "profit_margin": 5.2,
        "eps": 1.3,
        "de_ratio": 0.06,
        "gross_margin": 51.2,
        "p_fcf": 85.0,
        "roic": 6.5,
        "div_yield": 0.0,
        "upside_pct": 32.5,
        "tags": ["AI", "Semiconductor"],
    },
    {
        "symbol": "ORCL",
        "company_name": "Oracle Corporation",
        "logo_color": "#F80000",
        "logo_initials": "OR",
        "sector": "Technology",
        "industry": "Software",
        "market_cap": 3.8e11,
        "price": 138.0,
        "pe": 38.5,
        "peg": 1.6,
        "ps": 7.2,
        "pb": 35.0,
        "ev_sales": 8.1,
        "rsi": 61,
        "roe": 85.0,
        "profit_margin": 20.4,
        "eps": 3.8,
        "de_ratio": 4.5,
        "gross_margin": 71.4,
        "p_fcf": 32.0,
        "roic": 18.2,
        "div_yield": 1.15,
        "upside_pct": 12.8,
        "tags": ["Cloud", "Growth"],
    },
    {
        "symbol": "PLTR",
        "company_name": "Palantir Technologies Inc.",
        "logo_color": "#101010",
        "logo_initials": "PL",
        "sector": "Technology",
        "industry": "Software",
        "market_cap": 6.5e10,
        "price": 28.0,
        "pe": 85.0,
        "peg": 2.2,
        "ps": 25.4,
        "pb": 14.2,
        "ev_sales": 24.8,
        "rsi": 72,
        "roe": 18.5,
        "profit_margin": 20.1,
        "eps": 0.32,
        "de_ratio": 0.02,
        "gross_margin": 81.2,
        "p_fcf": 65.0,
        "roic": 16.4,
        "div_yield": 0.0,
        "upside_pct": 14.5,
        "tags": ["AI", "Defense", "Cloud", "Growth"],
    },
    {
        "symbol": "ARM",
        "company_name": "Arm Holdings plc",
        "logo_color": "#0091BD",
        "logo_initials": "AR",
        "sector": "Technology",
        "industry": "Semiconductors",
        "market_cap": 1.4e11,
        "price": 135.0,
        "pe": 95.0,
        "peg": 3.1,
        "ps": 38.0,
        "pb": 22.0,
        "ev_sales": 37.5,
        "rsi": 64,
        "roe": 16.2,
        "profit_margin": 24.0,
        "eps": 1.25,
        "de_ratio": 0.05,
        "gross_margin": 95.5,
        "p_fcf": 90.0,
        "roic": 14.8,
        "div_yield": 0.0,
        "upside_pct": 17.0,
        "tags": ["AI", "Semiconductor", "Growth"],
    },
    {
        "symbol": "IBM",
        "company_name": "International Business Machines",
        "logo_color": "#052FAD",
        "logo_initials": "IB",
        "sector": "Technology",
        "industry": "IT Services",
        "market_cap": 1.8e11,
        "price": 190.0,
        "pe": 21.4,
        "peg": 1.8,
        "ps": 2.8,
        "pb": 7.5,
        "ev_sales": 3.4,
        "rsi": 56,
        "roe": 32.4,
        "profit_margin": 13.2,
        "eps": 8.9,
        "de_ratio": 2.15,
        "gross_margin": 55.4,
        "p_fcf": 15.2,
        "roic": 12.4,
        "div_yield": 3.55,
        "upside_pct": 8.5,
        "tags": ["AI", "Quantum", "Defense", "Dividend"],
    },
    {
        "symbol": "MRVL",
        "company_name": "Marvell Technology Inc.",
        "logo_color": "#00A3E0",
        "logo_initials": "MR",
        "sector": "Technology",
        "industry": "Semiconductors",
        "market_cap": 6.2e10,
        "price": 72.0,
        "pe": 55.0,
        "peg": 1.7,
        "ps": 11.5,
        "pb": 4.8,
        "ev_sales": 12.0,
        "rsi": 59,
        "roe": -2.5,
        "profit_margin": -15.4,
        "eps": -1.1,
        "de_ratio": 0.32,
        "gross_margin": 52.4,
        "p_fcf": 45.0,
        "roic": 4.2,
        "div_yield": 0.35,
        "upside_pct": 25.0,
        "tags": ["Semiconductor", "AI"],
    },
    {
        "symbol": "CRM",
        "company_name": "Salesforce, Inc.",
        "logo_color": "#00A1E0",
        "logo_initials": "SF",
        "sector": "Technology",
        "industry": "Software",
        "market_cap": 2.4e11,
        "price": 250.0,
        "pe": 44.2,
        "peg": 1.5,
        "ps": 6.8,
        "pb": 4.2,
        "ev_sales": 6.9,
        "rsi": 48,
        "roe": 9.8,
        "profit_margin": 15.5,
        "eps": 5.8,
        "de_ratio": 0.22,
        "gross_margin": 75.8,
        "p_fcf": 22.4,
        "roic": 10.5,
        "div_yield": 0.62,
        "upside_pct": 20.4,
        "tags": ["AI", "Cloud", "Growth"],
    },
    {
        "symbol": "NOW",
        "company_name": "ServiceNow, Inc.",
        "logo_color": "#81B5A1",
        "logo_initials": "SN",
        "sector": "Technology",
        "industry": "Software",
        "market_cap": 1.7e11,
        "price": 820.0,
        "pe": 78.0,
        "peg": 2.0,
        "ps": 17.2,
        "pb": 21.0,
        "ev_sales": 16.8,
        "rsi": 63,
        "roe": 24.5,
        "profit_margin": 21.8,
        "eps": 9.4,
        "de_ratio": 0.28,
        "gross_margin": 78.9,
        "p_fcf": 42.0,
        "roic": 18.0,
        "div_yield": 0.0,
        "upside_pct": 16.2,
        "tags": ["AI", "Cloud", "Growth"],
    },
    {
        "symbol": "SNOW",
        "company_name": "Snowflake Inc.",
        "logo_color": "#29B5E8",
        "logo_initials": "SF",
        "sector": "Technology",
        "industry": "Software",
        "market_cap": 4.2e10,
        "price": 125.0,
        "pe": None,
        "peg": None,
        "ps": 13.8,
        "pb": 9.2,
        "ev_sales": 13.2,
        "rsi": 38,
        "roe": -21.4,
        "profit_margin": -32.5,
        "eps": -2.8,
        "de_ratio": 0.04,
        "gross_margin": 67.8,
        "p_fcf": 52.0,
        "roic": -12.5,
        "div_yield": 0.0,
        "upside_pct": 38.0,
        "tags": ["Cloud", "Growth", "AI"],
    },
    {
        "symbol": "ADBE",
        "company_name": "Adobe Inc.",
        "logo_color": "#FF0000",
        "logo_initials": "AD",
        "sector": "Technology",
        "industry": "Software",
        "market_cap": 2.2e11,
        "price": 540.0,
        "pe": 41.5,
        "peg": 1.9,
        "ps": 11.2,
        "pb": 14.5,
        "ev_sales": 11.0,
        "rsi": 49,
        "roe": 34.2,
        "profit_margin": 27.5,
        "eps": 12.2,
        "de_ratio": 0.25,
        "gross_margin": 88.2,
        "p_fcf": 31.0,
        "roic": 25.8,
        "div_yield": 0.0,
        "upside_pct": 21.5,
        "tags": ["AI", "Cloud", "Growth"],
    },
    {
        "symbol": "BIDU",
        "company_name": "Baidu, Inc.",
        "logo_color": "#2529D8",
        "logo_initials": "BD",
        "sector": "Communication Services",
        "industry": "Internet",
        "market_cap": 3.1e10,
        "price": 88.0,
        "pe": 11.5,
        "peg": 0.85,
        "ps": 1.6,
        "pb": 0.9,
        "ev_sales": 1.4,
        "rsi": 36,
        "roe": 8.5,
        "profit_margin": 15.2,
        "eps": 7.2,
        "de_ratio": 0.35,
        "gross_margin": 51.5,
        "p_fcf": 9.5,
        "roic": 7.2,
        "div_yield": 0.0,
        "upside_pct": 42.0,
        "tags": ["AI", "Value", "Robotics"],
    },
    {
        "symbol": "SMCI",
        "company_name": "Super Micro Computer Inc.",
        "logo_color": "#003399",
        "logo_initials": "SM",
        "sector": "Technology",
        "industry": "Hardware",
        "market_cap": 3.2e10,
        "price": 550.0,
        "pe": 28.4,
        "peg": 0.75,
        "ps": 2.1,
        "pb": 6.8,
        "ev_sales": 2.0,
        "rsi": 41,
        "roe": 38.2,
        "profit_margin": 8.5,
        "eps": 22.1,
        "de_ratio": 0.45,
        "gross_margin": 14.5,
        "p_fcf": 18.5,
        "roic": 28.0,
        "div_yield": 0.0,
        "upside_pct": 45.0,
        "tags": ["AI", "Growth"],
    },
    {
        "symbol": "PATH",
        "company_name": "UiPath Inc.",
        "logo_color": "#FA4616",
        "logo_initials": "UI",
        "sector": "Technology",
        "industry": "Software",
        "market_cap": 7.2e9,
        "price": 12.5,
        "pe": 45.0,
        "peg": 1.8,
        "ps": 5.5,
        "pb": 3.8,
        "ev_sales": 5.2,
        "rsi": 35,
        "roe": 5.2,
        "profit_margin": 4.8,
        "eps": 0.28,
        "de_ratio": 0.02,
        "gross_margin": 84.5,
        "p_fcf": 24.0,
        "roic": 6.0,
        "div_yield": 0.0,
        "upside_pct": 28.0,
        "tags": ["AI", "Robotics", "Growth"],
    },
    {
        "symbol": "AI",
        "company_name": "C3.ai, Inc.",
        "logo_color": "#000000",
        "logo_initials": "C3",
        "sector": "Technology",
        "industry": "Software",
        "market_cap": 2.8e9,
        "price": 23.0,
        "pe": None,
        "peg": None,
        "ps": 8.5,
        "pb": 3.2,
        "ev_sales": 7.8,
        "rsi": 42,
        "roe": -28.0,
        "profit_margin": -88.0,
        "eps": -2.3,
        "de_ratio": 0.0,
        "gross_margin": 58.5,
        "p_fcf": None,
        "roic": -22.0,
        "div_yield": 0.0,
        "upside_pct": 35.0,
        "tags": ["AI", "Growth"],
    },
    {
        "symbol": "NFLX",
        "company_name": "Netflix, Inc.",
        "logo_color": "#E50914",
        "logo_initials": "NF",
        "sector": "Communication Services",
        "industry": "Entertainment",
        "market_cap": 2.75e11,
        "price": 640.0,
        "pe": 38.5,
        "peg": 1.6,
        "ps": 7.8,
        "pb": 13.5,
        "ev_sales": 7.9,
        "rsi": 62,
        "roe": 34.8,
        "profit_margin": 20.5,
        "eps": 16.2,
        "de_ratio": 0.68,
        "gross_margin": 43.5,
        "p_fcf": 38.0,
        "roic": 22.0,
        "div_yield": 0.0,
        "upside_pct": 12.5,
        "tags": ["Growth"],
    },
    {
        "symbol": "INTC",
        "company_name": "Intel Corporation",
        "logo_color": "#0068B5",
        "logo_initials": "IN",
        "sector": "Technology",
        "industry": "Semiconductors",
        "market_cap": 1.3e11,
        "price": 30.0,
        "pe": 14.2,
        "peg": 1.9,
        "ps": 2.4,
        "pb": 1.2,
        "ev_sales": 2.8,
        "rsi": 42,
        "roe": 3.2,
        "profit_margin": 7.5,
        "eps": 0.95,
        "de_ratio": 0.48,
        "gross_margin": 41.0,
        "p_fcf": 16.0,
        "roic": 4.5,
        "div_yield": 1.6,
        "upside_pct": 18.5,
        "tags": ["Semiconductor", "Value", "Quantum"],
    },
    {
        "symbol": "QCOM",
        "company_name": "QUALCOMM Incorporated",
        "logo_color": "#3253DC",
        "logo_initials": "QC",
        "sector": "Technology",
        "industry": "Semiconductors",
        "market_cap": 1.92e11,
        "price": 172.0,
        "pe": 21.4,
        "peg": 1.3,
        "ps": 5.1,
        "pb": 8.2,
        "ev_sales": 5.3,
        "rsi": 64,
        "roe": 39.5,
        "profit_margin": 23.8,
        "eps": 8.05,
        "de_ratio": 0.65,
        "gross_margin": 55.8,
        "p_fcf": 18.2,
        "roic": 28.5,
        "div_yield": 1.97,
        "upside_pct": 15.0,
        "tags": ["AI", "Semiconductor", "Robotics"],
    },
    {
        "symbol": "MU",
        "company_name": "Micron Technology, Inc.",
        "logo_color": "#005596",
        "logo_initials": "MU",
        "sector": "Technology",
        "industry": "Semiconductors",
        "market_cap": 1.2e11,
        "price": 108.0,
        "pe": 18.5,
        "peg": 0.8,
        "ps": 4.5,
        "pb": 2.6,
        "ev_sales": 4.4,
        "rsi": 56,
        "roe": 14.2,
        "profit_margin": 12.8,
        "eps": 5.85,
        "de_ratio": 0.32,
        "gross_margin": 38.2,
        "p_fcf": 14.5,
        "roic": 11.2,
        "div_yield": 0.42,
        "upside_pct": 28.5,
        "tags": ["AI", "Semiconductor"],
    },
    {
        "symbol": "ASML",
        "company_name": "ASML Holding N.V.",
        "logo_color": "#00A3E0",
        "logo_initials": "AS",
        "sector": "Technology",
        "industry": "Semiconductors",
        "market_cap": 3.5e11,
        "price": 880.0,
        "pe": 41.2,
        "peg": 1.8,
        "ps": 12.5,
        "pb": 22.4,
        "ev_sales": 12.2,
        "rsi": 46,
        "roe": 58.2,
        "profit_margin": 28.4,
        "eps": 21.6,
        "de_ratio": 0.38,
        "gross_margin": 51.2,
        "p_fcf": 36.0,
        "roic": 38.5,
        "div_yield": 0.75,
        "upside_pct": 22.0,
        "tags": ["Semiconductor", "AI"],
    },
    {
        "symbol": "QYLD",
        "company_name": "Global X Nasdaq 100 Covered Call ETF",
        "logo_color": "#003366",
        "logo_initials": "QY",
        "sector": "Financials",
        "industry": "ETFs",
        "market_cap": 8.1e9,
        "price": 17.5,
        "pe": 12.0,
        "peg": None,
        "ps": None,
        "pb": None,
        "ev_sales": None,
        "rsi": 45,
        "roe": None,
        "profit_margin": None,
        "eps": None,
        "de_ratio": None,
        "gross_margin": None,
        "p_fcf": None,
        "roic": None,
        "div_yield": 11.5,
        "upside_pct": 4.2,
        "tags": ["Dividend", "Finance"],
    },
    {
        "symbol": "JEPI",
        "company_name": "JPMorgan Equity Premium Income ETF",
        "logo_color": "#0A2540",
        "logo_initials": "JE",
        "sector": "Financials",
        "industry": "ETFs",
        "market_cap": 3.3e10,
        "price": 56.0,
        "pe": 14.5,
        "peg": None,
        "ps": None,
        "pb": None,
        "ev_sales": None,
        "rsi": 49,
        "roe": None,
        "profit_margin": None,
        "eps": None,
        "de_ratio": None,
        "gross_margin": None,
        "p_fcf": None,
        "roic": None,
        "div_yield": 7.8,
        "upside_pct": 6.5,
        "tags": ["Dividend", "Finance"],
    },
    {
        "symbol": "VYM",
        "company_name": "Vanguard High Dividend Yield ETF",
        "logo_color": "#990000",
        "logo_initials": "VY",
        "sector": "Financials",
        "industry": "ETFs",
        "market_cap": 6.2e10,
        "price": 118.0,
        "pe": 16.8,
        "peg": None,
        "ps": None,
        "pb": None,
        "ev_sales": None,
        "rsi": 51,
        "roe": None,
        "profit_margin": None,
        "eps": None,
        "de_ratio": None,
        "gross_margin": None,
        "p_fcf": None,
        "roic": None,
        "div_yield": 3.15,
        "upside_pct": 8.0,
        "tags": ["Dividend", "Finance"],
    },
    {
        "symbol": "SCHD",
        "company_name": "Schwab U.S. Dividend Equity ETF",
        "logo_color": "#006699",
        "logo_initials": "SC",
        "sector": "Financials",
        "industry": "ETFs",
        "market_cap": 5.8e10,
        "price": 78.0,
        "pe": 16.2,
        "peg": None,
        "ps": None,
        "pb": None,
        "ev_sales": None,
        "rsi": 53,
        "roe": None,
        "profit_margin": None,
        "eps": None,
        "de_ratio": None,
        "gross_margin": None,
        "p_fcf": None,
        "roic": None,
        "div_yield": 3.42,
        "upside_pct": 9.2,
        "tags": ["Dividend", "Finance"],
    },
    {
        "symbol": "VTI",
        "company_name": "Vanguard Total Stock Market ETF",
        "logo_color": "#990000",
        "logo_initials": "VT",
        "sector": "Financials",
        "industry": "ETFs",
        "market_cap": 1.5e12,
        "price": 260.0,
        "pe": 23.1,
        "peg": None,
        "ps": None,
        "pb": None,
        "ev_sales": None,
        "rsi": 55,
        "roe": None,
        "profit_margin": None,
        "eps": None,
        "de_ratio": None,
        "gross_margin": None,
        "p_fcf": None,
        "roic": None,
        "div_yield": 1.4,
        "upside_pct": 11.0,
        "tags": ["Finance"],
    },
    {
        "symbol": "VOO",
        "company_name": "Vanguard S&P 500 ETF",
        "logo_color": "#990000",
        "logo_initials": "VO",
        "sector": "Financials",
        "industry": "ETFs",
        "market_cap": 1.1e12,
        "price": 500.0,
        "pe": 24.0,
        "peg": None,
        "ps": None,
        "pb": None,
        "ev_sales": None,
        "rsi": 58,
        "roe": None,
        "profit_margin": None,
        "eps": None,
        "de_ratio": None,
        "gross_margin": None,
        "p_fcf": None,
        "roic": None,
        "div_yield": 1.45,
        "upside_pct": 10.8,
        "tags": ["Finance"],
    },
    {
        "symbol": "SPY",
        "company_name": "SPDR S&P 500 ETF Trust",
        "logo_color": "#003366",
        "logo_initials": "SP",
        "sector": "Financials",
        "industry": "ETFs",
        "market_cap": 5.5e11,
        "price": 545.0,
        "pe": 24.2,
        "peg": None,
        "ps": None,
        "pb": None,
        "ev_sales": None,
        "rsi": 57,
        "roe": None,
        "profit_margin": None,
        "eps": None,
        "de_ratio": None,
        "gross_margin": None,
        "p_fcf": None,
        "roic": None,
        "div_yield": 1.32,
        "upside_pct": 10.5,
        "tags": ["Finance"],
    },
    {
        "symbol": "QQQ",
        "company_name": "Invesco QQQ Trust",
        "logo_color": "#0055A5",
        "logo_initials": "QQ",
        "sector": "Financials",
        "industry": "ETFs",
        "market_cap": 2.8e11,
        "price": 475.0,
        "pe": 30.5,
        "peg": None,
        "ps": None,
        "pb": None,
        "ev_sales": None,
        "rsi": 61,
        "roe": None,
        "profit_margin": None,
        "eps": None,
        "de_ratio": None,
        "gross_margin": None,
        "p_fcf": None,
        "roic": None,
        "div_yield": 0.58,
        "upside_pct": 14.0,
        "tags": ["Growth", "Finance"],
    },
    {
        "symbol": "SMH",
        "company_name": "VanEck Semiconductor ETF",
        "logo_color": "#002D62",
        "logo_initials": "SM",
        "sector": "Financials",
        "industry": "ETFs",
        "market_cap": 2.4e10,
        "price": 240.0,
        "pe": 35.0,
        "peg": None,
        "ps": None,
        "pb": None,
        "ev_sales": None,
        "rsi": 63,
        "roe": None,
        "profit_margin": None,
        "eps": None,
        "de_ratio": None,
        "gross_margin": None,
        "p_fcf": None,
        "roic": None,
        "div_yield": 0.48,
        "upside_pct": 18.5,
        "tags": ["Semiconductor", "Finance"],
    },
    {
        "symbol": "O",
        "company_name": "Realty Income Corporation",
        "logo_color": "#005A9C",
        "logo_initials": "O",
        "sector": "Real Estate",
        "industry": "REIT",
        "market_cap": 4.8e10,
        "price": 54.0,
        "pe": 42.0,
        "peg": 3.2,
        "ps": 10.5,
        "pb": 1.4,
        "ev_sales": 12.8,
        "rsi": 34,
        "roe": 3.5,
        "profit_margin": 22.4,
        "eps": 1.3,
        "de_ratio": 0.72,
        "gross_margin": 92.0,
        "p_fcf": 16.5,
        "roic": 4.2,
        "div_yield": 5.75,
        "upside_pct": 15.0,
        "tags": ["Dividend", "Value"],
    },
    {
        "symbol": "MAIN",
        "company_name": "Main Street Capital Corporation",
        "logo_color": "#003366",
        "logo_initials": "MA",
        "sector": "Financials",
        "industry": "Banking",
        "market_cap": 4.2e9,
        "price": 48.0,
        "pe": 9.8,
        "peg": 1.1,
        "ps": 7.8,
        "pb": 1.6,
        "ev_sales": 8.2,
        "rsi": 58,
        "roe": 16.8,
        "profit_margin": 65.2,
        "eps": 5.0,
        "de_ratio": 0.85,
        "gross_margin": 100.0,
        "p_fcf": 10.2,
        "roic": 12.5,
        "div_yield": 6.1,
        "upside_pct": 8.4,
        "tags": ["Dividend", "Finance", "Value"],
    },
    {
        "symbol": "WPC",
        "company_name": "W. P. Carey Inc.",
        "logo_color": "#1E395B",
        "logo_initials": "WP",
        "sector": "Real Estate",
        "industry": "REIT",
        "market_cap": 1.25e10,
        "price": 58.0,
        "pe": 18.2,
        "peg": 2.1,
        "ps": 7.2,
        "pb": 1.5,
        "ev_sales": 9.5,
        "rsi": 33,
        "roe": 7.8,
        "profit_margin": 38.5,
        "eps": 3.2,
        "de_ratio": 0.82,
        "gross_margin": 88.5,
        "p_fcf": 12.8,
        "roic": 5.1,
        "div_yield": 5.9,
        "upside_pct": 14.2,
        "tags": ["Dividend", "Value"],
    },
    {
        "symbol": "XOM",
        "company_name": "Exxon Mobil Corporation",
        "logo_color": "#E21F26",
        "logo_initials": "XO",
        "sector": "Energy",
        "industry": "Oil & Gas",
        "market_cap": 4.68e11,
        "price": 118.0,
        "pe": 13.8,
        "peg": 1.4,
        "ps": 1.3,
        "pb": 2.1,
        "ev_sales": 1.5,
        "rsi": 61,
        "roe": 16.5,
        "profit_margin": 10.5,
        "eps": 8.6,
        "de_ratio": 0.18,
        "gross_margin": 32.4,
        "p_fcf": 11.4,
        "roic": 14.2,
        "div_yield": 3.2,
        "upside_pct": 12.0,
        "tags": ["Value", "Dividend", "Defense"],
    },
    {
        "symbol": "CVX",
        "company_name": "Chevron Corporation",
        "logo_color": "#00549F",
        "logo_initials": "CV",
        "sector": "Energy",
        "industry": "Oil & Gas",
        "market_cap": 2.88e11,
        "price": 156.0,
        "pe": 14.1,
        "peg": 1.5,
        "ps": 1.4,
        "pb": 1.8,
        "ev_sales": 1.6,
        "rsi": 59,
        "roe": 13.4,
        "profit_margin": 10.2,
        "eps": 11.1,
        "de_ratio": 0.14,
        "gross_margin": 38.5,
        "p_fcf": 12.2,
        "roic": 12.1,
        "div_yield": 4.15,
        "upside_pct": 14.5,
        "tags": ["Value", "Dividend", "Defense"],
    },
    {
        "symbol": "JPM",
        "company_name": "JPMorgan Chase & Co.",
        "logo_color": "#0A2540",
        "logo_initials": "JP",
        "sector": "Financial Services",
        "industry": "Banking",
        "market_cap": 5.95e11,
        "price": 205.0,
        "pe": 12.4,
        "peg": 1.2,
        "ps": 3.6,
        "pb": 1.8,
        "ev_sales": 3.8,
        "rsi": 63,
        "roe": 16.8,
        "profit_margin": 31.5,
        "eps": 16.8,
        "de_ratio": 1.25,
        "gross_margin": 100.0,
        "p_fcf": 9.8,
        "roic": 14.5,
        "div_yield": 2.2,
        "upside_pct": 10.2,
        "tags": ["Finance", "Value", "Dividend"],
    },
    {
        "symbol": "BAC",
        "company_name": "Bank of America Corporation",
        "logo_color": "#00529B",
        "logo_initials": "BA",
        "sector": "Financial Services",
        "industry": "Banking",
        "market_cap": 3.2e11,
        "price": 41.0,
        "pe": 13.5,
        "peg": 1.3,
        "ps": 3.1,
        "pb": 1.2,
        "ev_sales": 3.2,
        "rsi": 62,
        "roe": 9.5,
        "profit_margin": 24.2,
        "eps": 3.05,
        "de_ratio": 1.45,
        "gross_margin": 100.0,
        "p_fcf": 8.5,
        "roic": 8.2,
        "div_yield": 2.33,
        "upside_pct": 15.4,
        "tags": ["Finance", "Value"],
    },
    {
        "symbol": "V",
        "company_name": "Visa Inc.",
        "logo_color": "#1A1F71",
        "logo_initials": "VI",
        "sector": "Financial Services",
        "industry": "Banking",
        "market_cap": 5.6e11,
        "price": 275.0,
        "pe": 29.2,
        "peg": 1.8,
        "ps": 16.5,
        "pb": 14.2,
        "ev_sales": 16.8,
        "rsi": 54,
        "roe": 48.5,
        "profit_margin": 54.5,
        "eps": 9.45,
        "de_ratio": 0.55,
        "gross_margin": 80.2,
        "p_fcf": 26.5,
        "roic": 28.0,
        "div_yield": 0.75,
        "upside_pct": 14.0,
        "tags": ["Finance", "Growth"],
    },
    {
        "symbol": "MA",
        "company_name": "Mastercard Incorporated",
        "logo_color": "#FF5F00",
        "logo_initials": "MA",
        "sector": "Financial Services",
        "industry": "Banking",
        "market_cap": 4.25e11,
        "price": 455.0,
        "pe": 34.5,
        "peg": 1.9,
        "ps": 16.8,
        "pb": 58.0,
        "ev_sales": 17.1,
        "rsi": 56,
        "roe": 165.0,
        "profit_margin": 45.2,
        "eps": 13.2,
        "de_ratio": 2.4,
        "gross_margin": 100.0,
        "p_fcf": 31.0,
        "roic": 52.0,
        "div_yield": 0.57,
        "upside_pct": 13.5,
        "tags": ["Finance", "Growth"],
    },
    {
        "symbol": "UNH",
        "company_name": "UnitedHealth Group Incorporated",
        "logo_color": "#002677",
        "logo_initials": "UN",
        "sector": "Healthcare",
        "industry": "Pharmaceuticals",
        "market_cap": 5.15e11,
        "price": 560.0,
        "pe": 25.1,
        "peg": 1.8,
        "ps": 1.4,
        "pb": 5.8,
        "ev_sales": 1.5,
        "rsi": 76,
        "roe": 25.4,
        "profit_margin": 6.2,
        "eps": 22.3,
        "de_ratio": 0.75,
        "gross_margin": 24.5,
        "p_fcf": 18.5,
        "roic": 15.2,
        "div_yield": 1.5,
        "upside_pct": 8.5,
        "tags": ["Value", "Defense"],
    },
    {
        "symbol": "JNJ",
        "company_name": "Johnson & Johnson",
        "logo_color": "#D51900",
        "logo_initials": "JJ",
        "sector": "Healthcare",
        "industry": "Pharmaceuticals",
        "market_cap": 3.66e11,
        "price": 152.0,
        "pe": 22.8,
        "peg": 2.4,
        "ps": 4.2,
        "pb": 5.1,
        "ev_sales": 4.5,
        "rsi": 48,
        "roe": 23.5,
        "profit_margin": 20.8,
        "eps": 6.68,
        "de_ratio": 0.45,
        "gross_margin": 68.5,
        "p_fcf": 18.0,
        "roic": 16.4,
        "div_yield": 3.25,
        "upside_pct": 11.2,
        "tags": ["Dividend", "Value", "Defense"],
    },
    {
        "symbol": "LLY",
        "company_name": "Eli Lilly and Company",
        "logo_color": "#E31B23",
        "logo_initials": "LL",
        "sector": "Healthcare",
        "industry": "Pharmaceuticals",
        "market_cap": 7.7e11,
        "price": 810.0,
        "pe": 115.0,
        "peg": 2.2,
        "ps": 20.5,
        "pb": 48.0,
        "ev_sales": 21.0,
        "rsi": 64,
        "roe": 62.4,
        "profit_margin": 18.5,
        "eps": 7.04,
        "de_ratio": 1.85,
        "gross_margin": 80.4,
        "p_fcf": 85.0,
        "roic": 26.5,
        "div_yield": 0.64,
        "upside_pct": 16.8,
        "tags": ["Growth"],
    },
    {
        "symbol": "ABBV",
        "company_name": "AbbVie Inc.",
        "logo_color": "#000B20",
        "logo_initials": "AB",
        "sector": "Healthcare",
        "industry": "Pharmaceuticals",
        "market_cap": 3.12e11,
        "price": 175.0,
        "pe": 15.2,
        "peg": 1.6,
        "ps": 5.6,
        "pb": 38.0,
        "ev_sales": 6.2,
        "rsi": 55,
        "roe": 145.0,
        "profit_margin": 11.8,
        "eps": 11.6,
        "de_ratio": 5.2,
        "gross_margin": 69.2,
        "p_fcf": 14.2,
        "roic": 16.8,
        "div_yield": 3.51,
        "upside_pct": 10.5,
        "tags": ["Dividend", "Value", "Defense"],
    },
]

def map_item_to_out(item: Any) -> dict:
    if isinstance(item, ScreenerStock):
        symbol = item.symbol
        company = item.company_name or symbol
        sector = item.sector or ""
        sub_sector = item.industry or ""
        market_cap = item.market_cap or 0.0
        price = item.price or 0.0
        pe = item.pe
        peg = item.peg
        ps = item.ps
        pb = item.pb
        ev_sales = item.ev_sales
        rsi_val = getattr(item, "rsi", None)
        rsi = rsi_val if rsi_val is not None else 50.0
        roe = item.roe
        profit_margin = item.profit_margin
        eps = item.eps
        de = item.de_ratio
        gross_margin = item.gross_margin
        p_fcf = item.p_fcf
        roic = item.roic
        div_yield = item.div_yield if item.div_yield is not None else 0.0
        upside = item.upside_pct if item.upside_pct is not None else 0.0

        tags_raw = item.tags
        if isinstance(tags_raw, str):
            try:
                tags = json.loads(tags_raw)
            except Exception:
                tags = []
        elif isinstance(tags_raw, list):
            tags = tags_raw
        else:
            tags = []
        logo_color = "#38bdf8"
        logo_initials = symbol[:2].upper()
    else:
        symbol = item["symbol"]
        company = item.get("company") or item.get("company_name") or symbol
        sector = item.get("sector") or ""
        sub_sector = item.get("subSector") or item.get("industry") or ""
        market_cap = item.get("marketCap") if "marketCap" in item else item.get("market_cap", 0.0)
        price = item.get("price", 0.0)
        pe = item.get("pe")
        peg = item.get("peg")
        ps = item.get("ps")
        pb = item.get("pb")
        ev_sales = item.get("evSales") if "evSales" in item else item.get("ev_sales")
        rsi = item.get("rsi", 50.0)
        roe = item.get("roe")
        profit_margin = item.get("profitMargin") if "profitMargin" in item else item.get("profit_margin")
        eps = item.get("eps")
        de = item.get("de") if "de" in item else item.get("de_ratio")
        gross_margin = item.get("grossMargin") if "grossMargin" in item else item.get("gross_margin")
        p_fcf = item.get("pFcf") if "pFcf" in item else item.get("p_fcf")
        roic = item.get("roic")
        div_yield = item.get("divYield") if "divYield" in item else item.get("div_yield", 0.0)
        upside = item.get("upside") if "upside" in item else item.get("upside_pct", 0.0)
        tags = item.get("tags", [])
        logo_color = item.get("logo_color") or item.get("logoColor") or "#38bdf8"
        logo_initials = item.get("logo_initials") or item.get("logoInitials") or symbol[:2].upper()

    return {
        "symbol": symbol,
        "company": company,
        "logoColor": logo_color,
        "logoInitials": logo_initials,
        "sector": sector,
        "subSector": sub_sector,
        "marketCap": market_cap,
        "price": price,
        "pe": pe,
        "peg": peg,
        "ps": ps,
        "pb": pb,
        "evSales": ev_sales,
        "rsi": rsi,
        "roe": roe,
        "profitMargin": profit_margin,
        "eps": eps,
        "de": de,
        "grossMargin": gross_margin,
        "pFcf": p_fcf,
        "roic": roic,
        "divYield": div_yield,
        "upside": upside,
        "tags": tags,
    }


def filter_fallback_item(item: dict, preset: Optional[str], filters: Dict[str, Any]) -> bool:
    symbol = item["symbol"]
    company = item["company_name"]
    sector = item["sector"]
    industry = item["industry"]
    pe = item["pe"]
    pb = item["pb"]
    roe = item["roe"]
    div_yield = item["div_yield"]
    market_cap = item["market_cap"]
    tags = item["tags"]
    tags_str_json = json.dumps(tags).lower()

    # Presets filter
    if preset and preset.lower() != "all":
        p = preset.lower()
        if p == "ai":
            match = (sector == "Technology" and ("Software" in industry or "Semiconductor" in industry)) or ('"ai"' in tags_str_json)
            if not match:
                return False
        elif p == "growth":
            match = (pe is not None and pe > 20 and roe is not None and (roe > 0.15 or roe > 15)) or ('"growth"' in tags_str_json)
            if not match:
                return False
        elif p == "value":
            match = (pe is not None and pe < 20 and pb is not None and pb < 3) or ('"value"' in tags_str_json)
            if not match:
                return False
        elif p == "dividend":
            match = (div_yield is not None and (div_yield > 0.03 or div_yield > 3.0)) or ('"dividend"' in tags_str_json)
            if not match:
                return False
        elif p == "finance":
            match = (sector == "Financial Services" or sector == "Financials") or ('"finance"' in tags_str_json)
            if not match:
                return False
        elif p == "semiconductor":
            match = ("Semiconductor" in industry) or ('"semiconductor"' in tags_str_json)
            if not match:
                return False
        elif p == "cloud":
            match = ("Software" in industry and market_cap > 10_000_000_000) or ('"cloud"' in tags_str_json)
            if not match:
                return False
        elif p == "quantum":
            match = ("Quantum" in company) or (symbol in ["IONQ", "RGTI", "QBTS", "IBM", "GOOGL", "MSFT", "AMZN"]) or ('"quantum"' in tags_str_json)
            if not match:
                return False
        elif p == "robotics":
            match = ("Robot" in industry) or (symbol in ["ABB", "FANUC", "IRBT", "HON", "EMR", "ROK", "KUKA"]) or ('"robotics"' in tags_str_json)
            if not match:
                return False
        elif p == "defense":
            match = ("Aerospace" in industry or "Defense" in industry) or ('"defense"' in tags_str_json)
            if not match:
                return False

    # Filters
    if filters:
        # Market Cap
        mc = filters.get("marketCap")
        if mc and mc.lower() != "all":
            k = mc.lower()
            if k == "mega" and market_cap <= 200_000_000_000:
                return False
            elif k == "large" and (market_cap < 10_000_000_000 or market_cap > 200_000_000_000):
                return False
            elif k == "mid" and (market_cap < 2_000_000_000 or market_cap >= 10_000_000_000):
                return False
            elif k == "small" and market_cap >= 2_000_000_000:
                return False

        # PE
        pe_val = filters.get("pe")
        if pe_val and pe_val.lower() != "all":
            k = pe_val.lower()
            if pe is None:
                return False
            if k == "under_15" and (pe < 0 or pe >= 15):
                return False
            elif k == "15_30" and (pe < 15 or pe > 30):
                return False
            elif k == "30_50" and (pe < 30 or pe > 50):
                return False
            elif k == "over_50" and pe <= 50:
                return False
            elif k == "negative" and pe >= 0:
                return False

        # Div Yield
        div_val = filters.get("divYield")
        if div_val and div_val.lower() != "all":
            k = div_val.lower()
            if div_yield is None:
                if k != "none":
                    return False
            elif k == "high" and not (div_yield > 0.04 or div_yield > 4.0):
                return False
            elif k == "moderate" and not ((0.02 <= div_yield <= 0.04) or (2.0 <= div_yield <= 4.0)):
                return False
            elif k == "low" and not ((0 < div_yield < 0.02) or (0 < div_yield < 2.0)):
                return False
            elif k == "none" and div_yield != 0:
                return False

        # Sector
        sec_val = filters.get("sector")
        if sec_val and sec_val.lower() != "all":
            if sector.lower() != sec_val.lower():
                return False

        # SubSector / Industry
        sub_val = filters.get("subSector") or filters.get("industry")
        if sub_val and sub_val.lower() != "all":
            if industry.lower() != sub_val.lower():
                return False

        # Search Query
        q = filters.get("searchQuery")
        if q and q.strip():
            query_str = q.strip().lower()
            if query_str not in symbol.lower() and query_str not in company.lower():
                return False

    return True


@router.post("/stocks")
def get_screener_stocks(req: ScreenerRequest, db: Session = Depends(get_db)):
    preset = req.preset
    filters = req.filters or {}
    sort_params = req.sort or {}
    sort_field = sort_params.get("field") or "marketCap"
    sort_order = sort_params.get("order") or "desc"
    page = max(1, req.page)
    page_size = max(1, req.pageSize)

    # Check if screener_stocks in DB has records
    db_count = 0
    try:
        db_count = db.execute(select(func.count()).select_from(ScreenerStock)).scalar() or 0
    except Exception:
        db_count = 0

    now_utc = datetime.now(timezone.utc).isoformat()

    if db_count > 0:
        # Query database using SQLAlchemy
        stmt = select(ScreenerStock)

        if preset and preset.lower() != "all":
            p = preset.lower()
            if p == "ai":
                stmt = stmt.where(
                    or_(
                        and_(ScreenerStock.sector == "Technology", or_(ScreenerStock.industry.ilike("%Software%"), ScreenerStock.industry.ilike("%Semiconductor%"))),
                        ScreenerStock.tags.ilike('%"ai"%' )
                    )
                )
            elif p == "growth":
                stmt = stmt.where(
                    or_(
                        and_(ScreenerStock.pe > 20, or_(ScreenerStock.roe > 0.15, ScreenerStock.roe > 15)),
                        ScreenerStock.tags.ilike('%"growth"%' )
                    )
                )
            elif p == "value":
                stmt = stmt.where(
                    or_(
                        and_(ScreenerStock.pe < 20, ScreenerStock.pb < 3),
                        ScreenerStock.tags.ilike('%"value"%' )
                    )
                )
            elif p == "dividend":
                stmt = stmt.where(
                    or_(
                        ScreenerStock.div_yield > 0.03,
                        ScreenerStock.div_yield > 3.0,
                        ScreenerStock.tags.ilike('%"dividend"%' )
                    )
                )
            elif p == "finance":
                stmt = stmt.where(
                    or_(
                        ScreenerStock.sector.ilike("%Financial%"),
                        ScreenerStock.tags.ilike('%"finance"%' )
                    )
                )
            elif p == "semiconductor":
                stmt = stmt.where(
                    or_(
                        ScreenerStock.industry.ilike("%Semiconductor%"),
                        ScreenerStock.tags.ilike('%"semiconductor"%' )
                    )
                )
            elif p == "cloud":
                stmt = stmt.where(
                    or_(
                        and_(ScreenerStock.industry.ilike("%Software%"), ScreenerStock.market_cap > 10_000_000_000),
                        ScreenerStock.tags.ilike('%"cloud"%' )
                    )
                )
            elif p == "quantum":
                stmt = stmt.where(
                    or_(
                        ScreenerStock.company_name.ilike("%Quantum%"),
                        ScreenerStock.symbol.in_(["IONQ", "RGTI", "QBTS", "IBM", "GOOGL", "MSFT", "AMZN"]),
                        ScreenerStock.tags.ilike('%"quantum"%' )
                    )
                )
            elif p == "robotics":
                stmt = stmt.where(
                    or_(
                        ScreenerStock.industry.ilike("%Robot%"),
                        ScreenerStock.symbol.in_(["ABB", "FANUC", "IRBT", "HON", "EMR", "ROK", "KUKA"]),
                        ScreenerStock.tags.ilike('%"robotics"%' )
                    )
                )
            elif p == "defense":
                stmt = stmt.where(
                    or_(
                        ScreenerStock.industry.ilike("%Aerospace%"),
                        ScreenerStock.industry.ilike("%Defense%"),
                        ScreenerStock.tags.ilike('%"defense"%' )
                    )
                )

        if filters:
            mc = filters.get("marketCap")
            if mc and mc.lower() != "all":
                k = mc.lower()
                if k == "mega":
                    stmt = stmt.where(ScreenerStock.market_cap > 200_000_000_000)
                elif k == "large":
                    stmt = stmt.where(and_(ScreenerStock.market_cap >= 10_000_000_000, ScreenerStock.market_cap <= 200_000_000_000))
                elif k == "mid":
                    stmt = stmt.where(and_(ScreenerStock.market_cap >= 2_000_000_000, ScreenerStock.market_cap < 10_000_000_000))
                elif k == "small":
                    stmt = stmt.where(ScreenerStock.market_cap < 2_000_000_000)

            pe_val = filters.get("pe")
            if pe_val and pe_val.lower() != "all":
                k = pe_val.lower()
                if k == "under_15":
                    stmt = stmt.where(and_(ScreenerStock.pe < 15, ScreenerStock.pe >= 0))
                elif k == "15_30":
                    stmt = stmt.where(and_(ScreenerStock.pe >= 15, ScreenerStock.pe <= 30))
                elif k == "30_50":
                    stmt = stmt.where(and_(ScreenerStock.pe >= 30, ScreenerStock.pe <= 50))
                elif k == "over_50":
                    stmt = stmt.where(ScreenerStock.pe > 50)
                elif k == "negative":
                    stmt = stmt.where(ScreenerStock.pe < 0)

            div_val = filters.get("divYield")
            if div_val and div_val.lower() != "all":
                k = div_val.lower()
                if k == "high":
                    stmt = stmt.where(or_(ScreenerStock.div_yield > 0.04, ScreenerStock.div_yield > 4.0))
                elif k == "moderate":
                    stmt = stmt.where(or_(and_(ScreenerStock.div_yield >= 0.02, ScreenerStock.div_yield <= 0.04), and_(ScreenerStock.div_yield >= 2.0, ScreenerStock.div_yield <= 4.0)))
                elif k == "low":
                    stmt = stmt.where(or_(and_(ScreenerStock.div_yield > 0, ScreenerStock.div_yield < 0.02), and_(ScreenerStock.div_yield > 0, ScreenerStock.div_yield < 2.0)))
                elif k == "none":
                    stmt = stmt.where(or_(ScreenerStock.div_yield == 0, ScreenerStock.div_yield.is_(None)))

            sec_val = filters.get("sector")
            if sec_val and sec_val.lower() != "all":
                stmt = stmt.where(func.lower(ScreenerStock.sector) == sec_val.lower())

            sub_val = filters.get("subSector") or filters.get("industry")
            if sub_val and sub_val.lower() != "all":
                stmt = stmt.where(func.lower(ScreenerStock.industry) == sub_val.lower())

            q = filters.get("searchQuery")
            if q and q.strip():
                query_str = f"%{q.strip()}%"
                stmt = stmt.where(or_(ScreenerStock.symbol.ilike(query_str), ScreenerStock.company_name.ilike(query_str)))

        all_matched = db.execute(stmt).scalars().all()
        refreshed_at = all_matched[0].refreshed_at.isoformat() if all_matched and getattr(all_matched[0], "refreshed_at", None) else now_utc

        # Sorting
        def sort_key_func(item: ScreenerStock):
            val = None
            if sort_field == "marketCap":
                val = item.market_cap
            elif sort_field == "company":
                val = item.company_name
            elif sort_field == "subSector":
                val = item.industry
            elif sort_field == "divYield":
                val = item.div_yield
            elif sort_field == "de":
                val = item.de_ratio
            elif sort_field == "pFcf":
                val = item.p_fcf
            elif sort_field == "evSales":
                val = item.ev_sales
            elif sort_field == "upside":
                val = item.upside_pct
            else:
                val = getattr(item, sort_field, None)
            return val

        def tuple_sort(item: ScreenerStock):
            val = sort_key_func(item)
            if val is None:
                return (1, "") if isinstance(val, str) else (1, 0)
            return (0, val)

        is_desc = sort_order.lower() == "desc"
        all_matched.sort(key=tuple_sort, reverse=is_desc)

        total = len(all_matched)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        page_items = all_matched[start_idx:end_idx]

        stocks_out = [map_item_to_out(stock) for stock in page_items]
        return {
            "total": total,
            "page": page,
            "pageSize": page_size,
            "stocks": stocks_out,
            "refreshedAt": refreshed_at,
            "isFallbackData": False,
        }

    # Fallback to hardcoded 51 stocks
    filtered = [stock for stock in FALLBACK_STOCKS if filter_fallback_item(stock, preset, filters)]

    def sort_fallback_func(stock: dict):
        val = None
        if sort_field == "marketCap":
            val = stock.get("market_cap")
        elif sort_field == "company":
            val = stock.get("company_name")
        elif sort_field == "subSector":
            val = stock.get("industry")
        elif sort_field == "divYield":
            val = stock.get("div_yield")
        elif sort_field == "de":
            val = stock.get("de_ratio")
        elif sort_field == "pFcf":
            val = stock.get("p_fcf")
        elif sort_field == "evSales":
            val = stock.get("ev_sales")
        elif sort_field == "upside":
            val = stock.get("upside_pct")
        elif sort_field in stock:
            val = stock.get(sort_field)
        else:
            val = stock.get(sort_field)
        return val

    def tuple_fallback_sort(stock: dict):
        val = sort_fallback_func(stock)
        if val is None:
            return (1, "") if isinstance(val, str) else (1, 0)
        return (0, val)

    is_desc = sort_order.lower() == "desc"
    filtered.sort(key=tuple_fallback_sort, reverse=is_desc)

    total = len(filtered)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    page_items = filtered[start_idx:end_idx]

    stocks_out = [map_item_to_out(stock) for stock in page_items]
    return {
        "total": total,
        "page": page,
        "pageSize": page_size,
        "stocks": stocks_out,
        "refreshedAt": FALLBACK_DATA_ASOF,
        "isFallbackData": True,
    }
