# Dividend Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Ticket 6 of `tickets.md`: a Dividend Ranking sub-tab showing price, gross/net dividend yield, observed payment frequency, and dividend growth for every Watchlist ticker, with a single editable tax-rate field.

**Architecture:** Backend: a new `dividend_service.py` (fetches and caches a ticker's raw dividend payment history, 24-hour TTL — payouts change quarterly at most, matching `fx_service.py`'s TTL exactly) and a new `dividend_metrics.py` (pure functions computing gross yield, payment frequency, and growth from that raw history — same fetch/pure-compute split `history_service.py`/`signals.py` already established). A new endpoint, `GET /watchlist/scan/dividends?ticker=X`, is **per-ticker like `/watchlist/scan/price-signals`**, not a single bulk Watchlist-scoped call — this is a deliberate consistency choice: Ticket 6's own acceptance criteria require the same scan discipline (Scan button, truthful per-ticker progress, disabled-while-running) every other Scanner has, and truthful progress requires the frontend to drive its own sequential loop over individual requests, exactly as Ticket 3 established for price signals. Frontend: a `useDividendScan` hook mirrors `usePriceSignalsScan` (sequential fetch, per-ticker failure isolation, progress) but is simpler — no period concept exists for dividends at all. **Net yield is computed entirely client-side** from the fetched gross yield and a tax-rate input, using the exact formula `DcaProjectionCalculator`/`PassiveIncomeCalculator` already use (`grossYield * (1 - taxRatePct / 100)`) — this is what makes "editing the tax rate updates net yield with no second request" trivially true, since it's pure arithmetic on data already in memory, not a value the backend computes per rate.

**Tech Stack:** FastAPI, pytest (backend). React 19, TypeScript, Vitest (frontend). Matches Tickets 3–5.

## Global Constraints

- **Gross yield is computed from raw trailing-12-month dividend payments divided by current price** (`sum(payments in the last 365 days) / price * 100`) — not from yfinance's `.info['dividendYield']` field, which `price_service._fetch_dividend_yield_pct` already has to heuristically guess is a fraction or already-a-percentage. Since this ticket fetches the raw payment history anyway (needed for frequency and growth), computing yield from that same real data avoids reusing a field with known format ambiguity, matching the never-fabricate-a-value discipline: a locally-derived number with a known formula beats an upstream field of uncertain scale.
- **Net yield is never computed or stored on the backend.** It exists only as a frontend render-time calculation from `gross_yield_pct` and a user-controlled tax-rate input, so changing the rate never triggers a request.
- Payment frequency counts observed payment dates in the trailing 365 days — never inferred from fund type or payout schedule metadata.
- Dividend growth compares the sum of the trailing 365 days of payments against the sum of the 365 days before that; a ticker with nothing in the prior window returns `None` (division by a zero-or-absent base is undefined, not zero).
- Every function in `dividend_metrics.py` stays pure: takes an explicit `as_of: date` rather than reading system time internally (only `dividend_service.py`, the impure layer, calls `datetime.now()`) — this is what makes the functions deterministically testable with fixed dates, matching how `history_service.py`/`signals.py` keep all "now"-dependent code out of `signals.py` itself.
- Window boundaries use `timedelta(days=365)`, not `date.replace(year=...)` — the latter throws on a Feb 29 `as_of` in a non-leap year.
- The `/watchlist/scan/dividends` endpoint does not read the Watchlist table, exactly like `/watchlist/scan/price-signals` — it computes for whatever ticker it's given; the frontend decides which tickers to call it for via the existing `GET /watchlist`.
- No comments except where a non-obvious constraint needs explaining. No abstractions beyond what this task needs.
- `cd backend && python -m pytest` and `cd frontend && npx tsc -b` must both be clean.

---

### Task 1: Backend — dividend service, metrics, and the scan endpoint

**Files:**
- Create: `backend/app/dividend_service.py`
- Create: `backend/app/dividend_metrics.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/watchlist.py`
- Create: `backend/tests/test_dividend_service.py`
- Create: `backend/tests/test_dividend_metrics.py`
- Create: `backend/tests/test_watchlist_dividends_router.py`

