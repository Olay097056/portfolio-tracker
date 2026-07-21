# Frontend Mutation Errors & Holdings Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the mutation-error-handling gap flagged by the react-frontend-foundation plan's final review, and compose the already-built (but not-yet-wired) holdings UI into the Portfolios page.

**Architecture:** Both data hooks (`usePortfolios`, `useHoldings`) get a matching try/catch around their mutation functions: on failure, set the shared `error` state AND re-throw, so both the page-level error banner and the calling form can react. `PortfoliosPage` stops replacing its entire tree on error (keeping the form/list visible with an inline banner instead). A new `PortfolioHoldings` component composes `useHoldings` + `HoldingRow` + `AddHoldingForm` for one portfolio at a time, rendered when that portfolio's card is expanded.

**Tech Stack:** Same as `react-frontend-foundation` — React 19, TypeScript 5.7 (strict, zero `any`), Vite 6, Vitest 3 + Testing Library.

This is Plan 3 of the portfolio-tracker build (Plan 1: `2026-07-20-backend-foundation.md`; Plan 2: `2026-07-20-react-frontend-foundation.md`; both merged to `master`). This plan implements the two items the frontend foundation plan's final review flagged as follow-up work: mutation error surfacing, and holdings-in-page composition (PRD.md section 10.3's holdings-per-portfolio-card requirement).

## Global Constraints

