# Frontend Live Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-built `GET /portfolios/{id}/summary` endpoint into the frontend so `PortfolioCard` shows real total value/P&L/a rebalance-needed count, and `PortfolioHoldings` shows each holding's current price, value, and rebalance-severity color.

**Architecture:** A new `usePortfolioSummary(portfolioId)` hook (same shape as the existing data hooks) wraps a new `getPortfolioSummary` API client function. `PortfolioCard` and `PortfolioHoldings` each call this hook independently (self-contained data fetching, matching the existing pattern where `PortfolioHoldings` already calls `useHoldings` itself rather than receiving holdings as a prop). Holdings are enriched for display by matching the CRUD `Holding[]` list (from `useHoldings`, used for add/delete) against the summary's `HoldingStats[]` (from `usePortfolioSummary`, used for price/value/severity) by ticker.

**Tech Stack:** Same as prior frontend plans — React 19, TypeScript 5.7 (strict, zero `any`), Vite 6, Vitest 3 + Testing Library.

This is Plan 5 of the portfolio-tracker build (Plans 1-4 merged to `master`: backend foundation, React frontend foundation, frontend mutation-error handling + holdings composition, backend price data service). This plan implements the frontend half of PRD.md section 8 (rebalancing display) and part of section 10 (dashboard/portfolio value display) — the last major piece before this counts as a complete v1 slice of "look at my portfolio and see what it's actually worth."

## Global Constraints

- Zero `any`/`@ts-ignore`/`@ts-expect-error` anywhere.
- Test output must be pristine — no warnings.
- `GET /portfolios/{id}/summary` takes no request body (server fetches prices itself, per the price-data-service plan) — the frontend client function takes only a `portfolioId`.
- Holding matching between `useHoldings`'s `Holding[]` (has `id`, used for delete) and `usePortfolioSummary`'s `HoldingStats[]` (has no `id`, only `ticker`) is done BY TICKER. This assumes one holding per ticker per portfolio, which the add-holding form doesn't currently enforce — document this as a known limitation, don't try to fix it in this plan (enforcing ticker uniqueness is a backend validation change, out of scope here).
- A ticker missing from the summary's `holdings` array (e.g. because both price sources failed for it) should render gracefully — show the holding's static data (ticker/shares/avg cost, already available from `useHoldings`) without price/value/severity, not crash or hide the row.

---

## File Structure

```
portfolio-tracker/frontend/src/
  api/
    types.ts                 # MODIFY: add HoldingStats, PortfolioSummary
    client.ts                 # MODIFY: add getPortfolioSummary
    client.test.ts            # MODIFY: add test for getPortfolioSummary
  hooks/
    usePortfolioSummary.ts     # CREATE
    usePortfolioSummary.test.tsx # CREATE
  components/
    PortfolioCard.tsx          # MODIFY: show real total value + rebalance-needed count
    PortfolioCard.test.tsx     # MODIFY: mock getPortfolioSummary in existing tests, add new tests
    HoldingRow.tsx              # MODIFY: accept optional stats (price/value/severity)
    HoldingRow.test.tsx         # MODIFY: add tests for the enriched display
    PortfolioHoldings.tsx        # MODIFY: fetch summary, match by ticker, pass stats to HoldingRow
    PortfolioHoldings.test.tsx   # MODIFY: mock getPortfolioSummary, add matching tests
```

No backend changes in this plan.

---

### Task 1: API types + client function for the summary endpoint

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/client.test.ts`

**Interfaces:**
- Produces: `HoldingStats`, `PortfolioSummary` types; `getPortfolioSummary(portfolioId: number): Promise<PortfolioSummary>` function — Task 2's hook imports this by exact name. Field names copied verbatim from `backend/app/schemas.py`'s `HoldingStatsOut`/`PortfolioSummaryOut`.

- [ ] **Step 1: Add the types to `frontend/src/api/types.ts`** (append to the end of the file)

```typescript
export interface HoldingStats {
  ticker: string;
  shares: number;
  avg_cost_usd: number;
  current_price: number;
  value: number;
  current_pct: number;
  target_pct: number | null;
  deviation_pp: number | null;
  severity: 'green' | 'yellow' | 'red' | null;
  unrealized_pnl: number;
  realized_pnl: number;
}

