# Dashboard Range Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the range selector (1D/5D/1M/6M/YTD/1Y/5Y) that Ticket 1 deferred — each range maps to a fixed, hardcoded fetch interval, so no combination the user can pick is ever one the price provider rejects — and wire it end-to-end through the existing chart pipeline built in Ticket 1.

**Architecture:** Widens `chart_service.py`'s `ChartRange` type and `RANGE_TO_YFINANCE` mapping table from one row to seven, adding a second dimension the walking skeleton didn't need: two of the seven ranges (1D, 5D) require intraday bars, and intraday bars from the same calendar day collide if encoded as `"YYYY-MM-DD"` strings (Ticket 1's encoding, which only ever needed daily/weekly bars) — so `ChartPoint.time` widens from `str` to `str | int`, with intraday ranges encoded as UNIX timestamps and daily/weekly ranges keeping the existing date-string encoding. On the frontend, the range selector reuses the exact `useChartData(ticker, range)` signature Ticket 1 already built (it always accepted `range` as a parameter) — but Ticket 1's remount-on-ticker-change fix must widen from keying on ticker alone to keying on ticker+range together, or switching range for the same ticker reproduces the exact stale-chart-data bug Ticket 1 fixed for ticker switches.

**Tech Stack:** FastAPI, pytest (backend); React 19, TypeScript, Vitest (frontend). No new dependencies.

## Global Constraints

- Range and interval are not independent user choices — a fixed, hardcoded mapping derives the fetch interval from the selected range. There is still no interval selector in the UI (per the spec's Implementation Decisions).
- The range→interval mapping, exactly as decided during grilling:

  | Range | yfinance interval |
  | --- | --- |
  | 1D | 5 minute |
  | 5D | 30 minute |
  | 1M | 1 day |
  | 6M | 1 day |
  | YTD | 1 day |
  | 1Y | 1 day |
  | 5Y | 1 week |

- Never fabricate data: a fetch that fails must surface as an explicit "unavailable" state — this constraint from Ticket 1 is unchanged and still binding.
- The chart-data cache must stay keyed by ticker AND range together — switching between two ranges for the same ticker, then back, must be served from cache within the TTL without a second fetch (this already works today since Ticket 1's cache key was always `(ticker, range_)` — this ticket must not regress it while widening the range type).
- Changing ticker or range while a fetch is in flight must supersede it — the stale response cannot land and relabel the chart with the wrong range's (or ticker's) data. Ticket 1 already solved this for the request-race case via a `requestId` ref in `useChartData`; this ticket must extend the render-phase remount/points-reset fix (see Task 2's Global Constraints below) to also cover range changes, not just ticker changes — this is the single highest-risk part of this ticket, since Ticket 1's original version of this same fix needed 3 review rounds before it was actually correct, and the bug it fixes is invisible to a reader who doesn't know to look for it.

---

### Task 1: Backend — complete the range→interval mapping and intraday time-encoding

**Files:**
- Modify: `backend/app/chart_service.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/tests/test_chart_service.py`
- Modify: `backend/tests/test_market_router.py`

**Interfaces:**
- Consumes: nothing from other tasks — backend-only, self-contained. `backend/app/routers/market.py`'s `get_chart` endpoint already imports `ChartRange` from `chart_service` (not a locally-declared `Literal`) — when `ChartRange` widens in this task, the endpoint automatically accepts all seven values with no code change there. Do not modify `backend/app/routers/market.py` in this task.
- Produces: `chart_service.get_chart_data(ticker: str, range_: ChartRange) -> list[ChartPoint] | None` where `ChartRange = Literal["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y"]` and `ChartPoint = TypedDict("ChartPoint", {"time": str | int, "close": float})` — `time` is a UNIX-timestamp `int` for `"1D"`/`"5D"`, a `"YYYY-MM-DD"` `str` for every other range. Task 2 (frontend) consumes this only through the existing HTTP contract (`GET /market/chart?ticker=X&range=Y` → `{"points": [{"time": str|int, "close": float}, ...] | null}`), not the Python functions directly.

Read `backend/app/chart_service.py` in full first — you are widening it, not rewriting it from scratch.

- [ ] **Step 1: Write the failing tests for the full range→interval mapping**

Read `backend/tests/test_chart_service.py`'s existing `test_fetch_from_provider_requests_one_year_of_daily_bars` test — you are replacing it with a parametrized version covering all seven ranges (delete that one test, since the new parametrized test's `"1Y"` case supersedes it exactly — keeping both would be a duplicate assertion of the same fact).

In `backend/tests/test_chart_service.py`, add `import pytest` is already present at the top of the file — confirm it, then remove the old `test_fetch_from_provider_requests_one_year_of_daily_bars` function entirely and add this in its place:

```python
@pytest.mark.parametrize(
    "range_,expected_period,expected_interval",
    [
        ("1D", "1d", "5m"),
        ("5D", "5d", "30m"),
        ("1M", "1mo", "1d"),
        ("6M", "6mo", "1d"),
        ("YTD", "ytd", "1d"),
        ("1Y", "1y", "1d"),
        ("5Y", "5y", "1wk"),
    ],
)
def test_fetch_from_provider_requests_the_correct_period_and_interval_for_each_range(
    monkeypatch, range_, expected_period, expected_interval
):
    import pandas as pd

    history = pd.DataFrame({"Close": [100.0]}, index=pd.to_datetime(["2026-01-02"]))
    calls = []

    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period, interval):
            calls.append((period, interval))
            return history

    import yfinance as yf

    monkeypatch.setattr(yf, "Ticker", FakeTicker)

    chart_service._fetch_from_provider("VTI", range_)

    assert calls == [(expected_period, expected_interval)]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_chart_service.py -v -k "period_and_interval"`
Expected: FAIL for every parametrized case except `"1Y"` — `KeyError` from `RANGE_TO_YFINANCE[range_]`, since only `"1Y"` exists in the table yet, and a `Literal["1Y"]` type on `ChartRange` (not yet widened) has no runtime effect on what `test_fetch_from_provider_requests_the_correct_period_and_interval_for_each_range` can pass in directly.

- [ ] **Step 3: Widen `ChartRange` and `RANGE_TO_YFINANCE`**

In `backend/app/chart_service.py`, replace:

```python
ChartRange = Literal["1Y"]

# range -> (yfinance period, yfinance interval). Only "1Y" exists in this ticket; the range
# selector ticket widens ChartRange and this table together, with no other code change needed.
RANGE_TO_YFINANCE: dict[str, tuple[str, str]] = {
    "1Y": ("1y", "1d"),
}
```

with:

```python
ChartRange = Literal["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y"]

# range -> (yfinance period, yfinance interval, time encoding). "date" encoding produces a
# "YYYY-MM-DD" string (fine for daily/weekly bars, one point per day at most); "timestamp"
# encoding produces a UNIX-timestamp int, required for intraday bars (1D, 5D) since multiple
# points share the same calendar day and a date-string time would collide.
RANGE_TO_YFINANCE: dict[str, tuple[str, str, Literal["date", "timestamp"]]] = {
    "1D": ("1d", "5m", "timestamp"),
    "5D": ("5d", "30m", "timestamp"),
    "1M": ("1mo", "1d", "date"),
    "6M": ("6mo", "1d", "date"),
    "YTD": ("ytd", "1d", "date"),
    "1Y": ("1y", "1d", "date"),
    "5Y": ("5y", "1wk", "date"),
}
```

Update `_fetch_from_provider` — it currently unpacks a 2-tuple and always uses date-string encoding:

```python
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
```

Replace it with:

```python
def _fetch_from_provider(ticker: str, range_: str) -> list[ChartPoint] | None:
    import yfinance as yf

    period, interval, encoding = RANGE_TO_YFINANCE[range_]
    try:
        history = yf.Ticker(ticker).history(period=period, interval=interval)
        if history.empty:
            return None
        if encoding == "timestamp":
            return [
                {"time": int(row.Index.timestamp()), "close": float(row.Close)}
                for row in history.itertuples()
            ]
        return [
            {"time": row.Index.strftime("%Y-%m-%d"), "close": float(row.Close)}
            for row in history.itertuples()
        ]
    except Exception:
        return None
```

Also widen the `ChartPoint` TypedDict:

```python
class ChartPoint(TypedDict):
    time: str | int
    close: float
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_chart_service.py -v -k "period_and_interval"`
Expected: PASS (7 parametrized cases)

- [ ] **Step 5: Write the failing tests for intraday timestamp encoding**

Add to `backend/tests/test_chart_service.py`:

```python
def test_fetch_from_provider_uses_unix_timestamps_for_intraday_ranges(monkeypatch):
    import pandas as pd

    index = pd.to_datetime(["2026-01-02 09:30:00", "2026-01-02 09:35:00"], utc=True)
    history = pd.DataFrame({"Close": [100.0, 100.5]}, index=index)

    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period, interval):
            return history

    import yfinance as yf

    monkeypatch.setattr(yf, "Ticker", FakeTicker)

    result = chart_service._fetch_from_provider("VTI", "1D")

    assert result == [
        {"time": int(index[0].timestamp()), "close": 100.0},
        {"time": int(index[1].timestamp()), "close": 100.5},
    ]
    assert all(isinstance(point["time"], int) for point in result)


def test_fetch_from_provider_uses_date_strings_for_the_weekly_range(monkeypatch):
    import pandas as pd

    index = pd.to_datetime(["2026-01-02", "2026-01-09"])
    history = pd.DataFrame({"Close": [100.0, 105.0]}, index=index)

    class FakeTicker:
        def __init__(self, ticker):
            pass

        def history(self, period, interval):
            return history

    import yfinance as yf

    monkeypatch.setattr(yf, "Ticker", FakeTicker)

    result = chart_service._fetch_from_provider("VTI", "5Y")

    assert result == [
        {"time": "2026-01-02", "close": 100.0},
        {"time": "2026-01-09", "close": 105.0},
    ]
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_chart_service.py -v -k "unix_timestamps or date_strings_for_the_weekly"`
Expected: `test_fetch_from_provider_uses_unix_timestamps_for_intraday_ranges` FAILs — before Step 3's change, `_fetch_from_provider` always produces a date string, never an int, and unpacking `RANGE_TO_YFINANCE["1D"]` as a 2-tuple would also fail with a `ValueError` before Step 3. `test_fetch_from_provider_uses_date_strings_for_the_weekly_range` should already PASS (date encoding is the pre-existing default) — if it fails, something in Step 3 broke the date path; investigate before continuing.

- [ ] **Step 7: Run the full `test_chart_service.py` suite to confirm nothing regressed**

Run: `cd backend && python -m pytest tests/test_chart_service.py -v`
Expected: all PASS. (The two encoding tests from Step 5 should now pass since Step 3's implementation already handles both branches.)

- [ ] **Step 8: Write the failing test for per-range cache separation**

Add to `backend/tests/test_chart_service.py`, near the existing `test_get_chart_data_caches_different_tickers_separately`:

```python
def test_get_chart_data_caches_different_ranges_separately_for_the_same_ticker(monkeypatch):
    calls = []

    def fake_fetch(ticker, range_):
        calls.append(range_)
        return SAMPLE_POINTS

    monkeypatch.setattr(chart_service, "_fetch_from_provider", fake_fetch)

    chart_service.get_chart_data("VTI", "1Y")
    chart_service.get_chart_data("VTI", "5Y")
    chart_service.get_chart_data("VTI", "1Y")
    chart_service.get_chart_data("VTI", "5Y")

    assert calls == ["1Y", "5Y"]
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_chart_service.py -v -k "different_ranges_separately"`
Expected: PASS — the cache was already keyed by `(ticker, range_)` in Ticket 1, so this test documents and locks in behavior that already works; it should not require any implementation change.

- [ ] **Step 10: Widen the `ChartPointOut` schema**

Read `backend/app/schemas.py` and find the `ChartPointOut` class (near `ChartOut`). Change:

```python
class ChartPointOut(BaseModel):
    time: str
    close: float
```

to:

```python
class ChartPointOut(BaseModel):
    time: str | int
    close: float
```

- [ ] **Step 11: Write the failing router tests for all seven ranges and invalid-range rejection**

Read `backend/tests/test_market_router.py`'s existing chart-related tests (`test_get_chart_returns_points_for_a_ticker`, `test_get_chart_reports_unavailable_when_fetch_fails`, `test_get_chart_passes_ticker_and_range_through`) for the exact `patch("app.routers.market.get_chart_data", ...)` style already used.

Append to `backend/tests/test_market_router.py`:

```python
def test_get_chart_accepts_all_seven_ranges(client):
    for range_ in ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y"]:
        with patch("app.routers.market.get_chart_data", return_value=[]) as mock_get_chart_data:
            response = client.get(f"/market/chart?ticker=VTI&range={range_}")
        assert response.status_code == 200, f"range={range_} failed: {response.json()}"
        mock_get_chart_data.assert_called_once_with("VTI", range_)


def test_get_chart_rejects_an_invalid_range(client):
    response = client.get("/market/chart?ticker=VTI&range=3Y")

    assert response.status_code == 422
```

- [ ] **Step 12: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_market_router.py -v -k "seven_ranges or rejects_an_invalid"`
Expected: `test_get_chart_accepts_all_seven_ranges` FAILs on every range except `"1Y"` with a 422 (since `app.routers.market.get_chart`'s `range: ChartRange = "1Y"` parameter still only accepts `"1Y"` before Step 3 widens `ChartRange`). `test_get_chart_rejects_an_invalid_range` should already PASS even before Step 3 (an invalid range was always rejected) — if it fails, investigate before continuing.

- [ ] **Step 13: Run the full backend suite**

Run: `cd backend && python -m pytest -q`
Expected: all PASS. (160 pre-existing − 1 test removed in Step 1 + 7 new period/interval cases + 2 encoding tests + 1 cache-separation test + 2 router tests = 171.)

- [ ] **Step 14: Commit**

```bash
git add backend/app/chart_service.py backend/app/schemas.py backend/tests/test_chart_service.py backend/tests/test_market_router.py
git commit -m "feat: complete the range-to-interval mapping and intraday timestamp encoding"
```

---

### Task 2: Frontend — range selector, widened types, and the ticker+range remount fix

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/hooks/useChartData.ts`
- Modify: `frontend/src/hooks/useChartData.test.tsx`
- Modify: `frontend/src/components/PriceChart.tsx`
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/pages/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `GET /market/chart?ticker=X&range=Y` from Task 1, now returning `{"points": [{"time": string|number, "close": number}, ...] | null}` for all seven ranges.
- Produces: nothing consumed by a later task — this is the final task of this ticket.

**Global Constraints for this task specifically** (read before writing any code):

Ticket 1 shipped a hard-won fix for a Critical bug: when the selected ticker changed, the newly-created chart briefly (or, on a slow/failing fetch, for the whole loading window) displayed the outgoing ticker's stale price line. The fix required two coordinated pieces, and **both must be widened from "keyed on ticker" to "keyed on ticker+range" together** in this task, or the exact same bug reappears for a range change on the same ticker:

1. `frontend/src/pages/DashboardPage.tsx` gives `<PriceChart>` a `key` prop so React fully remounts the chart (fresh `createChart()`, old instance's `remove()` runs) whenever the key changes. Today the key is `key={selectedTicker}` — it must become a key that changes on either ticker OR range change.
2. `frontend/src/hooks/useChartData.ts` resets its `points` state *synchronously during render* (not inside `useEffect`) the instant its identity changes, using a `useRef`-tracked previous value compared during the render body — **not** inside `useEffect` — because a child component's mount effects (the newly-remounted `PriceChart`'s `createChart` and its `setData`-calling effect) run *before* the parent's own effects in the same commit. If `points` were still cleared from inside `useChartData`'s `useEffect`, the freshly-mounted chart's own effect would run first and could draw the stale data before the reset ever lands. Read the existing comment in `useChartData.ts` above `prevTickerRef` — it explains this in detail; do not remove or contradict it, just widen what's being compared. Today it compares only `ticker`; it must compare a combined ticker+range identity.

Get both widened consistently in the same commit — a mismatch between what `DashboardPage`'s key tracks and what `useChartData`'s render-phase reset tracks reopens the bug for whichever kind of change (ticker or range) falls outside the narrower one.

- [ ] **Step 1: Write the failing test for the widened `ChartRange` type and `ChartPoint.time`**

Read `frontend/src/api/types.ts`'s current `ChartRange`/`ChartPoint`/`ChartData` definitions first (near the end of the file).

Read `frontend/src/api/client.test.ts`'s existing `getChartData` test for style, then add this test right after it:

```ts
  it('getChartData accepts every range value', async () => {
    mockFetchOnce({ points: [{ time: 1735808400, close: 100 }] });

    await getChartData('VTI', '1D');

    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/market/chart?ticker=VTI&range=1D', expect.objectContaining({ method: undefined }));
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/api/client.test.ts`
Expected: FAIL — TypeScript error, `'1D'` is not assignable to `ChartRange` (which is currently just `'1Y'`). (Vitest's esbuild transform doesn't type-check at runtime, so this may show as a runtime assertion failure instead if the URL still resolves — either failure mode confirms red state; if genuinely unsure, also run `npx tsc -b` and confirm it reports the type error.)

- [ ] **Step 3: Widen the types**

In `frontend/src/api/types.ts`, replace:

```ts
export type ChartRange = '1Y';

export interface ChartPoint {
  time: string;
  close: number;
}
```

with:

```ts
export type ChartRange = '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '5Y';

export interface ChartPoint {
  time: string | number;
  close: number;
}
```

(`ChartData` is unchanged — it already just wraps `ChartPoint[] | null`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/api/client.test.ts && cd .. && cd frontend && npx tsc -b`
Expected: vitest PASS, `tsc -b` clean (no output).

- [ ] **Step 5: Write the failing test for the widened render-phase reset in `useChartData`**

Read `frontend/src/hooks/useChartData.ts` in full — you are widening the existing `prevTickerRef` mechanism, not replacing the whole hook.

Read `frontend/src/hooks/useChartData.test.tsx`'s existing `'clears points immediately when the ticker changes, before the new fetch resolves'` test (near the bottom of the file) — you are adding a sibling test for a range change with the ticker held fixed.

Append to `frontend/src/hooks/useChartData.test.tsx`:

```ts
  it('clears points immediately when the range changes for the same ticker, before the new fetch resolves', async () => {
    let resolveSecond!: (value: { points: client.ChartData['points'] }) => void;
    const secondPromise = new Promise<{ points: client.ChartData['points'] }>((resolve) => {
      resolveSecond = resolve;
    });
    vi.spyOn(client, 'getChartData')
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', close: 100 }] })
      .mockReturnValueOnce(secondPromise as Promise<client.ChartData>);

    const { result, rerender } = renderHook(({ ticker, range }) => useChartData(ticker, range), {
      initialProps: { ticker: 'VTI' as string | null, range: '1Y' as const },
    });
    await waitFor(() => expect(result.current.points).toEqual([{ time: '2026-01-02', close: 100 }]));

    rerender({ ticker: 'VTI', range: '5Y' });

    // 5Y's fetch hasn't resolved yet — the 1Y-range points must not still be sitting there.
    expect(result.current.points).toBeNull();

    resolveSecond({ points: [{ time: '2026-01-02', close: 400 }] });
    await waitFor(() => expect(result.current.points).toEqual([{ time: '2026-01-02', close: 400 }]));
  });
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/hooks/useChartData.test.tsx -t "range changes for the same ticker"`
Expected: FAIL — `result.current.points` is still the 1Y data immediately after `rerender`, because the current `prevTickerRef` guard only compares `ticker`, and `ticker` didn't change here.

- [ ] **Step 7: Widen the render-phase reset**

In `frontend/src/hooks/useChartData.ts`, find this block (just above the `useEffect`):

```ts
  const prevTickerRef = useRef(ticker);
  if (prevTickerRef.current !== ticker) {
    prevTickerRef.current = ticker;
    setPoints(null);
  }
```

Replace it with:

```ts
  // Compares ticker+range together, not just ticker — switching range for the same ticker must
  // clear points just as reliably as switching ticker does, for the exact same reason (see the
  // comment above the useEffect below): a remounted PriceChart's own mount effect runs before
  // this hook's effect can clear stale data, so the reset must happen synchronously during render.
  const prevKeyRef = useRef(`${ticker ?? ''}|${range}`);
  const currentKey = `${ticker ?? ''}|${range}`;
  if (prevKeyRef.current !== currentKey) {
    prevKeyRef.current = currentKey;
    setPoints(null);
  }
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/hooks/useChartData.test.tsx`
Expected: all PASS (8 tests: the 7 existing plus the new one).

- [ ] **Step 9: Write the failing tests for the range selector and the range-change remount fix**

Read `frontend/src/pages/DashboardPage.tsx` and `frontend/src/pages/DashboardPage.test.tsx` in full — you are adding a range `<select>` next to the existing ticker `<select>`, and widening the `<PriceChart>` key.

Append to `frontend/src/pages/DashboardPage.test.tsx`:

```tsx
  it('shows a range selector once a ticker is selected, defaulting to 1 year', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', close: 100 }] });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    expect(screen.queryByLabelText(/range/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

    await waitFor(() => expect(screen.getByLabelText(/range/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/range/i)).toHaveValue('1Y');
  });

  it('refetches with the new range when the range selector changes', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', close: 100 }] });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(client.getChartData).toHaveBeenCalledWith('AAPL', '1Y'));

    fireEvent.change(screen.getByLabelText(/range/i), { target: { value: '5Y' } });

    await waitFor(() => expect(client.getChartData).toHaveBeenCalledWith('AAPL', '5Y'));
  });

  it('remounts the chart when only the range changes for the same ticker', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', close: 100 }] });

    const firstRemove = vi.fn();
    const secondRemove = vi.fn();
    vi.mocked(createChart)
      .mockReturnValueOnce({
        addSeries: vi.fn(() => ({ setData: vi.fn() })),
        remove: firstRemove,
      } as unknown as ReturnType<typeof createChart>)
      .mockReturnValueOnce({
        addSeries: vi.fn(() => ({ setData: vi.fn() })),
        remove: secondRemove,
      } as unknown as ReturnType<typeof createChart>);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(createChart).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText(/range/i), { target: { value: '5Y' } });

    await waitFor(() => expect(createChart).toHaveBeenCalledTimes(2));
    expect(firstRemove).toHaveBeenCalledTimes(1);
  });

  it('never draws the previous range stale data onto the freshly-remounted chart when the new range fetch fails', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData')
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', close: 100 }] })
      .mockRejectedValueOnce(new client.ApiError(502, 'upstream error'));

    const firstSetData = vi.fn();
    const secondSetData = vi.fn();
    vi.mocked(createChart)
      .mockReturnValueOnce({
        addSeries: vi.fn(() => ({ setData: firstSetData })),
        remove: vi.fn(),
      } as unknown as ReturnType<typeof createChart>)
      .mockReturnValueOnce({
        addSeries: vi.fn(() => ({ setData: secondSetData })),
        remove: vi.fn(),
      } as unknown as ReturnType<typeof createChart>);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(firstSetData).toHaveBeenCalledWith([{ time: '2026-01-02', value: 100 }]));

    fireEvent.change(screen.getByLabelText(/range/i), { target: { value: '5Y' } });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('upstream error'));
    expect(secondSetData).not.toHaveBeenCalled();
  });