- Zero `any`/`@ts-ignore`/`@ts-expect-error` anywhere — this project has a strict, repeatedly-enforced no-escape-hatch policy.
- Test output must be pristine — no warnings.
- `usePortfolios` and `useHoldings` must handle mutation errors with the SAME pattern (the prior plan's final review explicitly called out: "Decide once; both hooks should match").
- No live pricing in this plan either — holdings display ticker/shares/avg cost only, no current value/P&L/rebalance color (still blocked on a price-fetching plan, per `PRD.md` section 5).

---

## File Structure

```
portfolio-tracker/frontend/src/
  hooks/
    usePortfolios.ts          # MODIFY: add try/catch to create/update/remove
    usePortfolios.test.tsx    # MODIFY: add mutation-error tests
    useHoldings.ts            # MODIFY: same pattern
    useHoldings.test.tsx      # MODIFY: add mutation-error tests
  components/
    AddPortfolioForm.tsx      # MODIFY: await onSubmit, only reset fields on success
    AddPortfolioForm.test.tsx # MODIFY: add failed-submit test
    AddHoldingForm.tsx        # MODIFY: same pattern
    AddHoldingForm.test.tsx   # MODIFY: same pattern
    PortfolioHoldings.tsx     # CREATE: composes useHoldings + HoldingRow + AddHoldingForm
    PortfolioHoldings.test.tsx # CREATE
  pages/
    PortfoliosPage.tsx        # MODIFY: inline error banner (not full replacement); expand/collapse wiring
    PortfoliosPage.test.tsx   # MODIFY: add error-banner and expand/collapse tests
```

No backend changes in this plan.

---

### Task 1: `usePortfolios` — catch and surface mutation errors

**Files:**
- Modify: `frontend/src/hooks/usePortfolios.ts`
- Modify: `frontend/src/hooks/usePortfolios.test.tsx`

**Interfaces:**
- Consumes: `createPortfolio`, `updatePortfolio`, `deletePortfolio`, `listPortfolios` from `api/client` (unchanged).
- Produces: `usePortfolios()` still returns `{ portfolios, loading, error, create, update, remove }`, but now `error` is also set (and the rejected promise re-thrown) when `create`/`update`/`remove` fail, not just on initial load. Task 4 relies on this to show an inline error banner.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/hooks/usePortfolios.test.tsx (append)
it('create() sets error and re-throws when the API call fails, without touching portfolios', async () => {
  vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
  vi.spyOn(client, 'createPortfolio').mockRejectedValue(new client.ApiError(400, 'Target allocations would exceed 100%'));

  const { result } = renderHook(() => usePortfolios());
  await waitFor(() => expect(result.current.loading).toBe(false));

  await expect(
    act(async () => {
      await result.current.create({ name: 'DIME', target_allocation_pct: 90 });
    }),
  ).rejects.toThrow('Target allocations would exceed 100%');

  expect(result.current.error).toBe('Target allocations would exceed 100%');
  expect(result.current.portfolios).toEqual([]);
});

it('remove() sets error and re-throws when the API call fails', async () => {
  vi.spyOn(client, 'listPortfolios').mockResolvedValue([samplePortfolio]);
  vi.spyOn(client, 'deletePortfolio').mockRejectedValue(new Error('network down'));

  const { result } = renderHook(() => usePortfolios());
  await waitFor(() => expect(result.current.portfolios).toEqual([samplePortfolio]));

  await expect(
    act(async () => {
      await result.current.remove(1);
    }),
  ).rejects.toThrow('network down');

  expect(result.current.error).toBe('network down');
  expect(result.current.portfolios).toEqual([samplePortfolio]);
});

it('a successful create() clears any previous error', async () => {
  vi.spyOn(client, 'listPortfolios')
    .mockResolvedValueOnce([])
    .mockRejectedValueOnce(new Error('first load failed'))
    .mockResolvedValueOnce([samplePortfolio]);
  vi.spyOn(client, 'createPortfolio').mockResolvedValue(samplePortfolio);

  const { result, rerender } = renderHook(() => usePortfolios());
  await waitFor(() => expect(result.current.loading).toBe(false));

  // second render also triggers a load in this test setup via a manual refetch path is not available;
  // instead directly exercise the success-clears-error branch through a failed then successful create.
  vi.spyOn(client, 'createPortfolio').mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(samplePortfolio);

  await expect(act(async () => { await result.current.create({ name: 'X' }); })).rejects.toThrow('boom');
  expect(result.current.error).toBe('boom');

  await act(async () => {
    await result.current.create({ name: 'DIME' });
  });

  expect(result.current.error).toBeNull();
  rerender();
});
```

Add this fixture near the top of the file if not already present from earlier tasks (check first — `usePortfolios.test.tsx` already defines `samplePortfolio` at module scope; reuse it, do not redeclare):

```tsx
// only add if `samplePortfolio` is not already declared in this file
const samplePortfolio = { id: 1, name: 'DIME', cash_usd: 0, target_allocation_pct: null, created_at: '2026-01-01T00:00:00Z' };
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- usePortfolios`
Expected: the 3 new tests FAIL — `create()`/`remove()` currently reject with the raw error but never set `result.current.error`, so the `expect(result.current.error).toBe(...)` assertions fail (the rejection-throwing part may already incidentally pass since the current code doesn't catch at all, but the `error` state assertions will not).

- [ ] **Step 3: Update `frontend/src/hooks/usePortfolios.ts`**

```typescript
// frontend/src/hooks/usePortfolios.ts (replace the full file)
import { useCallback, useEffect, useState } from 'react';
import { createPortfolio, deletePortfolio, listPortfolios, updatePortfolio } from '../api/client';
import type { Portfolio, PortfolioCreateInput, PortfolioUpdateInput } from '../api/types';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function usePortfolios() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPortfolios();
      setPortfolios(data);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const create = useCallback(
    async (input: PortfolioCreateInput) => {
      try {
        await createPortfolio(input);
        setError(null);
        await refetch();
      } catch (err) {
        setError(toMessage(err));
        throw err;
      }
    },
    [refetch],
  );

  const update = useCallback(
    async (id: number, input: PortfolioUpdateInput) => {
      try {
        await updatePortfolio(id, input);
        setError(null);
        await refetch();
      } catch (err) {
        setError(toMessage(err));
        throw err;
      }
    },
    [refetch],
  );

  const remove = useCallback(
    async (id: number) => {
      try {
        await deletePortfolio(id);
        setError(null);
        await refetch();
      } catch (err) {
        setError(toMessage(err));
        throw err;
      }
    },
    [refetch],
  );

  return { portfolios, loading, error, create, update, remove };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- usePortfolios`
Expected: all `usePortfolios` tests pass (4 original + 3 new = 7).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/usePortfolios.ts frontend/src/hooks/usePortfolios.test.tsx
git commit -m "fix: surface mutation errors from usePortfolios instead of swallowing them"
```

---

### Task 2: `useHoldings` — same error-handling pattern

**Files:**
- Modify: `frontend/src/hooks/useHoldings.ts`
- Modify: `frontend/src/hooks/useHoldings.test.tsx`

**Interfaces:**
- Consumes: `createHolding`, `updateHolding`, `deleteHolding`, `listHoldings` from `api/client` (unchanged).
- Produces: `useHoldings(portfolioId)` still returns `{ holdings, loading, error, create, update, remove }`, with the identical error-surfacing behavior as `usePortfolios` (Task 1) — Task 5's `PortfolioHoldings` component relies on this.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/hooks/useHoldings.test.tsx (append)
it('create() sets error and re-throws when the API call fails, without touching holdings', async () => {
  vi.spyOn(client, 'listHoldings').mockResolvedValue([]);
  vi.spyOn(client, 'createHolding').mockRejectedValue(new client.ApiError(400, 'Holding target allocations would exceed 100%'));

  const { result } = renderHook(() => useHoldings(1));
  await waitFor(() => expect(result.current.loading).toBe(false));

  await expect(
    act(async () => {
      await result.current.create({ ticker: 'AAPL', shares: 12, avg_cost_usd: 187.4, target_allocation_pct: 90 });
    }),
  ).rejects.toThrow('Holding target allocations would exceed 100%');

  expect(result.current.error).toBe('Holding target allocations would exceed 100%');
  expect(result.current.holdings).toEqual([]);
});

it('remove() sets error and re-throws when the API call fails', async () => {
  vi.spyOn(client, 'listHoldings').mockResolvedValue([sampleHolding]);
  vi.spyOn(client, 'deleteHolding').mockRejectedValue(new Error('network down'));

  const { result } = renderHook(() => useHoldings(1));
  await waitFor(() => expect(result.current.holdings).toEqual([sampleHolding]));

  await expect(
    act(async () => {
      await result.current.remove(1);
    }),
  ).rejects.toThrow('network down');

  expect(result.current.error).toBe('network down');
  expect(result.current.holdings).toEqual([sampleHolding]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- useHoldings`
Expected: the 2 new tests FAIL — `result.current.error` assertions fail since the current code doesn't catch mutation errors.

- [ ] **Step 3: Update `frontend/src/hooks/useHoldings.ts`**

```typescript
// frontend/src/hooks/useHoldings.ts (replace the full file)
import { useCallback, useEffect, useState } from 'react';
import { createHolding, deleteHolding, listHoldings, updateHolding } from '../api/client';
import type { Holding, HoldingCreateInput, HoldingUpdateInput } from '../api/types';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useHoldings(portfolioId: number) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listHoldings(portfolioId);
      setHoldings(data);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const create = useCallback(
    async (input: HoldingCreateInput) => {
      try {
        await createHolding(portfolioId, input);
        setError(null);
        await refetch();
      } catch (err) {
        setError(toMessage(err));
        throw err;
      }
    },
    [portfolioId, refetch],
  );

  const update = useCallback(
    async (holdingId: number, input: HoldingUpdateInput) => {
      try {
        await updateHolding(portfolioId, holdingId, input);
        setError(null);
        await refetch();
      } catch (err) {
        setError(toMessage(err));
        throw err;
      }
    },
    [portfolioId, refetch],
  );

  const remove = useCallback(
    async (holdingId: number) => {
      try {
        await deleteHolding(portfolioId, holdingId);
        setError(null);
        await refetch();
      } catch (err) {
        setError(toMessage(err));
        throw err;
      }
    },
    [portfolioId, refetch],
  );

  return { holdings, loading, error, create, update, remove };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- useHoldings`
Expected: all `useHoldings` tests pass (3 original + 2 new = 5).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useHoldings.ts frontend/src/hooks/useHoldings.test.tsx
git commit -m "fix: surface mutation errors from useHoldings instead of swallowing them"
```

---

### Task 3: Forms only clear on successful submit

**Files:**
- Modify: `frontend/src/components/AddPortfolioForm.tsx`
- Modify: `frontend/src/components/AddPortfolioForm.test.tsx`
- Modify: `frontend/src/components/AddHoldingForm.tsx`
- Modify: `frontend/src/components/AddHoldingForm.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `AddPortfolioForm`'s `onSubmit` prop type changes from `(input: PortfolioCreateInput) => void` to `(input: PortfolioCreateInput) => void | Promise<void>`; same change for `AddHoldingForm`'s `onSubmit`. Both `PortfoliosPage` (Task 4) and `PortfolioHoldings` (Task 5) pass hook `create` functions (which now return `Promise<void>` and can reject per Tasks 1-2) directly as `onSubmit`.

- [ ] **Step 1: Write the failing test for `AddPortfolioForm`**

```tsx
// frontend/src/components/AddPortfolioForm.test.tsx (append)
it('does not clear the name field when onSubmit rejects', async () => {
  const onSubmit = vi.fn().mockRejectedValue(new Error('boom'));
  render(<AddPortfolioForm onSubmit={onSubmit} />);

  fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Speculative' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /add portfolio/i }));
  });

  expect(screen.getByLabelText(/name/i)).toHaveValue('Speculative');
});

it('clears the name field when onSubmit succeeds', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<AddPortfolioForm onSubmit={onSubmit} />);

  fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Speculative' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /add portfolio/i }));
  });

  expect(screen.getByLabelText(/name/i)).toHaveValue('');
});
```

Add `act` to the existing `@testing-library/react` import at the top of the file if it isn't already imported.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- AddPortfolioForm`
Expected: FAIL — the current implementation clears fields unconditionally and synchronously, so the "does not clear on rejection" test fails.

