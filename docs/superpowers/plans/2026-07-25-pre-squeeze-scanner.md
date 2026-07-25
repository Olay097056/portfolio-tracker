# Pre-Squeeze Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Ticket 5 of `tickets.md`: a Pre-Squeeze Scanner sub-tab measuring volatility contraction relative to each ticker's *own* recent history — Bollinger Band width, that width's percentile against the ticker's trailing six months, ATR as a percent of price, and the volume ratio Momentum already computes. It rides the same cached history and the same `/watchlist/scan/price-signals` endpoint as Momentum, so a scan in either tab populates both with no second request.

**Architecture:** Backend: three more pure functions in `signals.py` (`bollinger_band_width_pct`, `bollinger_band_width_percentile`, `atr_pct`), three more nullable fields on `PriceSignalOut`/the route — same additive pattern Ticket 4 already established. Frontend: before adding the new tab, this plan resolves two things Ticket 4's final review flagged as blocking Ticket 5 specifically — the shared `scan()` always required a `period`, but Pre-Squeeze has no period selector and would otherwise silently relabel Momentum's heading; and `formatSignedPercent`/`formatNumber` were only ever declared inside `MomentumScanner.tsx`, which Pre-Squeeze would have had to duplicate a third time. Both are fixed in a small prefactor task before `PreSqueezeScanner` is written, the same "make the change easy, then make the easy change" discipline Ticket 1 used for `TabStrip`.

**Tech Stack:** FastAPI, pytest (backend). React 19, TypeScript, Vitest (frontend). Matches Tickets 3–4 exactly.

## Global Constraints

- Every new function in `signals.py` stays pure: plain lists of numbers in, a number or `None` out, no I/O, no ticker awareness.
- `bollinger_band_width_percentile` measures a ticker's current band width against **its own trailing six months** (126 trading days), never against other tickers — this is the literal definition of "pre-squeeze" recorded in `CONTEXT.md`. Getting this scoped to one ticker's own history, not a cross-ticker comparison, is the one thing in this ticket that must not be gotten wrong.
- `atr_pct` needs `high`, `low`, and `close` per bar — all three were already provisioned on `history_service.Bar` back in Ticket 3 specifically for this ticket's use; no history-service change is needed.
- `volume_ratio` is **reused as-is** from `PriceSignalRow` — Pre-Squeeze reads the same field Momentum already renders. It is not recomputed, redefined, or given a second name.
- **`scan()`'s `period` parameter becomes optional.** Momentum's own calls keep passing it explicitly (no behavior change there). A caller that omits it — Pre-Squeeze, which has no period selector and doesn't display `percent_change_pct` — reuses whichever period was last explicitly requested for `percent_change_pct`, and **does not update `scannedPeriod`**. This is what stops a Pre-Squeeze-triggered scan from silently relabelling Momentum's heading to a period Momentum's own user never chose, while still keeping `percent_change_pct` computed with a real, consistent period rather than an arbitrary one.
- `formatSignedPercent`/`formatNumber` move out of `MomentumScanner.tsx` into a shared `frontend/src/utils/signalFormatting.ts` before `PreSqueezeScanner.tsx` is written, so the second consumer imports rather than duplicates.
- **Sort logic is deliberately left un-genericized.** A generic `sortNullableRows<T, K extends keyof T>` was considered and rejected: making it type-safe without an `as unknown as number` cast inside the sort comparator isn't achievable without a heavier generic constraint than the ~8 lines of duplicated sort logic justify. Each scanner keeps its own `sortColumn`/`toggleSort`/comparator, matching the shape Ticket 4 already shipped in `MomentumScanner`.
- No comments except where a non-obvious constraint needs explaining. No abstractions beyond what this task needs.
- `cd backend && python -m pytest` and `cd frontend && npx tsc -b` must both be clean.

---

### Task 1: Backend — Bollinger Band width, band-width percentile, and ATR signal functions

**Files:**
- Modify: `backend/app/signals.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/watchlist.py`
- Modify: `backend/tests/test_signals.py`
- Modify: `backend/tests/test_watchlist_scan_router.py`

