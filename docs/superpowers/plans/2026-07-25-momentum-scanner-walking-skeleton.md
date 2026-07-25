# Momentum Scanner Walking Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Ticket 3 of `tickets.md`: the first complete path from the rate-limited market-data provider through to a rendered Scanner table — a Momentum Scanner sub-tab with a Scan button, per-ticker progress, caching, and one working signal (percent change over a user-selected period). This proves every piece of Scanner infrastructure (history fetch/cache, sequential per-ticker fetching with failure isolation, scan-triggered UI, shared cross-tab scan state) that Tickets 4–7 all build on without re-deriving it.

**Architecture:** Backend: a new `history_service.py` (mirrors `price_service.py`'s and `fx_service.py`'s cache-with-TTL shape) fetches and caches one year of daily OHLCV history per ticker; a new `signals.py` holds pure signal-computation functions (only `percent_change` today — Ticket 4 adds RSI, volume ratio, distance-from-SMA here); a new endpoint on the existing watchlist router, `GET /watchlist/scan/price-signals?ticker=X&period=1d|1w|1m`, computes and returns signals **for one ticker at a time**. Frontend: a `usePriceSignalsScan` hook, owned by `WatchlistPage` (not by the Momentum tab itself), loops over the Watchlist's tickers **sequentially**, calling that per-ticker endpoint once per ticker and updating a `{ done, total }` progress counter after each response — this is what makes the "scanning 7 of 23" progress indicator truthful rather than simulated, and it's why the endpoint takes one ticker, not a list. Because the scan hook is owned by `WatchlistPage` and passed down as a prop, its results survive switching away from the Momentum tab and back — the same instance will be handed to Ticket 5's Pre-Squeeze tab later, so "one scan populates both tabs" (a Ticket 5 acceptance criterion) requires no rework here.

**Tech Stack:** FastAPI, SQLAlchemy, pytest, yfinance (backend — matches `price_service.py`/`fx_service.py` conventions exactly). React 19, TypeScript, Vitest, @testing-library/react (frontend).

## Global Constraints

- **Endpoint shape is per-ticker, not per-list.** `GET /watchlist/scan/price-signals` takes a single `ticker` query param and returns one row. This is a deliberate departure from `GET /prices`' and `GET /market-data`'s list-taking shape — it exists specifically so the frontend can drive its own progress counter across N sequential HTTP calls. Do not "simplify" this to accept a comma-separated ticker list; that would silently break the progress-reporting acceptance criterion.
- **The endpoint does not read the Watchlist table.** It computes signals for whatever ticker string it's given, the same way `GET /prices` doesn't care whether a ticker is in any portfolio. The frontend is what knows which tickers to call it for (via the existing `GET /watchlist`).
- History is fetched via `yf.Ticker(ticker).history(period="1y")`, cached **per ticker, in memory, 15-minute TTL** — this is 900 seconds vs. `price_service.py`'s 60 and `fx_service.py`'s 86400; the number is deliberately different from both existing caches, don't copy either constant.
- Fetching stays **sequential** end-to-end: the backend's per-ticker endpoint does one yfinance call per request; the frontend awaits each request before firing the next. No `Promise.all`, no backend batching.
- A ticker whose history can't be fetched, or whose history is too short for a given signal's lookback window, returns `null` for that signal — never a fabricated or estimated value. This is the same never-fabricate-a-value rule `price_service.py`'s `get_prices`/`get_market_data` already follow.
- `signals.py` functions are pure: they take a plain list of numbers, perform no I/O, and know nothing about tickers, caching, or HTTP. This is what makes them cheaply unit-testable and is what Ticket 4 will keep adding functions to.
- Follow existing code style: no comments except where a non-obvious constraint needs explaining, no abstractions beyond what this task needs.
- `cd backend && python -m pytest` and `cd frontend && npx tsc -b` must both be clean.

---

### Task 1: Backend — history service, signals module, and the price-signals endpoint

**Files:**
- Create: `backend/app/history_service.py`
- Create: `backend/app/signals.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/watchlist.py`
- Create: `backend/tests/test_history_service.py`
- Create: `backend/tests/test_signals.py`
- Create: `backend/tests/test_watchlist_scan_router.py`