**Interfaces:**
- Consumes: `price_service.get_price` (already exists, reused as-is).
- Produces: `dividend_service.get_dividend_payments(ticker: str) -> list[tuple[date, float]] | None`, `dividend_service.clear_cache() -> None`; `dividend_metrics.gross_yield_pct(payments, price, as_of) -> float | None`, `dividend_metrics.payment_frequency(payments, as_of) -> int`, `dividend_metrics.dividend_growth_pct(payments, as_of) -> float | None`. The live endpoint `GET /watchlist/scan/dividends?ticker=X` returns `{"ticker": str, "price": float | None, "gross_yield_pct": float | None, "payment_frequency": int | None, "dividend_growth_pct": float | None}`. Task 2's `getDividendSignal` client function and `DividendSignalRow` type are written to this exact field set.

- [ ] **Step 1: Write the failing tests for `dividend_service`**

```python
# backend/tests/test_dividend_service.py
from datetime import date

import pytest

from app import dividend_service


@pytest.fixture(autouse=True)
def _clear_cache():
    dividend_service.clear_cache()
    yield
    dividend_service.clear_cache()


SAMPLE_PAYMENTS = [(date(2026, 1, 15), 0.5), (date(2026, 4, 15), 0.5)]


def test_get_dividend_payments_returns_fetched_payments(monkeypatch):
    monkeypatch.setattr(dividend_service, "_fetch_dividend_payments", lambda ticker: SAMPLE_PAYMENTS)

    result = dividend_service.get_dividend_payments("JEPQ")

    assert result == SAMPLE_PAYMENTS


def test_get_dividend_payments_returns_none_when_fetch_fails(monkeypatch):
    monkeypatch.setattr(dividend_service, "_fetch_dividend_payments", lambda ticker: None)

    result = dividend_service.get_dividend_payments("BADTICKER")

    assert result is None


def test_get_dividend_payments_returns_empty_list_for_a_ticker_that_never_paid(monkeypatch):
    monkeypatch.setattr(dividend_service, "_fetch_dividend_payments", lambda ticker: [])

    result = dividend_service.get_dividend_payments("NODIVTICKER")

    assert result == []


def test_get_dividend_payments_caches_and_does_not_refetch_within_ttl(monkeypatch):
    call_count = {"n": 0}

    def fake_fetch(ticker):
        call_count["n"] += 1
        return SAMPLE_PAYMENTS

    monkeypatch.setattr(dividend_service, "_fetch_dividend_payments", fake_fetch)

    dividend_service.get_dividend_payments("JEPQ")
    dividend_service.get_dividend_payments("JEPQ")

    assert call_count["n"] == 1


def test_get_dividend_payments_refetches_after_ttl_expires(monkeypatch):
    monkeypatch.setattr(dividend_service, "_fetch_dividend_payments", lambda ticker: SAMPLE_PAYMENTS)

    fake_time = {"t": 1000.0}
    monkeypatch.setattr(dividend_service.time, "monotonic", lambda: fake_time["t"])

    dividend_service.get_dividend_payments("JEPQ")

    fake_time["t"] += dividend_service.CACHE_TTL_SECONDS + 1

    call_count = {"n": 0}

    def fake_fetch_second(ticker):
        call_count["n"] += 1
        return SAMPLE_PAYMENTS

    monkeypatch.setattr(dividend_service, "_fetch_dividend_payments", fake_fetch_second)

    dividend_service.get_dividend_payments("JEPQ")

    assert call_count["n"] == 1


def test_a_failed_fetch_is_not_cached(monkeypatch):
    monkeypatch.setattr(dividend_service, "_fetch_dividend_payments", lambda ticker: None)

    dividend_service.get_dividend_payments("BADTICKER")

    call_count = {"n": 0}

    def fake_fetch(ticker):
        call_count["n"] += 1
        return SAMPLE_PAYMENTS

    monkeypatch.setattr(dividend_service, "_fetch_dividend_payments", fake_fetch)

    result = dividend_service.get_dividend_payments("BADTICKER")

    assert result == SAMPLE_PAYMENTS
    assert call_count["n"] == 1
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_dividend_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.dividend_service'`

- [ ] **Step 3: Implement `dividend_service.py`**