- [ ] **Step 3: Update `frontend/src/components/AddPortfolioForm.tsx`**

```tsx
// frontend/src/components/AddPortfolioForm.tsx (replace the full file)
import { useState, type FormEvent } from 'react';
import type { PortfolioCreateInput } from '../api/types';

interface AddPortfolioFormProps {
  onSubmit: (input: PortfolioCreateInput) => void | Promise<void>;
}

export function AddPortfolioForm({ onSubmit }: AddPortfolioFormProps) {
  const [name, setName] = useState('');
  const [cash, setCash] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    try {
      await onSubmit({ name, cash_usd: cash === '' ? 0 : Number(cash) });
      setName('');
      setCash('');
    } catch {
      // Leave the fields populated so the user can retry; the error itself
      // is surfaced by the page-level error banner (see PortfoliosPage).
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="portfolio-name">Name</label>
      <input id="portfolio-name" value={name} onChange={(e) => setName(e.target.value)} />

      <label htmlFor="portfolio-cash">Cash (USD)</label>
      <input id="portfolio-cash" type="number" value={cash} onChange={(e) => setCash(e.target.value)} />

      <button type="submit">+ Add portfolio</button>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- AddPortfolioForm`
Expected: all `AddPortfolioForm` tests pass (2 original + 2 new = 4).