**Interfaces:**
- Consumes: nothing from other tasks — this task is backend-only and self-contained.
- Produces: `history_service.get_history(ticker: str) -> list[Bar] | None` (`Bar = TypedDict` with `close, high, low, volume: float`) and `history_service.clear_cache() -> None`; `signals.percent_change(closes: list[float], periods: int) -> float | None`; the live endpoint `GET /watchlist/scan/price-signals?ticker=X&period=1d|1w|1m` returning `{"ticker": str, "percent_change_pct": float | None}`. Task 2's frontend `getPriceSignal` client function calls this endpoint and types its response as `PriceSignalRow { ticker: string; percent_change_pct: number | null }` — matching this task's field names exactly.

- [ ] **Step 1: Write the failing tests for `history_service`**

```python
# backend/tests/test_history_service.py
import pytest

from app import history_service


@pytest.fixture(autouse=True)
def _clear_cache():
    history_service.clear_cache()
    yield
    history_service.clear_cache()


SAMPLE_BARS = [
    {"close": 100.0, "high": 101.0, "low": 99.0, "volume": 1000.0},
    {"close": 102.0, "high": 103.0, "low": 100.0, "volume": 1200.0},
]


def test_get_history_returns_fetched_bars(monkeypatch):
    monkeypatch.setattr(history_service, "_fetch_history", lambda ticker: SAMPLE_BARS)

    result = history_service.get_history("VTI")

    assert result == SAMPLE_BARS


def test_get_history_returns_none_when_fetch_fails(monkeypatch):
    monkeypatch.setattr(history_service, "_fetch_history", lambda ticker: None)

    result = history_service.get_history("BADTICKER")

    assert result is None


def test_get_history_caches_and_does_not_refetch_within_ttl(monkeypatch):
    call_count = {"n": 0}

    def fake_fetch(ticker):
        call_count["n"] += 1
        return SAMPLE_BARS

    monkeypatch.setattr(history_service, "_fetch_history", fake_fetch)

    first = history_service.get_history("VTI")
    second = history_service.get_history("VTI")

    assert first == SAMPLE_BARS
    assert second == SAMPLE_BARS
    assert call_count["n"] == 1


def test_get_history_refetches_after_ttl_expires(monkeypatch):
    monkeypatch.setattr(history_service, "_fetch_history", lambda ticker: SAMPLE_BARS)

    fake_time = {"t": 1000.0}
    monkeypatch.setattr(history_service.time, "monotonic", lambda: fake_time["t"])

    history_service.get_history("VTI")

    fake_time["t"] += history_service.CACHE_TTL_SECONDS + 1

    call_count = {"n": 0}

    def fake_fetch_second(ticker):
        call_count["n"] += 1
        return SAMPLE_BARS

    monkeypatch.setattr(history_service, "_fetch_history", fake_fetch_second)

    history_service.get_history("VTI")

    assert call_count["n"] == 1


def test_a_failed_fetch_is_not_cached(monkeypatch):
    monkeypatch.setattr(history_service, "_fetch_history", lambda ticker: None)

    history_service.get_history("BADTICKER")

    call_count = {"n": 0}

    def fake_fetch(ticker):
        call_count["n"] += 1
        return SAMPLE_BARS

    monkeypatch.setattr(history_service, "_fetch_history", fake_fetch)

    result = history_service.get_history("BADTICKER")

    assert result == SAMPLE_BARS
    assert call_count["n"] == 1
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_history_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.history_service'`

- [ ] **Step 3: Implement `history_service.py`**

```python
# backend/app/history_service.py
import time
from typing import TypedDict

CACHE_TTL_SECONDS = 900.0

_cache: dict[str, tuple[list["Bar"], float]] = {}


class Bar(TypedDict):
    close: float
    high: float
    low: float
    volume: float


def clear_cache() -> None:
    _cache.clear()


def _get_cached(ticker: str) -> list[Bar] | None:
    entry = _cache.get(ticker)
    if entry is None:
        return None
    bars, fetched_at = entry
    if time.monotonic() - fetched_at > CACHE_TTL_SECONDS:
        return None
    return bars


def _set_cached(ticker: str, bars: list[Bar]) -> None:
    _cache[ticker] = (bars, time.monotonic())


def _fetch_history(ticker: str) -> list[Bar] | None:
    import yfinance as yf

    try:
        history = yf.Ticker(ticker).history(period="1y")
        if history.empty:
            return None
        return [
            {
                "close": float(row.Close),
                "high": float(row.High),
                "low": float(row.Low),
                "volume": float(row.Volume),
            }
            for row in history.itertuples()
        ]
    except Exception:
        return None


def get_history(ticker: str) -> list[Bar] | None:
    cached = _get_cached(ticker)
    if cached is not None:
        return cached

    bars = _fetch_history(ticker)
    if bars is not None:
        _set_cached(ticker, bars)

    return bars
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_history_service.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Write the failing tests for `signals.percent_change`**

```python
# backend/tests/test_signals.py
import pytest