**Interfaces:**
- Consumes: `history_service.get_history` bars (`close`, `high`, `low`, `volume` — all already present).
- Produces: `signals.bollinger_band_width_pct(closes: list[float], period: int = 20, num_std: float = 2.0) -> float | None`, `signals.bollinger_band_width_percentile(closes: list[float], period: int = 20, num_std: float = 2.0, lookback: int = 126) -> float | None`, `signals.atr_pct(highs: list[float], lows: list[float], closes: list[float], period: int = 14) -> float | None`. `PriceSignalOut`/the endpoint response grows three more nullable fields: `bb_width_pct`, `bb_width_percentile`, `atr_pct`. Task 2's frontend types are written to this exact field set.

- [ ] **Step 1: Write the failing tests for the three new signal functions**

```python
# Append to backend/tests/test_signals.py
from app.signals import atr_pct, bollinger_band_width_pct, bollinger_band_width_percentile


def test_bollinger_band_width_pct_computes_width_as_percent_of_mean():
    closes = [100.0] * 19 + [110.0]

    result = bollinger_band_width_pct(closes, period=20, num_std=2.0)

    assert result == pytest.approx(8.674426, abs=1e-4)


def test_bollinger_band_width_pct_is_zero_for_a_flat_series():
    closes = [100.0] * 20

    result = bollinger_band_width_pct(closes, period=20, num_std=2.0)

    assert result == pytest.approx(0.0)


def test_bollinger_band_width_pct_returns_none_when_not_enough_history():
    closes = [100.0] * 10

    result = bollinger_band_width_pct(closes, period=20, num_std=2.0)

    assert result is None


def test_bollinger_band_width_percentile_ranks_todays_width_against_own_trailing_history():
    # Each of the last 3 days' own trailing-2-close width: day1 wide (110/100 swing), day2 and
    # day3 (today) both flat/zero — today ties the lowest width seen in its own 3-day lookback.
    closes = [100.0, 100.0, 100.0, 100.0, 110.0]

    result = bollinger_band_width_percentile(closes, period=2, num_std=2.0, lookback=3)

    assert result == pytest.approx(100.0)


def test_bollinger_band_width_percentile_low_when_todays_width_is_the_narrowest_seen():
    closes = [100.0, 100.0, 110.0, 100.0, 100.0]

    result = bollinger_band_width_percentile(closes, period=2, num_std=2.0, lookback=3)

    assert result == pytest.approx(33.333333, abs=1e-4)


def test_bollinger_band_width_percentile_returns_none_when_not_enough_history():
    closes = [100.0] * 4

    result = bollinger_band_width_percentile(closes, period=2, num_std=2.0, lookback=3)

    assert result is None


def test_atr_pct_computes_average_true_range_as_percent_of_latest_close():
    closes = [100.0] * 15
    highs = [101.0] * 15
    lows = [99.0] * 15

    result = atr_pct(highs, lows, closes, period=14)

    assert result == pytest.approx(2.0)


def test_atr_pct_returns_none_when_not_enough_history():
    closes = [100.0] * 5
    highs = [101.0] * 5
    lows = [99.0] * 5

    result = atr_pct(highs, lows, closes, period=14)

    assert result is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_signals.py -v`
Expected: FAIL — `ImportError: cannot import name 'atr_pct' from 'app.signals'`

- [ ] **Step 3: Implement the three functions**

Append to `backend/app/signals.py`:

```python
def bollinger_band_width_pct(closes: list[float], period: int = 20, num_std: float = 2.0) -> float | None:
    if len(closes) < period:
        return None
    window = closes[-period:]
    mean = sum(window) / period
    if mean <= 0:
        return None
    variance = sum((c - mean) ** 2 for c in window) / period
    std = variance**0.5
    upper = mean + num_std * std
    lower = mean - num_std * std
    return (upper - lower) / mean * 100


def bollinger_band_width_percentile(
    closes: list[float], period: int = 20, num_std: float = 2.0, lookback: int = 126
) -> float | None:
    if len(closes) < period + lookback:
        return None
    widths: list[float] = []
    for i in range(lookback):
        end = len(closes) - lookback + i + 1
        width = bollinger_band_width_pct(closes[:end], period, num_std)
        if width is None:
            return None
        widths.append(width)
    current = widths[-1]
    at_or_below = sum(1 for w in widths if w <= current)
    return at_or_below / len(widths) * 100


def atr_pct(highs: list[float], lows: list[float], closes: list[float], period: int = 14) -> float | None:
    if len(closes) < period + 1:
        return None
    true_ranges = []
    for i in range(1, len(closes)):
        high, low, prev_close = highs[i], lows[i], closes[i - 1]
        true_ranges.append(max(high - low, abs(high - prev_close), abs(low - prev_close)))
    average_true_range = sum(true_ranges[-period:]) / period
    latest_close = closes[-1]
    if latest_close <= 0:
        return None
    return average_true_range / latest_close * 100
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_signals.py -v`
Expected: PASS (22 tests total: 14 existing + 8 new)

