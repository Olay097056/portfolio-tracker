# Backend Foundation (Data Model + CRUD API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the FastAPI backend's data layer — SQLAlchemy models, SQLite persistence, and CRUD + summary-calculation REST endpoints for Portfolios, Holdings, and Watchlist — as a working, testable service with no frontend yet.

**Architecture:** FastAPI app with a single SQLite file (`portfolio.db`), SQLAlchemy 2.0 ORM models, Pydantic v2 schemas for request/response validation, and one router per resource. A `calculations.py` module computes derived stats (current allocation %, deviation vs target, rebalance severity, totals) from ORM objects — never stored, always computed on read.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.0, Pydantic v2, pytest, httpx (FastAPI TestClient transport), uvicorn.

This is Plan 1 of the portfolio-tracker build. It covers the backend data layer only. Price-data integration (yfinance/Twelve Data), the S/R algorithm, and the React frontend are separate follow-up plans — see [`PRD.md`](../../PRD.md) for full scope; this plan implements PRD sections 4 (data model), 7's totals math, and 8 (rebalancing severity).

## Global Constraints

- No per-transaction/lot history — `Holding` stores aggregate shares + average cost only (PRD.md section 4).
- No currency field on `Holding` — all prices/costs are USD; currency conversion is a display-layer concern for a later (frontend) plan, not this one (PRD.md section 9).
- `Holding.target_allocation_pct` values within one portfolio must sum to ≤ 100 (PRD.md section 4, "Allocation มี 2 ระดับ...").
- `Portfolio.target_allocation_pct` values across all portfolios must sum to ≤ 100.
- Rebalance severity thresholds: green ≤5pp deviation, yellow 5–10pp, red >10pp (PRD.md section 8) — these are fixed defaults for this plan; a configurable threshold is future work.
- SQLite only, single file, via SQLAlchemy — no external DB server (PRD.md section 4).

---

## File Structure

```
portfolio-tracker/backend/
  requirements.txt
  app/
    __init__.py
    main.py           # FastAPI() instance, include_router calls, DB init on startup
    database.py        # engine, SessionLocal, Base, get_db() dependency
    models.py          # SQLAlchemy ORM: Portfolio, Holding, WatchlistItem
    schemas.py          # Pydantic request/response models
    calculations.py     # pure functions: holding stats, portfolio stats, severity
    routers/
      __init__.py
      portfolios.py     # /portfolios CRUD + /portfolios/{id}/summary
      holdings.py        # /portfolios/{id}/holdings CRUD
      watchlist.py        # /watchlist CRUD
  tests/
    __init__.py
    conftest.py          # in-memory SQLite fixture + TestClient fixture
    test_calculations.py
    test_portfolios.py
    test_holdings.py
    test_watchlist.py
```

`SRLevel` (support/resistance) is intentionally deferred to the S/R-algorithm plan — it depends on price-series data this plan doesn't fetch yet.

---

### Task 1: Project scaffolding + database setup

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`
- Create: `backend/app/database.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`
- Test: `backend/tests/test_calculations.py` (placeholder assertion to prove the harness runs — replaced with real tests in Task 5)

**Interfaces:**
- Produces: `Base` (SQLAlchemy declarative base), `get_db()` (FastAPI dependency yielding a `Session`), `engine` — every later task imports these from `app.database`.

- [ ] **Step 1: Create the requirements file**

```
# backend/requirements.txt
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy==2.0.35
pydantic==2.9.2
pytest==8.3.3
httpx==0.27.2
```

- [ ] **Step 2: Install dependencies**

Run: `cd backend && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt` (Windows; use `.venv/bin/pip` on macOS/Linux)
Expected: all packages install with no errors.

- [ ] **Step 3: Write `app/database.py`**

```python
# backend/app/database.py
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./portfolio.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 4: Create empty `app/__init__.py` and `tests/__init__.py`**

```python
# backend/app/__init__.py
```

```python
# backend/tests/__init__.py
```

- [ ] **Step 5: Write `tests/conftest.py` — isolated in-memory DB per test**

```python
# backend/tests/conftest.py
import pytest
from sqlalchemy import create_engine, StaticPool
from sqlalchemy.orm import sessionmaker

from app.database import Base


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()
```

- [ ] **Step 6: Write a harness smoke test**

```python
# backend/tests/test_calculations.py
def test_harness_runs():
    assert 1 + 1 == 2
```

- [ ] **Step 7: Run pytest to confirm the harness works**