- [ ] **Step 5: Write the failing test for `AddHoldingForm`**

```tsx
// frontend/src/components/AddHoldingForm.test.tsx (append)
it('does not clear fields when onSubmit rejects', async () => {
  const onSubmit = vi.fn().mockRejectedValue(new Error('boom'));
  render(<AddHoldingForm onSubmit={onSubmit} />);

  fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
  fireEvent.change(screen.getByLabelText(/shares/i), { target: { value: '12' } });
  fireEvent.change(screen.getByLabelText(/average cost/i), { target: { value: '187.4' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /add holding/i }));
  });

  expect(screen.getByLabelText(/ticker/i)).toHaveValue('AAPL');
});

it('clears fields when onSubmit succeeds', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<AddHoldingForm onSubmit={onSubmit} />);

  fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
  fireEvent.change(screen.getByLabelText(/shares/i), { target: { value: '12' } });
  fireEvent.change(screen.getByLabelText(/average cost/i), { target: { value: '187.4' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /add holding/i }));
  });

  expect(screen.getByLabelText(/ticker/i)).toHaveValue('');
});
```

Add `act` to the existing `@testing-library/react` import at the top of the file if it isn't already imported.

- [ ] **Step 6: Run test to verify it fails**

Run: `cd frontend && npm test -- AddHoldingForm`
Expected: FAIL — same reason as Step 2.

- [ ] **Step 7: Update `frontend/src/components/AddHoldingForm.tsx`**

```tsx
// frontend/src/components/AddHoldingForm.tsx (replace the full file)
import { useState, type FormEvent } from 'react';
import type { HoldingCreateInput } from '../api/types';

interface AddHoldingFormProps {
  onSubmit: (input: HoldingCreateInput) => void | Promise<void>;
}

export function AddHoldingForm({ onSubmit }: AddHoldingFormProps) {
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [avgCost, setAvgCost] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!ticker.trim() || shares === '' || avgCost === '') {
      return;
    }
    try {
      await onSubmit({ ticker, shares: Number(shares), avg_cost_usd: Number(avgCost) });
      setTicker('');
      setShares('');
      setAvgCost('');
    } catch {
      // Leave the fields populated so the user can retry; the error itself
      // is surfaced by the page-level error banner.
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="holding-ticker">Ticker</label>
      <input id="holding-ticker" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} />

      <label htmlFor="holding-shares">Shares</label>
      <input id="holding-shares" type="number" value={shares} onChange={(e) => setShares(e.target.value)} />

      <label htmlFor="holding-avg-cost">Average cost ($)</label>
      <input id="holding-avg-cost" type="number" value={avgCost} onChange={(e) => setAvgCost(e.target.value)} />

      <button type="submit">+ Add holding</button>
    </form>
  );
}
```