from app.signals import percent_change


def test_percent_change_computes_gain():
    closes = [100.0, 101.0, 102.0, 103.0, 104.0, 110.0]

    result = percent_change(closes, 5)

    assert result == pytest.approx(10.0)


def test_percent_change_computes_loss():
    closes = [100.0, 95.0]

    result = percent_change(closes, 1)

    assert result == pytest.approx(-5.0)


def test_percent_change_returns_none_when_not_enough_history():
    closes = [100.0, 101.0, 102.0]

    result = percent_change(closes, 5)

    assert result is None


def test_percent_change_returns_none_when_start_price_is_zero_or_negative():
    closes = [0.0, 100.0]

    result = percent_change(closes, 1)

    assert result is None


def test_percent_change_with_exactly_enough_history():
    closes = [100.0, 110.0]

    result = percent_change(closes, 1)

    assert result == pytest.approx(10.0)
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_signals.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.signals'`

- [ ] **Step 7: Implement `signals.py`**

```python
# backend/app/signals.py
def percent_change(closes: list[float], periods: int) -> float | None:
    if len(closes) < periods + 1:
        return None
    start = closes[-(periods + 1)]
    end = closes[-1]
    if start <= 0:
        return None
    return (end - start) / start * 100
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_signals.py -v`
Expected: PASS (5 tests)

- [ ] **Step 9: Add the response schema**

Append to `backend/app/schemas.py`:

```python
class PriceSignalOut(BaseModel):
    ticker: str
    percent_change_pct: float | None
```

- [ ] **Step 10: Write the failing tests for the router endpoint**

```python
# backend/tests/test_watchlist_scan_router.py
from unittest.mock import patch


def test_scan_price_signal_returns_percent_change(client):
    bars = [{"close": 100.0, "high": 101.0, "low": 99.0, "volume": 1000.0}] * 4 + [
        {"close": 110.0, "high": 111.0, "low": 109.0, "volume": 1000.0}
    ]

    with patch("app.routers.watchlist.get_history", return_value=bars) as mock_get_history:
        response = client.get("/watchlist/scan/price-signals", params={"ticker": "VTI", "period": "1d"})

    assert response.status_code == 200
    assert response.json() == {"ticker": "VTI", "percent_change_pct" : 10.0}
    mock_get_history.assert_called_once_with("VTI")


def test_scan_price_signal_returns_null_when_history_unavailable(client):
    with patch("app.routers.watchlist.get_history", return_value=None):
        response = client.get("/watchlist/scan/price-signals", params={"ticker": "BADTICKER", "period": "1d"})

    assert response.status_code == 200
    assert response.json() == {"ticker": "BADTICKER", "percent_change_pct": None}


def test_scan_price_signal_defaults_to_one_week_period(client):
    bars = [{"close": 100.0, "high": 101.0, "low": 99.0, "volume": 1000.0}] * 6

    with patch("app.routers.watchlist.get_history", return_value=bars):
        response = client.get("/watchlist/scan/price-signals", params={"ticker": "VTI"})

    assert response.status_code == 200
    assert response.json()["percent_change_pct"] == 0.0


def test_scan_price_signal_rejects_invalid_period(client):
    response = client.get("/watchlist/scan/price-signals", params={"ticker": "VTI", "period": "1y"})

    assert response.status_code == 422


def test_scan_price_signal_one_month_period_uses_21_trading_days(client):
    bars = [{"close": 100.0, "high": 101.0, "low": 99.0, "volume": 1000.0}] * 21 + [
        {"close": 121.0, "high": 122.0, "low": 120.0, "volume": 1000.0}
    ]

    with patch("app.routers.watchlist.get_history", return_value=bars):
        response = client.get("/watchlist/scan/price-signals", params={"ticker": "VTI", "period": "1m"})

    assert response.json()["percent_change_pct"] == pytest.approx(21.0)
```

