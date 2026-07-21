# Price Data Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real price-fetching service to the backend (yfinance primary, Twelve Data fallback, cached) and wire it into the portfolio summary endpoint, replacing the caller-supplied `prices` map that was a deliberate placeholder in the backend-foundation plan.

**Architecture:** A new `app/price_service.py` module owns fetching and a short-TTL in-memory cache. Two internal, independently-mockable functions (`_fetch_from_yfinance`, `_fetch_from_twelvedata`) do the actual network calls; `get_price`/`get_prices` are the public API layered on top with caching and fallback. A new `GET /prices` endpoint exposes this directly (useful for the eventual chart/DCA-calculator work); `GET /portfolios/{id}/summary` (currently `POST` with a client-supplied `prices` body) is converted to fetch prices server-side via this service.

**Tech Stack:** Same backend stack as `backend-foundation` — FastAPI, SQLAlchemy, pytest — plus `yfinance` (new) and `httpx` (already a dependency, reused for the Twelve Data REST call).

This is Plan 4 of the portfolio-tracker build (Plans 1-3 merged to `master`: backend foundation, React frontend foundation, frontend mutation-error handling + holdings composition). This plan implements PRD.md section 5 (price data) and closes the gap the backend-foundation plan explicitly deferred: "Fetching real prices (yfinance/Twelve Data) — the summary endpoint takes prices as input for now; a follow-up plan wires a price-fetch service in front of it." It also acts on the prior final review's recommendation: "once prices come from a service... `POST /{id}/summary` should become `GET /portfolios/{id}/summary`... cacheable and semantically a read."

## Global Constraints