Run: `cd backend && .venv/Scripts/pytest tests/test_calculations.py -v`
Expected: `test_harness_runs PASSED`

- [ ] **Step 8: Commit**

```bash
git add backend/requirements.txt backend/app/__init__.py backend/app/database.py backend/tests/__init__.py backend/tests/conftest.py backend/tests/test_calculations.py
git commit -m "chore: scaffold backend project with SQLAlchemy database setup"
```

---

### Task 2: SQLAlchemy models — Portfolio, Holding, WatchlistItem

**Files:**
- Create: `backend/app/models.py`
- Modify: `backend/tests/conftest.py:9` (add `import app.models` so `Base.metadata` sees the tables — see Step 1 note)
- Test: `backend/tests/test_calculations.py` (extend with a model round-trip test)

**Interfaces:**
- Consumes: `Base` from `app.database` (Task 1).
- Produces: `Portfolio`, `Holding`, `WatchlistItem` classes — every later task imports these from `app.models`. Columns exactly as listed in Step 2 below (later tasks' Pydantic schemas and CRUD code depend on these exact names/types).

- [ ] **Step 1: Update `conftest.py` to import models before `create_all`**

`Base.metadata.create_all` only sees tables whose model classes have been imported somewhere. Add the import at the top of `conftest.py`:

```python
# backend/tests/conftest.py (add this line near the top, after the existing imports)
import app.models  # noqa: F401  (registers ORM classes with Base.metadata)
```

- [ ] **Step 2: Write `app/models.py`**

```python
# backend/app/models.py
from datetime import datetime, timezone

from sqlalchemy import Float, ForeignKey, String, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Portfolio(Base):
    __tablename__ = "portfolios"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    cash_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    target_allocation_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    holdings: Mapped[list["Holding"]] = relationship(
        back_populates="portfolio", cascade="all, delete-orphan"
    )


class Holding(Base):
    __tablename__ = "holdings"

    id: Mapped[int] = mapped_column(primary_key=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id"), nullable=False)
    ticker: Mapped[str] = mapped_column(String, nullable=False)
    shares: Mapped[float] = mapped_column(Float, nullable=False)
    avg_cost_usd: Mapped[float] = mapped_column(Float, nullable=False)
    target_allocation_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    realized_pnl_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    portfolio: Mapped["Portfolio"] = relationship(back_populates="holdings")


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticker: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
```

- [ ] **Step 3: Write the failing round-trip test**

```python
# backend/tests/test_calculations.py (append)
from app.models import Portfolio, Holding, WatchlistItem


def test_portfolio_holding_round_trip(db_session):
    portfolio = Portfolio(name="DIME", cash_usd=250.0, target_allocation_pct=70.0)
    db_session.add(portfolio)
    db_session.commit()
    db_session.refresh(portfolio)

    holding = Holding(
        portfolio_id=portfolio.id,
        ticker="AAPL",
        shares=12,
        avg_cost_usd=187.40,
        target_allocation_pct=20.0,
    )
    db_session.add(holding)
    db_session.commit()
    db_session.refresh(holding)

    watchlist_item = WatchlistItem(ticker="JNJ", category="Value")
    db_session.add(watchlist_item)
    db_session.commit()

    assert portfolio.holdings[0].ticker == "AAPL"
    assert holding.realized_pnl_usd == 0.0
    assert watchlist_item.category == "Value"
```

- [ ] **Step 4: Run test to verify it fails first (models.py not yet imported correctly / table missing)**

Run: `cd backend && .venv/Scripts/pytest tests/test_calculations.py -v`
Expected: FAIL if Step 1 or Step 2 was skipped (e.g. `sqlalchemy.exc.OperationalError: no such table: portfolios`). If both steps are already in place, this will pass immediately — that's fine, proceed to Step 5 to confirm.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && .venv/Scripts/pytest tests/test_calculations.py -v`
Expected: `test_harness_runs PASSED`, `test_portfolio_holding_round_trip PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/app/models.py backend/tests/conftest.py backend/tests/test_calculations.py
git commit -m "feat: add Portfolio, Holding, WatchlistItem SQLAlchemy models"
```

---

### Task 3: Calculation functions — holding stats, portfolio stats, severity

**Files:**
- Create: `backend/app/calculations.py`
- Test: `backend/tests/test_calculations.py` (append)

**Interfaces:**
- Consumes: `Holding`, `Portfolio` from `app.models` (Task 2) — reads their attributes, does not query the DB itself (pure functions, take ORM objects + a `prices: dict[str, float]` map as input).
- Produces: `holding_stats(holding, current_price, portfolio_holdings_value)`, `severity_for_deviation(deviation_pp)`, `portfolio_stats(portfolio, prices)`, `allocation_severity_summary(portfolios, prices)` — the API routers in Tasks 4–6 call these by exact name.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_calculations.py (append)
from app.calculations import (
    severity_for_deviation,
    holding_stats,
    portfolio_stats,
)
from app.models import Portfolio, Holding


def test_severity_for_deviation_bands():
    assert severity_for_deviation(0) == "green"
    assert severity_for_deviation(5) == "green"
    assert severity_for_deviation(5.1) == "yellow"
    assert severity_for_deviation(-9.9) == "yellow"
    assert severity_for_deviation(10.1) == "red"
    assert severity_for_deviation(-15) == "red"


def test_holding_stats_computes_value_pct_pnl():
    holding = Holding(
        ticker="AAPL", shares=12, avg_cost_usd=187.40,
        target_allocation_pct=20.0, realized_pnl_usd=0.0,
    )
    stats = holding_stats(holding, current_price=333.74, portfolio_holdings_value=9732.85)

    assert stats["value"] == 12 * 333.74
    assert round(stats["current_pct"], 2) == round(stats["value"] / 9732.85 * 100, 2)
    assert round(stats["deviation_pp"], 2) == round(stats["current_pct"] - 20.0, 2)
    assert stats["severity"] in ("green", "yellow", "red")
    assert round(stats["unrealized_pnl"], 2) == round((333.74 - 187.40) * 12, 2)


def test_portfolio_stats_totals_value_cash_and_pnl():
    portfolio = Portfolio(name="DIME", cash_usd=250.0, target_allocation_pct=70.0)
    portfolio.holdings = [
        Holding(ticker="AAPL", shares=12, avg_cost_usd=187.40, target_allocation_pct=20.0, realized_pnl_usd=0.0),
        Holding(ticker="SMH", shares=3.18, avg_cost_usd=297.77, target_allocation_pct=25.0, realized_pnl_usd=120.0),
    ]
    prices = {"AAPL": 333.74, "SMH": 556.53}

    stats = portfolio_stats(portfolio, prices)

    holdings_value = 12 * 333.74 + 3.18 * 556.53
    assert round(stats["holdings_value"], 2) == round(holdings_value, 2)
    assert round(stats["total_value"], 2) == round(holdings_value + 250.0, 2)
    assert round(stats["realized_pnl"], 2) == 120.0
    assert len(stats["holdings"]) == 2
    assert stats["holdings"][0]["ticker"] == "AAPL"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/Scripts/pytest tests/test_calculations.py -v`
Expected: `ModuleNotFoundError: No module named 'app.calculations'` (or `ImportError`) for the three new tests.

- [ ] **Step 3: Write `app/calculations.py`**

```python
# backend/app/calculations.py
from app.models import Holding, Portfolio

GREEN_MAX_PP = 5.0
YELLOW_MAX_PP = 10.0


def severity_for_deviation(deviation_pp: float) -> str:
    """Rebalance severity band for a percentage-point deviation (PRD.md section 8)."""
    abs_dev = abs(deviation_pp)
    if abs_dev > YELLOW_MAX_PP:
        return "red"
    if abs_dev > GREEN_MAX_PP:
        return "yellow"
    return "green"


def holding_stats(holding: Holding, current_price: float, portfolio_holdings_value: float) -> dict:
    value = holding.shares * current_price
    current_pct = (value / portfolio_holdings_value * 100) if portfolio_holdings_value else 0.0
    target_pct = holding.target_allocation_pct or 0.0
    deviation_pp = current_pct - target_pct
    unrealized_pnl = (current_price - holding.avg_cost_usd) * holding.shares
    return {
        "ticker": holding.ticker,
        "shares": holding.shares,
        "avg_cost_usd": holding.avg_cost_usd,
        "current_price": current_price,
        "value": value,
        "current_pct": current_pct,
        "target_pct": target_pct,
        "deviation_pp": deviation_pp,
        "severity": severity_for_deviation(deviation_pp),
        "unrealized_pnl": unrealized_pnl,
        "realized_pnl": holding.realized_pnl_usd,
    }


def portfolio_stats(portfolio: Portfolio, prices: dict[str, float]) -> dict:
    holdings_value = sum(h.shares * prices.get(h.ticker, 0.0) for h in portfolio.holdings)
    total_value = holdings_value + portfolio.cash_usd
    unrealized_pnl = sum(
        (prices.get(h.ticker, 0.0) - h.avg_cost_usd) * h.shares for h in portfolio.holdings
    )
    realized_pnl = sum(h.realized_pnl_usd for h in portfolio.holdings)
    holdings = [
        holding_stats(h, prices.get(h.ticker, 0.0), holdings_value) for h in portfolio.holdings
    ]
    return {
        "id": portfolio.id,
        "name": portfolio.name,
        "cash_usd": portfolio.cash_usd,
        "target_allocation_pct": portfolio.target_allocation_pct,
        "holdings_value": holdings_value,
        "total_value": total_value,
        "unrealized_pnl": unrealized_pnl,
        "realized_pnl": realized_pnl,
        "holdings": holdings,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/Scripts/pytest tests/test_calculations.py -v`
Expected: all 5 tests PASS (`test_harness_runs`, `test_portfolio_holding_round_trip`, `test_severity_for_deviation_bands`, `test_holding_stats_computes_value_pct_pnl`, `test_portfolio_stats_totals_value_cash_and_pnl`).

- [ ] **Step 5: Commit**

```bash
git add backend/app/calculations.py backend/tests/test_calculations.py
git commit -m "feat: add holding/portfolio stats and rebalance severity calculations"
```

---

### Task 4: Pydantic schemas + FastAPI app shell

**Files:**
- Create: `backend/app/schemas.py`
- Create: `backend/app/main.py`
- Create: `backend/app/routers/__init__.py`
- Test: `backend/tests/conftest.py` (add a `client` fixture)

**Interfaces:**
- Consumes: `Base`, `engine`, `get_db` from `app.database`; ORM models from `app.models`.
- Produces: `PortfolioCreate`, `PortfolioUpdate`, `PortfolioOut`, `HoldingCreate`, `HoldingUpdate`, `HoldingOut`, `WatchlistItemCreate`, `WatchlistItemOut` Pydantic classes in `app.schemas` — Tasks 5–7's routers import these by exact name. `app` FastAPI instance in `app.main` — the `client` fixture wraps it.

- [ ] **Step 1: Write `app/schemas.py`**

```python
# backend/app/schemas.py
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PortfolioCreate(BaseModel):
    name: str
    cash_usd: float = 0.0
    target_allocation_pct: float | None = None


class PortfolioUpdate(BaseModel):
    name: str | None = None
    cash_usd: float | None = None
    target_allocation_pct: float | None = None


class PortfolioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    cash_usd: float
    target_allocation_pct: float | None
    created_at: datetime


class HoldingCreate(BaseModel):
    ticker: str
    shares: float
    avg_cost_usd: float
    target_allocation_pct: float | None = None


class HoldingUpdate(BaseModel):
    ticker: str | None = None
    shares: float | None = None
    avg_cost_usd: float | None = None
    target_allocation_pct: float | None = None
    realized_pnl_usd: float | None = None


class HoldingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    portfolio_id: int
    ticker: str
    shares: float
    avg_cost_usd: float
    target_allocation_pct: float | None
    realized_pnl_usd: float
    created_at: datetime
    updated_at: datetime


class WatchlistItemCreate(BaseModel):
    ticker: str
    category: str | None = None


class WatchlistItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ticker: str
    category: str | None
    created_at: datetime
```

- [ ] **Step 2: Write empty `app/routers/__init__.py`**

```python
# backend/app/routers/__init__.py
```

- [ ] **Step 3: Write `app/main.py`**

```python
# backend/app/main.py
from fastapi import FastAPI

from app.database import Base, engine

app = FastAPI(title="Portfolio Tracker API")


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 4: Add a `client` fixture to `conftest.py`**

```python
# backend/tests/conftest.py (append)
from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app


@pytest.fixture()
def client(db_session):
    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
```

- [ ] **Step 5: Write the failing smoke test for the app shell**

```python
# backend/tests/test_portfolios.py
def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 6: Run test to verify it fails first**

Run: `cd backend && .venv/Scripts/pytest tests/test_portfolios.py -v`
Expected: FAIL if any of Steps 1–4 were skipped (e.g. `ModuleNotFoundError`). With all steps done it will already pass — confirm in Step 7.

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && .venv/Scripts/pytest tests/test_portfolios.py -v`
Expected: `test_health_endpoint PASSED`

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas.py backend/app/main.py backend/app/routers/__init__.py backend/tests/conftest.py backend/tests/test_portfolios.py
git commit -m "feat: add Pydantic schemas and FastAPI app shell with health endpoint"
```

---

### Task 5: Portfolio CRUD router + allocation validation

**Files:**
- Create: `backend/app/routers/portfolios.py`
- Modify: `backend/app/main.py:1-13` (register the router)
- Test: `backend/tests/test_portfolios.py` (append)

**Interfaces:**
- Consumes: `Portfolio` model (Task 2), `PortfolioCreate`/`PortfolioUpdate`/`PortfolioOut` schemas (Task 4), `get_db` (Task 1).
- Produces: `router` (`APIRouter`, prefix `/portfolios`) in `app.routers.portfolios` — `main.py` includes it. Endpoints: `POST /portfolios`, `GET /portfolios`, `GET /portfolios/{id}`, `PATCH /portfolios/{id}`, `DELETE /portfolios/{id}`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_portfolios.py (append)
def test_create_portfolio(client):
    response = client.post("/portfolios", json={"name": "DIME", "cash_usd": 250, "target_allocation_pct": 70})
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "DIME"
    assert body["cash_usd"] == 250
    assert "id" in body


def test_list_portfolios(client):
    client.post("/portfolios", json={"name": "DIME", "target_allocation_pct": 70})
    client.post("/portfolios", json={"name": "Speculative", "target_allocation_pct": 30})

    response = client.get("/portfolios")
    assert response.status_code == 200
    names = [p["name"] for p in response.json()]
    assert names == ["DIME", "Speculative"]


def test_create_portfolio_rejects_target_allocation_over_100_total(client):
    client.post("/portfolios", json={"name": "DIME", "target_allocation_pct": 70})
    response = client.post("/portfolios", json={"name": "Speculative", "target_allocation_pct": 40})

    assert response.status_code == 400
    assert "100" in response.json()["detail"]


def test_update_portfolio_name_and_cash(client):
    created = client.post("/portfolios", json={"name": "DIME", "target_allocation_pct": 70}).json()

    response = client.patch(f"/portfolios/{created['id']}", json={"name": "DIME Core", "cash_usd": 500})
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "DIME Core"
    assert body["cash_usd"] == 500


def test_delete_portfolio(client):
    created = client.post("/portfolios", json={"name": "DIME"}).json()

    response = client.delete(f"/portfolios/{created['id']}")
    assert response.status_code == 204

    response = client.get(f"/portfolios/{created['id']}")
    assert response.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/Scripts/pytest tests/test_portfolios.py -v`
Expected: FAIL on all 5 new tests with 404s (no `/portfolios` route registered yet).

- [ ] **Step 3: Write `app/routers/portfolios.py`**

```python
# backend/app/routers/portfolios.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Portfolio
from app.schemas import PortfolioCreate, PortfolioOut, PortfolioUpdate

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
    portfolio = db.get(Portfolio, portfolio_id)
    if portfolio is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio


@router.patch("/{portfolio_id}", response_model=PortfolioOut)
def update_portfolio(portfolio_id: int, payload: PortfolioUpdate, db: Session = Depends(get_db)):
    portfolio = db.get(Portfolio, portfolio_id)
    if portfolio is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
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
    portfolio = db.get(Portfolio, portfolio_id)
    if portfolio is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    db.delete(portfolio)
    db.commit()
```

- [ ] **Step 4: Register the router in `main.py`**

```python
# backend/app/main.py (replace the full file)
from fastapi import FastAPI

from app.database import Base, engine
from app.routers import portfolios

app = FastAPI(title="Portfolio Tracker API")
app.include_router(portfolios.router)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && .venv/Scripts/pytest tests/test_portfolios.py -v`
Expected: all 6 tests PASS (`test_health_endpoint` + the 5 new ones).

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/portfolios.py backend/app/main.py backend/tests/test_portfolios.py
git commit -m "feat: add portfolio CRUD endpoints with total-allocation validation"
```

---

### Task 6: Holding CRUD router (nested under a portfolio) + allocation validation

**Files:**
- Create: `backend/app/routers/holdings.py`
- Modify: `backend/app/main.py:1-15` (register the router)
- Test: `backend/tests/test_holdings.py`

**Interfaces:**
- Consumes: `Holding`, `Portfolio` models (Task 2), `HoldingCreate`/`HoldingUpdate`/`HoldingOut` schemas (Task 4), `get_db` (Task 1).
- Produces: `router` (`APIRouter`, prefix `/portfolios/{portfolio_id}/holdings`) in `app.routers.holdings`. Endpoints: `POST`, `GET` (list), `PATCH /{holding_id}`, `DELETE /{holding_id}`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_holdings.py
def _make_portfolio(client, name="DIME"):
    return client.post("/portfolios", json={"name": name}).json()


def test_create_holding(client):
    portfolio = _make_portfolio(client)

    response = client.post(
        f"/portfolios/{portfolio['id']}/holdings",
        json={"ticker": "AAPL", "shares": 12, "avg_cost_usd": 187.40, "target_allocation_pct": 20},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["ticker"] == "AAPL"
    assert body["portfolio_id"] == portfolio["id"]
    assert body["realized_pnl_usd"] == 0.0


def test_create_holding_rejects_target_allocation_over_100_within_portfolio(client):
    portfolio = _make_portfolio(client)
    client.post(
        f"/portfolios/{portfolio['id']}/holdings",
        json={"ticker": "AAPL", "shares": 12, "avg_cost_usd": 187.40, "target_allocation_pct": 70},
    )

    response = client.post(
        f"/portfolios/{portfolio['id']}/holdings",
        json={"ticker": "SMH", "shares": 3, "avg_cost_usd": 297.77, "target_allocation_pct": 40},
    )
    assert response.status_code == 400
    assert "100" in response.json()["detail"]


def test_create_holding_404_for_missing_portfolio(client):
    response = client.post(
        "/portfolios/999/holdings",
        json={"ticker": "AAPL", "shares": 12, "avg_cost_usd": 187.40},
    )
    assert response.status_code == 404


def test_list_holdings_for_portfolio(client):
    portfolio = _make_portfolio(client)
    client.post(f"/portfolios/{portfolio['id']}/holdings", json={"ticker": "AAPL", "shares": 12, "avg_cost_usd": 187.40})
    client.post(f"/portfolios/{portfolio['id']}/holdings", json={"ticker": "SMH", "shares": 3, "avg_cost_usd": 297.77})

    response = client.get(f"/portfolios/{portfolio['id']}/holdings")
    assert response.status_code == 200
    tickers = [h["ticker"] for h in response.json()]
    assert tickers == ["AAPL", "SMH"]


def test_update_holding_realized_pnl(client):
    portfolio = _make_portfolio(client)
    holding = client.post(
        f"/portfolios/{portfolio['id']}/holdings",
        json={"ticker": "SMH", "shares": 3.18, "avg_cost_usd": 297.77},
    ).json()

    response = client.patch(
        f"/portfolios/{portfolio['id']}/holdings/{holding['id']}", json={"realized_pnl_usd": 120.0}
    )
    assert response.status_code == 200
    assert response.json()["realized_pnl_usd"] == 120.0


def test_delete_holding(client):
    portfolio = _make_portfolio(client)
    holding = client.post(
        f"/portfolios/{portfolio['id']}/holdings",
        json={"ticker": "AAPL", "shares": 12, "avg_cost_usd": 187.40},
    ).json()

    response = client.delete(f"/portfolios/{portfolio['id']}/holdings/{holding['id']}")
    assert response.status_code == 204

    response = client.get(f"/portfolios/{portfolio['id']}/holdings")
    assert response.json() == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/Scripts/pytest tests/test_holdings.py -v`
Expected: FAIL on all 6 tests with 404s (no `/portfolios/{id}/holdings` route yet).

- [ ] **Step 3: Write `app/routers/holdings.py`**

```python
# backend/app/routers/holdings.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Holding, Portfolio
from app.schemas import HoldingCreate, HoldingOut, HoldingUpdate

router = APIRouter(prefix="/portfolios/{portfolio_id}/holdings", tags=["holdings"])


def _get_portfolio_or_404(db: Session, portfolio_id: int) -> Portfolio:
    portfolio = db.get(Portfolio, portfolio_id)
    if portfolio is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio


def _validate_holding_target_allocation(
    db: Session, portfolio_id: int, incoming_pct: float | None, exclude_holding_id: int | None = None
):
    if incoming_pct is None:
        return
    query = select(Holding.target_allocation_pct).where(Holding.portfolio_id == portfolio_id)
    if exclude_holding_id:
        query = query.where(Holding.id != exclude_holding_id)
    existing = [pct for pct in db.execute(query).scalars().all() if pct is not None]
    total = sum(existing) + incoming_pct
    if total > 100:
        raise HTTPException(
            status_code=400,
            detail=f"Holding target allocations in this portfolio would total {total:.1f}%, which exceeds 100%",
        )


@router.post("", response_model=HoldingOut, status_code=201)
def create_holding(portfolio_id: int, payload: HoldingCreate, db: Session = Depends(get_db)):
    _get_portfolio_or_404(db, portfolio_id)
    _validate_holding_target_allocation(db, portfolio_id, payload.target_allocation_pct)
    holding = Holding(portfolio_id=portfolio_id, **payload.model_dump())
    db.add(holding)
    db.commit()
    db.refresh(holding)
    return holding


@router.get("", response_model=list[HoldingOut])
def list_holdings(portfolio_id: int, db: Session = Depends(get_db)):
    _get_portfolio_or_404(db, portfolio_id)
    return db.execute(select(Holding).where(Holding.portfolio_id == portfolio_id)).scalars().all()


@router.patch("/{holding_id}", response_model=HoldingOut)
def update_holding(portfolio_id: int, holding_id: int, payload: HoldingUpdate, db: Session = Depends(get_db)):
    _get_portfolio_or_404(db, portfolio_id)
    holding = db.get(Holding, holding_id)
    if holding is None or holding.portfolio_id != portfolio_id:
        raise HTTPException(status_code=404, detail="Holding not found")
    updates = payload.model_dump(exclude_unset=True)
    if "target_allocation_pct" in updates:
        _validate_holding_target_allocation(
            db, portfolio_id, updates["target_allocation_pct"], exclude_holding_id=holding_id
        )
    for field, value in updates.items():
        setattr(holding, field, value)
    db.commit()
    db.refresh(holding)
    return holding


@router.delete("/{holding_id}", status_code=204)
def delete_holding(portfolio_id: int, holding_id: int, db: Session = Depends(get_db)):
    _get_portfolio_or_404(db, portfolio_id)
    holding = db.get(Holding, holding_id)
    if holding is None or holding.portfolio_id != portfolio_id:
        raise HTTPException(status_code=404, detail="Holding not found")
    db.delete(holding)
    db.commit()
```

- [ ] **Step 4: Register the router in `main.py`**

```python
# backend/app/main.py (replace the full file)
from fastapi import FastAPI

from app.database import Base, engine
from app.routers import holdings, portfolios

app = FastAPI(title="Portfolio Tracker API")
app.include_router(portfolios.router)
app.include_router(holdings.router)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && .venv/Scripts/pytest tests/test_holdings.py -v`
Expected: all 6 tests PASS.

- [ ] **Step 6: Run the full test suite to check nothing regressed**

Run: `cd backend && .venv/Scripts/pytest -v`
Expected: all tests across `test_calculations.py`, `test_portfolios.py`, `test_holdings.py` PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/holdings.py backend/app/main.py backend/tests/test_holdings.py
git commit -m "feat: add holding CRUD endpoints nested under portfolios with allocation validation"
```

---

### Task 7: Watchlist CRUD router + portfolio summary endpoint

**Files:**
- Create: `backend/app/routers/watchlist.py`
- Modify: `backend/app/routers/portfolios.py` (add a `GET /portfolios/{id}/summary` endpoint using `portfolio_stats`)
- Modify: `backend/app/main.py` (register the watchlist router)
- Test: `backend/tests/test_watchlist.py`
- Test: `backend/tests/test_portfolios.py` (append summary endpoint test)

**Interfaces:**
- Consumes: `WatchlistItem` model, `WatchlistItemCreate`/`WatchlistItemOut` schemas, `portfolio_stats` from `app.calculations` (Task 3).
- Produces: `router` in `app.routers.watchlist` (prefix `/watchlist`): `POST`, `GET`, `DELETE /{id}`. `GET /portfolios/{id}/summary` returning the `portfolio_stats` dict shape, accepting an optional `prices` query mechanism is deferred — for this plan it prices every holding at `0.0` unless a `prices` dict is supplied via request body on a `POST /portfolios/{id}/summary` (see Step 3 rationale) so the endpoint is testable without a live price feed (that integration is a later plan).

- [ ] **Step 1: Write the failing watchlist tests**

```python
# backend/tests/test_watchlist.py
def test_create_watchlist_item(client):
    response = client.post("/watchlist", json={"ticker": "JNJ", "category": "Value"})
    assert response.status_code == 201
    body = response.json()
    assert body["ticker"] == "JNJ"
    assert body["category"] == "Value"


def test_list_watchlist_items(client):
    client.post("/watchlist", json={"ticker": "JNJ", "category": "Value"})
    client.post("/watchlist", json={"ticker": "IOVA", "category": "Growth"})

    response = client.get("/watchlist")
    assert response.status_code == 200
    tickers = [w["ticker"] for w in response.json()]
    assert tickers == ["JNJ", "IOVA"]


def test_delete_watchlist_item(client):
    created = client.post("/watchlist", json={"ticker": "JNJ"}).json()

    response = client.delete(f"/watchlist/{created['id']}")
    assert response.status_code == 204

    response = client.get("/watchlist")
    assert response.json() == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/Scripts/pytest tests/test_watchlist.py -v`
Expected: FAIL on all 3 tests with 404s.

- [ ] **Step 3: Write `app/routers/watchlist.py`**

```python
# backend/app/routers/watchlist.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import WatchlistItem
from app.schemas import WatchlistItemCreate, WatchlistItemOut

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


@router.post("", response_model=WatchlistItemOut, status_code=201)
def create_watchlist_item(payload: WatchlistItemCreate, db: Session = Depends(get_db)):
    item = WatchlistItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("", response_model=list[WatchlistItemOut])
def list_watchlist_items(db: Session = Depends(get_db)):
    return db.execute(select(WatchlistItem)).scalars().all()


@router.delete("/{item_id}", status_code=204)
def delete_watchlist_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(WatchlistItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Watchlist item not found")
    db.delete(item)
    db.commit()
```

- [ ] **Step 4: Write the failing summary-endpoint test**

```python
# backend/tests/test_portfolios.py (append)
def test_portfolio_summary_uses_supplied_prices(client):
    portfolio = client.post("/portfolios", json={"name": "DIME", "cash_usd": 250, "target_allocation_pct": 70}).json()
    client.post(
        f"/portfolios/{portfolio['id']}/holdings",
        json={"ticker": "AAPL", "shares": 12, "avg_cost_usd": 187.40, "target_allocation_pct": 20},
    )

    response = client.post(
        f"/portfolios/{portfolio['id']}/summary", json={"prices": {"AAPL": 333.74}}
    )
    assert response.status_code == 200
    body = response.json()
    assert round(body["holdings_value"], 2) == round(12 * 333.74, 2)
    assert round(body["total_value"], 2) == round(12 * 333.74 + 250, 2)
    assert body["holdings"][0]["ticker"] == "AAPL"
    assert body["holdings"][0]["severity"] in ("green", "yellow", "red")


def test_portfolio_summary_404_for_missing_portfolio(client):
    response = client.post("/portfolios/999/summary", json={"prices": {}})
    assert response.status_code == 404
```

- [ ] **Step 5: Add a `PriceMap` request schema**

```python
# backend/app/schemas.py (append)
class PriceMap(BaseModel):
    prices: dict[str, float]
```

- [ ] **Step 6: Add the summary endpoint to `app/routers/portfolios.py`**

```python
# backend/app/routers/portfolios.py (append, after the existing imports add:)
from app.calculations import portfolio_stats
from app.schemas import PriceMap

# (append this function at the end of the file)
@router.post("/{portfolio_id}/summary")
def portfolio_summary(portfolio_id: int, payload: PriceMap, db: Session = Depends(get_db)):
    portfolio = db.get(Portfolio, portfolio_id)
    if portfolio is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio_stats(portfolio, payload.prices)
```

- [ ] **Step 7: Register the watchlist router in `main.py`**

```python
# backend/app/main.py (replace the full file)
from fastapi import FastAPI

from app.database import Base, engine
from app.routers import holdings, portfolios, watchlist

app = FastAPI(title="Portfolio Tracker API")
app.include_router(portfolios.router)
app.include_router(holdings.router)
app.include_router(watchlist.router)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 8: Run the full test suite**

Run: `cd backend && .venv/Scripts/pytest -v`
Expected: every test across all 4 test files PASSES (health, calculations, portfolios incl. summary, holdings, watchlist).

- [ ] **Step 9: Commit**

```bash
git add backend/app/routers/watchlist.py backend/app/routers/portfolios.py backend/app/schemas.py backend/app/main.py backend/tests/test_watchlist.py backend/tests/test_portfolios.py
git commit -m "feat: add watchlist CRUD endpoints and portfolio summary calculation endpoint"
```

---

## What this plan does NOT cover (deliberately — see follow-up plans)

- Fetching real prices (yfinance/Twelve Data) — the summary endpoint takes prices as input for now; a follow-up plan wires a price-fetch service in front of it.
- `SRLevel` model/endpoints (support/resistance) — depends on price-series data.
- The React frontend (Dashboard + Portfolios pages) — a separate plan, built against this API.
- FX conversion (USD/THB) — a frontend display-layer concern per PRD.md section 9.