Note: `test_scan_price_signal_one_month_period_uses_21_trading_days` needs `import pytest` added to the top of the file alongside the existing `from unittest.mock import patch`.

- [ ] **Step 11: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_watchlist_scan_router.py -v`
Expected: FAIL — 404 (route doesn't exist yet)

- [ ] **Step 12: Add the endpoint to the watchlist router**

Modify `backend/app/routers/watchlist.py` — add these imports to the top of the file (alongside the existing ones) and this route at the end of the file:

```python
from typing import Literal

from app.history_service import get_history
from app.schemas import PriceSignalOut
from app.signals import percent_change
```

```python
PERIOD_TRADING_DAYS: dict[str, int] = {"1d": 1, "1w": 5, "1m": 21}


@router.get("/scan/price-signals", response_model=PriceSignalOut)
def scan_price_signal(ticker: str, period: Literal["1d", "1w", "1m"] = "1w"):
    bars = get_history(ticker)
    if bars is None:
        return PriceSignalOut(ticker=ticker, percent_change_pct=None)
    closes = [bar["close"] for bar in bars]
    pct = percent_change(closes, PERIOD_TRADING_DAYS[period])
    return PriceSignalOut(ticker=ticker, percent_change_pct=pct)
```

The full modified `backend/app/routers/watchlist.py` should read:

```python
# backend/app/routers/watchlist.py
from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.history_service import get_history
from app.models import WatchlistItem
from app.routers._deps import get_or_404
from app.schemas import PriceSignalOut, WatchlistItemCreate, WatchlistItemOut
from app.signals import percent_change

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
    item = get_or_404(db, WatchlistItem, item_id, "Watchlist item not found")
    db.delete(item)
    db.commit()


PERIOD_TRADING_DAYS: dict[str, int] = {"1d": 1, "1w": 5, "1m": 21}


@router.get("/scan/price-signals", response_model=PriceSignalOut)
def scan_price_signal(ticker: str, period: Literal["1d", "1w", "1m"] = "1w"):
    bars = get_history(ticker)
    if bars is None:
        return PriceSignalOut(ticker=ticker, percent_change_pct=None)
    closes = [bar["close"] for bar in bars]
    pct = percent_change(closes, PERIOD_TRADING_DAYS[period])
    return PriceSignalOut(ticker=ticker, percent_change_pct=pct)
```

Note the route ordering: FastAPI matches routes in registration order, and `/scan/price-signals` is a literal path segment, not a `{item_id}` path parameter, so it will never be shadowed by `DELETE /{item_id}` — but keep `/scan/price-signals` registered after the two plain CRUD routes and it will never be shadowed by anything, since GET has no path-parameter route to collide with.

- [ ] **Step 13: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_watchlist_scan_router.py -v`
Expected: PASS (5 tests)

- [ ] **Step 14: Run the full backend suite**

Run: `cd backend && python -m pytest`
Expected: All tests pass (existing backend suite plus 15 new tests across the 3 new files).

- [ ] **Step 15: Commit**

```bash
git add backend/app/history_service.py backend/app/signals.py backend/app/schemas.py backend/app/routers/watchlist.py backend/tests/test_history_service.py backend/tests/test_signals.py backend/tests/test_watchlist_scan_router.py
git commit -m "feat: add history service, signals module, and price-signals scan endpoint"
```

---