- [ ] **Step 8: Run all component tests to verify they pass**

Run: `cd frontend && npm test`
Expected: all tests pass — no regressions in `PortfoliosPage.test.tsx`/`App.test.tsx` from the `onSubmit` type widening (they pass `create` as `onSubmit`, which already returns `Promise<void>`, so this is compatible).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/AddPortfolioForm.tsx frontend/src/components/AddPortfolioForm.test.tsx frontend/src/components/AddHoldingForm.tsx frontend/src/components/AddHoldingForm.test.tsx
git commit -m "fix: only clear add-portfolio/add-holding forms on successful submit"
```

---

### Task 4: `PortfoliosPage` — inline error banner instead of full-page replacement

**Files:**
- Modify: `frontend/src/pages/PortfoliosPage.tsx`
- Modify: `frontend/src/pages/PortfoliosPage.test.tsx`

**Interfaces:**
- Consumes: `usePortfolios` (now with mutation-error support per Task 1).
- Produces: `PortfoliosPage` keeps rendering the form and list even when `error` is set — Task 6 builds on this same page.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/pages/PortfoliosPage.test.tsx (append)
it('shows an inline error banner on a failed create, while keeping the form and list visible', async () => {
  vi.spyOn(client, 'listPortfolios').mockResolvedValue([portfolio]);
  vi.spyOn(client, 'createPortfolio').mockRejectedValue(new client.ApiError(400, 'Target allocations would exceed 100%'));

  render(<PortfoliosPage />);
  await waitFor(() => expect(screen.getByText('DIME')).toBeInTheDocument());

  fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Speculative' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /add portfolio/i }));
  });

  expect(screen.getByRole('alert')).toHaveTextContent('Target allocations would exceed 100%');
  // the existing portfolio and the form itself must still be visible/usable:
  expect(screen.getByText('DIME')).toBeInTheDocument();
  expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
});
```

Add `act` to the existing `@testing-library/react` import at the top of the file if it isn't already imported.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- PortfoliosPage`
Expected: FAIL — the current `PortfoliosPage` returns early on `error`, replacing the whole tree with just the alert text, so `screen.getByText('DIME')` and `screen.getByLabelText(/name/i)` are not found.

- [ ] **Step 3: Update `frontend/src/pages/PortfoliosPage.tsx`**

