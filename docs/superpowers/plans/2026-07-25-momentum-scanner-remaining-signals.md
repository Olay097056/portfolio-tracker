# Momentum Scanner Remaining Signals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Ticket 4 of `tickets.md`: fill out the Momentum Scanner's three remaining signals — 14-period RSI, latest volume against its 20-period average, and price's percent distance from its 50-period simple moving average — as additional sortable columns on the table the walking-skeleton ticket already proved out.

**Architecture:** Purely additive to Ticket 3's infrastructure. `signals.py` gains three more pure functions alongside `percent_change`. The existing `/watchlist/scan/price-signals` endpoint and `PriceSignalOut` schema grow three more nullable fields — same endpoint, same request shape, no new route. `PriceSignalRow` grows to match. `MomentumScanner` grows three more `<th>`/`<td>` columns, each independently sortable and each independently null-safe, since a ticker can have enough history for one signal's lookback window but not another's.

**Tech Stack:** FastAPI, pytest (backend). React 19, TypeScript, Vitest (frontend). Matches Ticket 3 exactly.

## Global Constraints

- Every new signal function in `signals.py` stays pure: a plain list of numbers in, a number or `None` out, no I/O, no ticker awareness — matches `percent_change`'s existing shape exactly.
- A signal whose lookback window exceeds the available history returns `None` for that signal alone — the other signals for the same ticker must still compute normally. Never fabricate or interpolate a value for missing history.
- Use `??`/`== null` for null-checks on the frontend, not `=== null`, per the final review of the prior ticket: with four nullable numeric fields now (was one), an `=== null` check silently lets a future `undefined` field fall through to `.toFixed()` and crash the row, where `??`/`== null` catches both.
- Export `PriceSignalsScanState` as `ReturnType<typeof usePriceSignalsScan>` from the hook itself rather than hand-duplicating the interface in `MomentumScanner.tsx` — flagged by the prior ticket's final review as a duplication that would only get worse; this ticket is the first natural point to fix it since both files are already being touched.
- Follow existing code style: no comments except where a non-obvious constraint needs explaining, no abstractions beyond what this task needs.
- `cd backend && python -m pytest` and `cd frontend && npx tsc -b` must both be clean.

---

### Task 1: Backend — RSI, volume ratio, and distance-from-SMA signal functions

**Files:**
- Modify: `backend/app/signals.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/watchlist.py`
- Modify: `backend/tests/test_signals.py`
- Modify: `backend/tests/test_watchlist_scan_router.py`

**Interfaces:**
- Consumes: `history_service.get_history` bars (already returns `close`, `high`, `low`, `volume` per bar — no history-service change needed, Ticket 3 already provisioned these fields for this exact purpose).
- Produces: `signals.rsi(closes: list[float], period: int = 14) -> float | None`, `signals.volume_ratio(volumes: list[float], period: int = 20) -> float | None`, `signals.distance_from_sma(closes: list[float], period: int = 50) -> float | None`. `PriceSignalOut`/the endpoint response grows three new nullable fields: `rsi_14`, `volume_ratio`, `distance_from_sma50_pct`. Task 2's frontend types are written to this exact field set.

- [ ] **Step 1: Write the failing tests for the three new signal functions**

```python
# Append to backend/tests/test_signals.py
from app.signals import distance_from_sma, rsi, volume_ratio


def test_rsi_all_gains_returns_100():
    closes = [100.0 + i for i in range(15)]

    result = rsi(closes, 14)

    assert result == pytest.approx(100.0)


def test_rsi_mixed_gains_and_losses():
    # 14 changes: +1 seven times, -1 seven times, alternating -> avg_gain = avg_loss -> RSI = 50
    closes = [100.0]
    for _ in range(7):
        closes.append(closes[-1] + 1)
        closes.append(closes[-1] - 1)

    result = rsi(closes, 14)

    assert result == pytest.approx(50.0)


def test_rsi_returns_none_when_not_enough_history():
    closes = [100.0, 101.0, 102.0]

    result = rsi(closes, 14)

    assert result is None


def test_rsi_with_exactly_enough_history():
    closes = [100.0 + i for i in range(15)]

    result = rsi(closes, 14)

    assert result is not None


def test_volume_ratio_above_average():
    volumes = [1000.0] * 20 + [2000.0]

    result = volume_ratio(volumes, 20)

    assert result == pytest.approx(2.0)


def test_volume_ratio_returns_none_when_not_enough_history():
    volumes = [1000.0] * 5

    result = volume_ratio(volumes, 20)

    assert result is None


def test_volume_ratio_returns_none_when_average_is_zero():
    volumes = [0.0] * 20 + [500.0]

    result = volume_ratio(volumes, 20)

    assert result is None


def test_distance_from_sma_above_average():
    closes = [100.0] * 49 + [110.0]

    result = distance_from_sma(closes, 50)

    assert result == pytest.approx(0.2)


def test_distance_from_sma_below_average():
    closes = [100.0] * 49 + [90.0]

    result = distance_from_sma(closes, 50)

    assert result == pytest.approx(-0.2)


def test_distance_from_sma_returns_none_when_not_enough_history():
    closes = [100.0] * 10

    result = distance_from_sma(closes, 50)

    assert result is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_signals.py -v`