- [ ] **Step 5: Extend the response schema**

In `backend/app/schemas.py`, replace `PriceSignalOut` with:

```python
class PriceSignalOut(BaseModel):
    ticker: str
    percent_change_pct: float | None
    rsi_14: float | None
    volume_ratio: float | None
    distance_from_sma50_pct: float | None
    bb_width_pct: float | None
    bb_width_percentile: float | None
    atr_pct: float | None
```

- [ ] **Step 6: Write the failing tests for the extended endpoint**

Append to `backend/tests/test_watchlist_scan_router.py`:

```python
def test_scan_price_signal_includes_bollinger_and_atr_fields(client):
    bars = [{"close": 100.0, "high": 101.0, "low": 99.0, "volume": 1000.0} for _ in range(146)]
    bars.append({"close": 110.0, "high": 111.0, "low": 109.0, "volume": 1000.0})

    with patch("app.routers.watchlist.get_history", return_value=bars):
        response = client.get("/watchlist/scan/price-signals", params={"ticker": "VTI", "period": "1d"})

    body = response.json()
    assert body["bb_width_pct"] is not None
    assert body["bb_width_percentile"] is not None
    assert body["atr_pct"] is not None


def test_scan_price_signal_returns_null_bollinger_and_atr_when_history_too_short_for_them(client):
    # 30 bars: enough for percent_change/rsi/volume_ratio/distance_from_sma-ish signals'
    # shorter windows, but short of the 126-day lookback bb_width_percentile needs.
    bars = [{"close": 100.0 + i, "high": 101.0, "low": 99.0, "volume": 1000.0} for i in range(30)]

    with patch("app.routers.watchlist.get_history", return_value=bars):
        response = client.get("/watchlist/scan/price-signals", params={"ticker": "VTI", "period": "1d"})

    body = response.json()
    assert body["percent_change_pct"] is not None
    assert body["bb_width_pct"] is not None
    assert body["bb_width_percentile"] is None
    assert body["atr_pct"] is not None


def test_scan_price_signal_returns_all_seven_fields_null_when_history_unavailable(client):
    with patch("app.routers.watchlist.get_history", return_value=None):
        response = client.get("/watchlist/scan/price-signals", params={"ticker": "BADTICKER", "period": "1d"})

    assert response.json() == {
        "ticker": "BADTICKER",
        "percent_change_pct": None,
        "rsi_14": None,
        "volume_ratio": None,
        "distance_from_sma50_pct": None,
        "bb_width_pct": None,
        "bb_width_percentile": None,
        "atr_pct": None,
    }
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_watchlist_scan_router.py -v`
Expected: FAIL — `KeyError: 'bb_width_pct'`

- [ ] **Step 8: Update the route handler**

In `backend/app/routers/watchlist.py`, change the signals import to `from app.signals import atr_pct, bollinger_band_width_pct, bollinger_band_width_percentile, distance_from_sma, percent_change, rsi, volume_ratio`, and replace `scan_price_signal` with:

```python
@router.get("/scan/price-signals", response_model=PriceSignalOut)
def scan_price_signal(ticker: str, period: Literal["1d", "1w", "1m"] = "1w"):
    bars = get_history(ticker)
    if bars is None:
        return PriceSignalOut(
            ticker=ticker,
            percent_change_pct=None,
            rsi_14=None,
            volume_ratio=None,
            distance_from_sma50_pct=None,
            bb_width_pct=None,
            bb_width_percentile=None,
            atr_pct=None,
        )
    closes = [bar["close"] for bar in bars]
    highs = [bar["high"] for bar in bars]
    lows = [bar["low"] for bar in bars]
    volumes = [bar["volume"] for bar in bars]
    return PriceSignalOut(
        ticker=ticker,
        percent_change_pct=percent_change(closes, PERIOD_TRADING_DAYS[period]),
        rsi_14=rsi(closes),
        volume_ratio=volume_ratio(volumes),
        distance_from_sma50_pct=distance_from_sma(closes),
        bb_width_pct=bollinger_band_width_pct(closes),
        bb_width_percentile=bollinger_band_width_percentile(closes),
        atr_pct=atr_pct(highs, lows, closes),
    )
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_watchlist_scan_router.py -v`
Expected: PASS (11 tests: 8 existing + 3 new)