```

- [ ] **Step 10: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/DashboardPage.test.tsx`
Expected: FAIL — there is no range `<select>` in `DashboardPage.tsx` yet, so `screen.getByLabelText(/range/i)` cannot find anything in every new test.

- [ ] **Step 11: Add the range selector and widen the `PriceChart` key**

Read `frontend/src/pages/DashboardPage.tsx`'s current full contents first.

Replace the file's full contents with:

```tsx
// frontend/src/pages/DashboardPage.tsx
import { useState } from 'react';
import { PriceChart } from '../components/PriceChart';
import { useChartData } from '../hooks/useChartData';
import { useDashboardTickers } from '../hooks/useDashboardTickers';
import type { ChartRange } from '../api/types';

const RANGES: { value: ChartRange; label: string }[] = [
  { value: '1D', label: '1 day' },
  { value: '5D', label: '5 days' },
  { value: '1M', label: '1 month' },
  { value: '6M', label: '6 months' },
  { value: 'YTD', label: 'Year to date' },
  { value: '1Y', label: '1 year' },
  { value: '5Y', label: '5 years' },
];

export function DashboardPage() {
  const { tickers, loading: tickersLoading, error: tickersError } = useDashboardTickers();
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [range, setRange] = useState<ChartRange>('1Y');
  const { points, loading, error } = useChartData(selectedTicker, range);

  return (
    <div>
      <h2>Dashboard</h2>

      {tickersError ? (
        <div role="alert">{tickersError}</div>
      ) : tickersLoading ? (
        <div>Loading tickers…</div>
      ) : tickers.length === 0 ? (
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

          {selectedTicker && (
            <>
              <label htmlFor="dashboard-range">Range</label>
              <select id="dashboard-range" value={range} onChange={(e) => setRange(e.target.value as ChartRange)}>
                {RANGES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>

              <PriceChart key={`${selectedTicker}|${range}`} points={points} loading={loading} error={error} />
            </>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/DashboardPage.test.tsx`