```tsx
// frontend/src/pages/PortfoliosPage.tsx (replace the full file)
import { AddPortfolioForm } from '../components/AddPortfolioForm';
import { PortfolioCard } from '../components/PortfolioCard';
import { usePortfolios } from '../hooks/usePortfolios';

export function PortfoliosPage() {
  const { portfolios, loading, error, create, remove } = usePortfolios();

  if (loading) {
    return <div>Loading portfolios…</div>;
  }

  return (
    <div>
      <h2>Portfolios</h2>
      {error && <div role="alert">{error}</div>}
      <AddPortfolioForm onSubmit={create} />
      {portfolios.length === 0 ? (
        <p>No portfolios yet — add one above.</p>
      ) : (
        portfolios.map((portfolio) => (
          <PortfolioCard key={portfolio.id} portfolio={portfolio} onDelete={remove} />
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- PortfoliosPage`
Expected: all `PortfoliosPage` tests pass (4 original + 1 new = 5).

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `cd frontend && npm test`
Expected: all tests pass across every file — no other test relied on the old full-page-replacement-on-error behavior (check `App.test.tsx` in particular, which only exercises the empty-state / no-error path and is unaffected).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/PortfoliosPage.tsx frontend/src/pages/PortfoliosPage.test.tsx
git commit -m "fix: show mutation errors as an inline banner instead of replacing the whole Portfolios page"
```

---

### Task 5: `PortfolioHoldings` — compose holdings display + add-holding form for one portfolio

**Files:**
- Create: `frontend/src/components/PortfolioHoldings.tsx`
- Create: `frontend/src/components/PortfolioHoldings.test.tsx`

**Interfaces:**
- Consumes: `useHoldings` (Task 2), `HoldingRow`, `AddHoldingForm` (both already exist, unchanged by this task).
- Produces: `PortfolioHoldings` component taking `{ portfolioId: number }` — Task 6's `PortfoliosPage` renders this when a portfolio card is expanded.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/components/PortfolioHoldings.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { PortfolioHoldings } from './PortfolioHoldings';

const holding = {
  id: 1,
  portfolio_id: 1,
  ticker: 'AAPL',
  shares: 12,
  avg_cost_usd: 187.4,
  target_allocation_pct: 20,
  realized_pnl_usd: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('PortfolioHoldings', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a loading state, then renders fetched holdings for the given portfolio', async () => {
    vi.spyOn(client, 'listHoldings').mockResolvedValue([holding]);

    render(<PortfolioHoldings portfolioId={1} />);

    expect(screen.getByText(/loading holdings/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());
    expect(client.listHoldings).toHaveBeenCalledWith(1);
  });

  it('shows an empty state when the portfolio has no holdings', async () => {
    vi.spyOn(client, 'listHoldings').mockResolvedValue([]);

    render(<PortfolioHoldings portfolioId={1} />);

    await waitFor(() => expect(screen.getByText(/no holdings yet/i)).toBeInTheDocument());
  });

  it('submitting the add-holding form creates a holding under this portfolio', async () => {
    vi.spyOn(client, 'listHoldings').mockResolvedValueOnce([]).mockResolvedValueOnce([holding]);
    vi.spyOn(client, 'createHolding').mockResolvedValue(holding);

    render(<PortfolioHoldings portfolioId={1} />);
    await waitFor(() => expect(screen.getByText(/no holdings yet/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    fireEvent.change(screen.getByLabelText(/shares/i), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/average cost/i), { target: { value: '187.4' } });
    fireEvent.click(screen.getByRole('button', { name: /add holding/i }));

    await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());
    expect(client.createHolding).toHaveBeenCalledWith(1, { ticker: 'AAPL', shares: 12, avg_cost_usd: 187.4 });
  });

  it('clicking delete on a holding removes it from the list', async () => {
    vi.spyOn(client, 'listHoldings').mockResolvedValueOnce([holding]).mockResolvedValueOnce([]);
    vi.spyOn(client, 'deleteHolding').mockResolvedValue(undefined);

    render(<PortfolioHoldings portfolioId={1} />);
    await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(screen.getByText(/no holdings yet/i)).toBeInTheDocument());
  });

  it('shows an inline error banner on a failed create', async () => {
    vi.spyOn(client, 'listHoldings').mockResolvedValue([]);
    vi.spyOn(client, 'createHolding').mockRejectedValue(new client.ApiError(400, 'Holding target allocations would exceed 100%'));

    render(<PortfolioHoldings portfolioId={1} />);
    await waitFor(() => expect(screen.getByText(/no holdings yet/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    fireEvent.change(screen.getByLabelText(/shares/i), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/average cost/i), { target: { value: '187.4' } });
    fireEvent.click(screen.getByRole('button', { name: /add holding/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Target allocations would exceed 100%'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- PortfolioHoldings`
Expected: FAIL — `./PortfolioHoldings` module does not exist yet.

- [ ] **Step 3: Write `frontend/src/components/PortfolioHoldings.tsx`**