- [ ] **Step 10: Run the full backend suite**

Run: `cd backend && python -m pytest`
Expected: All pass (92 pre-existing + 8 signal + 3 router = 103).

- [ ] **Step 11: Commit**

```bash
git add backend/app/signals.py backend/app/schemas.py backend/app/routers/watchlist.py backend/tests/test_signals.py backend/tests/test_watchlist_scan_router.py
git commit -m "feat: add Bollinger Band width, band-width percentile, and ATR signals to price-signals endpoint"
```

---

### Task 2: Frontend prefactor — shared formatters and an optional scan period

**Files:**
- Create: `frontend/src/utils/signalFormatting.ts`
- Create: `frontend/src/utils/signalFormatting.test.ts`
- Modify: `frontend/src/components/MomentumScanner.tsx`
- Modify: `frontend/src/hooks/usePriceSignalsScan.ts`
- Modify: `frontend/src/hooks/usePriceSignalsScan.test.tsx`
- Modify: `frontend/src/api/types.ts`

**Interfaces:**
- Consumes: nothing new — this task only reshapes existing Ticket 3/4 code.
- Produces: `formatSignedPercent(value: number | null | undefined): string` and `formatNumber(value: number | null | undefined): string`, exported from `signalFormatting.ts`; `usePriceSignalsScan().scan` becomes `(tickers: string[], period?: ScanPeriod) => Promise<void>`; `PriceSignalRow` grows the three new nullable fields Task 1 added to the backend. Task 3's `PreSqueezeScanner` imports both formatters and calls `scan(tickers)` with no period.

- [ ] **Step 1: Write the failing tests for the extracted formatters**

```ts
// frontend/src/utils/signalFormatting.test.ts
import { describe, expect, it } from 'vitest';
import { formatNumber, formatSignedPercent } from './signalFormatting';

describe('formatSignedPercent', () => {
  it('formats a positive value with a percent sign', () => {
    expect(formatSignedPercent(1.5)).toBe('1.50%');
  });

  it('formats a negative value with a percent sign', () => {
    expect(formatSignedPercent(-2.25)).toBe('-2.25%');
  });

  it('shows Unavailable for null', () => {
    expect(formatSignedPercent(null)).toBe('Unavailable');
  });

  it('shows Unavailable for undefined', () => {
    expect(formatSignedPercent(undefined)).toBe('Unavailable');
  });
});

describe('formatNumber', () => {
  it('formats a value to two decimal places', () => {
    expect(formatNumber(65.4)).toBe('65.40');
  });

  it('shows Unavailable for null', () => {
    expect(formatNumber(null)).toBe('Unavailable');
  });

  it('shows Unavailable for undefined', () => {
    expect(formatNumber(undefined)).toBe('Unavailable');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/utils/signalFormatting.test.ts`
Expected: FAIL — `Cannot find module './signalFormatting'`

- [ ] **Step 3: Implement `signalFormatting.ts`**

