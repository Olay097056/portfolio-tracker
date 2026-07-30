# Trending Stocks Today Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Ticket 7 of `tickets.md` — the final ticket of the Watchlist and Scanners effort: a Trending Stocks Today sub-tab showing today's biggest gainers, losers, and most-active tickers market-wide (via Financial Modeling Prep, a new backend dependency), each with an "Add to Watchlist" button.

**Architecture:** Unlike the three per-ticker Scanner tabs, Trending Stocks Today is not Watchlist-scoped and needs no per-ticker sequential fetch — it's three flat requests to FMP's pre-aggregated market-breadth endpoints, capped at 10 rows each. Backend: a `trending_service.py` behind `httpx` (already a dependency, no new package needed) reading `FMP_API_KEY` from the environment, following the exact convention `TWELVE_DATA_API_KEY` already established in `price_service.py`. A new `market.py` router (separate from `watchlist.py`, since this endpoint genuinely does not touch the Watchlist table) exposes `GET /market/trending`. Frontend: a `useTrendingData` hook — simpler than the Scanner hooks (one combined fetch, no per-ticker progress) — owned by `WatchlistPage` from the start and passed down as a prop, applying the lesson Ticket 6's final review had to retrofit: scan/fetch state that lives inside a Watchlist sub-tab component is lost on every tab switch, so it belongs one level up from day one.

**Tech Stack:** FastAPI, httpx, pytest (backend — no new pip package). React 19, TypeScript, Vitest (frontend). Matches Tickets 3–6.

## Global Constraints

- **`FMP_API_KEY` follows the existing `TWELVE_DATA_API_KEY` convention exactly**: `os.environ.get("FMP_API_KEY")`, checked once per request, no startup validation.
- **The endpoint does not read the Watchlist table** — same design as `/watchlist/scan/price-signals` and `/watchlist/scan/dividends`. It returns market-wide data regardless of what's in any Watchlist.
- **No per-ticker enrichment.** Only fields FMP's own gainers/losers/actives endpoints return are shown — no per-ticker yfinance calls layered on top, which would turn one cheap request into dozens and risk exactly the rate-limiting this design avoids.
- **Capped at 10 rows per list**, even if FMP returns more.
- **A missing API key produces an explicit, distinct signal** (`api_key_configured: false` in the response) — never a silently empty list and never placeholder/fabricated rows. The frontend must render a specific "configure this" message, not just an empty table indistinguishable from "no gainers today."
- **`useTrendingData` is owned by `WatchlistPage` and passed down as a `scanState` prop** to `TrendingStocksToday` — not created inside the component itself. This is the lesson from Ticket 6's Important finding (`useDividendScan` originally lived inside `DividendRanking` and lost all state on every sub-tab switch): every Watchlist sub-tab's fetched data is hoisted from the start in this ticket, no retrofit needed.
- **The "Add to Watchlist" button reuses `useWatchlist().create` as-is** — already upper-cases the ticker internally (a Ticket 2 fix written with this exact future caller in mind) and already refetches the Watchlist list afterward. No new watchlist-mutation code is written in this plan.
- Test assertions on any computed/formatted percentage use `toBeCloseTo`/`pytest.approx`, never `==`/exact-string equality against a hand-typed decimal — this session hit float-precision bugs in nearly every prior ticket's plan by violating this rule.
- When two adjacent table cells could render the same formatted value under a test's chosen fixture (e.g. a `0%` case), the test uses `getAllByText` with an explicit count, not `getByText` — this session also hit that ambiguity class repeatedly.
- No comments except where a non-obvious constraint needs explaining. No abstractions beyond what this task needs.
- `cd backend && python -m pytest` and `cd frontend && npx tsc -b` must both be clean.

---

### Task 1: Backend — trending service and the market endpoint

**Files:**
- Create: `backend/app/trending_service.py`
- Create: `backend/app/routers/market.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_trending_service.py`
- Create: `backend/tests/test_market_router.py`