```python
# backend/app/dividend_service.py
import time
from datetime import date

CACHE_TTL_SECONDS = 86400.0

_cache: dict[str, tuple[list[tuple[date, float]], float]] = {}


def clear_cache() -> None:
    _cache.clear()


def _get_cached(ticker: str) -> list[tuple[date, float]] | None:
    entry = _cache.get(ticker)
    if entry is None:
        return None
    payments, fetched_at = entry
    if time.monotonic() - fetched_at > CACHE_TTL_SECONDS:
        return None
    return payments


def _set_cached(ticker: str, payments: list[tuple[date, float]]) -> None:
    _cache[ticker] = (payments, time.monotonic())


def _fetch_dividend_payments(ticker: str) -> list[tuple[date, float]] | None:
    import yfinance as yf

    try:
        dividends = yf.Ticker(ticker).dividends
        return [(index.date(), float(amount)) for index, amount in dividends.items()]
    except Exception:
        return None


def get_dividend_payments(ticker: str) -> list[tuple[date, float]] | None:
    cached = _get_cached(ticker)
    if cached is not None:
        return cached

    payments = _fetch_dividend_payments(ticker)
    if payments is not None:
        _set_cached(ticker, payments)

    return payments
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_dividend_service.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Write the failing tests for `dividend_metrics`**

```python
# backend/tests/test_dividend_metrics.py
from datetime import date, timedelta

import pytest

from app.dividend_metrics import dividend_growth_pct, gross_yield_pct, payment_frequency

AS_OF = date(2026, 7, 25)


def test_payment_frequency_counts_quarterly_payments():
    dates = [AS_OF - timedelta(days=30), AS_OF - timedelta(days=120), AS_OF - timedelta(days=210), AS_OF - timedelta(days=300)]

    result = payment_frequency(dates, AS_OF)

    assert result == 4


def test_payment_frequency_counts_monthly_payments():
    dates = [AS_OF - timedelta(days=30 * i) for i in range(1, 13)]

    result = payment_frequency(dates, AS_OF)

    assert result == 12


def test_payment_frequency_excludes_payments_older_than_a_year():
    dates = [AS_OF - timedelta(days=30), AS_OF - timedelta(days=400)]

    result = payment_frequency(dates, AS_OF)

    assert result == 1


def test_payment_frequency_is_zero_for_no_payments():
    result = payment_frequency([], AS_OF)

    assert result == 0


def test_dividend_growth_pct_computes_growth_between_two_trailing_years():
    payments = [
        (AS_OF - timedelta(days=30), 1.1),
        (AS_OF - timedelta(days=120), 1.1),
        (AS_OF - timedelta(days=210), 1.1),
        (AS_OF - timedelta(days=300), 1.1),
        (AS_OF - timedelta(days=390), 1.0),
        (AS_OF - timedelta(days=480), 1.0),
        (AS_OF - timedelta(days=570), 1.0),
        (AS_OF - timedelta(days=660), 1.0),
    ]

    result = dividend_growth_pct(payments, AS_OF)

    assert result == pytest.approx(10.0)


def test_dividend_growth_pct_returns_none_when_prior_year_had_no_payments():
    payments = [(AS_OF - timedelta(days=30), 1.0)]

    result = dividend_growth_pct(payments, AS_OF)

    assert result is None


def test_gross_yield_pct_computes_trailing_year_sum_over_price():
    payments = [
        (AS_OF - timedelta(days=30), 1.1),
        (AS_OF - timedelta(days=120), 1.1),
        (AS_OF - timedelta(days=210), 1.1),
        (AS_OF - timedelta(days=300), 1.1),
    ]

    result = gross_yield_pct(payments, 100.0, AS_OF)

    assert result == pytest.approx(4.4)


def test_gross_yield_pct_returns_none_when_price_is_none():
    result = gross_yield_pct([(AS_OF, 1.0)], None, AS_OF)

    assert result is None


def test_gross_yield_pct_returns_none_when_price_is_not_positive():
    result = gross_yield_pct([(AS_OF, 1.0)], 0.0, AS_OF)

    assert result is None


def test_gross_yield_pct_is_zero_for_a_ticker_with_no_payments():
    result = gross_yield_pct([], 100.0, AS_OF)

    assert result == pytest.approx(0.0)
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_dividend_metrics.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.dividend_metrics'`

- [ ] **Step 7: Implement `dividend_metrics.py`**

```python
# backend/app/dividend_metrics.py
from datetime import date, timedelta

TRAILING_WINDOW = timedelta(days=365)


def payment_frequency(payment_dates: list[date], as_of: date) -> int:
    cutoff = as_of - TRAILING_WINDOW
    return sum(1 for d in payment_dates if d > cutoff)


def dividend_growth_pct(payments: list[tuple[date, float]], as_of: date) -> float | None:
    recent_cutoff = as_of - TRAILING_WINDOW
    prior_cutoff = as_of - (TRAILING_WINDOW * 2)
    recent = sum(amount for payment_date, amount in payments if payment_date > recent_cutoff)
    prior = sum(amount for payment_date, amount in payments if prior_cutoff < payment_date <= recent_cutoff)
    if prior <= 0:
        return None
    return (recent - prior) / prior * 100


def gross_yield_pct(payments: list[tuple[date, float]], price: float | None, as_of: date) -> float | None:
    if price is None or price <= 0:
        return None
    cutoff = as_of - TRAILING_WINDOW
    trailing_sum = sum(amount for payment_date, amount in payments if payment_date > cutoff)
    return trailing_sum / price * 100
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_dividend_metrics.py -v`
Expected: PASS (10 tests)

