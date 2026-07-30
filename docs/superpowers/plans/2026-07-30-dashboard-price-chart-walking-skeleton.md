# Dashboard Price Chart Walking Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new Dashboard tab with a ticker dropdown (deduplicated union of Portfolio holdings + Watchlist) and a line chart of that ticker's closing price over a fixed one-year daily window — proving the full pipeline (pick a ticker → fetch real data through a new independent chart service → render it with a newly-added charting library) end-to-end.

**Architecture:** A new backend `chart_service.py`, structurally identical to the existing `history_service.py`/`trending_service.py` (private raw-fetch function behind a cached public function, in-memory cache, `clear_cache()` test hook), feeds a new `GET /market/chart` endpoint. The frontend gets a matching `useChartData` hook (fetch-on-argument-change, like `useHoldings`), a `PriceChart` presentational component wrapping the new `lightweight-charts` library, a `useDashboardTickers` hook composing existing portfolio/holdings/watchlist data into one deduplicated ticker list, and a `DashboardPage` that wires it all together plus a new first-position nav tab in `App.tsx`.

**Tech Stack:** FastAPI, SQLAlchemy, pytest (backend); React 19, TypeScript, Vitest, `@testing-library/react`, new dependency `lightweight-charts` (frontend).

## Global Constraints

- Never fabricate data: a fetch that fails must surface as an explicit "unavailable" state (`points: null` from the API, an error string in the UI) — never a 500, never a blank-but-successful-looking chart.
- `history_service.py` is not touched, reused, or extended by this work — `chart_service.py` is fully independent (see spec's Implementation Decisions).
- The endpoint accepts a `range` query parameter from day one, threaded through end to end, even though this ticket only ever sends `"1Y"` — so Ticket 2 (range selector) needs no API-shape change.
- No candlestick rendering, no support/resistance, no 3-column mockup layout, no moving the DCA/stress-test calculators out of `HoldingRow` — out of scope for this ticket (see spec's Out of Scope).
- Follow this project's existing hook shape (`{ data/items/holdings, loading, error }`, `toMessage(err)` helper) and service shape (private `_fetch_from_provider`, cached public getter, `clear_cache()`) exactly — do not invent new shapes.

---

### Task 1: Backend — chart data service and endpoint

**Files:**
- Create: `backend/app/chart_service.py`
- Create: `backend/tests/test_chart_service.py`
- Modify: `backend/app/schemas.py` (append `ChartPointOut`, `ChartOut`)
- Modify: `backend/app/routers/market.py` (append `GET /market/chart`)
- Modify: `backend/tests/test_market_router.py` (append chart endpoint tests)

**Interfaces:**
- Consumes: nothing from other tasks — this task is backend-only and self-contained.
- Produces: `GET /market/chart?ticker=<TICKER>&range=1Y` → JSON `{"points": [{"time": "2026-01-02", "close": 100.0}, ...] | null}`. `chart_service.get_chart_data(ticker: str, range_: Literal["1Y"]) -> list[ChartPoint] | None` and `chart_service.clear_cache() -> None`, where `ChartPoint = TypedDict("ChartPoint", {"time": str, "close": float})`. Later tasks (frontend) consume this HTTP contract only, not the Python functions directly.

- [ ] **Step 1: Write the failing tests for `chart_service.py`**

Create `backend/tests/test_chart_service.py`:

```python
# backend/tests/test_chart_service.py
import pytest

from app import chart_service


@pytest.fixture(autouse=True)
def _clear_cache():
    chart_service.clear_cache()
    yield
    chart_service.clear_cache()


SAMPLE_POINTS = [
    {"time": "2026-01-02", "close": 100.0},
    {"time": "2026-01-05", "close": 101.5},
]


def test_get_chart_data_returns_fetched_points(monkeypatch):
    monkeypatch.setattr(chart_service, "_fetch_from_provider", lambda ticker, range_: SAMPLE_POINTS)

    result = chart_service.get_chart_data("VTI", "1Y")

    assert result == SAMPLE_POINTS


def test_get_chart_data_returns_none_when_fetch_fails(monkeypatch):
    monkeypatch.setattr(chart_service, "_fetch_from_provider", lambda ticker, range_: None)

    result = chart_service.get_chart_data("BADTICKER", "1Y")

    assert result is None


def test_get_chart_data_caches_and_does_not_refetch_within_ttl(monkeypatch):
    call_count = {"n": 0}

    def fake_fetch(ticker, range_):
        call_count["n"] += 1
        return SAMPLE_POINTS

    monkeypatch.setattr(chart_service, "_fetch_from_provider", fake_fetch)

    first = chart_service.get_chart_data("VTI", "1Y")
    second = chart_service.get_chart_data("VTI", "1Y")

    assert first == SAMPLE_POINTS
    assert second == SAMPLE_POINTS
    assert call_count["n"] == 1


def test_get_chart_data_refetches_after_ttl_expires(monkeypatch):
    monkeypatch.setattr(chart_service, "_fetch_from_provider", lambda ticker, range_: SAMPLE_POINTS)

    fake_time = {"t": 1000.0}
    monkeypatch.setattr(chart_service.time, "monotonic", lambda: fake_time["t"])

    chart_service.get_chart_data("VTI", "1Y")

    fake_time["t"] += chart_service.CACHE_TTL_SECONDS + 1

    call_count = {"n": 0}

    def fake_fetch_second(ticker, range_):
        call_count["n"] += 1
        return SAMPLE_POINTS

    monkeypatch.setattr(chart_service, "_fetch_from_provider", fake_fetch_second)

    chart_service.get_chart_data("VTI", "1Y")

    assert call_count["n"] == 1


def test_get_chart_data_caches_different_tickers_separately(monkeypatch):
    calls = []

    def fake_fetch(ticker, range_):
        calls.append(ticker)
        return SAMPLE_POINTS

    monkeypatch.setattr(chart_service, "_fetch_from_provider", fake_fetch)

    chart_service.get_chart_data("VTI", "1Y")
    chart_service.get_chart_data("SPY", "1Y")
    chart_service.get_chart_data("VTI", "1Y")
    chart_service.get_chart_data("SPY", "1Y")

    assert calls == ["VTI", "SPY"]


def test_a_failed_fetch_is_not_cached(monkeypatch):
    monkeypatch.setattr(chart_service, "_fetch_from_provider", lambda ticker, range_: None)

    chart_service.get_chart_data("BADTICKER", "1Y")

    call_count = {"n": 0}

    def fake_fetch(ticker, range_):
        call_count["n"] += 1
        return SAMPLE_POINTS

    monkeypatch.setattr(chart_service, "_fetch_from_provider", fake_fetch)

    result = chart_service.get_chart_data("BADTICKER", "1Y")

    assert result == SAMPLE_POINTS
    assert call_count["n"] == 1


def test_fetch_from_provider_maps_yfinance_rows_to_time_and_close(monkeypatch):
    import pandas as pd

    index = pd.to_datetime(["2026-01-02", "2026-01-05"])
    history = pd.DataFrame({"Close": [100.0, 101.5]}, index=index)

    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period, interval):
            return history

    import yfinance as yf

    monkeypatch.setattr(yf, "Ticker", FakeTicker)

    result = chart_service._fetch_from_provider("VTI", "1Y")

    assert result == [
        {"time": "2026-01-02", "close": 100.0},
        {"time": "2026-01-05", "close": 101.5},
    ]


def test_fetch_from_provider_returns_none_for_an_empty_history(monkeypatch):
    import pandas as pd

    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period, interval):
            return pd.DataFrame()

    import yfinance as yf

    monkeypatch.setattr(yf, "Ticker", FakeTicker)

    result = chart_service._fetch_from_provider("BADTICKER", "1Y")

    assert result is None


def test_fetch_from_provider_returns_none_when_yfinance_raises(monkeypatch):
    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period, interval):
            raise Exception("network error")

    import yfinance as yf

    monkeypatch.setattr(yf, "Ticker", FakeTicker)

    result = chart_service._fetch_from_provider("VTI", "1Y")

    assert result is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_chart_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.chart_service'` (or `AttributeError`, since `chart_service.py` does not exist yet).

- [ ] **Step 3: Implement `chart_service.py`**

Create `backend/app/chart_service.py`:

```python
# backend/app/chart_service.py
import time
from typing import Literal, TypedDict

# Matches history_service.py's TTL. This is a separate, independent cache from
# history_service.py's — this file exists specifically so a range-driven chart fetch never has
# to be taught into history_service.py's fixed 1-year-daily shape (see the spec's Implementation
# Decisions for why the two are kept apart).
CACHE_TTL_SECONDS = 900.0

ChartRange = Literal["1Y"]

# range -> (yfinance period, yfinance interval). Only "1Y" exists in this ticket; the range
# selector ticket widens ChartRange and this table together, with no other code change needed.
RANGE_TO_YFINANCE: dict[str, tuple[str, str]] = {
    "1Y": ("1y", "1d"),
}


class ChartPoint(TypedDict):
    time: str
    close: float


_cache: dict[tuple[str, str], tuple[list[ChartPoint], float]] = {}


def clear_cache() -> None:
    _cache.clear()


def _get_cached(ticker: str, range_: str) -> list[ChartPoint] | None:
    entry = _cache.get((ticker, range_))
    if entry is None:
        return None
    points, fetched_at = entry
    if time.monotonic() - fetched_at > CACHE_TTL_SECONDS:
        return None
    return points


def _set_cached(ticker: str, range_: str, points: list[ChartPoint]) -> None:
    _cache[(ticker, range_)] = (points, time.monotonic())


def _fetch_from_provider(ticker: str, range_: str) -> list[ChartPoint] | None:
    import yfinance as yf

    period, interval = RANGE_TO_YFINANCE[range_]
    try:
        history = yf.Ticker(ticker).history(period=period, interval=interval)
        if history.empty:
            return None
        return [
            {"time": row.Index.strftime("%Y-%m-%d"), "close": float(row.Close)}
            for row in history.itertuples()
        ]
    except Exception:
        return None


def get_chart_data(ticker: str, range_: ChartRange) -> list[ChartPoint] | None:
    cached = _get_cached(ticker, range_)
    if cached is not None:
        return cached

    points = _fetch_from_provider(ticker, range_)
    if points is not None:
        _set_cached(ticker, range_, points)

    return points
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_chart_service.py -v`
Expected: PASS (9 tests)

- [ ] **Step 5: Write the failing tests for the endpoint**

Read `backend/app/schemas.py` and `backend/app/routers/market.py` first to see the exact existing `TrendingOut`/`get_trending` shape you are matching.

Append to `backend/tests/test_market_router.py`:

```python
def test_get_chart_returns_points_for_a_ticker(client):
    points = [{"time": "2026-01-02", "close": 100.0}, {"time": "2026-01-05", "close": 101.5}]

    with patch("app.routers.market.get_chart_data", return_value=points):
        response = client.get("/market/chart?ticker=VTI&range=1Y")

    assert response.status_code == 200
    assert response.json() == {"points": points}


def test_get_chart_reports_unavailable_when_fetch_fails(client):
    with patch("app.routers.market.get_chart_data", return_value=None):
        response = client.get("/market/chart?ticker=BADTICKER&range=1Y")

    assert response.status_code == 200
    assert response.json() == {"points": None}


def test_get_chart_passes_ticker_and_range_through(client):
    with patch("app.routers.market.get_chart_data", return_value=[]) as mock_get_chart_data:
        client.get("/market/chart?ticker=VTI&range=1Y")

    mock_get_chart_data.assert_called_once_with("VTI", "1Y")
```

(`test_market_router.py` already imports `from unittest.mock import patch` at the top — do not add a second import line.)

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_market_router.py -v -k chart`
Expected: FAIL — 404 (no `/market/chart` route yet) or `AttributeError: module 'app.routers.market' has no attribute 'get_chart_data'`.

- [ ] **Step 7: Add schemas and wire the endpoint**

In `backend/app/schemas.py`, append after the existing `TrendingOut` class:

```python
class ChartPointOut(BaseModel):
    time: str
    close: float


class ChartOut(BaseModel):
    points: list[ChartPointOut] | None
```

In `backend/app/routers/market.py`, the full file becomes:

```python
import os
from typing import Literal

from fastapi import APIRouter

from app.chart_service import get_chart_data
from app.schemas import ChartOut, TrendingOut
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


@router.get("/chart", response_model=ChartOut)
def get_chart(ticker: str, range: Literal["1Y"] = "1Y"):
    points = get_chart_data(ticker, range)
    return ChartOut(points=points)
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd backend && python -m pytest -q`
Expected: PASS, all tests (147 pre-existing + 9 chart_service + 3 chart router = 159)

- [ ] **Step 9: Commit**

```bash
git add backend/app/chart_service.py backend/tests/test_chart_service.py backend/app/schemas.py backend/app/routers/market.py backend/tests/test_market_router.py
git commit -m "feat: add chart_service and GET /market/chart endpoint"
```

---

### Task 2: Frontend — API client and `useChartData` hook

**Files:**
- Modify: `frontend/src/api/types.ts` (append `ChartRange`, `ChartPoint`, `ChartData`)
- Modify: `frontend/src/api/client.ts` (append `getChartData`)
- Modify: `frontend/src/api/client.test.ts` (append `getChartData` test, add import)
- Create: `frontend/src/hooks/useChartData.ts`
- Create: `frontend/src/hooks/useChartData.test.tsx`

**Interfaces:**
- Consumes: `GET /market/chart?ticker=X&range=Y` from Task 1, returning `{"points": [{"time": string, "close": number}, ...] | null}`.
- Produces: `getChartData(ticker: string, range: ChartRange): Promise<ChartData>` from `frontend/src/api/client.ts`. `useChartData(ticker: string | null, range: ChartRange)` returning `{ points: ChartPoint[] | null, loading: boolean, error: string | null }`, exported from `frontend/src/hooks/useChartData.ts`. Task 3 (`PriceChart`) consumes this return shape as props. Task 4 (`DashboardPage`) calls this hook directly.

- [ ] **Step 1: Write the failing test for `getChartData`**

Read `frontend/src/api/client.test.ts`'s existing `getTrending` test first (near the bottom of the file) to match its exact style.

In `frontend/src/api/client.test.ts`, add `getChartData` to the existing import block from `'./client'`, and append this test at the end of the `describe('api client', ...)` block, just before its closing `});`:

```ts
  it('getChartData calls GET /market/chart with ticker and range', async () => {
    mockFetchOnce({ points: [{ time: '2026-01-02', close: 100 }] });

    const result = await getChartData('VTI', '1Y');

    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/market/chart?ticker=VTI&range=1Y', expect.objectContaining({ method: undefined }));
    expect(result).toEqual({ points: [{ time: '2026-01-02', close: 100 }] });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/api/client.test.ts`
Expected: FAIL — `getChartData is not defined` (TypeScript compile error surfaced by Vitest, or an import error).

- [ ] **Step 3: Add the types and client function**

In `frontend/src/api/types.ts`, append at the end of the file:

```ts
export type ChartRange = '1Y';

export interface ChartPoint {
  time: string;
  close: number;
}

export interface ChartData {
  points: ChartPoint[] | null;
}
```

In `frontend/src/api/client.ts`, add `ChartData` and `ChartRange` to the existing `import type { ... } from './types'` block (alphabetical, matching the existing ordering), and append this function at the end of the file:

```ts
export function getChartData(ticker: string, range: ChartRange): Promise<ChartData> {
  return request<ChartData>(`/market/chart?ticker=${encodeURIComponent(ticker)}&range=${range}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/api/client.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing tests for `useChartData`**

Read `frontend/src/hooks/useHoldings.ts` and `frontend/src/hooks/useHoldings.test.tsx` first — `useChartData` follows the same "fetch on argument change via `useEffect`" shape, not the manual-`refresh()` shape of `useTrendingData`.

Create `frontend/src/hooks/useChartData.test.tsx`:

```tsx
// frontend/src/hooks/useChartData.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { useChartData } from './useChartData';

describe('useChartData', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('issues no request and has no data while ticker is null', () => {
    const getChartDataSpy = vi.spyOn(client, 'getChartData');

    const { result } = renderHook(() => useChartData(null, '1Y'));

    expect(getChartDataSpy).not.toHaveBeenCalled();
    expect(result.current.points).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('fetches and stores points once a ticker is provided', async () => {
    const points = [{ time: '2026-01-02', close: 100 }];
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points });

    const { result } = renderHook(() => useChartData('VTI', '1Y'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(client.getChartData).toHaveBeenCalledWith('VTI', '1Y');
    expect(result.current.points).toEqual(points);
    expect(result.current.error).toBeNull();
  });

  it('refetches when the ticker changes', async () => {
    vi.spyOn(client, 'getChartData')
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', close: 100 }] })
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', close: 400 }] });

    const { result, rerender } = renderHook(({ ticker }) => useChartData(ticker, '1Y'), {
      initialProps: { ticker: 'VTI' as string | null },
    });
    await waitFor(() => expect(result.current.points).toEqual([{ time: '2026-01-02', close: 100 }]));

    rerender({ ticker: 'SPY' });

    await waitFor(() => expect(client.getChartData).toHaveBeenLastCalledWith('SPY', '1Y'));
    await waitFor(() => expect(result.current.points).toEqual([{ time: '2026-01-02', close: 400 }]));
  });

  it('sets an explicit error and null points when the API reports the ticker unavailable', async () => {
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: null });

    const { result } = renderHook(() => useChartData('BADTICKER', '1Y'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.points).toBeNull();
    expect(result.current.error).toContain('BADTICKER');
  });

  it('sets an error and null points when the request throws', async () => {
    vi.spyOn(client, 'getChartData').mockRejectedValue(new client.ApiError(502, 'upstream error'));

    const { result } = renderHook(() => useChartData('VTI', '1Y'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.points).toBeNull();
    expect(result.current.error).toBe('upstream error');
  });

  it('a stale in-flight request cannot overwrite a newer selection', async () => {
    let resolveFirst!: (value: { points: client.ChartData['points'] }) => void;
    const firstPromise = new Promise<{ points: client.ChartData['points'] }>((resolve) => {
      resolveFirst = resolve;
    });
    vi.spyOn(client, 'getChartData')
      .mockReturnValueOnce(firstPromise as Promise<client.ChartData>)
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', close: 400 }] });

    const { result, rerender } = renderHook(({ ticker }) => useChartData(ticker, '1Y'), {
      initialProps: { ticker: 'VTI' as string | null },
    });

    rerender({ ticker: 'SPY' });
    await waitFor(() => expect(result.current.points).toEqual([{ time: '2026-01-02', close: 400 }]));

    // The abandoned VTI request now resolves late — it must not overwrite SPY's already-landed data.
    resolveFirst({ points: [{ time: '2026-01-02', close: 100 }] });

    expect(result.current.points).toEqual([{ time: '2026-01-02', close: 400 }]);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/hooks/useChartData.test.tsx`
Expected: FAIL — `Failed to resolve import "./useChartData"`.

- [ ] **Step 7: Implement `useChartData`**

Create `frontend/src/hooks/useChartData.ts`:

```ts
// frontend/src/hooks/useChartData.ts
import { useEffect, useRef, useState } from 'react';
import { getChartData } from '../api/client';
import type { ChartPoint, ChartRange } from '../api/types';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useChartData(ticker: string | null, range: ChartRange) {
  const [points, setPoints] = useState<ChartPoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Each fetch is tagged with an incrementing id. A response is only applied if it's still the
  // most recent request in flight — otherwise a slow, abandoned request for a since-replaced
  // ticker could land after a newer one and relabel the chart with the wrong ticker's data.
  const requestId = useRef(0);

  useEffect(() => {
    if (ticker === null) {
      setPoints(null);
      setLoading(false);
      setError(null);
      return;
    }

    const thisRequestId = ++requestId.current;
    setLoading(true);
    setError(null);

    getChartData(ticker, range)
      .then((data) => {
        if (requestId.current !== thisRequestId) return;
        if (data.points === null) {
          setPoints(null);
          setError(`No chart data available for ${ticker}.`);
        } else {
          setPoints(data.points);
        }
      })
      .catch((err) => {
        if (requestId.current !== thisRequestId) return;
        setPoints(null);
        setError(toMessage(err));
      })
      .finally(() => {
        if (requestId.current !== thisRequestId) return;
        setLoading(false);
      });
  }, [ticker, range]);

  return { points, loading, error };
}

export type ChartDataState = ReturnType<typeof useChartData>;
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/hooks/useChartData.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 9: Run the full frontend suite and type check**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: all tests PASS, `tsc` exits with no output.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/api/client.test.ts frontend/src/hooks/useChartData.ts frontend/src/hooks/useChartData.test.tsx
git commit -m "feat: add getChartData client function and useChartData hook"
```

---

### Task 3: Frontend — `lightweight-charts` dependency and `PriceChart` component

**Files:**
- Modify: `frontend/package.json` (add `lightweight-charts` dependency)
- Create: `frontend/src/components/PriceChart.tsx`
- Create: `frontend/src/components/PriceChart.test.tsx`

**Interfaces:**
- Consumes: `ChartPoint` type from `frontend/src/api/types.ts` (Task 2). Does not consume `useChartData` directly — it receives already-fetched data as props, matching this codebase's hook/presentational-component split.
- Produces: `PriceChart({ points, loading, error }: { points: ChartPoint[] | null; loading: boolean; error: string | null })` from `frontend/src/components/PriceChart.tsx`. Task 4 (`DashboardPage`) renders this component, passing `useChartData`'s return values straight through as props.

- [ ] **Step 1: Install the dependency**

Run: `cd frontend && npm install lightweight-charts`
Expected: `frontend/package.json`'s `dependencies` gains a `"lightweight-charts": "^..."` entry, and `package-lock.json` updates.

- [ ] **Step 2: Write the failing tests for `PriceChart`**

Create `frontend/src/components/PriceChart.test.tsx`:

```tsx
// frontend/src/components/PriceChart.test.tsx
import { render, screen } from '@testing-library/react';
import { createChart } from 'lightweight-charts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PriceChart } from './PriceChart';

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(),
}));

describe('PriceChart', () => {
  let setData: ReturnType<typeof vi.fn>;
  let addLineSeries: ReturnType<typeof vi.fn>;
  let remove: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setData = vi.fn();
    addLineSeries = vi.fn(() => ({ setData }));
    remove = vi.fn();
    vi.mocked(createChart).mockReturnValue({ addLineSeries, remove } as unknown as ReturnType<typeof createChart>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a chart with a single line series on mount', () => {
    render(<PriceChart points={null} loading={false} error={null} />);

    expect(createChart).toHaveBeenCalledTimes(1);
    expect(addLineSeries).toHaveBeenCalledTimes(1);
  });

  it('calls setData with close mapped to value when points are provided', () => {
    render(
      <PriceChart
        points={[
          { time: '2026-01-02', close: 100 },
          { time: '2026-01-05', close: 101.5 },
        ]}
        loading={false}
        error={null}
      />,
    );

    expect(setData).toHaveBeenCalledWith([
      { time: '2026-01-02', value: 100 },
      { time: '2026-01-05', value: 101.5 },
    ]);
  });

  it('does not call setData when points is null', () => {
    render(<PriceChart points={null} loading={false} error={null} />);

    expect(setData).not.toHaveBeenCalled();
  });

  it('shows a loading status while loading', () => {
    render(<PriceChart points={null} loading={true} error={null} />);

    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
  });

  it('shows an error message when error is set', () => {
    render(<PriceChart points={null} loading={false} error="No chart data available for BADTICKER." />);

    expect(screen.getByRole('alert')).toHaveTextContent('No chart data available for BADTICKER.');
  });

  it('removes the chart on unmount', () => {
    const { unmount } = render(<PriceChart points={null} loading={false} error={null} />);

    unmount();

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/PriceChart.test.tsx`
Expected: FAIL — `Failed to resolve import "./PriceChart"`.

- [ ] **Step 4: Implement `PriceChart`**

Create `frontend/src/components/PriceChart.tsx`:

```tsx
// frontend/src/components/PriceChart.tsx
import { createChart, type IChartApi, type ISeriesApi } from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import type { ChartPoint } from '../api/types';

interface PriceChartProps {
  points: ChartPoint[] | null;
  loading: boolean;
  error: string | null;
}

export function PriceChart({ points, loading, error }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart: IChartApi = createChart(containerRef.current, { width: 600, height: 300 });
    const series = chart.addLineSeries();
    seriesRef.current = series;
    return () => {
      chart.remove();
      seriesRef.current = null;
    };
    // Created once on mount; PriceChart is remounted by its parent when that's needed (matches
    // this codebase's existing pattern of remount-over-manual-teardown for provider-backed UI).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (seriesRef.current === null || points === null) return;
    seriesRef.current.setData(points.map((point) => ({ time: point.time, value: point.close })));
  }, [points]);

  return (
    <div>
      {loading && <div role="status">Loading chart…</div>}
      {error && <div role="alert">{error}</div>}
      <div ref={containerRef} />
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/PriceChart.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 6: Run the full frontend suite and type check**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: all tests PASS, `tsc` exits with no output.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/PriceChart.tsx frontend/src/components/PriceChart.test.tsx
git commit -m "feat: add lightweight-charts and the PriceChart component"
```

---

### Task 4: Frontend — `useDashboardTickers`, `DashboardPage`, and nav wiring

**Files:**
- Create: `frontend/src/hooks/useDashboardTickers.ts`
- Create: `frontend/src/hooks/useDashboardTickers.test.tsx`
- Create: `frontend/src/pages/DashboardPage.tsx`
- Create: `frontend/src/pages/DashboardPage.test.tsx`
- Modify: `frontend/src/App.tsx` (add the Dashboard tab, positioned first)
- Modify: `frontend/src/App.test.tsx` (add a test for the new tab)

**Interfaces:**
- Consumes: `usePortfolios()` (`{ portfolios, loading }`, from `frontend/src/hooks/usePortfolios.ts`), `listHoldings(portfolioId: number): Promise<Holding[]>` (from `frontend/src/api/client.ts`), `useWatchlist()` (`{ items, loading }`, from `frontend/src/hooks/useWatchlist.ts`), `useChartData` and `PriceChart` from Tasks 2 and 3.
- Produces: `useDashboardTickers()` returning `{ tickers: string[], loading: boolean }` — a sorted, deduplicated union of every ticker across all portfolios' holdings and the Watchlist. `DashboardPage` composes everything into the tab's UI. Nothing later in this ticket consumes these — this is the final integration task.

- [ ] **Step 1: Write the failing tests for `useDashboardTickers`**

Read `frontend/src/hooks/usePortfolios.ts` and `frontend/src/hooks/useWatchlist.ts` first to confirm their exact return shapes (`{ portfolios, loading, ... }` and `{ items, loading, ... }`).

Create `frontend/src/hooks/useDashboardTickers.test.tsx`:

```tsx
// frontend/src/hooks/useDashboardTickers.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { useDashboardTickers } from './useDashboardTickers';

const portfolioA = { id: 1, name: 'A', cash_usd: 0, target_allocation_pct: null, created_at: '2026-01-01T00:00:00Z' };
const portfolioB = { id: 2, name: 'B', cash_usd: 0, target_allocation_pct: null, created_at: '2026-01-01T00:00:00Z' };

function holding(ticker: string, portfolioId: number) {
  return {
    id: 1,
    portfolio_id: portfolioId,
    ticker,
    shares: 1,
    avg_cost_usd: 1,
    target_allocation_pct: null,
    realized_pnl_usd: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('useDashboardTickers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the deduplicated, sorted union of holdings tickers across all portfolios and watchlist tickers', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([portfolioA, portfolioB]);
    vi.spyOn(client, 'listHoldings').mockImplementation(async (portfolioId) =>
      portfolioId === 1 ? [holding('VTI', 1), holding('SPY', 1)] : [holding('SPY', 2)],
    );
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 2, ticker: 'VTI', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);

    const { result } = renderHook(() => useDashboardTickers());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tickers).toEqual(['AAPL', 'SPY', 'VTI']);
  });

  it('is loading until portfolios, their holdings, and the watchlist have all resolved', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([portfolioA]);
    vi.spyOn(client, 'listHoldings').mockResolvedValue([holding('VTI', 1)]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    const { result } = renderHook(() => useDashboardTickers());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('returns an empty list without calling listHoldings when there are no portfolios', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    const listHoldingsSpy = vi.spyOn(client, 'listHoldings');
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    const { result } = renderHook(() => useDashboardTickers());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tickers).toEqual([]);
    expect(listHoldingsSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/hooks/useDashboardTickers.test.tsx`
Expected: FAIL — `Failed to resolve import "./useDashboardTickers"`.

- [ ] **Step 3: Implement `useDashboardTickers`**

Create `frontend/src/hooks/useDashboardTickers.ts`:

```ts
// frontend/src/hooks/useDashboardTickers.ts
import { useEffect, useState } from 'react';
import { listHoldings } from '../api/client';
import { usePortfolios } from './usePortfolios';
import { useWatchlist } from './useWatchlist';

export function useDashboardTickers() {
  const { portfolios, loading: portfoliosLoading } = usePortfolios();
  const { items: watchlistItems, loading: watchlistLoading } = useWatchlist();
  const [holdingTickers, setHoldingTickers] = useState<string[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(true);

  useEffect(() => {
    if (portfoliosLoading) return;

    if (portfolios.length === 0) {
      setHoldingTickers([]);
      setHoldingsLoading(false);
      return;
    }

    let cancelled = false;
    setHoldingsLoading(true);

    Promise.all(portfolios.map((portfolio) => listHoldings(portfolio.id)))
      .then((results) => {
        if (cancelled) return;
        setHoldingTickers(results.flat().map((holding) => holding.ticker));
      })
      .catch(() => {
        if (cancelled) return;
        setHoldingTickers([]);
      })
      .finally(() => {
        if (cancelled) return;
        setHoldingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [portfolios, portfoliosLoading]);

  const tickers = Array.from(new Set([...holdingTickers, ...watchlistItems.map((item) => item.ticker)])).sort();
  const loading = portfoliosLoading || watchlistLoading || holdingsLoading;

  return { tickers, loading };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/hooks/useDashboardTickers.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing tests for `DashboardPage`**

Create `frontend/src/pages/DashboardPage.test.tsx`:

```tsx
// frontend/src/pages/DashboardPage.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createChart } from 'lightweight-charts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { DashboardPage } from './DashboardPage';

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(),
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(createChart).mockReturnValue({
      addLineSeries: vi.fn(() => ({ setData: vi.fn() })),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a ticker dropdown with none selected, listing the deduplicated union of holdings and watchlist tickers', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([
      { id: 1, name: 'Core', cash_usd: 0, target_allocation_pct: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'listHoldings').mockResolvedValue([
      {
        id: 1,
        portfolio_id: 1,
        ticker: 'VTI',
        shares: 1,
        avg_cost_usd: 1,
        target_allocation_pct: null,
        realized_pnl_usd: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/ticker/i)).toHaveValue('');
    expect(screen.getByRole('option', { name: 'VTI' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'AAPL' })).toBeInTheDocument();
  });

  it('issues no chart request until a ticker is selected', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    const getChartDataSpy = vi.spyOn(client, 'getChartData');

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    expect(getChartDataSpy).not.toHaveBeenCalled();
  });

  it('fetches and renders the chart for the ticker once selected', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', close: 100 }] });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

    await waitFor(() => expect(client.getChartData).toHaveBeenCalledWith('AAPL', '1Y'));
  });

  it('shows a message instead of a dropdown when there are no tickers anywhere', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText(/no tickers to chart/i)).toBeInTheDocument());
    expect(screen.queryByLabelText(/ticker/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/DashboardPage.test.tsx`
Expected: FAIL — `Failed to resolve import "./DashboardPage"`.

- [ ] **Step 7: Implement `DashboardPage`**

Create `frontend/src/pages/DashboardPage.tsx`:

```tsx
// frontend/src/pages/DashboardPage.tsx
import { useState } from 'react';
import { PriceChart } from '../components/PriceChart';
import { useChartData } from '../hooks/useChartData';
import { useDashboardTickers } from '../hooks/useDashboardTickers';

const RANGE = '1Y' as const;

export function DashboardPage() {
  const { tickers, loading: tickersLoading } = useDashboardTickers();
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const { points, loading, error } = useChartData(selectedTicker, RANGE);

  if (tickersLoading) {
    return <div>Loading tickers…</div>;
  }

  return (
    <div>
      <h2>Dashboard</h2>

      {tickers.length === 0 ? (
        <p>No tickers to chart yet — add a holding or a Watchlist ticker first.</p>
      ) : (
        <>
          <label htmlFor="dashboard-ticker">Ticker</label>
          <select id="dashboard-ticker" value={selectedTicker ?? ''} onChange={(e) => setSelectedTicker(e.target.value || null)}>
            <option value="">Select a ticker…</option>
            {tickers.map((ticker) => (
              <option key={ticker} value={ticker}>
                {ticker}
              </option>
            ))}
          </select>

          {selectedTicker && <PriceChart points={points} loading={loading} error={error} />}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/DashboardPage.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 9: Wire the Dashboard tab into `App.tsx`**

Read `frontend/src/App.tsx` in full first — the whole file is short.

Add this failing assertion as a new test in `frontend/src/App.test.tsx`, appended inside the existing `describe('App', ...)` block:

```tsx
  it('switches to the Dashboard tab and shows its content', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<App />);
    await waitFor(() => expect(screen.getByText(/no portfolios yet/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/no tickers to chart/i)).toBeInTheDocument());
  });
```

Run: `cd frontend && npx vitest run src/App.test.tsx`
Expected: FAIL — no button named "Dashboard" exists yet.

Then update `frontend/src/App.tsx` to the following full contents (adds the `Dashboard` entry first in `TABS`, keeps `portfolios` as the default `activeTab` — the existing "renders the app title and the portfolios page by default" test must keep passing unmodified):

```tsx
import { useState } from 'react';
import { TabStrip } from './components/TabStrip';
import { DashboardPage } from './pages/DashboardPage';
import { PortfoliosPage } from './pages/PortfoliosPage';
import { ToolsPage } from './pages/ToolsPage';
import { WatchlistPage } from './pages/WatchlistPage';

type Tab = 'dashboard' | 'portfolios' | 'tools' | 'watchlist';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'portfolios', label: 'Portfolios' },
  { id: 'tools', label: 'Tools' },
  { id: 'watchlist', label: 'Watchlist' },
] as const satisfies { id: Tab; label: string }[];

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('portfolios');

  return (
    <div>
      <h1>Portfolio Tracker</h1>
      <TabStrip tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'dashboard' && <DashboardPage />}
      {activeTab === 'portfolios' && <PortfoliosPage />}
      {activeTab === 'tools' && <ToolsPage />}
      {activeTab === 'watchlist' && <WatchlistPage />}
    </div>
  );
}
```

- [ ] **Step 10: Run the full frontend suite and type check**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: all tests PASS (216 pre-existing + 7 from Task 2 + 6 from Task 3 + 3 useDashboardTickers + 4 DashboardPage + 1 App.tsx = 237), `tsc` exits with no output.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/hooks/useDashboardTickers.ts frontend/src/hooks/useDashboardTickers.test.tsx frontend/src/pages/DashboardPage.tsx frontend/src/pages/DashboardPage.test.tsx frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat: add Dashboard tab with ticker selection and price chart"
```

---

## Final Verification

- [ ] `cd backend && python -m pytest -q` → all pass
- [ ] `cd frontend && npx vitest run` → all pass
- [ ] `cd frontend && npx tsc -b` → no output (clean)
- [ ] Manually confirm: open the app, click "Dashboard" (now first in the nav), pick a ticker from the dropdown, see a line chart render (requires a real backend + real yfinance access — this cannot be verified by the automated tests alone, since they all mock `_fetch_from_provider`/`getChartData`/`lightweight-charts`).