- Primary price source: yfinance (free, no API key). Fallback: Twelve Data (needs `TWELVE_DATA_API_KEY` env var; if unset, Twelve Data is simply skipped — yfinance-only is a valid running configuration for local dev).
- Cache TTL: 60 seconds — don't refetch a ticker's price more than once per minute (per the original price-data-API research ticket's guidance: "cache response, don't refetch every page load").
- A ticker that fails on both sources is OMITTED from the result (not an error, not a zero) — callers (e.g. `portfolio_stats`) already default missing tickers to `0.0` via `prices.get(ticker, 0.0)`.
- No live network calls in tests — every test mocks `_fetch_from_yfinance`/`_fetch_from_twelvedata` (or the cache clock), never hits real yfinance/Twelve Data.
- No per-transaction/lot history, no currency field on `Holding` — unchanged from prior plans, not touched by this one.
- Money/share values are plain `float` — unchanged from prior plans.

---

## File Structure

```
portfolio-tracker/backend/
  requirements.txt          # MODIFY: add yfinance
  app/
    price_service.py         # CREATE: cache + fetch + fallback
    routers/
      prices.py               # CREATE: GET /prices endpoint
      portfolios.py            # MODIFY: summary endpoint POST->GET, server-fetched prices
    main.py                    # MODIFY: register prices router
  tests/
    test_price_service.py      # CREATE
    test_prices_router.py      # CREATE
    test_portfolios.py         # MODIFY: update summary endpoint tests for the new GET shape
```

---

### Task 1: `price_service.py` — single-ticker fetch, cache, fallback

**Files:**
- Create: `backend/app/price_service.py`
- Test: `backend/tests/test_price_service.py`
- Modify: `backend/requirements.txt`

**Interfaces:**
- Produces: `get_price(ticker: str) -> float | None`, `get_prices(tickers: list[str]) -> dict[str, float]` (added in Task 2, this task's `get_price` is what it's built on), `clear_cache() -> None` (test helper, also useful if the cache ever needs a manual reset), and the two internal functions `_fetch_from_yfinance(ticker: str) -> float | None` / `_fetch_from_twelvedata(ticker: str) -> float | None` — Task 3's router and Task 4's summary endpoint call `get_price`/`get_prices` by exact name; tests monkeypatch the two `_fetch_from_*` functions by exact name.

- [ ] **Step 1: Add `yfinance` to `requirements.txt`**

```
# backend/requirements.txt
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy==2.0.35
pydantic==2.9.2
pytest==8.3.3
httpx==0.27.2
yfinance==0.2.51
```

- [ ] **Step 2: Install the new dependency**

Run: `cd backend && .venv/Scripts/pip install -r requirements.txt`
Expected: `yfinance` and its transitive dependencies install with no errors.

- [ ] **Step 3: Write the failing tests**

```python
# backend/tests/test_price_service.py
import pytest

from app import price_service


@pytest.fixture(autouse=True)
def _clear_cache():
    price_service.clear_cache()
    yield
    price_service.clear_cache()


def test_get_price_returns_yfinance_price_and_does_not_call_twelvedata(monkeypatch):
    monkeypatch.setattr(price_service, "_fetch_from_yfinance", lambda ticker: 333.74)

    called_twelvedata = []
    monkeypatch.setattr(price_service, "_fetch_from_twelvedata", lambda ticker: called_twelvedata.append(ticker) or 999.0)

    price = price_service.get_price("AAPL")

    assert price == 333.74
    assert called_twelvedata == []


def test_get_price_falls_back_to_twelvedata_when_yfinance_fails(monkeypatch):
    monkeypatch.setattr(price_service, "_fetch_from_yfinance", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_from_twelvedata", lambda ticker: 556.53)

    price = price_service.get_price("SMH")

    assert price == 556.53


def test_get_price_returns_none_when_both_sources_fail(monkeypatch):
    monkeypatch.setattr(price_service, "_fetch_from_yfinance", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_from_twelvedata", lambda ticker: None)

    price = price_service.get_price("NOTATICKER")

    assert price is None


def test_get_price_caches_and_does_not_refetch_within_ttl(monkeypatch):
    call_count = {"n": 0}

    def fake_yfinance(ticker):
        call_count["n"] += 1
        return 100.0

    monkeypatch.setattr(price_service, "_fetch_from_yfinance", fake_yfinance)

    first = price_service.get_price("AAPL")
    second = price_service.get_price("AAPL")

    assert first == 100.0
    assert second == 100.0
    assert call_count["n"] == 1


def test_get_price_refetches_after_ttl_expires(monkeypatch):
    monkeypatch.setattr(price_service, "_fetch_from_yfinance", lambda ticker: 100.0)

    fake_time = {"t": 1000.0}
    monkeypatch.setattr(price_service.time, "monotonic", lambda: fake_time["t"])

    price_service.get_price("AAPL")

    fake_time["t"] += price_service.CACHE_TTL_SECONDS + 1

    call_count = {"n": 0}

    def fake_yfinance_second(ticker):
        call_count["n"] += 1
        return 105.0

    monkeypatch.setattr(price_service, "_fetch_from_yfinance", fake_yfinance_second)

    price = price_service.get_price("AAPL")

    assert price == 105.0
    assert call_count["n"] == 1


def test_a_failed_fetch_is_not_cached(monkeypatch):
    monkeypatch.setattr(price_service, "_fetch_from_yfinance", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_from_twelvedata", lambda ticker: None)

    price_service.get_price("BADTICKER")

    call_count = {"n": 0}

    def fake_yfinance(ticker):
        call_count["n"] += 1
        return 50.0

    monkeypatch.setattr(price_service, "_fetch_from_yfinance", fake_yfinance)

    price = price_service.get_price("BADTICKER")

    assert price == 50.0
    assert call_count["n"] == 1
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd backend && .venv/Scripts/pytest tests/test_price_service.py -v`
Expected: FAIL — `app.price_service` module does not exist yet (`ModuleNotFoundError`).

- [ ] **Step 5: Write `app/price_service.py`**

```python
# backend/app/price_service.py
import os
import time

CACHE_TTL_SECONDS = 60.0

_cache: dict[str, tuple[float, float]] = {}


def clear_cache() -> None:
    _cache.clear()


def _get_cached(ticker: str) -> float | None:
    entry = _cache.get(ticker)
    if entry is None:
        return None
    price, fetched_at = entry
    if time.monotonic() - fetched_at > CACHE_TTL_SECONDS:
        return None
    return price


def _set_cached(ticker: str, price: float) -> None:
    _cache[ticker] = (price, time.monotonic())


def _fetch_from_yfinance(ticker: str) -> float | None:
    import yfinance as yf

    try:
        fast_info = yf.Ticker(ticker).fast_info
        price = fast_info["lastPrice"]
        return float(price) if price is not None else None
    except Exception:
        return None


def _fetch_from_twelvedata(ticker: str) -> float | None:
    import httpx

    api_key = os.environ.get("TWELVE_DATA_API_KEY")
    if not api_key:
        return None
    try:
        response = httpx.get(
            "https://api.twelvedata.com/price",
            params={"symbol": ticker, "apikey": api_key},
            timeout=5.0,
        )
        response.raise_for_status()
        price = response.json().get("price")
        return float(price) if price is not None else None
    except Exception:
        return None


def get_price(ticker: str) -> float | None:
    cached = _get_cached(ticker)
    if cached is not None:
        return cached

    price = _fetch_from_yfinance(ticker)
    if price is None:
        price = _fetch_from_twelvedata(ticker)

    if price is not None:
        _set_cached(ticker, price)

    return price
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && .venv/Scripts/pytest tests/test_price_service.py -v`
Expected: all 6 tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/requirements.txt backend/app/price_service.py backend/tests/test_price_service.py
git commit -m "feat: add price_service with yfinance primary, Twelve Data fallback, and a 60s cache"
```

---

### Task 2: `get_prices` — batch fetch

**Files:**
- Modify: `backend/app/price_service.py`
- Modify: `backend/tests/test_price_service.py`

**Interfaces:**
- Consumes: `get_price` (Task 1).
- Produces: `get_prices(tickers: list[str]) -> dict[str, float]` — Task 3's router and Task 4's summary endpoint call this by exact name.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_price_service.py (append)
def test_get_prices_returns_a_dict_keyed_by_ticker(monkeypatch):
    prices = {"AAPL": 333.74, "SMH": 556.53}
    monkeypatch.setattr(price_service, "_fetch_from_yfinance", lambda ticker: prices[ticker])

    result = price_service.get_prices(["AAPL", "SMH"])

    assert result == {"AAPL": 333.74, "SMH": 556.53}


def test_get_prices_omits_tickers_that_fail_both_sources(monkeypatch):
    def fake_yfinance(ticker):
        return 100.0 if ticker == "AAPL" else None

    monkeypatch.setattr(price_service, "_fetch_from_yfinance", fake_yfinance)
    monkeypatch.setattr(price_service, "_fetch_from_twelvedata", lambda ticker: None)

    result = price_service.get_prices(["AAPL", "BADTICKER"])

    assert result == {"AAPL": 100.0}


def test_get_prices_with_empty_list_returns_empty_dict():
    result = price_service.get_prices([])

    assert result == {}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/Scripts/pytest tests/test_price_service.py -v -k get_prices`
Expected: FAIL — `get_prices` is not defined (`AttributeError`).

- [ ] **Step 3: Add `get_prices` to `app/price_service.py`**

```python
# backend/app/price_service.py (append at the end of the file)
def get_prices(tickers: list[str]) -> dict[str, float]:
    result: dict[str, float] = {}
    for ticker in tickers:
        price = get_price(ticker)
        if price is not None:
            result[ticker] = price
    return result
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/Scripts/pytest tests/test_price_service.py -v`
Expected: all 9 tests pass (6 from Task 1 + 3 new).

- [ ] **Step 5: Commit**

```bash
git add backend/app/price_service.py backend/tests/test_price_service.py
git commit -m "feat: add get_prices for batch ticker lookups"
```

---

### Task 3: `GET /prices` endpoint

**Files:**
- Create: `backend/app/routers/prices.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_prices_router.py`

**Interfaces:**
- Consumes: `get_prices` from `app.price_service` (Task 2).
- Produces: `router` (`APIRouter`, prefix `/prices`) in `app.routers.prices` — `main.py` includes it. Endpoint: `GET /prices?tickers=AAPL,SMH` returning `{"prices": {"AAPL": 333.74, "SMH": 556.53}}`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_prices_router.py
from unittest.mock import patch


def test_get_prices_returns_fetched_prices(client):
    with patch("app.routers.prices.get_prices", return_value={"AAPL": 333.74, "SMH": 556.53}) as mock_get_prices:
        response = client.get("/prices", params={"tickers": "AAPL,SMH"})

    assert response.status_code == 200
    assert response.json() == {"prices": {"AAPL": 333.74, "SMH": 556.53}}
    mock_get_prices.assert_called_once_with(["AAPL", "SMH"])


def test_get_prices_with_no_tickers_param_returns_empty(client):
    response = client.get("/prices")

    assert response.status_code == 200
    assert response.json() == {"prices": {}}


def test_get_prices_strips_whitespace_around_tickers(client):
    with patch("app.routers.prices.get_prices", return_value={}) as mock_get_prices:
        client.get("/prices", params={"tickers": " AAPL , SMH "})

    mock_get_prices.assert_called_once_with(["AAPL", "SMH"])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/Scripts/pytest tests/test_prices_router.py -v`
Expected: FAIL with 404s — no `/prices` route registered yet.

- [ ] **Step 3: Write `app/routers/prices.py`**

```python
# backend/app/routers/prices.py
from fastapi import APIRouter

from app.price_service import get_prices

router = APIRouter(prefix="/prices", tags=["prices"])


@router.get("")
def read_prices(tickers: str = ""):
    ticker_list = [t.strip() for t in tickers.split(",") if t.strip()]
    return {"prices": get_prices(ticker_list)}
```

- [ ] **Step 4: Register the router in `main.py`**

```python
# backend/app/main.py (replace the full file)
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import holdings, portfolios, prices, watchlist


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Portfolio Tracker API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(portfolios.router)
app.include_router(holdings.router)
app.include_router(watchlist.router)
app.include_router(prices.router)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && .venv/Scripts/pytest tests/test_prices_router.py -v`
Expected: all 3 tests pass.

- [ ] **Step 6: Run the full backend suite to confirm no regressions**

Run: `cd backend && .venv/Scripts/pytest -v`
Expected: all tests pass — 32 pre-existing + 9 price_service + 3 prices_router = 44.

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/prices.py backend/app/main.py backend/tests/test_prices_router.py
git commit -m "feat: add GET /prices endpoint for batch ticker price lookups"
```

---

### Task 4: Convert the portfolio summary endpoint to server-fetched prices

**Files:**
- Modify: `backend/app/routers/portfolios.py`
- Modify: `backend/tests/test_portfolios.py`
- Modify: `backend/app/schemas.py` (remove the now-unused `PriceMap`, only if nothing else references it — check first)

**Interfaces:**
- Consumes: `get_prices` from `app.price_service` (Task 2).
- Produces: `GET /portfolios/{portfolio_id}/summary` (was `POST` with a `PriceMap` body) — collects tickers from the portfolio's holdings, calls `get_prices`, then `portfolio_stats`. Response shape (`PortfolioSummaryOut`) is unchanged.

- [ ] **Step 1: Check whether `PriceMap` is used anywhere else**

Run: `cd backend && grep -rn "PriceMap" app/ tests/`
Expected: matches only in `app/schemas.py` (the definition) and `app/routers/portfolios.py` (the current summary endpoint, about to be replaced) and possibly `tests/test_portfolios.py`. If `PriceMap` is referenced anywhere you don't recognize, stop and report NEEDS_CONTEXT rather than removing something still in use.

- [ ] **Step 2: Update the summary tests in `backend/tests/test_portfolios.py`**

Find and replace the three tests that currently POST a `prices` body (`test_portfolio_summary_uses_supplied_prices`, `test_portfolio_summary_404_for_missing_portfolio`, `test_portfolio_summaries_are_isolated_across_portfolios`) with GET-based versions that mock `app.routers.portfolios.get_prices`:

```python
# backend/tests/test_portfolios.py
# Replace the existing test_portfolio_summary_uses_supplied_prices with:
def test_portfolio_summary_fetches_prices_server_side(client):
    from unittest.mock import patch

    portfolio = client.post("/portfolios", json={"name": "DIME", "cash_usd": 250, "target_allocation_pct": 70}).json()
    client.post(
        f"/portfolios/{portfolio['id']}/holdings",
        json={"ticker": "AAPL", "shares": 12, "avg_cost_usd": 187.40, "target_allocation_pct": 20},
    )

    with patch("app.routers.portfolios.get_prices", return_value={"AAPL": 333.74}) as mock_get_prices:
        response = client.get(f"/portfolios/{portfolio['id']}/summary")

    assert response.status_code == 200
    body = response.json()
    assert round(body["holdings_value"], 2) == round(12 * 333.74, 2)
    assert round(body["total_value"], 2) == round(12 * 333.74 + 250, 2)
    assert body["holdings"][0]["ticker"] == "AAPL"
    mock_get_prices.assert_called_once_with(["AAPL"])


# Replace the existing test_portfolio_summary_404_for_missing_portfolio with:
def test_portfolio_summary_404_for_missing_portfolio(client):
    response = client.get("/portfolios/999/summary")
    assert response.status_code == 404


# Replace the existing test_portfolio_summaries_are_isolated_across_portfolios's
# `.post(f"/portfolios/{id}/summary", json={"prices": {...}})` calls with:
#   .get(f"/portfolios/{id}/summary")
# and wrap both calls in the same `with patch("app.routers.portfolios.get_prices", ...)` block,
# using a return value covering the union of tickers both portfolios need
# (e.g. return_value={"AAPL": 150, "SMH": 300}).
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && .venv/Scripts/pytest tests/test_portfolios.py -v -k summary`
Expected: FAIL — the route is still `POST` and still expects a `PriceMap` body.

- [ ] **Step 4: Update `app/routers/portfolios.py`**

Remove the `PriceMap` import and replace the summary endpoint:

```python
# backend/app/routers/portfolios.py (replace the full file)
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.calculations import portfolio_stats
from app.database import get_db
from app.models import Portfolio
from app.price_service import get_prices
from app.routers._deps import get_or_404
from app.schemas import PortfolioCreate, PortfolioOut, PortfolioSummaryOut, PortfolioUpdate

router = APIRouter(prefix="/portfolios", tags=["portfolios"])


def _validate_total_target_allocation(db: Session, incoming_pct: float | None, exclude_id: int | None = None):
    if incoming_pct is None:
        return
    query = select(Portfolio.target_allocation_pct).where(Portfolio.id != exclude_id) if exclude_id else select(
        Portfolio.target_allocation_pct
    )
    existing = [pct for pct in db.execute(query).scalars().all() if pct is not None]
    total = sum(existing) + incoming_pct
    if total > 100:
        raise HTTPException(
            status_code=400,
            detail=f"Portfolio target allocations would total {total:.1f}%, which exceeds 100%",
        )


@router.post("", response_model=PortfolioOut, status_code=201)
def create_portfolio(payload: PortfolioCreate, db: Session = Depends(get_db)):
    _validate_total_target_allocation(db, payload.target_allocation_pct)
    portfolio = Portfolio(**payload.model_dump())
    db.add(portfolio)
    db.commit()
    db.refresh(portfolio)
    return portfolio


@router.get("", response_model=list[PortfolioOut])
def list_portfolios(db: Session = Depends(get_db)):
    return db.execute(select(Portfolio)).scalars().all()


@router.get("/{portfolio_id}", response_model=PortfolioOut)
def get_portfolio(portfolio_id: int, db: Session = Depends(get_db)):
    return get_or_404(db, Portfolio, portfolio_id, "Portfolio not found")


@router.patch("/{portfolio_id}", response_model=PortfolioOut)
def update_portfolio(portfolio_id: int, payload: PortfolioUpdate, db: Session = Depends(get_db)):
    portfolio = get_or_404(db, Portfolio, portfolio_id, "Portfolio not found")
    updates = payload.model_dump(exclude_unset=True)
    if "target_allocation_pct" in updates:
        _validate_total_target_allocation(db, updates["target_allocation_pct"], exclude_id=portfolio_id)
    for field, value in updates.items():
        setattr(portfolio, field, value)
    db.commit()
    db.refresh(portfolio)
    return portfolio


@router.delete("/{portfolio_id}", status_code=204)
def delete_portfolio(portfolio_id: int, db: Session = Depends(get_db)):
    portfolio = get_or_404(db, Portfolio, portfolio_id, "Portfolio not found")
    db.delete(portfolio)
    db.commit()


@router.get("/{portfolio_id}/summary", response_model=PortfolioSummaryOut)
def portfolio_summary(portfolio_id: int, db: Session = Depends(get_db)):
    portfolio = get_or_404(db, Portfolio, portfolio_id, "Portfolio not found")
    tickers = [h.ticker for h in portfolio.holdings]
    prices = get_prices(tickers)
    return portfolio_stats(portfolio, prices)
```

- [ ] **Step 5: Remove the now-unused `PriceMap` schema**

Confirm from Step 1's grep that `PriceMap` has no other references, then remove its class definition from `backend/app/schemas.py`:

```python
# backend/app/schemas.py — remove this class entirely:
# class PriceMap(BaseModel):
#     prices: dict[str, float]
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && .venv/Scripts/pytest tests/test_portfolios.py -v`
Expected: all portfolio tests pass, including the updated summary tests.

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && .venv/Scripts/pytest -v`
Expected: all tests pass, 0 warnings. Count should be the same as after Task 3 (44) since this task modifies existing tests rather than adding new ones (3 summary tests replaced 1-for-1, net zero change).

- [ ] **Step 8: Commit**

```bash
git add backend/app/routers/portfolios.py backend/app/schemas.py backend/tests/test_portfolios.py
git commit -m "feat: fetch summary prices server-side via price_service instead of a client-supplied body"
```

---

## What this plan does NOT cover (deliberately — see follow-up plans)

- Frontend consumption of `/prices` or the now-GET `/portfolios/{id}/summary` — the React app doesn't call either yet; that's the natural next plan (wire real $ values, P&L, and rebalance-severity coloring into the Dashboard/Portfolios UI).
- `SRLevel` / support-resistance calculation — depends on historical price series, not just a current quote; still a separate future plan per PRD.md section 6.
- FX/currency conversion — still a separate future plan per PRD.md section 9.
- Historical/intraday price series for charting — this plan only fetches a current quote (`fast_info`/`lastPrice`), not OHLC history.