- [ ] **Step 9: Add the response schema**

Append to `backend/app/schemas.py`:

```python
class DividendSignalOut(BaseModel):
    ticker: str
    price: float | None
    gross_yield_pct: float | None
    payment_frequency: int | None
    dividend_growth_pct: float | None
```

- [ ] **Step 10: Write the failing tests for the router endpoint**

```python
# backend/tests/test_watchlist_dividends_router.py
from datetime import date, timedelta
from unittest.mock import patch

AS_OF = date.today()


def test_scan_dividends_returns_price_yield_frequency_and_growth(client):
    payments = [
        (AS_OF - timedelta(days=30), 1.1),
        (AS_OF - timedelta(days=120), 1.1),
        (AS_OF - timedelta(days=210), 1.1),
        (AS_OF - timedelta(days=300), 1.1),
        (AS_OF - timedelta(days=390), 1.0),
        (AS_OF - timedelta(days=480), 1.0),
        (AS_OF - timedelta(days=570), 1.0),
        (AS_OF - timedelta(days=660), 1.0),
    ]

    with (
        patch("app.routers.watchlist.get_price", return_value=100.0),
        patch("app.routers.watchlist.get_dividend_payments", return_value=payments),
    ):
        response = client.get("/watchlist/scan/dividends", params={"ticker": "JEPQ"})

    assert response.status_code == 200
    body = response.json()
    assert body["ticker"] == "JEPQ"
    assert body["price"] == 100.0
    assert body["gross_yield_pct"] == 4.4
    assert body["payment_frequency"] == 4
    assert body["dividend_growth_pct"] == 10.0


def test_scan_dividends_returns_all_fields_null_when_payments_unavailable(client):
    with (
        patch("app.routers.watchlist.get_price", return_value=None),
        patch("app.routers.watchlist.get_dividend_payments", return_value=None),
    ):
        response = client.get("/watchlist/scan/dividends", params={"ticker": "BADTICKER"})

    assert response.json() == {
        "ticker": "BADTICKER",
        "price": None,
        "gross_yield_pct": None,
        "payment_frequency": None,
        "dividend_growth_pct": None,
    }


def test_scan_dividends_for_a_ticker_that_never_paid_shows_zero_not_missing(client):
    with (
        patch("app.routers.watchlist.get_price", return_value=50.0),
        patch("app.routers.watchlist.get_dividend_payments", return_value=[]),
    ):
        response = client.get("/watchlist/scan/dividends", params={"ticker": "NODIVTICKER"})

    body = response.json()
    assert body["price"] == 50.0
    assert body["gross_yield_pct"] == 0.0
    assert body["payment_frequency"] == 0
    assert body["dividend_growth_pct"] is None
```

- [ ] **Step 11: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_watchlist_dividends_router.py -v`
Expected: FAIL — 404 (route doesn't exist yet)

- [ ] **Step 12: Add the endpoint to the watchlist router**

In `backend/app/routers/watchlist.py`, add these imports alongside the existing ones:

```python
from datetime import date

from app.dividend_metrics import dividend_growth_pct, gross_yield_pct, payment_frequency
from app.dividend_service import get_dividend_payments
from app.price_service import get_price
from app.schemas import DividendSignalOut
```

And append this route at the end of the file:

```python
@router.get("/scan/dividends", response_model=DividendSignalOut)
def scan_dividends(ticker: str):
    price = get_price(ticker)
    payments = get_dividend_payments(ticker)
    if payments is None:
        return DividendSignalOut(ticker=ticker, price=price, gross_yield_pct=None, payment_frequency=None, dividend_growth_pct=None)
    as_of = date.today()
    return DividendSignalOut(
        ticker=ticker,
        price=price,
        gross_yield_pct=gross_yield_pct(payments, price, as_of),
        payment_frequency=payment_frequency([d for d, _ in payments], as_of),
        dividend_growth_pct=dividend_growth_pct(payments, as_of),
    )