```ts
// frontend/src/utils/signalFormatting.ts
export function formatSignedPercent(value: number | null | undefined): string {
  return value == null ? 'Unavailable' : `${value.toFixed(2)}%`;
}

export function formatNumber(value: number | null | undefined): string {
  return value == null ? 'Unavailable' : value.toFixed(2);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/utils/signalFormatting.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Point `MomentumScanner` at the shared formatters**

In `frontend/src/components/MomentumScanner.tsx`, delete the local `formatSignedPercent`/`formatNumber` function declarations, and add this import line alongside the existing ones:

```ts
import { formatNumber, formatSignedPercent } from '../utils/signalFormatting';
```

- [ ] **Step 6: Run `MomentumScanner`'s existing tests to confirm this is behavior-preserving**

Run: `cd frontend && npx vitest run src/components/MomentumScanner.test.tsx`
Expected: PASS, all 8 tests, **without modifying the test file** — this is the proof the extraction changed nothing observable, same discipline as the `TabStrip` extraction in Ticket 1.

- [ ] **Step 7: Add the `PriceSignalRow` fields Task 1 added to the backend**

In `frontend/src/api/types.ts`, replace `PriceSignalRow` with:

```ts
export interface PriceSignalRow {
  ticker: string;
  percent_change_pct: number | null;
  rsi_14: number | null;
  volume_ratio: number | null;
  distance_from_sma50_pct: number | null;
  bb_width_pct: number | null;
  bb_width_percentile: number | null;
  atr_pct: number | null;
}
```

- [ ] **Step 8: Write the failing test for the optional-period scan behaviour**

Add this test to `frontend/src/hooks/usePriceSignalsScan.test.tsx`, inside the existing `describe` block (add the three new fields as `null` to every existing `PriceSignalRow`-shaped object literal already in this file — `percent_change_pct`/`ticker` pairs like `{ ticker, percent_change_pct: 1.5 }` — so the file still type-checks against the 7-field interface; this is a mechanical, no-behavior-change edit, matching what Ticket 4 already had to do to this same file):

```tsx
  it('a scan without an explicit period reuses the last explicit period for percent_change_pct, and does not change scannedPeriod', async () => {
    vi.spyOn(client, 'getPriceSignal').mockImplementation(async (ticker, period) => ({
      ticker,
      percent_change_pct: 1,
      rsi_14: null,
      volume_ratio: null,
      distance_from_sma50_pct: null,
      bb_width_pct: null,
      bb_width_percentile: null,
      atr_pct: null,
    }));

    const { result } = renderHook(() => usePriceSignalsScan());

    await act(async () => {
      await result.current.scan(['VTI'], '1m');
    });
    expect(result.current.scannedPeriod).toBe('1m');
    expect(client.getPriceSignal).toHaveBeenLastCalledWith('VTI', '1m');

    await act(async () => {
      await result.current.scan(['SPY']);
    });

    expect(client.getPriceSignal).toHaveBeenLastCalledWith('SPY', '1m');
    expect(result.current.scannedPeriod).toBe('1m');
  });
```

- [ ] **Step 9: Run the hook tests to verify the new test fails**

Run: `cd frontend && npx vitest run src/hooks/usePriceSignalsScan.test.tsx`
Expected: FAIL — `scan` currently requires a `period` argument; calling it with one argument is a type error today, and at runtime `getPriceSignal` would be called with `period: undefined`.

- [ ] **Step 10: Make `period` optional in `usePriceSignalsScan`**

Replace the full contents of `frontend/src/hooks/usePriceSignalsScan.ts` with:

```ts
// frontend/src/hooks/usePriceSignalsScan.ts
import { useCallback, useRef, useState } from 'react';
import { getPriceSignal } from '../api/client';
import type { PriceSignalRow, ScanPeriod } from '../api/types';

interface ScanProgress {
  done: number;
  total: number;
}

const DEFAULT_PERIOD: ScanPeriod = '1w';

export function usePriceSignalsScan() {
  const [results, setResults] = useState<Record<string, PriceSignalRow>>({});
  const [scannedPeriod, setScannedPeriod] = useState<ScanPeriod | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const lastExplicitPeriod = useRef<ScanPeriod>(DEFAULT_PERIOD);

  const scan = useCallback(async (tickers: string[], period?: ScanPeriod) => {
    // A caller that doesn't care about percent_change_pct's period (Pre-Squeeze has no period
    // selector and never displays that field) can omit it — the last explicitly-requested period
    // keeps feeding percent_change_pct so results stay consistently labelled, but scannedPeriod
    // itself, and therefore Momentum's heading, is left untouched by a scan Momentum didn't ask
    // for. This is what stops a Pre-Squeeze scan from silently relabelling Momentum's column.
    const effectivePeriod = period ?? lastExplicitPeriod.current;

    setScanning(true);
    setProgress({ done: 0, total: tickers.length });
    const next: Record<string, PriceSignalRow> = {};

    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i];
      try {
        next[ticker] = await getPriceSignal(ticker, effectivePeriod);
      } catch {
        // One ticker's failure must not abandon the rest of the scan — record it as
        // unavailable and keep going, per the never-fabricate-a-value rule.
        next[ticker] = {
          ticker,
          percent_change_pct: null,
          rsi_14: null,
          volume_ratio: null,
          distance_from_sma50_pct: null,
          bb_width_pct: null,
          bb_width_percentile: null,
          atr_pct: null,
        };
      }
      setProgress({ done: i + 1, total: tickers.length });
    }

    if (period !== undefined) {
      lastExplicitPeriod.current = period;
      // Recorded alongside results, not read from the caller's own period state, so a column
      // heading built from this can never desync from the data actually being displayed — even
      // after the results survive a remount (e.g. switching Watchlist sub-tabs and back).
      setScannedPeriod(period);
    }
    setResults(next);
    setScanning(false);
    setProgress(null);
  }, []);

  return { results, scannedPeriod, scanning, progress, scan };
}