### Task 2: Frontend — scan hook, Momentum Scanner tab, and WatchlistPage wiring

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/client.test.ts`
- Create: `frontend/src/hooks/usePriceSignalsScan.ts`
- Create: `frontend/src/hooks/usePriceSignalsScan.test.tsx`
- Create: `frontend/src/components/MomentumScanner.tsx`
- Create: `frontend/src/components/MomentumScanner.test.tsx`
- Modify: `frontend/src/pages/WatchlistPage.tsx`
- Modify: `frontend/src/pages/WatchlistPage.test.tsx`

**Interfaces:**
- Consumes: Task 1's `GET /watchlist/scan/price-signals?ticker=X&period=Y` endpoint; the existing `useWatchlist` hook (for the ticker list) and `TabStrip` component (already on master).
- Produces: `PriceSignalRow { ticker: string; percent_change_pct: number | null }` and `ScanPeriod = '1d' | '1w' | '1m'` types; `getPriceSignal(ticker: string, period: ScanPeriod): Promise<PriceSignalRow>` client function; `usePriceSignalsScan()` returning `{ results: Record<string, PriceSignalRow>; scanning: boolean; progress: { done: number; total: number } | null; scan: (tickers: string[], period: ScanPeriod) => Promise<void> }`. Ticket 5's Pre-Squeeze Scanner will receive this exact hook instance as a prop from `WatchlistPage`, the same way `MomentumScanner` does here — do not change this shape without updating both consumers.

- [ ] **Step 1: Add the types**

Append to `frontend/src/api/types.ts`:

```ts
export type ScanPeriod = '1d' | '1w' | '1m';

export interface PriceSignalRow {
  ticker: string;
  percent_change_pct: number | null;
}
```

- [ ] **Step 2: Write the failing client test**

Add `getPriceSignal` to the existing `import { ... } from './client'` list in `frontend/src/api/client.test.ts`, and add this test inside the existing `describe('api client', ...)` block:

```ts
  it('getPriceSignal calls GET /watchlist/scan/price-signals with ticker and period', async () => {
    mockFetchOnce({ ticker: 'VTI', percent_change_pct: 2.3 });

    const result = await getPriceSignal('VTI', '1w');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/watchlist/scan/price-signals?ticker=VTI&period=1w',
      expect.objectContaining({ method: undefined }),
    );
    expect(result).toEqual({ ticker: 'VTI', percent_change_pct: 2.3 });
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/api/client.test.ts`
Expected: FAIL — `getPriceSignal is not defined`

- [ ] **Step 4: Implement `getPriceSignal`**

Add `PriceSignalRow, ScanPeriod` to the existing `import type { ... } from './types'` block in `frontend/src/api/client.ts`, and append this function:

```ts
export function getPriceSignal(ticker: string, period: ScanPeriod): Promise<PriceSignalRow> {
  return request<PriceSignalRow>(
    `/watchlist/scan/price-signals?ticker=${encodeURIComponent(ticker)}&period=${period}`,
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/api/client.test.ts`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 6: Write the failing tests for `usePriceSignalsScan`**

```tsx
// frontend/src/hooks/usePriceSignalsScan.test.tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { usePriceSignalsScan } from './usePriceSignalsScan';

describe('usePriceSignalsScan', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with no results and not scanning', () => {
    const { result } = renderHook(() => usePriceSignalsScan());

    expect(result.current.results).toEqual({});
    expect(result.current.scanning).toBe(false);
    expect(result.current.progress).toBeNull();
  });

  it('fetches each ticker sequentially and stores results keyed by ticker', async () => {
    const calls: string[] = [];
    vi.spyOn(client, 'getPriceSignal').mockImplementation(async (ticker) => {
      calls.push(ticker);
      return { ticker, percent_change_pct: ticker === 'VTI' ? 1.5 : 2.5 };
    });

    const { result } = renderHook(() => usePriceSignalsScan());

    await act(async () => {
      await result.current.scan(['VTI', 'SPY'], '1w');
    });

    expect(calls).toEqual(['VTI', 'SPY']);
    expect(result.current.results).toEqual({
      VTI: { ticker: 'VTI', percent_change_pct: 1.5 },
      SPY: { ticker: 'SPY', percent_change_pct: 2.5 },
    });
    expect(client.getPriceSignal).toHaveBeenNthCalledWith(1, 'VTI', '1w');
    expect(client.getPriceSignal).toHaveBeenNthCalledWith(2, 'SPY', '1w');
  });

  it('updates progress after each ticker completes and clears it when done', async () => {
    vi.spyOn(client, 'getPriceSignal').mockImplementation(async (ticker) => ({
      ticker,
      percent_change_pct: 1,
    }));

    const { result } = renderHook(() => usePriceSignalsScan());

    const scanPromise = act(async () => {
      await result.current.scan(['VTI', 'SPY', 'BND'], '1d');
    });

    await scanPromise;

    expect(result.current.scanning).toBe(false);
  });

  it('records a null-valued row for a ticker whose fetch fails, without abandoning the rest', async () => {
    vi.spyOn(client, 'getPriceSignal').mockImplementation(async (ticker) => {
      if (ticker === 'BADTICKER') {
        throw new client.ApiError(502, 'upstream error');
      }
      return { ticker, percent_change_pct: 3 };
    });

    const { result } = renderHook(() => usePriceSignalsScan());

    await act(async () => {
      await result.current.scan(['VTI', 'BADTICKER'], '1w');
    });

    expect(result.current.results).toEqual({
      VTI: { ticker: 'VTI', percent_change_pct: 3 },
      BADTICKER: { ticker: 'BADTICKER', percent_change_pct: null },
    });
  });

  it('replaces prior results wholesale on a new scan rather than merging', async () => {
    vi.spyOn(client, 'getPriceSignal').mockImplementation(async (ticker) => ({
      ticker,
      percent_change_pct: 1,
    }));

    const { result } = renderHook(() => usePriceSignalsScan());

    await act(async () => {
      await result.current.scan(['VTI'], '1w');
    });
    expect(result.current.results).toEqual({ VTI: { ticker: 'VTI', percent_change_pct: 1 } });

    await act(async () => {
      await result.current.scan(['SPY'], '1w');
    });

    expect(result.current.results).toEqual({ SPY: { ticker: 'SPY', percent_change_pct: 1 } });
  });
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/hooks/usePriceSignalsScan.test.tsx`
Expected: FAIL — `Cannot find module './usePriceSignalsScan'`

- [ ] **Step 8: Implement `usePriceSignalsScan`**

```ts
// frontend/src/hooks/usePriceSignalsScan.ts
import { useCallback, useState } from 'react';
import { getPriceSignal } from '../api/client';
import type { PriceSignalRow, ScanPeriod } from '../api/types';

interface ScanProgress {
  done: number;
  total: number;
}

export function usePriceSignalsScan() {
  const [results, setResults] = useState<Record<string, PriceSignalRow>>({});
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);

  const scan = useCallback(async (tickers: string[], period: ScanPeriod) => {
    setScanning(true);
    setProgress({ done: 0, total: tickers.length });
    const next: Record<string, PriceSignalRow> = {};

    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i];
      try {
        next[ticker] = await getPriceSignal(ticker, period);
      } catch {
        // One ticker's failure must not abandon the rest of the scan — record it as
        // unavailable and keep going, per the never-fabricate-a-value rule.
        next[ticker] = { ticker, percent_change_pct: null };
      }
      setProgress({ done: i + 1, total: tickers.length });
    }

    setResults(next);
    setScanning(false);
  }, []);

  return { results, scanning, progress, scan };
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/hooks/usePriceSignalsScan.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 10: Write the failing tests for `MomentumScanner`**