**Interfaces:**
- Consumes: nothing from other tasks — backend-only, self-contained.
- Produces: `trending_service.get_gainers() -> list[TrendingRow] | None`, `trending_service.get_losers() -> list[TrendingRow] | None`, `trending_service.get_most_active() -> list[TrendingRow] | None` (each `None` specifically when `FMP_API_KEY` is unset OR the fetch failed — the route, not the service, is what turns "key unset" into the more specific `api_key_configured` flag). The live endpoint `GET /market/trending` returns `{"gainers": [...] | null, "losers": [...] | null, "most_active": [...] | null, "api_key_configured": bool}`, each row `{"ticker": str, "name": str, "price": float | null, "change_pct": float | null}`. Task 2's frontend types are written to this exact shape.

- [ ] **Step 1: Write the failing tests for `trending_service`**

```python
# backend/tests/test_trending_service.py
import pytest

from app import trending_service

SAMPLE_ROWS = [
    {"ticker": "AAPL", "name": "Apple Inc.", "price": 195.5, "change_pct": 4.2},
    {"ticker": "MSFT", "name": "Microsoft Corp.", "price": 410.0, "change_pct": 3.1},
]


def test_get_gainers_returns_fetched_rows(monkeypatch):
    monkeypatch.setattr(trending_service, "_fetch_list", lambda endpoint: SAMPLE_ROWS)

    result = trending_service.get_gainers()

    assert result == SAMPLE_ROWS


def test_get_losers_calls_the_losers_endpoint(monkeypatch):
    calls = []
    monkeypatch.setattr(trending_service, "_fetch_list", lambda endpoint: calls.append(endpoint) or SAMPLE_ROWS)

    trending_service.get_losers()

    assert calls == ["losers"]


def test_get_most_active_calls_the_actives_endpoint(monkeypatch):
    calls = []
    monkeypatch.setattr(trending_service, "_fetch_list", lambda endpoint: calls.append(endpoint) or SAMPLE_ROWS)

    trending_service.get_most_active()

    assert calls == ["actives"]


def test_get_gainers_calls_the_gainers_endpoint(monkeypatch):
    calls = []
    monkeypatch.setattr(trending_service, "_fetch_list", lambda endpoint: calls.append(endpoint) or SAMPLE_ROWS)

    trending_service.get_gainers()

    assert calls == ["gainers"]


def test_get_gainers_returns_none_when_fetch_fails(monkeypatch):
    monkeypatch.setattr(trending_service, "_fetch_list", lambda endpoint: None)

    result = trending_service.get_gainers()

    assert result is None


def test_fetch_list_returns_none_without_an_api_key(monkeypatch):
    monkeypatch.delenv("FMP_API_KEY", raising=False)

    result = trending_service._fetch_list("gainers")

    assert result is None


def test_fetch_list_caps_at_ten_rows(monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "test-key")

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [{"symbol": f"T{i}", "name": f"Ticker {i}", "price": 1.0, "changesPercentage": 1.0} for i in range(15)]

    import httpx

    monkeypatch.setattr(httpx, "get", lambda *args, **kwargs: FakeResponse())

    result = trending_service._fetch_list("gainers")

    assert len(result) == 10


def test_fetch_list_maps_fmp_field_names(monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "test-key")

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return [{"symbol": "AAPL", "name": "Apple Inc.", "price": 195.5, "changesPercentage": 4.2}]

    import httpx

    monkeypatch.setattr(httpx, "get", lambda *args, **kwargs: FakeResponse())

    result = trending_service._fetch_list("gainers")

    assert result == [{"ticker": "AAPL", "name": "Apple Inc.", "price": 195.5, "change_pct": 4.2}]


def test_fetch_list_returns_none_when_the_request_fails(monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "test-key")

    class FailingResponse:
        def raise_for_status(self):
            raise Exception("upstream error")

    import httpx

    monkeypatch.setattr(httpx, "get", lambda *args, **kwargs: FailingResponse())

    result = trending_service._fetch_list("gainers")

    assert result is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_trending_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.trending_service'`

- [ ] **Step 3: Implement `trending_service.py`**