```

- [ ] **Step 13: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_watchlist_dividends_router.py -v`
Expected: PASS (3 tests)

- [ ] **Step 14: Run the full backend suite**

Run: `cd backend && python -m pytest`
Expected: All pass (102 pre-existing + 6 dividend_service + 10 dividend_metrics + 3 router = 121).

- [ ] **Step 15: Commit**

```bash
git add backend/app/dividend_service.py backend/app/dividend_metrics.py backend/app/schemas.py backend/app/routers/watchlist.py backend/tests/test_dividend_service.py backend/tests/test_dividend_metrics.py backend/tests/test_watchlist_dividends_router.py
git commit -m "feat: add dividend service, metrics, and the dividend scan endpoint"
```

---

### Task 2: Frontend — dividend scan hook and Dividend Ranking tab

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/client.test.ts`
- Create: `frontend/src/hooks/useDividendScan.ts`
- Create: `frontend/src/hooks/useDividendScan.test.tsx`
- Create: `frontend/src/components/DividendRanking.tsx`
- Create: `frontend/src/components/DividendRanking.test.tsx`
- Modify: `frontend/src/pages/WatchlistPage.tsx`
- Modify: `frontend/src/pages/WatchlistPage.test.tsx`

**Interfaces:**
- Consumes: Task 1's `GET /watchlist/scan/dividends?ticker=X`; the existing `useWatchlist`, `TabStrip`, `formatSignedPercent`/`formatNumber` (from `signalFormatting.ts`).
- Produces: `DividendSignalRow { ticker: string; price: number | null; gross_yield_pct: number | null; payment_frequency: number | null; dividend_growth_pct: number | null }`; `getDividendSignal(ticker: string): Promise<DividendSignalRow>`; `useDividendScan()` returning `{ results: Record<string, DividendSignalRow>; scanning: boolean; progress: { done: number; total: number } | null; scan: (tickers: string[]) => Promise<void> }`.

- [ ] **Step 1: Add the type**

Append to `frontend/src/api/types.ts`:

```ts
export interface DividendSignalRow {
  ticker: string;
  price: number | null;
  gross_yield_pct: number | null;
  payment_frequency: number | null;
  dividend_growth_pct: number | null;
}
```

- [ ] **Step 2: Write the failing client test**

Add `getDividendSignal` to the existing `import { ... } from './client'` list in `frontend/src/api/client.test.ts`, and add this test inside the existing `describe('api client', ...)` block:

```ts
  it('getDividendSignal calls GET /watchlist/scan/dividends with the ticker', async () => {
    mockFetchOnce({ ticker: 'JEPQ', price: 58.51, gross_yield_pct: 11.1, payment_frequency: 12, dividend_growth_pct: 3.2 });

    const result = await getDividendSignal('JEPQ');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/watchlist/scan/dividends?ticker=JEPQ',
      expect.objectContaining({ method: undefined }),
    );
    expect(result.gross_yield_pct).toBe(11.1);
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/api/client.test.ts`
Expected: FAIL — `getDividendSignal is not defined`

- [ ] **Step 4: Implement `getDividendSignal`**

Add `DividendSignalRow` to the existing `import type { ... } from './types'` block in `frontend/src/api/client.ts`, and append:

```ts
export function getDividendSignal(ticker: string): Promise<DividendSignalRow> {
  return request<DividendSignalRow>(`/watchlist/scan/dividends?ticker=${encodeURIComponent(ticker)}`);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/api/client.test.ts`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 6: Write the failing tests for `useDividendScan`**

```tsx
// frontend/src/hooks/useDividendScan.test.tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { useDividendScan } from './useDividendScan';

describe('useDividendScan', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with no results and not scanning', () => {
    const { result } = renderHook(() => useDividendScan());

    expect(result.current.results).toEqual({});
    expect(result.current.scanning).toBe(false);
    expect(result.current.progress).toBeNull();
  });

  it('fetches each ticker sequentially and stores results keyed by ticker', async () => {
    const calls: string[] = [];
    vi.spyOn(client, 'getDividendSignal').mockImplementation(async (ticker) => {
      calls.push(ticker);
      return { ticker, price: 100, gross_yield_pct: 4, payment_frequency: 4, dividend_growth_pct: 2 };
    });

    const { result } = renderHook(() => useDividendScan());

    await act(async () => {
      await result.current.scan(['JEPQ', 'SCHD']);
    });

    expect(calls).toEqual(['JEPQ', 'SCHD']);
    expect(result.current.results.JEPQ.gross_yield_pct).toBe(4);
  });

  it('records a null-valued row for a ticker whose fetch fails, without abandoning the rest', async () => {
    vi.spyOn(client, 'getDividendSignal').mockImplementation(async (ticker) => {
      if (ticker === 'BADTICKER') {
        throw new client.ApiError(502, 'upstream error');
      }
      return { ticker, price: 100, gross_yield_pct: 4, payment_frequency: 4, dividend_growth_pct: 2 };
    });

    const { result } = renderHook(() => useDividendScan());

    await act(async () => {
      await result.current.scan(['JEPQ', 'BADTICKER']);
    });

    expect(result.current.results.BADTICKER).toEqual({
      ticker: 'BADTICKER',
      price: null,
      gross_yield_pct: null,
      payment_frequency: null,
      dividend_growth_pct: null,
    });
  });

  it('updates progress after each ticker and clears it when done', async () => {
    let resolveJepq!: (row: { ticker: string; price: number | null; gross_yield_pct: number | null; payment_frequency: number | null; dividend_growth_pct: number | null }) => void;
    const jepqPromise = new Promise<{ ticker: string; price: number | null; gross_yield_pct: number | null; payment_frequency: number | null; dividend_growth_pct: number | null }>((resolve) => {
      resolveJepq = resolve;
    });
    vi.spyOn(client, 'getDividendSignal').mockImplementation(async (ticker) => (ticker === 'JEPQ' ? jepqPromise : { ticker, price: 1, gross_yield_pct: 1, payment_frequency: 1, dividend_growth_pct: 1 }));

    const { result } = renderHook(() => useDividendScan());

    let scanPromise!: Promise<void>;
    act(() => {
      scanPromise = result.current.scan(['JEPQ', 'SCHD']);
    });

    await waitFor(() => expect(result.current.progress).toEqual({ done: 0, total: 2 }));

    await act(async () => {
      resolveJepq({ ticker: 'JEPQ', price: 1, gross_yield_pct: 1, payment_frequency: 1, dividend_growth_pct: 1 });
      await scanPromise;
    });

    expect(result.current.scanning).toBe(false);
    expect(result.current.progress).toBeNull();
  });

  it('replaces prior results wholesale on a new scan rather than merging', async () => {
    vi.spyOn(client, 'getDividendSignal').mockImplementation(async (ticker) => ({ ticker, price: 1, gross_yield_pct: 1, payment_frequency: 1, dividend_growth_pct: 1 }));

    const { result } = renderHook(() => useDividendScan());

    await act(async () => {
      await result.current.scan(['JEPQ']);
    });
    expect(Object.keys(result.current.results)).toEqual(['JEPQ']);

    await act(async () => {
      await result.current.scan(['SCHD']);
    });

    expect(Object.keys(result.current.results)).toEqual(['SCHD']);
  });
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/hooks/useDividendScan.test.tsx`
Expected: FAIL — `Cannot find module './useDividendScan'`

- [ ] **Step 8: Implement `useDividendScan`**

```ts
// frontend/src/hooks/useDividendScan.ts
import { useCallback, useState } from 'react';
import { getDividendSignal } from '../api/client';
import type { DividendSignalRow } from '../api/types';

interface ScanProgress {
  done: number;
  total: number;
}

export function useDividendScan() {
  const [results, setResults] = useState<Record<string, DividendSignalRow>>({});
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);

  const scan = useCallback(async (tickers: string[]) => {
    setScanning(true);
    setProgress({ done: 0, total: tickers.length });
    const next: Record<string, DividendSignalRow> = {};

    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i];
      try {
        next[ticker] = await getDividendSignal(ticker);
      } catch {
        // One ticker's failure must not abandon the rest of the scan — record it as
        // unavailable and keep going, per the never-fabricate-a-value rule.
        next[ticker] = { ticker, price: null, gross_yield_pct: null, payment_frequency: null, dividend_growth_pct: null };
      }
      setProgress({ done: i + 1, total: tickers.length });
    }

    setResults(next);
    setScanning(false);
    setProgress(null);
  }, []);

  return { results, scanning, progress, scan };
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/hooks/useDividendScan.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 10: Write the failing tests for `DividendRanking`**