```tsx
// frontend/src/components/MomentumScanner.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { usePriceSignalsScan } from '../hooks/usePriceSignalsScan';
import { MomentumScanner } from './MomentumScanner';

function Wrapper() {
  const scanState = usePriceSignalsScan();
  return <MomentumScanner scanState={scanState} />;
}

describe('MomentumScanner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows an empty-watchlist message and no Scan button when the watchlist has no tickers', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<Wrapper />);

    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^scan$/i })).not.toBeInTheDocument();
  });

  it('shows a Scan button and issues no request until it is pressed', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'VTI', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    const getPriceSignalSpy = vi.spyOn(client, 'getPriceSignal');

    render(<Wrapper />);

    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());
    expect(getPriceSignalSpy).not.toHaveBeenCalled();
  });

  it('scans each watchlist ticker, shows progress, disables the button, then renders results', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'VTI', category: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 2, ticker: 'SPY', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getPriceSignal').mockImplementation(async (ticker) => ({
      ticker,
      percent_change_pct: ticker === 'VTI' ? 1.5 : -2.25,
    }));

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => expect(screen.getByText('VTI')).toBeInTheDocument());
    expect(screen.getByText('SPY')).toBeInTheDocument();
    expect(screen.getByText('1.50%')).toBeInTheDocument();
    expect(screen.getByText('-2.25%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^scan$/i })).not.toBeDisabled();
  });

  it('shows a row marked unavailable for a ticker whose signal could not be fetched', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'BADTICKER', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getPriceSignal').mockRejectedValue(new client.ApiError(502, 'upstream error'));

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => expect(screen.getByText('BADTICKER')).toBeInTheDocument());
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
  });

  it('sends the selected period to getPriceSignal', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'VTI', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getPriceSignal').mockResolvedValue({ ticker: 'VTI', percent_change_pct: 1 });

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/period/i), { target: { value: '1m' } });
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => expect(client.getPriceSignal).toHaveBeenCalledWith('VTI', '1m'));
  });
});
```