```tsx
// frontend/src/components/PortfolioHoldings.tsx
import { AddHoldingForm } from './AddHoldingForm';
import { HoldingRow } from './HoldingRow';
import { useHoldings } from '../hooks/useHoldings';

interface PortfolioHoldingsProps {
  portfolioId: number;
}

export function PortfolioHoldings({ portfolioId }: PortfolioHoldingsProps) {
  const { holdings, loading, error, create, remove } = useHoldings(portfolioId);

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
        holdings.map((holding) => <HoldingRow key={holding.id} holding={holding} onDelete={remove} />)
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- PortfolioHoldings`
Expected: all 5 `PortfolioHoldings` tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PortfolioHoldings.tsx frontend/src/components/PortfolioHoldings.test.tsx
git commit -m "feat: add PortfolioHoldings component composing useHoldings, HoldingRow, and AddHoldingForm"
```

---

### Task 6: Wire `PortfolioHoldings` into `PortfoliosPage` via expand/collapse

**Files:**
- Modify: `frontend/src/components/PortfolioCard.tsx`
- Modify: `frontend/src/components/PortfolioCard.test.tsx`
- Modify: `frontend/src/pages/PortfoliosPage.tsx`
- Modify: `frontend/src/pages/PortfoliosPage.test.tsx`

**Interfaces:**
- Consumes: `PortfolioHoldings` (Task 5).
- Produces: clicking a portfolio card's "Show holdings" button toggles a `PortfolioHoldings` panel for that portfolio, rendered inline below the card. Only one portfolio's holdings panel is expanded at a time.

- [ ] **Step 1: Write the failing test for `PortfolioCard`'s new expand button**

```tsx
// frontend/src/components/PortfolioCard.test.tsx (append)
it('calls onToggleHoldings with the portfolio id when the "show holdings" button is clicked', () => {
  const onToggleHoldings = vi.fn();
  render(<PortfolioCard portfolio={portfolio} onDelete={vi.fn()} onToggleHoldings={onToggleHoldings} expanded={false} />);

  fireEvent.click(screen.getByRole('button', { name: /show holdings/i }));

  expect(onToggleHoldings).toHaveBeenCalledWith(1);
});