```tsx
// frontend/src/components/DividendRanking.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { DividendRanking } from './DividendRanking';

describe('DividendRanking', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows an empty-watchlist message and no Scan button when the watchlist has no tickers', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<DividendRanking />);

    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^scan$/i })).not.toBeInTheDocument();
  });

  it('scans and renders price, gross yield, net yield (default 15% tax), frequency, and growth', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'JEPQ', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getDividendSignal').mockResolvedValue({
      ticker: 'JEPQ',
      price: 58.51,
      gross_yield_pct: 11.1,
      payment_frequency: 12,
      dividend_growth_pct: 3.2,
    });

    render(<DividendRanking />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => expect(screen.getByText('JEPQ')).toBeInTheDocument());
    expect(screen.getByText('58.51')).toBeInTheDocument();
    expect(screen.getByText('11.10%')).toBeInTheDocument();
    expect(screen.getByText('9.44%')).toBeInTheDocument(); // 11.1 * (1 - 15/100)
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3.20%')).toBeInTheDocument();
  });

  it('recomputes net yield when the tax rate changes, without issuing a second request', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'JEPQ', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getDividendSignal').mockResolvedValue({
      ticker: 'JEPQ',
      price: 58.51,
      gross_yield_pct: 10.0,
      payment_frequency: 12,
      dividend_growth_pct: 3.2,
    });

    render(<DividendRanking />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));
    await waitFor(() => expect(screen.getByText('8.50%')).toBeInTheDocument()); // 10 * (1 - 15/100)

    fireEvent.change(screen.getByLabelText(/tax rate/i), { target: { value: '20' } });

    expect(screen.getByText('8.00%')).toBeInTheDocument(); // 10 * (1 - 20/100)
    expect(client.getDividendSignal).toHaveBeenCalledTimes(1);
  });

  it('shows a ticker that never paid as zero yield and zero frequency, not unavailable', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'NODIV', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getDividendSignal').mockResolvedValue({
      ticker: 'NODIV',
      price: 50.0,
      gross_yield_pct: 0,
      payment_frequency: 0,
      dividend_growth_pct: null,
    });

    render(<DividendRanking />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => expect(screen.getByText('NODIV')).toBeInTheDocument());
    expect(screen.getByText('0.00%')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument(); // dividend_growth_pct: null
  });

  it('shows a row marked unavailable for a ticker whose signal could not be fetched', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'BADTICKER', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getDividendSignal').mockRejectedValue(new client.ApiError(502, 'upstream error'));

    render(<DividendRanking />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => expect(screen.getByText('BADTICKER')).toBeInTheDocument());
    expect(screen.getAllByText(/unavailable/i).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 11: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/DividendRanking.test.tsx`