Expected: all PASS (11 tests: the 7 existing plus the 4 new ones from Step 9).

- [ ] **Step 13: Verify `PriceChart`'s numeric-timestamp handling type-checks**

Read `node_modules/lightweight-charts/dist/typings.d.ts` and confirm: `export type Time = UTCTimestamp | BusinessDay | string;` and `export type UTCTimestamp = Nominal<number, "UTCTimestamp">;` (a branded/nominal number type). A plain `string` for `time` already satisfies `Time` directly (this is why Ticket 1's code type-checked with no cast). A plain `number`, however, does **not** structurally satisfy the branded `UTCTimestamp` without an explicit cast — passing a `number` where `Time` is expected will fail `tsc -b` once `ChartPoint.time` includes `number`.

Read `frontend/src/components/PriceChart.tsx`'s current data-sync effect:

```ts
  useEffect(() => {
    if (seriesRef.current === null || points === null) return;
    seriesRef.current.setData(points.map((point) => ({ time: point.time, value: point.close })));
  }, [points]);
```

Update the import line at the top of the file from:

```ts
import { createChart, LineSeries, type IChartApi, type ISeriesApi } from 'lightweight-charts';
```

to:

```ts
import { createChart, LineSeries, type IChartApi, type ISeriesApi, type Time, type UTCTimestamp } from 'lightweight-charts';
```

And update the data-sync effect to cast a numeric `time` to `UTCTimestamp` (a plain string still passes through unchanged, satisfying `Time` directly):

```ts
  useEffect(() => {
    if (seriesRef.current === null || points === null) return;
    seriesRef.current.setData(
      points.map((point) => ({
        time: (typeof point.time === 'number' ? (point.time as UTCTimestamp) : point.time) as Time,
        value: point.close,
      })),
    );
  }, [points]);
```

- [ ] **Step 14: Run the full frontend suite and type check**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: all tests PASS (244 pre-existing + 1 client.test.ts + 1 useChartData.test.tsx + 4 DashboardPage.test.tsx = 250), `tsc -b` exits with no output.

- [ ] **Step 15: Add a regression test proving intraday points (numeric `time`) reach `setData` correctly**

Read `frontend/src/components/PriceChart.test.tsx`'s existing `'calls setData with close mapped to value when points are provided'` test for style.

Append to `frontend/src/components/PriceChart.test.tsx`:

```tsx
  it('passes a numeric time through to setData for intraday points', () => {
    render(
      <PriceChart
        points={[
          { time: 1735808400, close: 100 },
          { time: 1735808700, close: 101.5 },
        ]}
        loading={false}
        error={null}
      />,
    );

    expect(setData).toHaveBeenCalledWith([
      { time: 1735808400, value: 100 },
      { time: 1735808700, value: 101.5 },
    ]);
  });
```

Run: `cd frontend && npx vitest run src/components/PriceChart.test.tsx`
Expected: PASS (7 tests: the 6 existing plus this one) — this test should already pass immediately given Step 13's implementation, since `PriceChart.tsx` doesn't need further changes; this step exists to lock the behavior in with a test, not to drive new code.

- [ ] **Step 16: Run the full frontend suite one more time**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: all tests PASS (251 total), `tsc -b` clean.

- [ ] **Step 17: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.test.ts frontend/src/hooks/useChartData.ts frontend/src/hooks/useChartData.test.tsx frontend/src/components/PriceChart.tsx frontend/src/components/PriceChart.test.tsx frontend/src/pages/DashboardPage.tsx frontend/src/pages/DashboardPage.test.tsx
git commit -m "feat: add the Dashboard range selector"
```

---

## Final Verification

- [ ] `cd backend && python -m pytest -q` → all pass (171)
- [ ] `cd frontend && npx vitest run` → all pass (251)
- [ ] `cd frontend && npx tsc -b` → no output (clean)
- [ ] Manually confirm: open the app, select a ticker on the Dashboard tab, switch through all seven range options, and watch the chart redraw each time with no stale line ever visible from a prior range — requires a real backend + real yfinance access, which the automated tests (all of which mock `_fetch_from_provider`/`getChartData`/`lightweight-charts`) cannot verify.