it('shows "hide holdings" label when expanded is true', () => {
  render(<PortfolioCard portfolio={portfolio} onDelete={vi.fn()} onToggleHoldings={vi.fn()} expanded={true} />);

  expect(screen.getByRole('button', { name: /hide holdings/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- PortfolioCard`
Expected: FAIL — `PortfolioCard` doesn't accept `onToggleHoldings`/`expanded` props or render a toggle button yet, so `getByRole('button', { name: /show holdings/i })` isn't found.

- [ ] **Step 3: Update `frontend/src/components/PortfolioCard.tsx`**

```tsx
// frontend/src/components/PortfolioCard.tsx (replace the full file)
import type { Portfolio } from '../api/types';

interface PortfolioCardProps {
  portfolio: Portfolio;
  onDelete: (id: number) => void;
  onToggleHoldings: (id: number) => void;
  expanded: boolean;
}

export function PortfolioCard({ portfolio, onDelete, onToggleHoldings, expanded }: PortfolioCardProps) {
  return (
    <div className="portfolio-card">
      <h3>{portfolio.name}</h3>
      <div>Cash: ${portfolio.cash_usd.toLocaleString()}</div>
      <div>
        Target allocation: {portfolio.target_allocation_pct === null ? 'no target set' : `${portfolio.target_allocation_pct}%`}
      </div>
      <button onClick={() => onToggleHoldings(portfolio.id)}>{expanded ? 'Hide holdings' : 'Show holdings'}</button>
      <button onClick={() => onDelete(portfolio.id)}>Delete</button>
    </div>
  );
}
```

- [ ] **Step 4: Run `PortfolioCard` tests to verify they pass**

Run: `cd frontend && npm test -- PortfolioCard`
Expected: all `PortfolioCard` tests pass (3 original + 2 new = 5) — the 3 original tests still work unchanged since they don't touch `onToggleHoldings`/`expanded` behavior, only need the new required props supplied. Check the 3 original tests in the file: if any of them render `<PortfolioCard portfolio={...} onDelete={...} />` WITHOUT the two new required props, add `onToggleHoldings={vi.fn()} expanded={false}` to those render calls now (TypeScript will fail to compile otherwise, since the props are non-optional).

- [ ] **Step 5: Write the failing test for `PortfoliosPage`'s expand/collapse wiring**

```tsx
// frontend/src/pages/PortfoliosPage.test.tsx (append)
it('expands a portfolio to show its holdings panel when "Show holdings" is clicked, and collapses on second click', async () => {
  vi.spyOn(client, 'listPortfolios').mockResolvedValue([portfolio]);
  vi.spyOn(client, 'listHoldings').mockResolvedValue([]);

  render(<PortfoliosPage />);
  await waitFor(() => expect(screen.getByText('DIME')).toBeInTheDocument());

  expect(screen.queryByText(/no holdings yet/i)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /show holdings/i }));
  await waitFor(() => expect(screen.getByText(/no holdings yet/i)).toBeInTheDocument());
  expect(client.listHoldings).toHaveBeenCalledWith(1);

  fireEvent.click(screen.getByRole('button', { name: /hide holdings/i }));
  expect(screen.queryByText(/no holdings yet/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd frontend && npm test -- PortfoliosPage`
Expected: FAIL — `PortfoliosPage` doesn't render `PortfolioHoldings` or pass `onToggleHoldings`/`expanded` to `PortfolioCard` yet; also a TypeScript compile error since `PortfolioCard` now requires those props.

- [ ] **Step 7: Update `frontend/src/pages/PortfoliosPage.tsx`**

```tsx
// frontend/src/pages/PortfoliosPage.tsx (replace the full file)
import { useState } from 'react';
import { AddPortfolioForm } from '../components/AddPortfolioForm';
import { PortfolioCard } from '../components/PortfolioCard';
import { PortfolioHoldings } from '../components/PortfolioHoldings';
import { usePortfolios } from '../hooks/usePortfolios';

export function PortfoliosPage() {
  const { portfolios, loading, error, create, remove } = usePortfolios();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  function toggleHoldings(id: number) {
    setExpandedId((current) => (current === id ? null : id));
  }

  if (loading) {
    return <div>Loading portfolios…</div>;
  }

  return (
    <div>
      <h2>Portfolios</h2>
      {error && <div role="alert">{error}</div>}
      <AddPortfolioForm onSubmit={create} />
      {portfolios.length === 0 ? (
        <p>No portfolios yet — add one above.</p>
      ) : (
        portfolios.map((portfolio) => (
          <div key={portfolio.id}>
            <PortfolioCard
              portfolio={portfolio}
              onDelete={remove}
              onToggleHoldings={toggleHoldings}
              expanded={expandedId === portfolio.id}
            />
            {expandedId === portfolio.id && <PortfolioHoldings portfolioId={portfolio.id} />}
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 8: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: every test passes across every file. Expect roughly: App (1) + api client (6) + usePortfolios (7) + useHoldings (5) + PortfolioCard (5) + AddPortfolioForm (4) + HoldingRow (2) + AddHoldingForm (4) + PortfoliosPage (6) + PortfolioHoldings (5) = 45 total. Treat this as an estimate to sanity-check against, not a hard assertion — read the actual final summary line from the command output.

- [ ] **Step 9: Run the production build to confirm TypeScript compiles cleanly**

Run: `cd frontend && npm run build`
Expected: builds successfully with zero TypeScript errors (this is the step that would catch a missed `PortfolioCard` call site still using the old 2-prop signature).

- [ ] **Step 10: Manual end-to-end verification (not automatable in this environment)**

1. In one terminal: `cd backend && .venv/Scripts/uvicorn app.main:app --reload --port 8000`
2. In another terminal: `cd frontend && npm run dev`
3. Open `http://localhost:5173`.
4. Add a portfolio with a target allocation over 100% alone (e.g. target 150%) and confirm an inline error banner appears while the form and any existing portfolios remain visible and the form's fields are NOT cleared.
5. Add a valid portfolio (e.g. target 50%, no other portfolios yet) and confirm it appears with no error.
6. Click "Show holdings" on that portfolio, confirm "No holdings yet" appears, add a holding, confirm it appears in the list.
7. Click "Hide holdings", confirm the panel disappears; click "Show holdings" again, confirm the holding is still there (refetched correctly).
8. Delete the holding, confirm the empty state returns.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/components/PortfolioCard.tsx frontend/src/components/PortfolioCard.test.tsx frontend/src/pages/PortfoliosPage.tsx frontend/src/pages/PortfoliosPage.test.tsx
git commit -m "feat: wire holdings display into PortfoliosPage via per-card expand/collapse"
```

---

## What this plan does NOT cover (deliberately — see follow-up plans)

- Live pricing, current value, unrealized/realized P&L display, rebalance-severity coloring, S/R, DCA/stress-test calculators, currency conversion, Dashboard page/chart — all still blocked on a price-fetching plan (PRD.md sections 5-9).
- Editing an existing portfolio's or holding's fields (only create/delete are wired in the UI; `update` exists on both hooks and is tested, but no edit form/UI calls it yet).
- The pre-existing "full page flicker on every mutation" Minor finding from the prior plan's final review (loading state during refetch) — still present, not addressed here; revisit if it becomes noticeable once holdings are in daily use.