Expected: FAIL — `Cannot find module './DividendRanking'`

- [ ] **Step 12: Implement `DividendRanking`**

```tsx
// frontend/src/components/DividendRanking.tsx
import { useState } from 'react';
import { useDividendScan } from '../hooks/useDividendScan';
import { useWatchlist } from '../hooks/useWatchlist';
import { formatNumber, formatSignedPercent } from '../utils/signalFormatting';

export function DividendRanking() {
  const { items, loading } = useWatchlist();
  const [taxRatePct, setTaxRatePct] = useState('15');
  const { results, scanning, progress, scan } = useDividendScan();

  if (loading) {
    return <div>Loading watchlist…</div>;
  }

  if (items.length === 0) {
    return (
      <div>
        <h3>Dividend Ranking</h3>
        <p>Your watchlist is empty — add tickers in Manage Watchlist before scanning.</p>
      </div>
    );
  }

  const rows = items.map((item) => results[item.ticker]).filter((row) => row !== undefined);
  const taxRate = Number(taxRatePct) || 0;

  async function handleScan() {
    await scan(items.map((item) => item.ticker));
  }

  return (
    <div>
      <h3>Dividend Ranking</h3>

      <label htmlFor="dividend-tax-rate">Dividend tax rate (%)</label>
      <input id="dividend-tax-rate" type="number" value={taxRatePct} onChange={(e) => setTaxRatePct(e.target.value)} />

      <button type="button" onClick={handleScan} disabled={scanning}>
        {scanning ? 'Scanning…' : 'Scan'}
      </button>

      {scanning && progress && (
        <div role="status">
          Scanning {progress.done} of {progress.total}…
        </div>
      )}

      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Price</th>
              <th>Gross yield</th>
              <th>Net yield</th>
              <th>Payment frequency (12mo)</th>
              <th>Dividend growth (YoY)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const netYieldPct = row.gross_yield_pct == null ? null : row.gross_yield_pct * (1 - taxRate / 100);
              return (
                <tr key={row.ticker}>
                  <td>{row.ticker}</td>
                  <td>{formatNumber(row.price)}</td>
                  <td>{formatSignedPercent(row.gross_yield_pct)}</td>
                  <td>{formatSignedPercent(netYieldPct)}</td>
                  <td>{row.payment_frequency == null ? 'Unavailable' : row.payment_frequency}</td>
                  <td>{formatSignedPercent(row.dividend_growth_pct)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 13: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/DividendRanking.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 14: Add the failing test for `WatchlistPage`'s new tab**

Add this test inside the existing `describe('WatchlistPage', ...)` block in `frontend/src/pages/WatchlistPage.test.tsx`:

```tsx
  it('switches to the Dividend Ranking sub-tab and shows its content', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<WatchlistPage />);
    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Dividend Ranking' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dividend Ranking' })).toBeInTheDocument());
  });