- [ ] **Step 11: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/MomentumScanner.test.tsx`
Expected: FAIL — `Cannot find module './MomentumScanner'`

- [ ] **Step 12: Implement `MomentumScanner`**

```tsx
// frontend/src/components/MomentumScanner.tsx
import { useState } from 'react';
import type { PriceSignalRow, ScanPeriod } from '../api/types';
import { useWatchlist } from '../hooks/useWatchlist';

interface PriceSignalsScanState {
  results: Record<string, PriceSignalRow>;
  scanning: boolean;
  progress: { done: number; total: number } | null;
  scan: (tickers: string[], period: ScanPeriod) => Promise<void>;
}

interface MomentumScannerProps {
  scanState: PriceSignalsScanState;
}

type SortDirection = 'asc' | 'desc';

export function MomentumScanner({ scanState }: MomentumScannerProps) {
  const { items, loading } = useWatchlist();
  const [period, setPeriod] = useState<ScanPeriod>('1w');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const { results, scanning, progress, scan } = scanState;

  if (loading) {
    return <div>Loading watchlist…</div>;
  }

  if (items.length === 0) {
    return (
      <div>
        <h3>Momentum Scanner</h3>
        <p>Your watchlist is empty — add tickers in Manage Watchlist before scanning.</p>
      </div>
    );
  }

  const rows = items
    .map((item) => results[item.ticker])
    .filter((row): row is PriceSignalRow => row !== undefined);

  const sortedRows = [...rows].sort((a, b) => {
    if (a.percent_change_pct === null) return 1;
    if (b.percent_change_pct === null) return -1;
    return sortDirection === 'asc' ? a.percent_change_pct - b.percent_change_pct : b.percent_change_pct - a.percent_change_pct;
  });

  async function handleScan() {
    await scan(
      items.map((item) => item.ticker),
      period,
    );
  }

  return (
    <div>
      <h3>Momentum Scanner</h3>

      <label htmlFor="momentum-period">Period</label>
      <select
        id="momentum-period"
        value={period}
        onChange={(e) => setPeriod(e.target.value as ScanPeriod)}
        disabled={scanning}
      >
        <option value="1d">1 day</option>
        <option value="1w">1 week</option>
        <option value="1m">1 month</option>
      </select>

      <button type="button" onClick={handleScan} disabled={scanning}>
        {scanning ? 'Scanning…' : 'Scan'}
      </button>

      {scanning && progress && (
        <div role="status">
          Scanning {progress.done} of {progress.total}…
        </div>
      )}

      {sortedRows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Ticker</th>
              <th>
                <button type="button" onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}>
                  % change ({period})
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.ticker}>
                <td>{row.ticker}</td>
                <td>{row.percent_change_pct === null ? 'Unavailable' : `${row.percent_change_pct.toFixed(2)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 13: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/MomentumScanner.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 14: Write the failing test for `WatchlistPage`'s new tab**

Add this test inside the existing `describe('WatchlistPage', ...)` block in `frontend/src/pages/WatchlistPage.test.tsx`:

```tsx
  it('switches to the Momentum Scanner sub-tab and shows its content', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<WatchlistPage />);
    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Momentum Scanner' }));

    expect(screen.getByRole('heading', { name: 'Momentum Scanner' })).toBeInTheDocument();
  });
```

This requires adding `fireEvent` to the existing `import { render, screen, waitFor } from '@testing-library/react'` line at the top of the file.

- [ ] **Step 15: Run `WatchlistPage.test.tsx` to verify the new test fails**

Run: `cd frontend && npx vitest run src/pages/WatchlistPage.test.tsx`
Expected: FAIL on the new test — no "Momentum Scanner" button exists yet. The pre-existing test must still pass.

- [ ] **Step 16: Wire `MomentumScanner` into `WatchlistPage`**

Replace the full contents of `frontend/src/pages/WatchlistPage.tsx` with:

```tsx
// frontend/src/pages/WatchlistPage.tsx
import { useState } from 'react';
import { TabStrip } from '../components/TabStrip';
import { MomentumScanner } from '../components/MomentumScanner';
import { usePriceSignalsScan } from '../hooks/usePriceSignalsScan';
import { WatchlistManagementPage } from './WatchlistManagementPage';