export interface PortfolioSummary {
  id: number;
  name: string;
  cash_usd: number;
  target_allocation_pct: number | null;
  holdings_value: number;
  total_value: number;
  unrealized_pnl: number;
  realized_pnl: number;
  holdings: HoldingStats[];
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// frontend/src/api/client.test.ts (append)
it('getPortfolioSummary calls GET /portfolios/{id}/summary and returns the parsed body', async () => {
  const summary = {
    id: 1,
    name: 'DIME',
    cash_usd: 250,
    target_allocation_pct: 70,
    holdings_value: 4004.88,
    total_value: 4254.88,
    unrealized_pnl: 1751.28,
    realized_pnl: 0,
    holdings: [
      {
        ticker: 'AAPL',
        shares: 12,
        avg_cost_usd: 187.4,
        current_price: 333.74,
        value: 4004.88,
        current_pct: 100,
        target_pct: 20,
        deviation_pp: 80,
        severity: 'red' as const,
        unrealized_pnl: 1755.28,
        realized_pnl: 0,
      },
    ],
  };
  mockFetchOnce(summary);

  const result = await getPortfolioSummary(1);

  expect(fetch).toHaveBeenCalledWith(
    'http://localhost:8000/portfolios/1/summary',
    expect.objectContaining({ method: undefined }),
  );
  expect(result).toEqual(summary);
});
```

Add `getPortfolioSummary` to the existing `import { ... } from './client'` line at the top of the file.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- client.test`
Expected: FAIL — `getPortfolioSummary` is not exported from `./client` yet.

- [ ] **Step 4: Add `getPortfolioSummary` to `frontend/src/api/client.ts`**

Add the import and function:

```typescript
// frontend/src/api/client.ts
// add PortfolioSummary to the existing `import type { ... } from './types'` line
// then append this function at the end of the file:
export function getPortfolioSummary(portfolioId: number): Promise<PortfolioSummary> {
  return request<PortfolioSummary>(`/portfolios/${portfolioId}/summary`);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test -- client.test`
Expected: all `api client` tests pass (7 original + 1 new = 8).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/api/client.test.ts
git commit -m "feat: add HoldingStats/PortfolioSummary types and getPortfolioSummary client function"
```

---

### Task 2: `usePortfolioSummary` hook

**Files:**
- Create: `frontend/src/hooks/usePortfolioSummary.ts`
- Create: `frontend/src/hooks/usePortfolioSummary.test.tsx`

**Interfaces:**
- Consumes: `getPortfolioSummary` from `api/client` (Task 1).
- Produces: `usePortfolioSummary(portfolioId: number)` returning `{ summary: PortfolioSummary | null, loading: boolean, error: string | null, refetch: () => Promise<void> }` — Tasks 3-4 import this by exact name and shape.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/hooks/usePortfolioSummary.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { usePortfolioSummary } from './usePortfolioSummary';

const sampleSummary = {
  id: 1,
  name: 'DIME',
  cash_usd: 250,
  target_allocation_pct: 70,
  holdings_value: 4004.88,
  total_value: 4254.88,
  unrealized_pnl: 1755.28,
  realized_pnl: 0,
  holdings: [],
};

describe('usePortfolioSummary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the summary for the given portfolio id on mount', async () => {
    vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue(sampleSummary);

    const { result } = renderHook(() => usePortfolioSummary(1));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(client.getPortfolioSummary).toHaveBeenCalledWith(1);
    expect(result.current.summary).toEqual(sampleSummary);
    expect(result.current.error).toBeNull();
  });

  it('sets error and leaves summary null when the fetch fails', async () => {
    vi.spyOn(client, 'getPortfolioSummary').mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => usePortfolioSummary(1));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('network down');
    expect(result.current.summary).toBeNull();
  });

  it('refetches when the portfolio id changes', async () => {
    vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue(sampleSummary);

    const { result, rerender } = renderHook(({ id }) => usePortfolioSummary(id), { initialProps: { id: 1 } });
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ id: 2 });

    await waitFor(() => expect(client.getPortfolioSummary).toHaveBeenLastCalledWith(2));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- usePortfolioSummary`
Expected: FAIL — `./usePortfolioSummary` module does not exist yet.

- [ ] **Step 3: Write `frontend/src/hooks/usePortfolioSummary.ts`**

```typescript
// frontend/src/hooks/usePortfolioSummary.ts
import { useCallback, useEffect, useState } from 'react';
import { getPortfolioSummary } from '../api/client';
import type { PortfolioSummary } from '../api/types';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function usePortfolioSummary(portfolioId: number) {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPortfolioSummary(portfolioId);
      setSummary(data);
    } catch (err) {
      setError(toMessage(err));
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { summary, loading, error, refetch };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- usePortfolioSummary`
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/usePortfolioSummary.ts frontend/src/hooks/usePortfolioSummary.test.tsx
git commit -m "feat: add usePortfolioSummary hook"
```

---

### Task 3: `PortfolioCard` shows real total value and a rebalance-needed count

**Files:**
- Modify: `frontend/src/components/PortfolioCard.tsx`
- Modify: `frontend/src/components/PortfolioCard.test.tsx`

**Interfaces:**
- Consumes: `usePortfolioSummary` (Task 2).
- Produces: `PortfolioCard`'s props are UNCHANGED (`portfolio`, `onDelete`, `onToggleHoldings`, `expanded`) — it now fetches its own summary internally, no new required props, so `PortfoliosPage` needs no changes.

- [ ] **Step 1: Update the 5 existing tests to mock `getPortfolioSummary`**

`PortfolioCard` will now call `usePortfolioSummary` on render, which calls `getPortfolioSummary`. Every existing test must mock this or it will hang waiting on a real (mocked-away-but-unconfigured) fetch. At the top of `frontend/src/components/PortfolioCard.test.tsx`, add an import and a `beforeEach` that gives every test a default successful mock (individual tests can override with `vi.spyOn` again if they need different data):

```tsx
// frontend/src/components/PortfolioCard.test.tsx
// add near the top, alongside the existing imports:
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';

// add this inside the describe block, before the existing tests:
beforeEach(() => {
  vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue({
    id: portfolio.id,
    name: portfolio.name,
    cash_usd: portfolio.cash_usd,
    target_allocation_pct: portfolio.target_allocation_pct,
    holdings_value: 0,
    total_value: portfolio.cash_usd,
    unrealized_pnl: 0,
    realized_pnl: 0,
    holdings: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

Every existing `it(...)` in this file that renders `<PortfolioCard .../>` and asserts synchronously right after must now `await waitFor(...)` for the summary to load before its assertions — wrap each existing test body's render+assert in `await waitFor(() => expect(...))` for at least one assertion, so React has flushed the async summary fetch. Read the existing 5 tests and adjust each one minimally to await the summary load before asserting (e.g. the "renders name/cash/target" test should `await waitFor(() => expect(screen.getByText('DIME')).toBeInTheDocument())` before checking the rest).

- [ ] **Step 2: Write the new failing tests**

```tsx
// frontend/src/components/PortfolioCard.test.tsx (append)
it('shows the real total value from the summary once loaded', async () => {
  vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue({
    id: 1,
    name: 'DIME',
    cash_usd: 250,
    target_allocation_pct: 70,
    holdings_value: 4004.88,
    total_value: 4254.88,
    unrealized_pnl: 1755.28,
    realized_pnl: 0,
    holdings: [],
  });

  render(<PortfolioCard portfolio={portfolio} onDelete={vi.fn()} onToggleHoldings={vi.fn()} expanded={false} />);

  await waitFor(() => expect(screen.getByText(/4,254.88/)).toBeInTheDocument());
});

it('shows a rebalance-needed count when some holdings are yellow/red', async () => {
  vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue({
    id: 1,
    name: 'DIME',
    cash_usd: 0,
    target_allocation_pct: 70,
    holdings_value: 1000,
    total_value: 1000,
    unrealized_pnl: 0,
    realized_pnl: 0,
    holdings: [
      { ticker: 'AAPL', shares: 1, avg_cost_usd: 100, current_price: 100, value: 500, current_pct: 50, target_pct: 20, deviation_pp: 30, severity: 'red', unrealized_pnl: 0, realized_pnl: 0 },
      { ticker: 'SMH', shares: 1, avg_cost_usd: 100, current_price: 100, value: 500, current_pct: 50, target_pct: 50, deviation_pp: 0, severity: 'green', unrealized_pnl: 0, realized_pnl: 0 },
    ],
  });

  render(<PortfolioCard portfolio={portfolio} onDelete={vi.fn()} onToggleHoldings={vi.fn()} expanded={false} />);

  await waitFor(() => expect(screen.getByText(/1 holding needs rebalancing/i)).toBeInTheDocument());
});

it('does not show a rebalance-needed message when all holdings are green', async () => {
  vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue({
    id: 1,
    name: 'DIME',
    cash_usd: 0,
    target_allocation_pct: 70,
    holdings_value: 500,
    total_value: 500,
    unrealized_pnl: 0,
    realized_pnl: 0,
    holdings: [
      { ticker: 'AAPL', shares: 1, avg_cost_usd: 100, current_price: 100, value: 500, current_pct: 100, target_pct: 100, deviation_pp: 0, severity: 'green', unrealized_pnl: 0, realized_pnl: 0 },
    ],
  });

  render(<PortfolioCard portfolio={portfolio} onDelete={vi.fn()} onToggleHoldings={vi.fn()} expanded={false} />);

  await waitFor(() => expect(screen.getByText(/500/)).toBeInTheDocument());
  expect(screen.queryByText(/needs? rebalancing/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npm test -- PortfolioCard`
Expected: FAIL — `PortfolioCard` doesn't call `usePortfolioSummary` or render total value/rebalance count yet.

- [ ] **Step 4: Update `frontend/src/components/PortfolioCard.tsx`**

```tsx
// frontend/src/components/PortfolioCard.tsx (replace the full file)
import type { Portfolio } from '../api/types';
import { usePortfolioSummary } from '../hooks/usePortfolioSummary';

interface PortfolioCardProps {
  portfolio: Portfolio;
  onDelete: (id: number) => void;
  onToggleHoldings: (id: number) => void;
  expanded: boolean;
}

export function PortfolioCard({ portfolio, onDelete, onToggleHoldings, expanded }: PortfolioCardProps) {
  const { summary, loading, error } = usePortfolioSummary(portfolio.id);
  const needsRebalanceCount = summary
    ? summary.holdings.filter((h) => h.severity === 'yellow' || h.severity === 'red').length
    : 0;

  return (
    <div className="portfolio-card">
      <h3>{portfolio.name}</h3>
      {loading && <div>Loading value…</div>}
      {error && <div role="alert">{error}</div>}
      {summary && (
        <>
          <div>Total value: ${summary.total_value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          <div>Unrealized P&amp;L: ${summary.unrealized_pnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          {needsRebalanceCount > 0 && (
            <div role="status">
              {needsRebalanceCount} holding{needsRebalanceCount === 1 ? '' : 's'} need{needsRebalanceCount === 1 ? 's' : ''} rebalancing
            </div>
          )}
        </>
      )}
      <div>
        Target allocation: {portfolio.target_allocation_pct === null ? 'no target set' : `${portfolio.target_allocation_pct}%`}
      </div>
      <button onClick={() => onToggleHoldings(portfolio.id)}>{expanded ? 'Hide holdings' : 'Show holdings'}</button>
      <button onClick={() => onDelete(portfolio.id)}>Delete</button>
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npm test -- PortfolioCard`
Expected: all `PortfolioCard` tests pass (5 original, adjusted + 3 new = 8).

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run: `cd frontend && npm test`
Expected: all tests pass — check `PortfoliosPage.test.tsx` in particular, since it renders `PortfolioCard` indirectly; its existing mocks may need `client.getPortfolioSummary` stubbed too (add `vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue({...})` with reasonable defaults to any `PortfoliosPage` test that currently doesn't have it, following the same pattern as Step 1, if the full-suite run shows failures there).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/PortfolioCard.tsx frontend/src/components/PortfolioCard.test.tsx frontend/src/pages/PortfoliosPage.test.tsx
git commit -m "feat: show real total value and rebalance-needed count on PortfolioCard"
```

---

### Task 4: `PortfolioHoldings`/`HoldingRow` show price, value, and rebalance color per holding

**Files:**
- Modify: `frontend/src/components/HoldingRow.tsx`
- Modify: `frontend/src/components/HoldingRow.test.tsx`
- Modify: `frontend/src/components/PortfolioHoldings.tsx`
- Modify: `frontend/src/components/PortfolioHoldings.test.tsx`

**Interfaces:**
- Consumes: `usePortfolioSummary` (Task 2).
- Produces: `HoldingRow` gains an optional `stats?: HoldingStats` prop — when present, renders current price/value/a severity-colored indicator alongside the existing ticker/shares/avg-cost/delete-button; when absent (or when the ticker isn't found in the summary), renders exactly as before (graceful degradation per this plan's Global Constraints).

- [ ] **Step 1: Write the failing tests for `HoldingRow`**

```tsx
// frontend/src/components/HoldingRow.test.tsx (append)
it('renders current price, value, and a severity indicator when stats are provided', () => {
  render(
    <HoldingRow
      holding={holding}
      onDelete={vi.fn()}
      stats={{
        ticker: 'AAPL',
        shares: 12,
        avg_cost_usd: 187.4,
        current_price: 333.74,
        value: 4004.88,
        current_pct: 41.1,
        target_pct: 20,
        deviation_pp: 21.1,
        severity: 'red',
        unrealized_pnl: 1755.28,
        realized_pnl: 0,
      }}
    />,
  );

  expect(screen.getByText(/333.74/)).toBeInTheDocument();
  expect(screen.getByText(/4,004.88/)).toBeInTheDocument();
  expect(screen.getByTestId('severity-indicator')).toHaveAttribute('data-severity', 'red');
});

it('renders without price/value when stats are not provided', () => {
  render(<HoldingRow holding={holding} onDelete={vi.fn()} />);

  expect(screen.queryByTestId('severity-indicator')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- HoldingRow`
Expected: FAIL — `HoldingRow` doesn't accept a `stats` prop yet.

- [ ] **Step 3: Update `frontend/src/components/HoldingRow.tsx`**

```tsx
// frontend/src/components/HoldingRow.tsx (replace the full file)
import type { Holding, HoldingStats } from '../api/types';

interface HoldingRowProps {
  holding: Holding;
  onDelete: (id: number) => void;
  stats?: HoldingStats;
}

export function HoldingRow({ holding, onDelete, stats }: HoldingRowProps) {
  return (
    <div className="holding-row">
      <span>{holding.ticker}</span>
      <span>{holding.shares} sh</span>
      <span>@ ${holding.avg_cost_usd}</span>
      {stats && (
        <>
          <span data-testid="severity-indicator" data-severity={stats.severity ?? 'none'} />
          <span>${stats.current_price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          <span>${stats.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        </>
      )}
      <button onClick={() => onDelete(holding.id)}>Delete</button>
    </div>
  );
}
```

- [ ] **Step 4: Run `HoldingRow` tests to verify they pass**

Run: `cd frontend && npm test -- HoldingRow`
Expected: all `HoldingRow` tests pass (2 original + 2 new = 4).

- [ ] **Step 5: Write the failing test for `PortfolioHoldings`**

```tsx
// frontend/src/components/PortfolioHoldings.test.tsx (append)
it('matches each holding to its stats by ticker and passes them to HoldingRow', async () => {
  vi.spyOn(client, 'listHoldings').mockResolvedValue([holding]);
  vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue({
    id: 1,
    name: 'DIME',
    cash_usd: 0,
    target_allocation_pct: null,
    holdings_value: 4004.88,
    total_value: 4004.88,
    unrealized_pnl: 1755.28,
    realized_pnl: 0,
    holdings: [
      {
        ticker: 'AAPL',
        shares: 12,
        avg_cost_usd: 187.4,
        current_price: 333.74,
        value: 4004.88,
        current_pct: 100,
        target_pct: 20,
        deviation_pp: 80,
        severity: 'red',
        unrealized_pnl: 1755.28,
        realized_pnl: 0,
      },
    ],
  });

  render(<PortfolioHoldings portfolioId={1} />);

  await waitFor(() => expect(screen.getByText(/333.74/)).toBeInTheDocument());
});

it('renders a holding with no matching summary entry gracefully (no price shown, no crash)', async () => {
  vi.spyOn(client, 'listHoldings').mockResolvedValue([holding]);
  vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue({
    id: 1,
    name: 'DIME',
    cash_usd: 0,
    target_allocation_pct: null,
    holdings_value: 0,
    total_value: 0,
    unrealized_pnl: 0,
    realized_pnl: 0,
    holdings: [],
  });

  render(<PortfolioHoldings portfolioId={1} />);

  await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());
  expect(screen.queryByTestId('severity-indicator')).not.toBeInTheDocument();
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd frontend && npm test -- PortfolioHoldings`
Expected: FAIL — `PortfolioHoldings` doesn't call `usePortfolioSummary` or pass `stats` to `HoldingRow` yet.

- [ ] **Step 7: Update `frontend/src/components/PortfolioHoldings.tsx`**

```tsx
// frontend/src/components/PortfolioHoldings.tsx (replace the full file)
import { AddHoldingForm } from './AddHoldingForm';
import { HoldingRow } from './HoldingRow';
import { useHoldings } from '../hooks/useHoldings';
import { usePortfolioSummary } from '../hooks/usePortfolioSummary';

interface PortfolioHoldingsProps {
  portfolioId: number;
}

export function PortfolioHoldings({ portfolioId }: PortfolioHoldingsProps) {
  const { holdings, loading, error, create, remove } = useHoldings(portfolioId);
  const { summary } = usePortfolioSummary(portfolioId);

  if (loading) {
    return <div>Loading holdings…</div>;
  }

  return (
    <div>
      {error && <div role="alert">{error}</div>}
      <AddHoldingForm onSubmit={create} />
      {holdings.length === 0 ? (
        <p>No holdings yet — add one above.</p>
      ) : (
        holdings.map((holding) => (
          <HoldingRow
            key={holding.id}
            holding={holding}
            onDelete={remove}
            stats={summary?.holdings.find((h) => h.ticker === holding.ticker)}
          />
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 8: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: every test passes across every file.

- [ ] **Step 9: Run the production build to confirm TypeScript compiles cleanly**

Run: `cd frontend && npm run build`
Expected: builds successfully with zero TypeScript errors.

- [ ] **Step 10: Manual end-to-end verification (not automatable in this environment)**

1. In one terminal: `cd backend && .venv/Scripts/uvicorn app.main:app --reload --port 8000`
2. In another terminal: `cd frontend && npm run dev`
3. Open `http://localhost:5173`.
4. Add a portfolio, then add a real ticker (e.g. `AAPL`) as a holding with some shares/avg cost and a target allocation.
5. Confirm the portfolio card shows "Loading value…" briefly, then a real total value (fetched from yfinance).
6. If the target allocation is far from the holding's actual computed share of the portfolio, confirm the "N holdings need rebalancing" message appears.
7. Click "Show holdings" and confirm the holding row shows a current price and value alongside the ticker/shares/avg cost.
8. Add a holding with an obviously invalid ticker (e.g. `NOTATICKER123`) and confirm it still renders (ticker/shares/avg cost only, no price/severity indicator, no crash).

- [ ] **Step 11: Commit**

```bash
git add frontend/src/components/HoldingRow.tsx frontend/src/components/HoldingRow.test.tsx frontend/src/components/PortfolioHoldings.tsx frontend/src/components/PortfolioHoldings.test.tsx
git commit -m "feat: show current price, value, and rebalance severity per holding"
```

---

## What this plan does NOT cover (deliberately — see follow-up plans)

- Support/resistance lines, price charts — depend on historical price series, not the current-quote-only `price_service` this plan consumes. Still a separate future plan.
- Currency (USD/THB) conversion — still a separate future plan per PRD.md section 9.
- DCA calculator, stress-test calculator — pure client-side math components, not yet built; a natural next small plan since they need no new backend work.
- Portfolio-level rebalancing severity (a portfolio's own % of total capital across ALL portfolios vs. its `target_allocation_pct`) — the backend doesn't compute this yet (noted as a gap in the frontend-foundation plan's final review); this plan only surfaces per-HOLDING severity within a portfolio, not per-PORTFOLIO severity across portfolios.
- Editing an existing holding's fields via the UI (`update` exists on `useHoldings`, tested, but no edit form calls it).