```python
# backend/app/trending_service.py
import os
from typing import TypedDict

FMP_ENDPOINTS = {
    "gainers": "gainers",
    "losers": "losers",
    "actives": "actives",
}


class TrendingRow(TypedDict):
    ticker: str
    name: str
    price: float | None
    change_pct: float | None


def _fetch_list(endpoint: str) -> list[TrendingRow] | None:
    import httpx

    api_key = os.environ.get("FMP_API_KEY")
    if not api_key:
        return None
    try:
        response = httpx.get(
            f"https://financialmodelingprep.com/api/v3/stock_market/{endpoint}",
            params={"apikey": api_key},
            timeout=5.0,
        )
        response.raise_for_status()
        data = response.json()
        return [
            {
                "ticker": item.get("symbol", ""),
                "name": item.get("name", ""),
                "price": item.get("price"),
                "change_pct": item.get("changesPercentage"),
            }
            for item in data[:10]
        ]
    except Exception:
        return None


def get_gainers() -> list[TrendingRow] | None:
    return _fetch_list("gainers")


def get_losers() -> list[TrendingRow] | None:
    return _fetch_list("losers")


def get_most_active() -> list[TrendingRow] | None:
    return _fetch_list("actives")
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_trending_service.py -v`
Expected: PASS (8 tests)

- [ ] **Step 5: Add the response schemas**

Append to `backend/app/schemas.py`:

```python
class TrendingRowOut(BaseModel):
    ticker: str
    name: str
    price: float | None
    change_pct: float | None


class TrendingOut(BaseModel):
    gainers: list[TrendingRowOut] | None
    losers: list[TrendingRowOut] | None
    most_active: list[TrendingRowOut] | None
    api_key_configured: bool
```

- [ ] **Step 6: Write the failing tests for the router**