Expected: FAIL — `ImportError: cannot import name 'rsi' from 'app.signals'`

- [ ] **Step 3: Implement the three functions**

Append to `backend/app/signals.py`:

```python
def rsi(closes: list[float], period: int = 14) -> float | None:
    if len(closes) < period + 1:
        return None
    changes = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    recent = changes[-period:]
    gains = [c for c in recent if c > 0]
    losses = [-c for c in recent if c < 0]
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def volume_ratio(volumes: list[float], period: int = 20) -> float | None:
    if len(volumes) < period + 1:
        return None
    latest = volumes[-1]
    average = sum(volumes[-(period + 1) : -1]) / period
    if average <= 0:
        return None
    return latest / average


def distance_from_sma(closes: list[float], period: int = 50) -> float | None:
    if len(closes) < period:
        return None
    average = sum(closes[-period:]) / period
    if average <= 0:
        return None
    return (closes[-1] - average) / average * 100
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_signals.py -v`
Expected: PASS (14 tests total: 5 existing `percent_change` + 9 new)

- [ ] **Step 5: Extend the response schema**

Modify `backend/app/schemas.py` — replace the `PriceSignalOut` class with:

```python
class PriceSignalOut(BaseModel):
    ticker: str
    percent_change_pct: float | None
    rsi_14: float | None
    volume_ratio: float | None
    distance_from_sma50_pct: float | None
```

- [ ] **Step 6: Write the failing tests for the extended endpoint**

Append to `backend/tests/test_watchlist_scan_router.py`:

```python
def test_scan_price_signal_includes_rsi_volume_ratio_and_sma_distance(client):
    bars = [{"close": 100.0, "high": 101.0, "low": 99.0, "volume": 1000.0} for _ in range(50)]
    bars.append({"close": 110.0, "high": 111.0, "low": 109.0, "volume": 2000.0})

    with patch("app.routers.watchlist.get_history", return_value=bars):
        response = client.get("/watchlist/scan/price-signals", params={"ticker": "VTI", "period": "1d"})

    body = response.json()
    assert body["rsi_14"] == pytest.approx(100.0)
    assert body["volume_ratio"] == pytest.approx(2.0)
    assert body["distance_from_sma50_pct"] is not None


def test_scan_price_signal_returns_null_signals_when_history_unavailable(client):
    with patch("app.routers.watchlist.get_history", return_value=None):
        response = client.get("/watchlist/scan/price-signals", params={"ticker": "BADTICKER", "period": "1d"})

    assert response.json() == {
        "ticker": "BADTICKER",
        "percent_change_pct": None,
        "rsi_14": None,
        "volume_ratio": None,
        "distance_from_sma50_pct": None,
    }


def test_scan_price_signal_computes_available_signals_when_history_is_partial(client):
    # 10 bars: enough for percent_change(1d) but not enough for rsi(14), volume_ratio(20), or sma(50)
    bars = [{"close": 100.0 + i, "high": 101.0, "low": 99.0, "volume": 1000.0} for i in range(10)]

    with patch("app.routers.watchlist.get_history", return_value=bars):
        response = client.get("/watchlist/scan/price-signals", params={"ticker": "VTI", "period": "1d"})

    body = response.json()
    assert body["percent_change_pct"] is not None
    assert body["rsi_14"] is None
    assert body["volume_ratio"] is None
    assert body["distance_from_sma50_pct"] is None
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_watchlist_scan_router.py -v`
Expected: FAIL — `KeyError: 'rsi_14'` (field doesn't exist on the response yet)

- [ ] **Step 8: Update the route handler**

In `backend/app/routers/watchlist.py`, change the import line `from app.signals import percent_change` to `from app.signals import distance_from_sma, percent_change, rsi, volume_ratio`, and replace the `scan_price_signal` function with:

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
        )
    closes = [bar["close"] for bar in bars]
    volumes = [bar["volume"] for bar in bars]
    return PriceSignalOut(
        ticker=ticker,
        percent_change_pct=percent_change(closes, PERIOD_TRADING_DAYS[period]),
        rsi_14=rsi(closes),
        volume_ratio=volume_ratio(volumes),
        distance_from_sma50_pct=distance_from_sma(closes),
    )
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_watchlist_scan_router.py -v`
Expected: PASS (8 tests total: 5 existing + 3 new)

- [ ] **Step 10: Run the full backend suite**

Run: `cd backend && python -m pytest`
Expected: All tests pass (79 pre-existing + 9 signal + 3 router = 91).

- [ ] **Step 11: Commit**

```bash
git add backend/app/signals.py backend/app/schemas.py backend/app/routers/watchlist.py backend/tests/test_signals.py backend/tests/test_watchlist_scan_router.py
git commit -m "feat: add RSI, volume ratio, and distance-from-SMA signals to price-signals endpoint"
```

---

### Task 2: Frontend — extend types and render the three new columns

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/hooks/usePriceSignalsScan.ts`
- Modify: `frontend/src/components/MomentumScanner.tsx`
- Modify: `frontend/src/components/MomentumScanner.test.tsx`