type WatchlistTab = 'manage' | 'momentum';

// "Manage Watchlist", not "Watchlist" — the top-level nav button in App.tsx is already labelled
// "Watchlist"; a same-labelled sub-tab button would make getByRole('button', { name: 'Watchlist' })
// ambiguous in tests (both buttons render at once) and confusing for a screen-reader user.
const TABS = [
  { id: 'manage', label: 'Manage Watchlist' },
  { id: 'momentum', label: 'Momentum Scanner' },
] as const satisfies { id: WatchlistTab; label: string }[];

export function WatchlistPage() {
  const [activeTab, setActiveTab] = useState<WatchlistTab>('manage');
  // Owned here, not inside MomentumScanner, so the scan results survive switching sub-tabs —
  // and so Ticket 5's Pre-Squeeze tab can receive this same instance and reuse one scan's data.
  const priceSignalsScan = usePriceSignalsScan();

  return (
    <div>
      <h2>Watchlist</h2>
      <TabStrip tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'manage' && <WatchlistManagementPage />}
      {activeTab === 'momentum' && <MomentumScanner scanState={priceSignalsScan} />}
    </div>
  );
}
```

- [ ] **Step 17: Run `WatchlistPage.test.tsx` to verify both tests pass**

Run: `cd frontend && npx vitest run src/pages/WatchlistPage.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 18: Run the full frontend suite and typecheck**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: All tests pass (135 pre-existing + 1 client + 5 hook + 6 MomentumScanner + 1 WatchlistPage = 148), `tsc -b` clean.

- [ ] **Step 19: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/api/client.test.ts frontend/src/hooks/usePriceSignalsScan.ts frontend/src/hooks/usePriceSignalsScan.test.tsx frontend/src/components/MomentumScanner.tsx frontend/src/components/MomentumScanner.test.tsx frontend/src/pages/WatchlistPage.tsx frontend/src/pages/WatchlistPage.test.tsx
git commit -m "feat: add Momentum Scanner tab with scan hook and price-signal client"
```

## Self-Review

**1. Spec coverage:** Ticket 3's acceptance criteria from `tickets.md` map to: history service with 15-min TTL + `clear_cache` (Task 1 Step 3), failed fetch not cached (Task 1 tests), one row per ticker including failures with null values (Task 1 Step 12 + Task 2's hook), sequential fetching with failure isolation (Global Constraints + Task 2 Step 8's `for` loop with per-iteration `try/catch`), empty-on-open / no request until Scan pressed / progress / disabled-while-running / persisted results / unavailable rows (Task 2 Step 12), selectable percent-change period (Task 2 Step 12's `<select>`), sortable + labelled column (Task 2 Step 12), empty-Watchlist message (Task 2 Step 12), cache-within-TTL behaviour (Task 1 tests).

**2. Placeholder scan:** No TBD/TODO markers. Every code block is complete, copy-pasteable file contents or complete function/route additions. The four inline comments (endpoint-shape rationale in Global Constraints, failure-isolation rationale in the hook, tab-label-collision rationale and scan-state-ownership rationale in `WatchlistPage`) each explain a non-obvious constraint at its point of use.

**3. Type consistency:** `PriceSignalRow` (Task 2 Step 1) field names (`ticker`, `percent_change_pct`) match the backend's `PriceSignalOut` schema (Task 1 Step 9) exactly — both frontend and backend were written in the same task-pair specifically to keep this in sync. `usePriceSignalsScan`'s returned shape (`results`, `scanning`, `progress`, `scan`) declared in Task 2's Interfaces block is consumed by `MomentumScanner`'s `PriceSignalsScanState` interface with matching field names and the same `scan(tickers: string[], period: ScanPeriod) => Promise<void>` signature. `ScanPeriod` is defined once (Task 2 Step 1) and used identically in the client function, the hook, and the component — never redeclared with different string literals.