```

- [ ] **Step 15: Run `WatchlistPage.test.tsx` to verify the new test fails**

Run: `cd frontend && npx vitest run src/pages/WatchlistPage.test.tsx`
Expected: FAIL on the new test — no "Dividend Ranking" tab exists yet. All pre-existing tests must still pass.

- [ ] **Step 16: Wire `DividendRanking` into `WatchlistPage`**

In `frontend/src/pages/WatchlistPage.tsx`, add the import `import { DividendRanking } from '../components/DividendRanking';`, extend the `WatchlistTab` type to `'manage' | 'momentum' | 'pre-squeeze' | 'dividend-ranking'`, add `{ id: 'dividend-ranking', label: 'Dividend Ranking' }` to `TABS`, and add `{activeTab === 'dividend-ranking' && <DividendRanking />}` to the render — Dividend Ranking does **not** take a `scanState` prop (it owns its own `useDividendScan()` internally, unlike the price-signal scanners, since dividends have nothing to share with Momentum/Pre-Squeeze).

- [ ] **Step 17: Run `WatchlistPage.test.tsx` to verify all tests pass**

Run: `cd frontend && npx vitest run src/pages/WatchlistPage.test.tsx`
Expected: PASS (all tests: 6 pre-existing + 1 new = 7)

- [ ] **Step 18: Run the full frontend suite and typecheck**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: All tests pass, `tsc -b` clean.

- [ ] **Step 19: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/api/client.test.ts frontend/src/hooks/useDividendScan.ts frontend/src/hooks/useDividendScan.test.tsx frontend/src/components/DividendRanking.tsx frontend/src/components/DividendRanking.test.tsx frontend/src/pages/WatchlistPage.tsx frontend/src/pages/WatchlistPage.test.tsx
git commit -m "feat: add Dividend Ranking tab with client-side net-yield calculation"
```

## Self-Review

**1. Spec coverage:** Ticket 6's acceptance criteria map to: price/gross/net yield/frequency/growth columns (Task 2 Step 12's table), tax-rate field defaulting to 15% following the DCA Projection/Passive Income convention (Task 2 Step 12, same default string literal), net yield recomputing without a second request (Task 2 Step 12's per-row calculation, proven by Task 2 Step 10's dedicated test asserting `toHaveBeenCalledTimes(1)`), frequency from observed payment dates not fund-type inference (Task 1's `payment_frequency`), growth as trailing-12mo vs prior-12mo (Task 1's `dividend_growth_pct`), a ticker that paid nothing shown as zero not hidden (Task 1 Step 10's `test_scan_dividends_for_a_ticker_that_never_paid_shows_zero_not_missing`, Task 2 Step 10's matching frontend test), same scan discipline as other Scanners (Task 2 Step 12 mirrors `MomentumScanner`'s shell), no subjective tags anywhere.

**2. Placeholder scan:** No TBD/TODO markers. All code blocks are complete file contents or complete appended functions.

**3. Type consistency:** `DividendSignalOut` (Task 1 Step 9) and `DividendSignalRow` (Task 2 Step 1) share the same 5 field names in the same order. `useDividendScan`'s returned shape matches `usePriceSignalsScan`'s shape minus the period-related fields (`scannedPeriod`, and `scan` takes no second argument) — deliberately not sharing an interface with `PriceSignalsScanState` since dividends have no period concept at all; forcing a shared type here would just reintroduce an optional field nobody uses, the same class of accidental coupling Ticket 5 had to fix for `scannedPeriod`.
