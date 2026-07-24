# DCA Projection and Passive Income Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first two of the four Tools features from `docs/specs/2026-07-24-stockvision-tools-merge.md` — DCA Projection and Passive Income — backed by real market data (price, dividend yield, price growth rate) instead of stockvision-app's hardcoded presets, and wire them into the Tools tab.

**Architecture:** Backend: extend `price_service.py` with `get_market_data()` (price + dividend yield + growth rate, each independently nullable, yfinance-only for yield/growth) exposed via a new `GET /market-data` endpoint mirroring `routers/prices.py`. Frontend: two pure calculation modules ported from the stockvision-app draft (`utils/dcaProjection.ts`, `utils/passiveIncome.ts`), two self-contained calculator components that pre-fill yield/growth from `getMarketData` and fall back to blank/editable fields on failure, composed into `ToolsPage` behind sub-tabs.

**Tech Stack:** FastAPI + SQLAlchemy backend (Python), React 19 + TypeScript 5.7 (strict) + Vite 6 frontend, pytest (backend tests), Vitest 3 + Testing Library (frontend tests).

## Global Constraints

- Zero `any` / `@ts-ignore` / `@ts-expect-error` in any TypeScript file.
- Tests never touch real network — mock at the service/function boundary (`get_price`, `_fetch_dividend_yield_pct`, `_fetch_growth_rate_pct` on the backend; `api/client` functions on the frontend).
- Dividend yield and price growth rate are **dimensionless percentages** — they need no USD→THB conversion (a yield of 11.1% is 11.1% whether the portfolio is valued in USD or THB). The FX service and `GET /fx/usd-thb` endpoint built in the prior plan (`docs/superpowers/plans/2026-07-24-fx-service-and-theme-nav.md`) are **not consumed by this plan** — they remain for a future feature that needs an actual currency conversion (e.g. Portfolio Builder in a later plan, or the portfolio-summary-level toggle in PRD §9). This corrects an imprecision in `docs/specs/2026-07-24-stockvision-tools-merge.md`'s ADR 0002, which implied these two calculators would use the FX mechanism — they don't need to, and building a fake dependency on it here would be unnecessary complexity.
- Only `get_price` is reused with its existing Twelve Data fallback for the `price` field of market data. `dividend_yield_pct` and `growth_rate_pct` are yfinance-only, no fallback, per the spec (Twelve Data's free tier doesn't carry fundamentals).
- This plan does NOT build Portfolio Builder or ETF Comparison (the other two Tools features) — those don't need `get_market_data` at all (per spec, they use plain price/P&L) and are separate, later work. `ToolsPage.tsx`'s sub-tabs will only have "DCA Projection" and "Passive Income" after this plan; a later plan adds the other two sub-tabs following the same pattern.
- Naming: the frontend function is `calculateDcaProjection` (not `calculateDca`, which already exists in `utils/dca.ts` for a different concept — see `CONTEXT.md`'s "DCA calculator" vs. "DCA Projection" glossary entries).

---

### Task 1: Backend — `price_service.get_market_data()`

**Files:**
- Modify: `backend/app/price_service.py`
- Test: `backend/tests/test_price_service.py` (append)

**Interfaces:**
- Consumes: existing `get_price(ticker: str) -> float | None` (already in this file).
- Produces: `MarketData` (a `TypedDict` with `price: float | None`, `dividend_yield_pct: float | None`, `growth_rate_pct: float | None`), `get_market_data(tickers: list[str]) -> dict[str, MarketData]`, `clear_market_data_cache() -> None` — Task 2's router imports `get_market_data` by this exact name.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_price_service.py`:

```python
def test_get_market_data_returns_price_yield_and_growth(monkeypatch):
    monkeypatch.setattr(price_service, "get_price", lambda ticker: 58.51)
    monkeypatch.setattr(price_service, "_fetch_dividend_yield_pct", lambda ticker: 11.1)
    monkeypatch.setattr(price_service, "_fetch_growth_rate_pct", lambda ticker: 10.0)

    result = price_service.get_market_data(["JEPQ"])

    assert result == {"JEPQ": {"price": 58.51, "dividend_yield_pct": 11.1, "growth_rate_pct": 10.0}}


def test_get_market_data_leaves_yield_and_growth_none_when_they_fail(monkeypatch):
    monkeypatch.setattr(price_service, "get_price", lambda ticker: 58.51)
    monkeypatch.setattr(price_service, "_fetch_dividend_yield_pct", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_growth_rate_pct", lambda ticker: None)

    result = price_service.get_market_data(["JEPQ"])

    assert result == {"JEPQ": {"price": 58.51, "dividend_yield_pct": None, "growth_rate_pct": None}}


def test_get_market_data_includes_ticker_even_when_price_fails(monkeypatch):
    monkeypatch.setattr(price_service, "get_price", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_dividend_yield_pct", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_growth_rate_pct", lambda ticker: None)

    result = price_service.get_market_data(["BADTICKER"])

    assert result == {"BADTICKER": {"price": None, "dividend_yield_pct": None, "growth_rate_pct": None}}


def test_get_market_data_caches_and_does_not_refetch_within_ttl(monkeypatch):
    call_count = {"n": 0}

    def fake_get_price(ticker):
        call_count["n"] += 1
        return 58.51

    monkeypatch.setattr(price_service, "get_price", fake_get_price)
    monkeypatch.setattr(price_service, "_fetch_dividend_yield_pct", lambda ticker: 11.1)
    monkeypatch.setattr(price_service, "_fetch_growth_rate_pct", lambda ticker: 10.0)

    price_service.get_market_data(["JEPQ"])
    price_service.get_market_data(["JEPQ"])

    assert call_count["n"] == 1


def test_get_market_data_does_not_cache_when_price_fails(monkeypatch):
    monkeypatch.setattr(price_service, "get_price", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_dividend_yield_pct", lambda ticker: None)
    monkeypatch.setattr(price_service, "_fetch_growth_rate_pct", lambda ticker: None)

    price_service.get_market_data(["BADTICKER"])

    call_count = {"n": 0}

    def fake_get_price(ticker):
        call_count["n"] += 1
        return 58.51

    monkeypatch.setattr(price_service, "get_price", fake_get_price)

    price_service.get_market_data(["BADTICKER"])

    assert call_count["n"] == 1


def test_get_market_data_with_empty_list_returns_empty_dict():
    result = price_service.get_market_data([])

    assert result == {}
```

Note: `_clear_cache` in this file's existing `autouse=True` fixture only clears `price_service._cache` (the plain-price cache), not the new `_market_data_cache`. Extend that fixture in the same file to also call `price_service.clear_market_data_cache()`:

```python
@pytest.fixture(autouse=True)
def _clear_cache():
    price_service.clear_cache()
    price_service.clear_market_data_cache()
    yield
    price_service.clear_cache()
    price_service.clear_market_data_cache()
```

(This replaces the existing `_clear_cache` fixture at the top of `backend/tests/test_price_service.py` — the `price_service.clear_cache()` calls it already makes stay as-is, two new lines are added.)

- [ ] **Step 2: Run tests to verify they fail**

From `portfolio-tracker/backend`, run: `.venv/Scripts/python.exe -m pytest tests/test_price_service.py -v`
Expected: the 6 new tests FAIL — `AttributeError: module 'app.price_service' has no attribute 'get_market_data'` (or similar for `_fetch_dividend_yield_pct`/`_fetch_growth_rate_pct`/`clear_market_data_cache`)

- [ ] **Step 3: Write the implementation**

Append to `backend/app/price_service.py` (the file already has `import os`, `import time`, `CACHE_TTL_SECONDS = 60.0`, `_cache`, `clear_cache`, `_get_cached`, `_set_cached`, `_fetch_from_yfinance`, `_fetch_from_twelvedata`, `get_price`, `get_prices` — add the following after `get_prices`):

```python
from typing import TypedDict


class MarketData(TypedDict):
    price: float | None
    dividend_yield_pct: float | None
    growth_rate_pct: float | None


_market_data_cache: dict[str, tuple[MarketData, float]] = {}


def clear_market_data_cache() -> None:
    _market_data_cache.clear()


def _get_cached_market_data(ticker: str) -> MarketData | None:
    entry = _market_data_cache.get(ticker)
    if entry is None:
        return None
    data, fetched_at = entry
    if time.monotonic() - fetched_at > CACHE_TTL_SECONDS:
        return None
    return data


def _set_cached_market_data(ticker: str, data: MarketData) -> None:
    _market_data_cache[ticker] = (data, time.monotonic())


def _fetch_dividend_yield_pct(ticker: str) -> float | None:
    import yfinance as yf

    try:
        info = yf.Ticker(ticker).info
        raw_yield = info.get("dividendYield")
        # yfinance returns dividendYield as a fraction (e.g. 0.111 for 11.1%)
        return float(raw_yield) * 100 if raw_yield is not None else None
    except Exception:
        return None


def _fetch_growth_rate_pct(ticker: str) -> float | None:
    import yfinance as yf

    try:
        history = yf.Ticker(ticker).history(period="5y")
        if history.empty or len(history) < 2:
            return None
        start_price = float(history["Close"].iloc[0])
        end_price = float(history["Close"].iloc[-1])
        years = (history.index[-1] - history.index[0]).days / 365.25
        if start_price <= 0 or years <= 0:
            return None
        return ((end_price / start_price) ** (1 / years) - 1) * 100
    except Exception:
        return None


def get_market_data(tickers: list[str]) -> dict[str, MarketData]:
    result: dict[str, MarketData] = {}
    for ticker in tickers:
        cached = _get_cached_market_data(ticker)
        if cached is not None:
            result[ticker] = cached
            continue
        data: MarketData = {
            "price": get_price(ticker),
            "dividend_yield_pct": _fetch_dividend_yield_pct(ticker),
            "growth_rate_pct": _fetch_growth_rate_pct(ticker),
        }
        if data["price"] is not None:
            _set_cached_market_data(ticker, data)
        result[ticker] = data
    return result
```

Move the `from typing import TypedDict` import to the top of the file alongside the existing `import os` / `import time` lines instead of leaving it inline — that's the file's established import style.

- [ ] **Step 4: Run tests to verify they pass**

From `portfolio-tracker/backend`, run: `.venv/Scripts/python.exe -m pytest tests/test_price_service.py -v`
Expected: all tests in the file pass (existing + 6 new)

- [ ] **Step 5: Commit**

```bash
git add backend/app/price_service.py backend/tests/test_price_service.py
git commit -m "feat: add get_market_data (price + dividend yield + growth rate)"
```

---

### Task 2: Backend — `GET /market-data` router endpoint

**Files:**
- Create: `backend/app/routers/market_data.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_market_data_router.py`

**Interfaces:**
- Consumes: `app.price_service.get_market_data` (Task 1).
- Produces: `GET /market-data?tickers=A,B` → `{"market_data": {"A": {...}, "B": {...}}}`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_market_data_router.py`:

```python
from unittest.mock import patch


def test_get_market_data_returns_fetched_data(client):
    with patch(
        "app.routers.market_data.get_market_data",
        return_value={"JEPQ": {"price": 58.51, "dividend_yield_pct": 11.1, "growth_rate_pct": 10.0}},
    ) as mock_get_market_data:
        response = client.get("/market-data", params={"tickers": "JEPQ"})

    assert response.status_code == 200
    assert response.json() == {
        "market_data": {"JEPQ": {"price": 58.51, "dividend_yield_pct": 11.1, "growth_rate_pct": 10.0}}
    }
    mock_get_market_data.assert_called_once_with(["JEPQ"])


def test_get_market_data_with_no_tickers_param_returns_empty(client):
    response = client.get("/market-data")

    assert response.status_code == 200
    assert response.json() == {"market_data": {}}


def test_get_market_data_strips_whitespace_around_tickers(client):
    with patch("app.routers.market_data.get_market_data", return_value={}) as mock_get_market_data:
        client.get("/market-data", params={"tickers": " JEPQ , QQQI "})

    mock_get_market_data.assert_called_once_with(["JEPQ", "QQQI"])
```

- [ ] **Step 2: Run tests to verify they fail**

From `portfolio-tracker/backend`, run: `.venv/Scripts/python.exe -m pytest tests/test_market_data_router.py -v`
Expected: FAIL — `404 Not Found` or `ModuleNotFoundError: No module named 'app.routers.market_data'`

- [ ] **Step 3: Write the implementation**

Create `backend/app/routers/market_data.py`:

```python
from fastapi import APIRouter

from app.price_service import get_market_data

router = APIRouter(prefix="/market-data", tags=["market-data"])


@router.get("")
def read_market_data(tickers: str = ""):
    ticker_list = [t.strip() for t in tickers.split(",") if t.strip()]
    return {"market_data": get_market_data(ticker_list)}
```

Modify `backend/app/main.py`'s import line from:

```python
from app.routers import fx, holdings, portfolios, prices, watchlist
```

to:

```python
from app.routers import fx, holdings, market_data, portfolios, prices, watchlist
```

And add `app.include_router(market_data.router)` after the existing `app.include_router(fx.router)` line.

- [ ] **Step 4: Run tests to verify they pass**

From `portfolio-tracker/backend`, run: `.venv/Scripts/python.exe -m pytest tests/test_market_data_router.py -v`
Expected: 3 passed

Also run the full backend suite: `.venv/Scripts/python.exe -m pytest -v`
Expected: all passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/market_data.py backend/app/main.py backend/tests/test_market_data_router.py
git commit -m "feat: expose GET /market-data endpoint"
```

---

### Task 3: Frontend — `utils/dcaProjection.ts`

**Files:**
- Create: `frontend/src/utils/dcaProjection.ts`
- Test: `frontend/src/utils/dcaProjection.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `DcaProjectionInput`, `DcaProjectionYear`, `calculateDcaProjection(input: DcaProjectionInput): DcaProjectionYear[]` — Task 6 imports these exact names from `../utils/dcaProjection`; Task 4's `passiveIncome.ts` also imports `calculateDcaProjection` and `DcaProjectionInput`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/dcaProjection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { calculateDcaProjection } from './dcaProjection';

describe('calculateDcaProjection', () => {
  it('returns one entry per year', () => {
    const result = calculateDcaProjection({
      initialInvestmentThb: 100000,
      monthlyContributionThb: 10000,
      years: 5,
      dividendYieldPct: 10,
      priceGrowthRatePct: 0,
      reinvestDividends: true,
      taxRatePct: 15,
    });

    expect(result).toHaveLength(5);
  });

  it('accumulates total invested as initial plus all monthly contributions', () => {
    const result = calculateDcaProjection({
      initialInvestmentThb: 100000,
      monthlyContributionThb: 10000,
      years: 5,
      dividendYieldPct: 10,
      priceGrowthRatePct: 0,
      reinvestDividends: true,
      taxRatePct: 15,
    });

    expect(result[4].totalInvestedThb).toBe(700000);
  });

  it('grows the portfolio beyond total invested when reinvesting a positive net yield', () => {
    const result = calculateDcaProjection({
      initialInvestmentThb: 100000,
      monthlyContributionThb: 10000,
      years: 5,
      dividendYieldPct: 10,
      priceGrowthRatePct: 0,
      reinvestDividends: true,
      taxRatePct: 15,
    });

    expect(result[4].portfolioValueThb).toBeGreaterThan(700000);
  });

  it('does not grow the portfolio beyond contributions when not reinvesting and growth is zero', () => {
    const result = calculateDcaProjection({
      initialInvestmentThb: 100000,
      monthlyContributionThb: 10000,
      years: 2,
      dividendYieldPct: 10,
      priceGrowthRatePct: 0,
      reinvestDividends: false,
      taxRatePct: 15,
    });

    expect(result[1].portfolioValueThb).toBe(result[1].totalInvestedThb);
  });

  it('returns an empty array for zero years', () => {
    const result = calculateDcaProjection({
      initialInvestmentThb: 100000,
      monthlyContributionThb: 0,
      years: 0,
      dividendYieldPct: 5,
      priceGrowthRatePct: 5,
      reinvestDividends: true,
      taxRatePct: 15,
    });

    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

From `portfolio-tracker/frontend`, run: `npm test -- src/utils/dcaProjection.test.ts`
Expected: FAIL — cannot find module `./dcaProjection`

- [ ] **Step 3: Write the implementation**

Create `frontend/src/utils/dcaProjection.ts`:

```ts
export interface DcaProjectionInput {
  initialInvestmentThb: number;
  monthlyContributionThb: number;
  years: number;
  dividendYieldPct: number;
  priceGrowthRatePct: number;
  reinvestDividends: boolean;
  taxRatePct: number;
}

export interface DcaProjectionYear {
  year: number;
  totalInvestedThb: number;
  portfolioValueThb: number;
  netMonthlyDividendThb: number;
  monthlyCapitalGainThb: number;
}

export function calculateDcaProjection(input: DcaProjectionInput): DcaProjectionYear[] {
  const {
    initialInvestmentThb,
    monthlyContributionThb,
    years,
    dividendYieldPct,
    priceGrowthRatePct,
    reinvestDividends,
    taxRatePct,
  } = input;

  const grossYield = dividendYieldPct / 100;
  const netYield = grossYield * (1 - taxRatePct / 100);
  const growthRate = priceGrowthRatePct / 100;

  const monthlyYield = netYield / 12;
  const monthlyGrowth = growthRate / 12;
  const monthlyReturn = reinvestDividends ? monthlyGrowth + monthlyYield : monthlyGrowth;

  let currentPortfolio = initialInvestmentThb;
  let totalInvested = initialInvestmentThb;

  const results: DcaProjectionYear[] = [];

  for (let year = 1; year <= years; year++) {
    for (let month = 1; month <= 12; month++) {
      currentPortfolio += monthlyContributionThb;
      totalInvested += monthlyContributionThb;
      currentPortfolio *= 1 + monthlyReturn;
    }

    const netMonthlyDividendThb = (currentPortfolio * netYield) / 12;
    const monthlyCapitalGainThb = (currentPortfolio * growthRate) / 12;

    results.push({
      year,
      totalInvestedThb: totalInvested,
      portfolioValueThb: currentPortfolio,
      netMonthlyDividendThb,
      monthlyCapitalGainThb,
    });
  }

  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

From `portfolio-tracker/frontend`, run: `npm test -- src/utils/dcaProjection.test.ts`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/dcaProjection.ts frontend/src/utils/dcaProjection.test.ts
git commit -m "feat: add calculateDcaProjection (compound growth projection)"
```

---

### Task 4: Frontend — `utils/passiveIncome.ts`

**Files:**
- Create: `frontend/src/utils/passiveIncome.ts`
- Test: `frontend/src/utils/passiveIncome.test.ts`

**Interfaces:**
- Consumes: `calculateDcaProjection`, `DcaProjectionInput` from `../utils/dcaProjection` (Task 3, exact names).
- Produces: `PassiveIncomeInput`, `PassiveIncomeResult`, `calculateRequiredPortfolio(input: PassiveIncomeInput): PassiveIncomeResult` — Task 7 imports these exact names from `../utils/passiveIncome`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/passiveIncome.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { calculateRequiredPortfolio } from './passiveIncome';

describe('calculateRequiredPortfolio', () => {
  it('computes required portfolio from target income and net yield', () => {
    const result = calculateRequiredPortfolio({
      targetMonthlyIncomeThb: 10000,
      initialInvestmentThb: 50000,
      monthlyContributionThb: 5000,
      dividendYieldPct: 6,
      priceGrowthRatePct: 3,
      taxRatePct: 15,
    });

    const expected = (10000 * 12) / (0.06 * 0.85);
    expect(result.requiredPortfolioThb).toBeCloseTo(expected, 2);
  });

  it('finds a yearsToTarget within the 30-year horizon when achievable', () => {
    const result = calculateRequiredPortfolio({
      targetMonthlyIncomeThb: 10000,
      initialInvestmentThb: 50000,
      monthlyContributionThb: 5000,
      dividendYieldPct: 6,
      priceGrowthRatePct: 3,
      taxRatePct: 15,
    });

    expect(result.yearsToTarget).toBeGreaterThan(0);
    expect(result.yearsToTarget).toBeLessThanOrEqual(30);
    expect(result.isAchievableWithin30Years).toBe(true);
  });

  it('returns requiredPortfolioThb of 0 when dividend yield is zero', () => {
    const result = calculateRequiredPortfolio({
      targetMonthlyIncomeThb: 10000,
      initialInvestmentThb: 50000,
      monthlyContributionThb: 5000,
      dividendYieldPct: 0,
      priceGrowthRatePct: 3,
      taxRatePct: 15,
    });

    expect(result.requiredPortfolioThb).toBe(0);
  });

  it('caps yearsToTarget at 30 and marks unachievable when the target is never reached', () => {
    const result = calculateRequiredPortfolio({
      targetMonthlyIncomeThb: 10000000,
      initialInvestmentThb: 1000,
      monthlyContributionThb: 100,
      dividendYieldPct: 1,
      priceGrowthRatePct: 1,
      taxRatePct: 15,
    });

    expect(result.yearsToTarget).toBe(30);
    expect(result.isAchievableWithin30Years).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

From `portfolio-tracker/frontend`, run: `npm test -- src/utils/passiveIncome.test.ts`
Expected: FAIL — cannot find module `./passiveIncome`

- [ ] **Step 3: Write the implementation**

Create `frontend/src/utils/passiveIncome.ts`:

```ts
import { calculateDcaProjection } from './dcaProjection';

export interface PassiveIncomeInput {
  targetMonthlyIncomeThb: number;
  initialInvestmentThb: number;
  monthlyContributionThb: number;
  dividendYieldPct: number;
  priceGrowthRatePct: number;
  taxRatePct: number;
}

export interface PassiveIncomeYearProgress {
  year: number;
  portfolioValueThb: number;
  monthlyDividendThb: number;
  progressPct: number;
}

export interface PassiveIncomeResult {
  requiredPortfolioThb: number;
  yearsToTarget: number;
  isAchievableWithin30Years: boolean;
  yearlyProjection: PassiveIncomeYearProgress[];
}

const MAX_YEARS = 30;

export function calculateRequiredPortfolio(input: PassiveIncomeInput): PassiveIncomeResult {
  const {
    targetMonthlyIncomeThb,
    initialInvestmentThb,
    monthlyContributionThb,
    dividendYieldPct,
    priceGrowthRatePct,
    taxRatePct,
  } = input;

  const netYield = (dividendYieldPct / 100) * (1 - taxRatePct / 100);
  const requiredAnnualNetDividendThb = targetMonthlyIncomeThb * 12;
  const requiredPortfolioThb = netYield > 0 ? requiredAnnualNetDividendThb / netYield : 0;

  const dcaResults = calculateDcaProjection({
    initialInvestmentThb,
    monthlyContributionThb,
    years: MAX_YEARS,
    dividendYieldPct,
    priceGrowthRatePct,
    reinvestDividends: true,
    taxRatePct,
  });

  let yearsToTarget = -1;
  const yearlyProjection: PassiveIncomeYearProgress[] = dcaResults.map((res) => {
    const progressPct =
      targetMonthlyIncomeThb > 0 ? Math.min(100, (res.netMonthlyDividendThb / targetMonthlyIncomeThb) * 100) : 0;
    if (yearsToTarget === -1 && res.netMonthlyDividendThb >= targetMonthlyIncomeThb) {
      yearsToTarget = res.year;
    }
    return {
      year: res.year,
      portfolioValueThb: res.portfolioValueThb,
      monthlyDividendThb: res.netMonthlyDividendThb,
      progressPct,
    };
  });

  return {
    requiredPortfolioThb,
    yearsToTarget: yearsToTarget !== -1 ? yearsToTarget : MAX_YEARS,
    isAchievableWithin30Years: yearsToTarget !== -1,
    yearlyProjection,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

From `portfolio-tracker/frontend`, run: `npm test -- src/utils/passiveIncome.test.ts`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/passiveIncome.ts frontend/src/utils/passiveIncome.test.ts
git commit -m "feat: add calculateRequiredPortfolio (passive income target)"
```

---

### Task 5: Frontend — `getMarketData` API client function

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Test: `frontend/src/api/client.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (independent of Tasks 1-4; only needs the backend contract from Task 2, which is already committed).
- Produces: `MarketData` type (exported from `api/types.ts`), `getMarketData(tickers: string[]): Promise<Record<string, MarketData>>` (exported from `api/client.ts`) — Tasks 6 and 7 import both by these exact names.

- [ ] **Step 1: Write the failing test**

Read `frontend/src/api/client.test.ts` first to see its existing structure and the `request`-mocking pattern it uses (it mocks global `fetch`), then append a test in the same style:

```ts
it('getMarketData fetches from /market-data with a comma-joined tickers param and returns the market_data map', async () => {
  const mockResponse = {
    market_data: { JEPQ: { price: 58.51, dividend_yield_pct: 11.1, growth_rate_pct: 10.0 } },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    }),
  );

  const result = await getMarketData(['JEPQ']);

  expect(result).toEqual(mockResponse.market_data);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/market-data?tickers=JEPQ'),
    expect.anything(),
  );
});
```

Add `getMarketData` to the existing `import { ... } from './client'` line at the top of the test file, matching however the other client functions are already imported there.

- [ ] **Step 2: Run test to verify it fails**

From `portfolio-tracker/frontend`, run: `npm test -- src/api/client.test.ts`
Expected: FAIL — `getMarketData` is not exported / not a function

- [ ] **Step 3: Write the implementation**

Add to `frontend/src/api/types.ts` (after the existing `PortfolioSummary` interface):

```ts
export interface MarketData {
  price: number | null;
  dividend_yield_pct: number | null;
  growth_rate_pct: number | null;
}
```

Add to `frontend/src/api/client.ts`'s type-only import line at the top (extend the existing `import type { ... } from './types'` list to include `MarketData`), then add after the existing `getPortfolioSummary` function:

```ts
export function getMarketData(tickers: string[]): Promise<Record<string, MarketData>> {
  const query = tickers.join(',');
  return request<{ market_data: Record<string, MarketData> }>(`/market-data?tickers=${encodeURIComponent(query)}`).then(
    (res) => res.market_data,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

From `portfolio-tracker/frontend`, run: `npm test -- src/api/client.test.ts`
Expected: all tests in the file pass (existing + 1 new)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/api/client.test.ts
git commit -m "feat: add getMarketData API client function"
```

---

### Task 6: Frontend — `DcaProjectionCalculator` component

**Files:**
- Create: `frontend/src/components/DcaProjectionCalculator.tsx`
- Test: `frontend/src/components/DcaProjectionCalculator.test.tsx`

**Interfaces:**
- Consumes: `calculateDcaProjection` from `../utils/dcaProjection` (Task 3), `getMarketData` and `MarketData` from `../api/client` / `../api/types` (Task 5).
- Produces: `DcaProjectionCalculator` (no props) — Task 8 imports this exact name from `../components/DcaProjectionCalculator`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/DcaProjectionCalculator.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { DcaProjectionCalculator } from './DcaProjectionCalculator';

describe('DcaProjectionCalculator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a projection using the default inputs without requiring a ticker', () => {
    render(<DcaProjectionCalculator />);

    expect(screen.getByText(/Portfolio value after 10 years/i)).toBeInTheDocument();
  });

  it('pre-fills yield and growth from real market data once a ticker is entered', async () => {
    vi.spyOn(client, 'getMarketData').mockResolvedValue({
      JEPQ: { price: 58.5, dividend_yield_pct: 11.1, growth_rate_pct: 10 },
    });

    render(<DcaProjectionCalculator />);
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'JEPQ' } });

    await waitFor(() => expect(screen.getByLabelText(/dividend yield/i)).toHaveValue(11.1));
    expect(screen.getByLabelText(/price growth/i)).toHaveValue(10);
  });

  it('leaves yield and growth blank and editable when market data cannot be fetched', async () => {
    vi.spyOn(client, 'getMarketData').mockRejectedValue(new Error('yfinance unavailable'));

    render(<DcaProjectionCalculator />);
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'BADTICKER' } });

    await waitFor(() => expect(client.getMarketData).toHaveBeenCalled());
    expect(screen.getByLabelText(/dividend yield/i)).toHaveValue(null);

    fireEvent.change(screen.getByLabelText(/dividend yield/i), { target: { value: '7' } });
    expect(screen.getByLabelText(/dividend yield/i)).toHaveValue(7);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