**Interfaces:**
- Consumes: Task 1's extended `PriceSignalOut` response.
- Produces: `PriceSignalRow` grows `rsi_14`, `volume_ratio`, `distance_from_sma50_pct` (all `number | null`); `usePriceSignalsScan.ts` now exports `PriceSignalsScanState = ReturnType<typeof usePriceSignalsScan>` — Ticket 5's Pre-Squeeze tab imports this type from the hook rather than redefining it a third time.

- [ ] **Step 1: Extend the `PriceSignalRow` type**

In `frontend/src/api/types.ts`, replace the `PriceSignalRow` interface with:

```ts
export interface PriceSignalRow {
  ticker: string;
  percent_change_pct: number | null;
  rsi_14: number | null;
  volume_ratio: number | null;
  distance_from_sma50_pct: number | null;
}
```

- [ ] **Step 2: Export `PriceSignalsScanState` from the hook**

In `frontend/src/hooks/usePriceSignalsScan.ts`, add this line immediately after the `usePriceSignalsScan` function definition (at the end of the file):

```ts
export type PriceSignalsScanState = ReturnType<typeof usePriceSignalsScan>;
```

- [ ] **Step 3: Write the failing tests for the new columns**

Replace the existing test `'scans each watchlist ticker, shows progress, disables the button, then renders results'` in `frontend/src/components/MomentumScanner.test.tsx` with:

```tsx
  it('scans each watchlist ticker, shows progress, disables the button, then renders all four signal columns', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'VTI', category: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 2, ticker: 'SPY', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getPriceSignal').mockImplementation(async (ticker) => ({
      ticker,
      percent_change_pct: ticker === 'VTI' ? 1.5 : -2.25,
      rsi_14: ticker === 'VTI' ? 65.4 : 32.1,
      volume_ratio: ticker === 'VTI' ? 1.8 : 0.9,
      distance_from_sma50_pct: ticker === 'VTI' ? 3.2 : -1.1,
    }));

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => expect(screen.getByText('VTI')).toBeInTheDocument());
    expect(screen.getByText('SPY')).toBeInTheDocument();
    expect(screen.getByText('1.50%')).toBeInTheDocument();
    expect(screen.getByText('-2.25%')).toBeInTheDocument();
    expect(screen.getByText('65.40')).toBeInTheDocument();
    expect(screen.getByText('32.10')).toBeInTheDocument();
    expect(screen.getByText('1.80')).toBeInTheDocument();
    expect(screen.getByText('0.90')).toBeInTheDocument();
    expect(screen.getByText('3.20%')).toBeInTheDocument();
    expect(screen.getByText('-1.10%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^scan$/i })).not.toBeDisabled();
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
    });

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => expect(screen.getByText('NEWLISTING')).toBeInTheDocument());
    expect(screen.getByText('4.00%')).toBeInTheDocument();
    expect(screen.getAllByText('Unavailable')).toHaveLength(3);
  });
```

Also update the existing test `'shows a row marked unavailable for a ticker whose signal could not be fetched'` — the mocked rejection path is unchanged, but confirm it still asserts `screen.getByText(/unavailable/i)` (singular match via regex is fine there since it only needs to prove at least one unavailable cell renders); no change needed to that test's body.