export type PriceSignalsScanState = ReturnType<typeof usePriceSignalsScan>;
```

- [ ] **Step 11: Run the hook tests to verify they pass**

Run: `cd frontend && npx vitest run src/hooks/usePriceSignalsScan.test.tsx`
Expected: PASS, all tests including the new one.

- [ ] **Step 12: Run the full frontend suite and typecheck**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: All tests pass, `tsc -b` clean. `MomentumScanner.test.tsx` must show 8/8 passing **unmodified** (Step 6 already confirmed this, this is the final regression check after the other files changed).

- [ ] **Step 13: Commit**

```bash
git add frontend/src/utils/signalFormatting.ts frontend/src/utils/signalFormatting.test.ts frontend/src/components/MomentumScanner.tsx frontend/src/hooks/usePriceSignalsScan.ts frontend/src/hooks/usePriceSignalsScan.test.tsx frontend/src/api/types.ts
git commit -m "refactor: extract shared signal formatters; make scan period optional for non-Momentum callers"
```

---

### Task 3: Frontend — `PreSqueezeScanner` and `WatchlistPage` wiring

**Files:**
- Create: `frontend/src/components/PreSqueezeScanner.tsx`
- Create: `frontend/src/components/PreSqueezeScanner.test.tsx`
- Modify: `frontend/src/pages/WatchlistPage.tsx`
- Modify: `frontend/src/pages/WatchlistPage.test.tsx`

**Interfaces:**
- Consumes: `PriceSignalsScanState` (Task 2), `useWatchlist`, `formatSignedPercent`/`formatNumber` (Task 2), `TabStrip`.
- Produces: `PreSqueezeScanner({ scanState }: { scanState: PriceSignalsScanState })` with no other props — mirrors `MomentumScanner`'s prop shape exactly.

- [ ] **Step 1: Write the failing tests for `PreSqueezeScanner`**

```tsx
// frontend/src/components/PreSqueezeScanner.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { usePriceSignalsScan } from '../hooks/usePriceSignalsScan';
import { PreSqueezeScanner } from './PreSqueezeScanner';

function Wrapper() {
  const scanState = usePriceSignalsScan();
  return <PreSqueezeScanner scanState={scanState} />;
}

const fullRow = {
  percent_change_pct: 1,
  rsi_14: 1,
  volume_ratio: 1.8,
  distance_from_sma50_pct: 1,
  bb_width_pct: 4.2,
  bb_width_percentile: 12.5,
  atr_pct: 3.1,
};