```python
# backend/tests/test_market_router.py
from unittest.mock import patch


def test_get_trending_returns_all_three_lists_when_key_is_configured(client, monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "test-key")
    rows = [{"ticker": "AAPL", "name": "Apple Inc.", "price": 195.5, "change_pct": 4.2}]

    with (
        patch("app.routers.market.get_gainers", return_value=rows),
        patch("app.routers.market.get_losers", return_value=rows),
        patch("app.routers.market.get_most_active", return_value=rows),
    ):
        response = client.get("/market/trending")

    assert response.status_code == 200
    body = response.json()
    assert body["api_key_configured"] is True
    assert body["gainers"] == rows
    assert body["losers"] == rows
    assert body["most_active"] == rows


def test_get_trending_reports_missing_key_without_calling_fmp(client, monkeypatch):
    monkeypatch.delenv("FMP_API_KEY", raising=False)

    with patch("app.routers.market.get_gainers") as mock_get_gainers:
        response = client.get("/market/trending")

    assert response.status_code == 200
    body = response.json()
    assert body == {"gainers": None, "losers": None, "most_active": None, "api_key_configured": False}
    mock_get_gainers.assert_not_called()


def test_get_trending_reports_a_list_as_unavailable_when_its_own_fetch_fails(client, monkeypatch):
    monkeypatch.setenv("FMP_API_KEY", "test-key")
    rows = [{"ticker": "AAPL", "name": "Apple Inc.", "price": 195.5, "change_pct": 4.2}]

    with (
        patch("app.routers.market.get_gainers", return_value=None),
        patch("app.routers.market.get_losers", return_value=rows),
        patch("app.routers.market.get_most_active", return_value=rows),
    ):
        response = client.get("/market/trending")

    body = response.json()
    assert body["api_key_configured"] is True
    assert body["gainers"] is None
    assert body["losers"] == rows
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_market_router.py -v`
Expected: FAIL — 404 (route doesn't exist yet)

- [ ] **Step 8: Create the market router**

```python
# backend/app/routers/market.py
import os

from fastapi import APIRouter

from app.schemas import TrendingOut
from app.trending_service import get_gainers, get_losers, get_most_active

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/trending", response_model=TrendingOut)
def get_trending():
    api_key_configured = bool(os.environ.get("FMP_API_KEY"))
    if not api_key_configured:
        return TrendingOut(gainers=None, losers=None, most_active=None, api_key_configured=False)
    return TrendingOut(
        gainers=get_gainers(),
        losers=get_losers(),
        most_active=get_most_active(),
        api_key_configured=True,
    )
```

- [ ] **Step 9: Register the router**

In `backend/app/main.py`, change the import line `from app.routers import fx, holdings, market_data, portfolios, prices, watchlist` to `from app.routers import fx, holdings, market, market_data, portfolios, prices, watchlist`, and add `app.include_router(market.router)` alongside the other `app.include_router(...)` calls.

- [ ] **Step 10: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_market_router.py -v`
Expected: PASS (3 tests)

- [ ] **Step 11: Run the full backend suite**

Run: `cd backend && python -m pytest`
Expected: All pass (124 pre-existing + 8 trending_service + 3 router = 135).

- [ ] **Step 12: Commit**

```bash
git add backend/app/trending_service.py backend/app/routers/market.py backend/app/schemas.py backend/app/main.py backend/tests/test_trending_service.py backend/tests/test_market_router.py
git commit -m "feat: add trending service and the market-trending endpoint"
```

---

### Task 2: Frontend — trending data hook, tab, and WatchlistPage wiring

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/client.test.ts`
- Create: `frontend/src/hooks/useTrendingData.ts`
- Create: `frontend/src/hooks/useTrendingData.test.tsx`
- Create: `frontend/src/components/TrendingStocksToday.tsx`
- Create: `frontend/src/components/TrendingStocksToday.test.tsx`
- Modify: `frontend/src/pages/WatchlistPage.tsx`
- Modify: `frontend/src/pages/WatchlistPage.test.tsx`

**Interfaces:**
- Consumes: Task 1's `GET /market/trending`; the existing `useWatchlist` (for `items` and `create`), `TabStrip`, `formatSignedPercent`/`formatNumber`.
- Produces: `TrendingRow { ticker: string; name: string; price: number | null; change_pct: number | null }`, `TrendingData { gainers: TrendingRow[] | null; losers: TrendingRow[] | null; most_active: TrendingRow[] | null; api_key_configured: boolean }`; `getTrending(): Promise<TrendingData>`; `useTrendingData()` returning `{ data: TrendingData | null; loading: boolean; error: string | null; refresh: () => Promise<void> }`.

- [ ] **Step 1: Add the types**

Append to `frontend/src/api/types.ts`:

```ts
export interface TrendingRow {
  ticker: string;
  name: string;
  price: number | null;
  change_pct: number | null;
}

export interface TrendingData {
  gainers: TrendingRow[] | null;
  losers: TrendingRow[] | null;
  most_active: TrendingRow[] | null;
  api_key_configured: boolean;
}
```

- [ ] **Step 2: Write the failing client test**

Add `getTrending` to the existing `import { ... } from './client'` list in `frontend/src/api/client.test.ts`, and add this test inside the existing `describe('api client', ...)` block:

```ts
  it('getTrending calls GET /market/trending', async () => {
    mockFetchOnce({ gainers: [], losers: [], most_active: [], api_key_configured: true });

    const result = await getTrending();

    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/market/trending', expect.objectContaining({ method: undefined }));
    expect(result.api_key_configured).toBe(true);
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/api/client.test.ts`
Expected: FAIL — `getTrending is not defined`

- [ ] **Step 4: Implement `getTrending`**

Add `TrendingData` to the existing `import type { ... } from './types'` block in `frontend/src/api/client.ts`, and append:

```ts
export function getTrending(): Promise<TrendingData> {
  return request<TrendingData>('/market/trending');
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/api/client.test.ts`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 6: Write the failing tests for `useTrendingData`**

```tsx
// frontend/src/hooks/useTrendingData.test.tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { useTrendingData } from './useTrendingData';

describe('useTrendingData', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with no data, not loading, no error', () => {
    const { result } = renderHook(() => useTrendingData());

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('issues no request until refresh is called', () => {
    const getTrendingSpy = vi.spyOn(client, 'getTrending');

    renderHook(() => useTrendingData());

    expect(getTrendingSpy).not.toHaveBeenCalled();
  });

  it('fetches and stores the data on refresh', async () => {
    const payload = {
      gainers: [{ ticker: 'AAPL', name: 'Apple Inc.', price: 195.5, change_pct: 4.2 }],
      losers: [],
      most_active: [],
      api_key_configured: true,
    };
    vi.spyOn(client, 'getTrending').mockResolvedValue(payload);

    const { result } = renderHook(() => useTrendingData());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.data).toEqual(payload);
    expect(result.current.loading).toBe(false);
  });

  it('sets an error and leaves data null when the request fails', async () => {
    vi.spyOn(client, 'getTrending').mockRejectedValue(new client.ApiError(502, 'upstream error'));

    const { result } = renderHook(() => useTrendingData());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBe('upstream error');
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('clears a previous error on a successful refresh', async () => {
    vi.spyOn(client, 'getTrending')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ gainers: [], losers: [], most_active: [], api_key_configured: true });

    const { result } = renderHook(() => useTrendingData());

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBe('boom');

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBeNull();
  });
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/hooks/useTrendingData.test.tsx`
Expected: FAIL — `Cannot find module './useTrendingData'`

- [ ] **Step 8: Implement `useTrendingData`**

```ts
// frontend/src/hooks/useTrendingData.ts
import { useCallback, useState } from 'react';
import { getTrending } from '../api/client';
import type { TrendingData } from '../api/types';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useTrendingData() {
  const [data, setData] = useState<TrendingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getTrending();
      setData(result);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, refresh };
}

export type TrendingDataState = ReturnType<typeof useTrendingData>;
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/hooks/useTrendingData.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 10: Write the failing tests for `TrendingStocksToday`**

```tsx
// frontend/src/components/TrendingStocksToday.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { useTrendingData } from '../hooks/useTrendingData';
import { TrendingStocksToday } from './TrendingStocksToday';

function Wrapper() {
  const scanState = useTrendingData();
  return <TrendingStocksToday scanState={scanState} />;
}

describe('TrendingStocksToday', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a Refresh button and issues no request until it is pressed', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);
    const getTrendingSpy = vi.spyOn(client, 'getTrending');

    render(<Wrapper />);

    await waitFor(() => expect(screen.getByRole('button', { name: /^refresh$/i })).toBeInTheDocument());
    expect(getTrendingSpy).not.toHaveBeenCalled();
  });

  it('shows a configuration message and no lists when the API key is not set', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);
    vi.spyOn(client, 'getTrending').mockResolvedValue({ gainers: null, losers: null, most_active: null, api_key_configured: false });

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^refresh$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));

    await waitFor(() => expect(screen.getByText(/FMP_API_KEY/i)).toBeInTheDocument());
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders gainers, losers, and most-active rows with ticker, name, price, and change', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);
    vi.spyOn(client, 'getTrending').mockResolvedValue({
      gainers: [{ ticker: 'AAPL', name: 'Apple Inc.', price: 195.5, change_pct: 4.2 }],
      losers: [{ ticker: 'XYZ', name: 'Xyz Corp.', price: 10.0, change_pct: -6.1 }],
      most_active: [{ ticker: 'SPY', name: 'SPDR S&P 500', price: 550.0, change_pct: 0.5 }],
      api_key_configured: true,
    });

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^refresh$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));

    await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    expect(screen.getByText('195.50')).toBeInTheDocument();
    expect(screen.getByText('4.20%')).toBeInTheDocument();
    expect(screen.getByText('XYZ')).toBeInTheDocument();
    expect(screen.getByText('-6.10%')).toBeInTheDocument();
    expect(screen.getByText('SPY')).toBeInTheDocument();
  });

  it('adds a ticker to the Watchlist when its row button is clicked', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'createWatchlistItem').mockResolvedValue({ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' });
    vi.spyOn(client, 'getTrending').mockResolvedValue({
      gainers: [{ ticker: 'AAPL', name: 'Apple Inc.', price: 195.5, change_pct: 4.2 }],
      losers: [],
      most_active: [],
      api_key_configured: true,
    });

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^refresh$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));
    await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /add to watchlist/i }));

    // useWatchlist.create() spreads its input straight into createWatchlistItem (only overriding
    // ticker's casing) — since this component's onAdd calls create({ ticker }) with no category
    // key at all, the resulting call has no category key either, not category: null.
    await waitFor(() => expect(client.createWatchlistItem).toHaveBeenCalledWith({ ticker: 'AAPL' }));
  });

  it('shows an already-watched row as such instead of an Add button', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getTrending').mockResolvedValue({
      gainers: [{ ticker: 'AAPL', name: 'Apple Inc.', price: 195.5, change_pct: 4.2 }],
      losers: [],
      most_active: [],
      api_key_configured: true,
    });

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^refresh$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));

    await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());
    expect(screen.getByText(/already watched/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add to watchlist/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 11: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/TrendingStocksToday.test.tsx`
Expected: FAIL — `Cannot find module './TrendingStocksToday'`

- [ ] **Step 12: Implement `TrendingStocksToday`**

```tsx
// frontend/src/components/TrendingStocksToday.tsx
import type { TrendingRow } from '../api/types';
import type { TrendingDataState } from '../hooks/useTrendingData';
import { useWatchlist } from '../hooks/useWatchlist';
import { formatNumber, formatSignedPercent } from '../utils/signalFormatting';

interface TrendingStocksTodayProps {
  scanState: TrendingDataState;
}

interface TrendingListProps {
  title: string;
  rows: TrendingRow[] | null;
  watchedTickers: Set<string>;
  onAdd: (ticker: string) => void;
}

function TrendingList({ title, rows, watchedTickers, onAdd }: TrendingListProps) {
  return (
    <div>
      <h4>{title}</h4>
      {rows === null || rows.length === 0 ? (
        <p>No data.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Name</th>
              <th>Price</th>
              <th>% change</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.ticker}>
                <td>{row.ticker}</td>
                <td>{row.name}</td>
                <td>{formatNumber(row.price)}</td>
                <td>{formatSignedPercent(row.change_pct)}</td>
                <td>
                  {watchedTickers.has(row.ticker) ? (
                    <span>Already watched</span>
                  ) : (
                    <button type="button" onClick={() => onAdd(row.ticker)}>
                      Add to Watchlist
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function TrendingStocksToday({ scanState }: TrendingStocksTodayProps) {
  const { items, create } = useWatchlist();
  const { data, loading, error, refresh } = scanState;
  const watchedTickers = new Set(items.map((item) => item.ticker));

  async function handleAdd(ticker: string) {
    await create({ ticker });
  }

  return (
    <div>
      <h3>Trending Stocks Today</h3>

      <button type="button" onClick={refresh} disabled={loading}>
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>

      {error && <div role="alert">{error}</div>}

      {data && !data.api_key_configured && (
        <p>Set the FMP_API_KEY environment variable to enable Trending Stocks Today.</p>
      )}

      {data && data.api_key_configured && (
        <>
          <TrendingList title="Gainers" rows={data.gainers} watchedTickers={watchedTickers} onAdd={handleAdd} />
          <TrendingList title="Losers" rows={data.losers} watchedTickers={watchedTickers} onAdd={handleAdd} />
          <TrendingList title="Most active" rows={data.most_active} watchedTickers={watchedTickers} onAdd={handleAdd} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 13: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/TrendingStocksToday.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 14: Add the failing test for `WatchlistPage`'s new tab and persistence**

Add these two tests inside the existing `describe('WatchlistPage', ...)` block in `frontend/src/pages/WatchlistPage.test.tsx`:

```tsx
  it('switches to the Trending Stocks Today sub-tab and shows its content', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<WatchlistPage />);
    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Trending Stocks Today' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Trending Stocks Today' })).toBeInTheDocument());
  });

  it('keeps Trending Stocks Today data after switching away and back, with no re-fetch', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);
    vi.spyOn(client, 'getTrending').mockResolvedValue({
      gainers: [{ ticker: 'AAPL', name: 'Apple Inc.', price: 195.5, change_pct: 4.2 }],
      losers: [],
      most_active: [],
      api_key_configured: true,
    });

    render(<WatchlistPage />);
    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Trending Stocks Today' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^refresh$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));
    await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());
    expect(client.getTrending).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Manage Watchlist' }));
    fireEvent.click(screen.getByRole('button', { name: 'Trending Stocks Today' }));

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(client.getTrending).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 15: Run `WatchlistPage.test.tsx` to verify the new tests fail**

Run: `cd frontend && npx vitest run src/pages/WatchlistPage.test.tsx`
Expected: FAIL on the 2 new tests — no "Trending Stocks Today" tab exists yet. All pre-existing tests must still pass.

- [ ] **Step 16: Wire `TrendingStocksToday` into `WatchlistPage`**

In `frontend/src/pages/WatchlistPage.tsx`: add the import `import { TrendingStocksToday } from '../components/TrendingStocksToday';` and `import { useTrendingData } from '../hooks/useTrendingData';`; extend `WatchlistTab` to `'manage' | 'dividend-ranking' | 'momentum' | 'pre-squeeze' | 'trending'`; add `{ id: 'trending', label: 'Trending Stocks Today' }` as the **last** entry in `TABS` (matching the spec's stated order — Manage, Dividend Ranking, Momentum Scanner, Pre-Squeeze Scanner, Trending Stocks Today); add `const trendingData = useTrendingData();` alongside the two existing hoisted hooks; add `{activeTab === 'trending' && <TrendingStocksToday scanState={trendingData} />}` to the render.

- [ ] **Step 17: Run `WatchlistPage.test.tsx` to verify all tests pass**

Run: `cd frontend && npx vitest run src/pages/WatchlistPage.test.tsx`
Expected: PASS (all tests: 8 pre-existing + 2 new = 10)

- [ ] **Step 18: Run the full frontend suite and typecheck**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: All tests pass, `tsc -b` clean.

- [ ] **Step 19: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/api/client.test.ts frontend/src/hooks/useTrendingData.ts frontend/src/hooks/useTrendingData.test.tsx frontend/src/components/TrendingStocksToday.tsx frontend/src/components/TrendingStocksToday.test.tsx frontend/src/pages/WatchlistPage.tsx frontend/src/pages/WatchlistPage.test.tsx
git commit -m "feat: add Trending Stocks Today tab via Financial Modeling Prep"
```

## Self-Review

**1. Spec coverage:** Ticket 7's acceptance criteria map to: FMP as a new dependency behind `FMP_API_KEY` (Task 1 Step 3, matching the `TWELVE_DATA_API_KEY` convention), a single private fetcher (`_fetch_list`, Task 1 Step 3), 3 lists capped at 10 rows (Task 1 Steps 3/6), only-FMP-fields with no per-ticker enrichment (Task 1 Step 3's mapping, no yfinance/history_service import anywhere in this plan), explicit missing-key signal never placeholder data (Task 1 Step 8's `api_key_configured` branch, Task 2 Step 12's distinct message), Add-to-Watchlist button reusing existing mutation (Task 2 Step 12's `create({ ticker })`), already-watched row state (Task 2 Step 12's `watchedTickers` check), endpoint not reading the Watchlist (Task 1's router has no `db: Session` parameter at all, confirmed by contrast with `watchlist.py`'s CRUD routes).

**2. Placeholder scan:** No TBD/TODO markers. All code blocks are complete file contents or complete appended functions.

**3. Type consistency:** `TrendingOut`/`TrendingRowOut` (Task 1 Step 5) match `TrendingData`/`TrendingRow` (Task 2 Step 1) field-for-field. `useTrendingData`'s returned shape (`data`, `loading`, `error`, `refresh`) is declared once (Task 2 Step 8) and consumed by `TrendingStocksTodayProps` (Task 2 Step 12) via the exported `TrendingDataState` type — same pattern as `PriceSignalsScanState`/`DividendScanState`, not redeclared. `WatchlistTab`'s final 5-member union (Task 2 Step 16) and `TABS`'s order are written to match `docs/specs/2026-07-25-watchlist-and-scanners.md`'s explicit stated order exactly, closing the drift Ticket 6's final review had to fix after the fact.