Update the existing test `'sends the selected period to getPriceSignal'` — no change needed, `getPriceSignal`'s call signature (`ticker`, `period`) is unchanged by this ticket.

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/MomentumScanner.test.tsx`
Expected: FAIL — new columns/cells don't exist yet.

- [ ] **Step 5: Implement the extended `MomentumScanner`**

Replace the full contents of `frontend/src/components/MomentumScanner.tsx` with:

```tsx
// frontend/src/components/MomentumScanner.tsx
import { useState } from 'react';
import type { PriceSignalRow, ScanPeriod } from '../api/types';
import type { PriceSignalsScanState } from '../hooks/usePriceSignalsScan';
import { useWatchlist } from '../hooks/useWatchlist';

interface MomentumScannerProps {
  scanState: PriceSignalsScanState;
}

type SortColumn = 'percent_change_pct' | 'rsi_14' | 'volume_ratio' | 'distance_from_sma50_pct';
type SortDirection = 'asc' | 'desc';

function formatSignedPercent(value: number | null | undefined): string {
  return value == null ? 'Unavailable' : `${value.toFixed(2)}%`;
}

function formatNumber(value: number | null | undefined): string {
  return value == null ? 'Unavailable' : value.toFixed(2);
}

export function MomentumScanner({ scanState }: MomentumScannerProps) {
  const { items, loading } = useWatchlist();
  const [period, setPeriod] = useState<ScanPeriod>('1w');
  const [sortColumn, setSortColumn] = useState<SortColumn>('percent_change_pct');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const { results, scannedPeriod, scanning, progress, scan } = scanState;

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
    const aValue = a[sortColumn];
    const bValue = b[sortColumn];
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

  async function handleScan() {
    await scan(
      items.map((item) => item.ticker),
      period,
    );
  }

  const headingPeriod = scannedPeriod ?? period;

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
                <button type="button" onClick={() => toggleSort('percent_change_pct')}>
                  % change ({headingPeriod})
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort('rsi_14')}>
                  RSI (14)
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort('volume_ratio')}>
                  Volume vs 20-day avg
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort('distance_from_sma50_pct')}>
                  Distance from SMA (50)
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.ticker}>
                <td>{row.ticker}</td>
                <td>{formatSignedPercent(row.percent_change_pct)}</td>
                <td>{formatNumber(row.rsi_14)}</td>
                <td>{formatNumber(row.volume_ratio)}</td>
                <td>{formatSignedPercent(row.distance_from_sma50_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

Note: the `PriceSignalsScanState` interface that was previously hand-declared inside this file is gone — it's now imported from the hook, per the Global Constraints prefactor.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/MomentumScanner.test.tsx`
Expected: PASS (7 tests: the 5 originals minus the one replaced, plus the replacement, plus the new unavailable-signal test — net 6 unique test names, verify actual count matches what's in the file after Step 3's edits)

- [ ] **Step 7: Run the full frontend suite and typecheck**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: All tests pass, `tsc -b` clean. Confirm no other file imports the old hand-declared `PriceSignalsScanState` from `MomentumScanner.tsx` (nothing did as of this plan being written — Ticket 5 will be the first).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/hooks/usePriceSignalsScan.ts frontend/src/components/MomentumScanner.tsx frontend/src/components/MomentumScanner.test.tsx
git commit -m "feat: render RSI, volume ratio, and distance-from-SMA columns in Momentum Scanner"
```

## Self-Review

**1. Spec coverage:** Ticket 4's acceptance criteria map to: pure functions with hand-computed tests including insufficient-history cases (Task 1 Steps 1-4), sortable columns with period/parameter-stating headings (Task 2 Step 5's `<th>` labels), per-signal (not per-row) null handling verified by Task 1 Step 6's partial-history test and Task 2 Step 3's unavailable-signal test, no composite score / no social column (nothing of the sort appears anywhere in this plan).

**2. Placeholder scan:** No TBD/TODO markers. All code blocks are complete file replacements or complete appended functions.

**3. Type consistency:** `PriceSignalOut`'s four field names (Task 1 Step 5) match `PriceSignalRow`'s four field names (Task 2 Step 1) exactly — same task-pair discipline as Ticket 3. `PriceSignalsScanState` is defined once (Task 2 Step 2) and imported, not redeclared, in `MomentumScanner.tsx` (Task 2 Step 5) — resolves the duplication flagged by Ticket 3's final review before Ticket 5 could make it worse.