describe('PreSqueezeScanner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows an empty-watchlist message and no Scan button when the watchlist has no tickers', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<Wrapper />);

    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^scan$/i })).not.toBeInTheDocument();
  });

  it('has no period selector, unlike Momentum Scanner', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'VTI', category: null, created_at: '2026-01-01T00:00:00Z' }]);

    render(<Wrapper />);

    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());
    expect(screen.queryByLabelText(/period/i)).not.toBeInTheDocument();
  });

  it('scans without a period argument and renders all four signal columns', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'VTI', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getPriceSignal').mockResolvedValue({ ticker: 'VTI', ...fullRow });

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => expect(screen.getByText('VTI')).toBeInTheDocument());
    expect(client.getPriceSignal).toHaveBeenCalledWith('VTI', '1w');
    expect(screen.getByText('4.20%')).toBeInTheDocument();
    expect(screen.getByText('12.50')).toBeInTheDocument();
    expect(screen.getByText('3.10%')).toBeInTheDocument();
    expect(screen.getByText('1.80')).toBeInTheDocument();
  });

  it('shows a signal as unavailable when its own value is null while other signals for the same ticker still render', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'NEWLISTING', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getPriceSignal').mockResolvedValue({
      ticker: 'NEWLISTING',
      percent_change_pct: 4.0,
      rsi_14: null,
      volume_ratio: null,
      distance_from_sma50_pct: null,
      bb_width_pct: null,
      bb_width_percentile: null,
      atr_pct: null,
    });

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => expect(screen.getByText('NEWLISTING')).toBeInTheDocument());
    expect(screen.getAllByText('Unavailable')).toHaveLength(4);
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
    expect(screen.getAllByText(/unavailable/i).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/PreSqueezeScanner.test.tsx`
Expected: FAIL — `Cannot find module './PreSqueezeScanner'`

- [ ] **Step 3: Implement `PreSqueezeScanner`**

```tsx
// frontend/src/components/PreSqueezeScanner.tsx
import { useState } from 'react';
import type { PriceSignalRow } from '../api/types';
import type { PriceSignalsScanState } from '../hooks/usePriceSignalsScan';
import { useWatchlist } from '../hooks/useWatchlist';
import { formatNumber, formatSignedPercent } from '../utils/signalFormatting';

interface PreSqueezeScannerProps {
  scanState: PriceSignalsScanState;
}

type SortColumn = 'bb_width_pct' | 'bb_width_percentile' | 'atr_pct' | 'volume_ratio';
type SortDirection = 'asc' | 'desc';

export function PreSqueezeScanner({ scanState }: PreSqueezeScannerProps) {
  const { items, loading } = useWatchlist();
  const [sortColumn, setSortColumn] = useState<SortColumn>('bb_width_percentile');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const { results, scanning, progress, scan } = scanState;

  if (loading) {
    return <div>Loading watchlist…</div>;
  }

  if (items.length === 0) {
    return (
      <div>
        <h3>Pre-Squeeze Scanner</h3>
        <p>Your watchlist is empty — add tickers in Manage Watchlist before scanning.</p>
      </div>
    );
  }

  const rows = items
    .map((item) => results[item.ticker])
    .filter((row): row is PriceSignalRow => row !== undefined);

  const sortedRows = [...rows].sort((a, b) => {
    const aValue = a[sortColumn];
    const bValue = b[sortColumn];
    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;
    return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
  });

  function toggleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  }

  function ariaSortFor(column: SortColumn): 'ascending' | 'descending' | undefined {
    if (sortColumn !== column) return undefined;
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  }

  async function handleScan() {
    // No period argument — Pre-Squeeze has no period selector and never displays
    // percent_change_pct, so the shared scan reuses whatever period Momentum last requested.
    await scan(items.map((item) => item.ticker));
  }

  return (
    <div>
      <h3>Pre-Squeeze Scanner</h3>

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
              <th aria-sort={ariaSortFor('bb_width_pct')}>
                <button type="button" onClick={() => toggleSort('bb_width_pct')}>
                  BB width (20, 2σ)
                </button>
              </th>
              <th aria-sort={ariaSortFor('bb_width_percentile')}>
                <button type="button" onClick={() => toggleSort('bb_width_percentile')}>
                  BB width percentile (6mo)
                </button>
              </th>
              <th aria-sort={ariaSortFor('atr_pct')}>
                <button type="button" onClick={() => toggleSort('atr_pct')}>
                  ATR (14)
                </button>
              </th>
              <th aria-sort={ariaSortFor('volume_ratio')}>
                <button type="button" onClick={() => toggleSort('volume_ratio')}>
                  Volume vs 20-day avg
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.ticker}>
                <td>{row.ticker}</td>
                <td>{formatSignedPercent(row.bb_width_pct)}</td>
                <td>{formatNumber(row.bb_width_percentile)}</td>
                <td>{formatSignedPercent(row.atr_pct)}</td>
                <td>{formatNumber(row.volume_ratio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/PreSqueezeScanner.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Write the failing tests for `WatchlistPage`'s new tab and cross-tab sharing**

Add these two tests inside the existing `describe('WatchlistPage', ...)` block in `frontend/src/pages/WatchlistPage.test.tsx`:

```tsx
  it('switches to the Pre-Squeeze Scanner sub-tab and shows its content', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<WatchlistPage />);
    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Pre-Squeeze Scanner' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Pre-Squeeze Scanner' })).toBeInTheDocument());
  });

  it('scanning on Momentum Scanner populates Pre-Squeeze Scanner too, with no second request', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'VTI', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getPriceSignal').mockResolvedValue({
      ticker: 'VTI',
      percent_change_pct: 1.5,
      rsi_14: 60,
      volume_ratio: 1.2,
      distance_from_sma50_pct: 2,
      bb_width_pct: 4.2,
      bb_width_percentile: 12.5,
      atr_pct: 3.1,
    });

    render(<WatchlistPage />);
    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Momentum Scanner' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));
    await waitFor(() => expect(screen.getByText('VTI')).toBeInTheDocument());
    expect(client.getPriceSignal).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Pre-Squeeze Scanner' }));

    await waitFor(() => expect(screen.getByText('12.50')).toBeInTheDocument());
    expect(client.getPriceSignal).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 6: Run `WatchlistPage.test.tsx` to verify the new tests fail**

Run: `cd frontend && npx vitest run src/pages/WatchlistPage.test.tsx`
Expected: FAIL on the 2 new tests — no "Pre-Squeeze Scanner" tab exists yet. All pre-existing tests must still pass.

- [ ] **Step 7: Wire `PreSqueezeScanner` into `WatchlistPage`**

Replace the full contents of `frontend/src/pages/WatchlistPage.tsx` with:

```tsx
// frontend/src/pages/WatchlistPage.tsx
import { useState } from 'react';
import { TabStrip } from '../components/TabStrip';
import { MomentumScanner } from '../components/MomentumScanner';
import { PreSqueezeScanner } from '../components/PreSqueezeScanner';
import { usePriceSignalsScan } from '../hooks/usePriceSignalsScan';
import { WatchlistManagementPage } from './WatchlistManagementPage';

type WatchlistTab = 'manage' | 'momentum' | 'pre-squeeze';

// "Manage Watchlist", not "Watchlist" — the top-level nav button in App.tsx is already labelled
// "Watchlist"; a same-labelled sub-tab button would make getByRole('button', { name: 'Watchlist' })
// ambiguous in tests (both buttons render at once) and confusing for a screen-reader user.
const TABS = [
  { id: 'manage', label: 'Manage Watchlist' },
  { id: 'momentum', label: 'Momentum Scanner' },
  { id: 'pre-squeeze', label: 'Pre-Squeeze Scanner' },
] as const satisfies { id: WatchlistTab; label: string }[];

export function WatchlistPage() {
  const [activeTab, setActiveTab] = useState<WatchlistTab>('manage');
  // Owned here, not inside either scanner tab, so scan results survive switching sub-tabs and
  // are shared between Momentum and Pre-Squeeze — one scan populates both.
  const priceSignalsScan = usePriceSignalsScan();

  return (
    <div>
      <h2>Watchlist</h2>
      <TabStrip tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'manage' && <WatchlistManagementPage />}
      {activeTab === 'momentum' && <MomentumScanner scanState={priceSignalsScan} />}
      {activeTab === 'pre-squeeze' && <PreSqueezeScanner scanState={priceSignalsScan} />}
    </div>
  );
}
```

- [ ] **Step 8: Run `WatchlistPage.test.tsx` to verify all tests pass**

Run: `cd frontend && npx vitest run src/pages/WatchlistPage.test.tsx`
Expected: PASS (all tests: 3 pre-existing + 2 new = 5)

- [ ] **Step 9: Run the full frontend suite and typecheck**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: All tests pass, `tsc -b` clean.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/PreSqueezeScanner.tsx frontend/src/components/PreSqueezeScanner.test.tsx frontend/src/pages/WatchlistPage.tsx frontend/src/pages/WatchlistPage.test.tsx
git commit -m "feat: add Pre-Squeeze Scanner tab, sharing one scan with Momentum Scanner"
```

## Self-Review

**1. Spec coverage:** Ticket 5's acceptance criteria map to: BB width/percentile/ATR with hand-computed pure-function tests including insufficient-history cases (Task 1), percentile scoped to the ticker's own trailing six months not cross-ticker (Global Constraints + Task 1 Step 1's percentile tests), volume ratio reused not recomputed (Task 3's `PreSqueezeScanner` reads `row.volume_ratio` directly from the shared `PriceSignalRow`, no new volume function), no days-to-earnings/market-cap column (nothing of the sort appears anywhere), one-scan-populates-both-tabs with no second request (Task 3 Step 5's dedicated cross-tab test), per-signal null handling (Task 3 Step 1's unavailable-signal test).

**2. Placeholder scan:** No TBD/TODO markers. All code blocks are complete file replacements or complete appended functions.

**3. Type consistency:** `PriceSignalOut` (Task 1) and `PriceSignalRow` (Task 2) both grow the same three field names in the same order. `PreSqueezeScanner`'s `PriceSignalsScanState` import (Task 3) matches the type as reshaped by Task 2 (optional `period` on `scan`), so Task 3 never needs to pass a period. The rejected generic-sort-utility decision is recorded in Global Constraints precisely so a reviewer doesn't flag the `MomentumScanner`/`PreSqueezeScanner` sort-logic duplication as an oversight — it was considered and declined for a stated reason.