From `portfolio-tracker/frontend`, run: `npm test -- src/components/DcaProjectionCalculator.test.tsx`
Expected: FAIL — cannot find module `./DcaProjectionCalculator`

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/DcaProjectionCalculator.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { getMarketData } from '../api/client';
import { calculateDcaProjection } from '../utils/dcaProjection';

export function DcaProjectionCalculator() {
  const [ticker, setTicker] = useState('');
  const [initialInvestment, setInitialInvestment] = useState('100000');
  const [monthlyContribution, setMonthlyContribution] = useState('5000');
  const [years, setYears] = useState('10');
  const [dividendYieldPct, setDividendYieldPct] = useState('');
  const [priceGrowthRatePct, setPriceGrowthRatePct] = useState('');
  const [taxRatePct, setTaxRatePct] = useState('15');
  const [reinvestDividends, setReinvestDividends] = useState(true);

  useEffect(() => {
    const trimmed = ticker.trim().toUpperCase();
    if (!trimmed) {
      return;
    }
    let cancelled = false;
    getMarketData([trimmed])
      .then((data) => {
        if (cancelled) return;
        const entry = data[trimmed];
        if (entry?.dividend_yield_pct != null) {
          setDividendYieldPct(String(entry.dividend_yield_pct.toFixed(2)));
        }
        if (entry?.growth_rate_pct != null) {
          setPriceGrowthRatePct(String(entry.growth_rate_pct.toFixed(2)));
        }
      })
      .catch(() => {
        // leave fields blank/editable on failure — never fabricate a value
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const projection = calculateDcaProjection({
    initialInvestmentThb: Number(initialInvestment) || 0,
    monthlyContributionThb: Number(monthlyContribution) || 0,
    years: Number(years) || 0,
    dividendYieldPct: Number(dividendYieldPct) || 0,
    priceGrowthRatePct: Number(priceGrowthRatePct) || 0,
    reinvestDividends,
    taxRatePct: Number(taxRatePct) || 0,
  });

  const last = projection[projection.length - 1];

  return (
    <div>
      <h3>DCA Projection</h3>
      <label htmlFor="dca-proj-ticker">Ticker</label>
      <input id="dca-proj-ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} />

      <label htmlFor="dca-proj-initial">Initial investment (THB)</label>
      <input
        id="dca-proj-initial"
        type="number"
        value={initialInvestment}
        onChange={(e) => setInitialInvestment(e.target.value)}
      />

      <label htmlFor="dca-proj-monthly">Monthly contribution (THB)</label>
      <input
        id="dca-proj-monthly"
        type="number"
        value={monthlyContribution}
        onChange={(e) => setMonthlyContribution(e.target.value)}
      />

      <label htmlFor="dca-proj-years">Years</label>
      <input id="dca-proj-years" type="number" value={years} onChange={(e) => setYears(e.target.value)} />

      <label htmlFor="dca-proj-yield">Dividend yield (%/yr)</label>
      <input
        id="dca-proj-yield"
        type="number"
        value={dividendYieldPct}
        onChange={(e) => setDividendYieldPct(e.target.value)}
      />

      <label htmlFor="dca-proj-growth">Price growth (%/yr)</label>
      <input
        id="dca-proj-growth"
        type="number"
        value={priceGrowthRatePct}
        onChange={(e) => setPriceGrowthRatePct(e.target.value)}
      />

      <label htmlFor="dca-proj-tax">Dividend tax rate (%)</label>
      <input id="dca-proj-tax" type="number" value={taxRatePct} onChange={(e) => setTaxRatePct(e.target.value)} />

      <label htmlFor="dca-proj-reinvest">
        <input
          id="dca-proj-reinvest"
          type="checkbox"
          checked={reinvestDividends}
          onChange={(e) => setReinvestDividends(e.target.checked)}
        />
        Reinvest dividends
      </label>

      {last && (
        <div>
          <div>
            Portfolio value after {last.year} years: ฿{last.portfolioValueThb.toFixed(0)}
          </div>
          <div>Total invested: ฿{last.totalInvestedThb.toFixed(0)}</div>
          <div>
            Net monthly dividend at year {last.year}: ฿{last.netMonthlyDividendThb.toFixed(0)}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

From `portfolio-tracker/frontend`, run: `npm test -- src/components/DcaProjectionCalculator.test.tsx`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DcaProjectionCalculator.tsx frontend/src/components/DcaProjectionCalculator.test.tsx
git commit -m "feat: add DcaProjectionCalculator component"
```

---

### Task 7: Frontend — `PassiveIncomeCalculator` component

**Files:**
- Create: `frontend/src/components/PassiveIncomeCalculator.tsx`
- Test: `frontend/src/components/PassiveIncomeCalculator.test.tsx`

**Interfaces:**
- Consumes: `calculateRequiredPortfolio` from `../utils/passiveIncome` (Task 4), `getMarketData` from `../api/client` (Task 5).
- Produces: `PassiveIncomeCalculator` (no props) — Task 8 imports this exact name from `../components/PassiveIncomeCalculator`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/PassiveIncomeCalculator.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { PassiveIncomeCalculator } from './PassiveIncomeCalculator';

describe('PassiveIncomeCalculator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a required-portfolio result using the default inputs without requiring a ticker', () => {
    render(<PassiveIncomeCalculator />);

    expect(screen.getByText(/Required portfolio/i)).toBeInTheDocument();
  });

  it('pre-fills yield and growth from real market data once a ticker is entered', async () => {
    vi.spyOn(client, 'getMarketData').mockResolvedValue({
      JEPQ: { price: 58.5, dividend_yield_pct: 11.1, growth_rate_pct: 10 },
    });

    render(<PassiveIncomeCalculator />);
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'JEPQ' } });

    await waitFor(() => expect(screen.getByLabelText(/dividend yield/i)).toHaveValue(11.1));
    expect(screen.getByLabelText(/price growth/i)).toHaveValue(10);
  });

  it('leaves yield and growth blank and editable when market data cannot be fetched', async () => {
    vi.spyOn(client, 'getMarketData').mockRejectedValue(new Error('yfinance unavailable'));

    render(<PassiveIncomeCalculator />);
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'BADTICKER' } });

    await waitFor(() => expect(client.getMarketData).toHaveBeenCalled());
    expect(screen.getByLabelText(/dividend yield/i)).toHaveValue(null);

    fireEvent.change(screen.getByLabelText(/dividend yield/i), { target: { value: '7' } });
    expect(screen.getByLabelText(/dividend yield/i)).toHaveValue(7);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

From `portfolio-tracker/frontend`, run: `npm test -- src/components/PassiveIncomeCalculator.test.tsx`
Expected: FAIL — cannot find module `./PassiveIncomeCalculator`

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/PassiveIncomeCalculator.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { getMarketData } from '../api/client';
import { calculateRequiredPortfolio } from '../utils/passiveIncome';

export function PassiveIncomeCalculator() {
  const [ticker, setTicker] = useState('');
  const [targetMonthlyIncome, setTargetMonthlyIncome] = useState('30000');
  const [initialInvestment, setInitialInvestment] = useState('100000');
  const [monthlyContribution, setMonthlyContribution] = useState('15000');
  const [dividendYieldPct, setDividendYieldPct] = useState('');
  const [priceGrowthRatePct, setPriceGrowthRatePct] = useState('');
  const [taxRatePct, setTaxRatePct] = useState('15');

  useEffect(() => {
    const trimmed = ticker.trim().toUpperCase();
    if (!trimmed) {
      return;
    }
    let cancelled = false;
    getMarketData([trimmed])
      .then((data) => {
        if (cancelled) return;
        const entry = data[trimmed];
        if (entry?.dividend_yield_pct != null) {
          setDividendYieldPct(String(entry.dividend_yield_pct.toFixed(2)));
        }
        if (entry?.growth_rate_pct != null) {
          setPriceGrowthRatePct(String(entry.growth_rate_pct.toFixed(2)));
        }
      })
      .catch(() => {
        // leave fields blank/editable on failure — never fabricate a value
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const result = calculateRequiredPortfolio({
    targetMonthlyIncomeThb: Number(targetMonthlyIncome) || 0,
    initialInvestmentThb: Number(initialInvestment) || 0,
    monthlyContributionThb: Number(monthlyContribution) || 0,
    dividendYieldPct: Number(dividendYieldPct) || 0,
    priceGrowthRatePct: Number(priceGrowthRatePct) || 0,
    taxRatePct: Number(taxRatePct) || 0,
  });

  return (
    <div>
      <h3>Passive Income</h3>
      <label htmlFor="ff-ticker">Ticker</label>
      <input id="ff-ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} />

      <label htmlFor="ff-target">Target monthly income (THB)</label>
      <input
        id="ff-target"
        type="number"
        value={targetMonthlyIncome}
        onChange={(e) => setTargetMonthlyIncome(e.target.value)}
      />

      <label htmlFor="ff-initial">Initial investment (THB)</label>
      <input
        id="ff-initial"
        type="number"
        value={initialInvestment}
        onChange={(e) => setInitialInvestment(e.target.value)}
      />

      <label htmlFor="ff-monthly">Monthly contribution (THB)</label>
      <input
        id="ff-monthly"
        type="number"
        value={monthlyContribution}
        onChange={(e) => setMonthlyContribution(e.target.value)}
      />

      <label htmlFor="ff-yield">Dividend yield (%/yr)</label>
      <input id="ff-yield" type="number" value={dividendYieldPct} onChange={(e) => setDividendYieldPct(e.target.value)} />

      <label htmlFor="ff-growth">Price growth (%/yr)</label>
      <input
        id="ff-growth"
        type="number"
        value={priceGrowthRatePct}
        onChange={(e) => setPriceGrowthRatePct(e.target.value)}
      />

      <label htmlFor="ff-tax">Dividend tax rate (%)</label>
      <input id="ff-tax" type="number" value={taxRatePct} onChange={(e) => setTaxRatePct(e.target.value)} />

      <div>Required portfolio: ฿{result.requiredPortfolioThb.toFixed(0)}</div>
      <div>
        {result.isAchievableWithin30Years
          ? `Reachable in ${result.yearsToTarget} years at this contribution rate`
          : 'Not reachable within 30 years at this contribution rate'}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

From `portfolio-tracker/frontend`, run: `npm test -- src/components/PassiveIncomeCalculator.test.tsx`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PassiveIncomeCalculator.tsx frontend/src/components/PassiveIncomeCalculator.test.tsx
git commit -m "feat: add PassiveIncomeCalculator component"
```

---

### Task 8: Frontend — wire both calculators into `ToolsPage`

**Files:**
- Modify: `frontend/src/pages/ToolsPage.tsx`
- Create: `frontend/src/pages/ToolsPage.test.tsx`

**Interfaces:**
- Consumes: `DcaProjectionCalculator` from `../components/DcaProjectionCalculator` (Task 6), `PassiveIncomeCalculator` from `../components/PassiveIncomeCalculator` (Task 7).
- Produces: `ToolsPage` — export name and "no props" signature unchanged from the prior plan, so `App.tsx` needs no changes; a later plan adds two more sub-tabs to this same file for Portfolio Builder and ETF Comparison.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/ToolsPage.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToolsPage } from './ToolsPage';

describe('ToolsPage', () => {
  it('shows DCA Projection by default and switches to Passive Income on click', () => {
    render(<ToolsPage />);

    expect(screen.getByRole('heading', { name: 'DCA Projection' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Passive Income' }));

    expect(screen.getByRole('heading', { name: 'Passive Income' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'DCA Projection' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

From `portfolio-tracker/frontend`, run: `npm test -- src/pages/ToolsPage.test.tsx`
Expected: FAIL — no heading named "DCA Projection" (current `ToolsPage` just renders "Tools" / "Coming soon.")

- [ ] **Step 3: Write the implementation**

Replace the full contents of `frontend/src/pages/ToolsPage.tsx` with:

```tsx
import { useState } from 'react';
import { DcaProjectionCalculator } from '../components/DcaProjectionCalculator';
import { PassiveIncomeCalculator } from '../components/PassiveIncomeCalculator';

type ToolsTab = 'dca-projection' | 'passive-income';

export function ToolsPage() {
  const [activeTab, setActiveTab] = useState<ToolsTab>('dca-projection');

  return (
    <div>
      <h2>Tools</h2>
      <nav>
        <button
          type="button"
          aria-pressed={activeTab === 'dca-projection'}
          onClick={() => setActiveTab('dca-projection')}
        >
          DCA Projection
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'passive-income'}
          onClick={() => setActiveTab('passive-income')}
        >
          Passive Income
        </button>
      </nav>
      {activeTab === 'dca-projection' && <DcaProjectionCalculator />}
      {activeTab === 'passive-income' && <PassiveIncomeCalculator />}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

From `portfolio-tracker/frontend`, run: `npm test -- src/pages/ToolsPage.test.tsx`
Expected: 1 passed

Also run the full frontend suite to confirm `App.test.tsx`'s "switches to the Tools tab" test still passes (it only asserts `getByRole('heading', {name: 'Tools'})`, which `ToolsPage` still renders) and nothing else broke: `npm test`
Expected: all passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ToolsPage.tsx frontend/src/pages/ToolsPage.test.tsx
git commit -m "feat: wire DCA Projection and Passive Income into ToolsPage"
```

---

## Self-Review

**Spec coverage** (against `docs/specs/2026-07-24-stockvision-tools-merge.md`'s user stories 5-12 and the "Backend: market data" / "Frontend: pure calculation utils" / "Frontend: API client" / "Frontend: components" Implementation Decisions):
- DCA Projection tool with real pre-filled yield/growth, manual override, graceful blank-on-failure → Tasks 3, 6. ✅
- Naming disambiguation from the existing "DCA calculator" → Task 3 (function named `calculateDcaProjection`), consistent with `CONTEXT.md`. ✅
- Passive Income tool, same pre-fill/fallback behavior → Tasks 4, 7. ✅
- THB-native inputs/outputs for both tools → Tasks 3, 4, 6, 7 (all THB-suffixed fields, no FX conversion — see Global Constraints for why that's correct, not a gap). ✅
- Market data (price + yield + growth) sourced from yfinance only for yield/growth, price via existing `get_price` with its Twelve Data fallback → Task 1. ✅
- New endpoint modeled on `routers/prices.py` → Task 2. ✅
- Explicitly NOT building: Portfolio Builder, ETF Comparison → stated in Global Constraints, not touched by any task. ✅

**Placeholder scan:** No TBD/TODO/"add error handling"-style steps — every step has full code.

**Type consistency:** `calculateDcaProjection`/`DcaProjectionInput` (Task 3) are imported by those exact names in Task 4 (`passiveIncome.ts` reuses the projection engine) and Task 6 (`DcaProjectionCalculator.tsx`). `calculateRequiredPortfolio` (Task 4) is imported by that exact name in Task 7. `getMarketData`/`MarketData` (Task 5) are imported by those exact names in Tasks 6 and 7. `DcaProjectionCalculator`/`PassiveIncomeCalculator` (Tasks 6, 7) are imported by those exact names in Task 8. `ToolsPage`'s export signature (no props) is unchanged from the prior plan, so no changes are needed to `App.tsx` or `App.test.tsx` in this plan.
