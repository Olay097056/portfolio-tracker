# Watchlist Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Ticket 2 of `tickets.md`: a new top-level Watchlist nav area where the user can add, list, and remove tickers they are following (with an optional free-text category), so later Scanner tickets have a real universe to scan.

**Architecture:** Frontend-only. The backend `WatchlistItem` model and its `POST /watchlist`, `GET /watchlist`, `DELETE /watchlist/{id}` endpoints already exist and already have backend test coverage — this plan does not touch `backend/`. The frontend follows the exact same three-layer shape the Portfolios feature already uses: an API client + types layer, a `useWatchlist` data hook (mirrors `usePortfolios`), and presentation components (mirrors `AddPortfolioForm` / `PortfolioCard` / `PortfoliosPage`). A new `WatchlistPage` hosts the area behind the shared `TabStrip` component (from the `extract-shared-tab-navigation` branch, already merged to master) with one sub-tab today — "Manage Watchlist" — so later tickets (Momentum Scanner, Pre-Squeeze Scanner, Dividend Ranking, Trending Stocks Today) each add one more `TABS` entry without restructuring anything.

**Tech Stack:** React 19, TypeScript, Vitest, @testing-library/react — matches the rest of `frontend/`.

## Global Constraints

- Ticker input is normalised to upper case before it is sent to the backend, so "vti" and "VTI" cannot become two separate entries.
- Category is optional: an empty category field must be sent as `null`, not `""` and not the key omitted.
- Do not create placeholder sub-tabs for the four Scanner tickets (Momentum, Pre-Squeeze, Dividend Ranking, Trending Stocks) — YAGNI. Each of those tickets adds its own `TABS` entry to `WatchlistPage` when it lands.
- The top-level nav button for this area is labelled "Watchlist" (added to `App.tsx`'s `TABS`). The sub-tab inside the area must use a **different** label — "Manage Watchlist", not "Watchlist" — because the final review of the `extract-shared-tab-navigation` branch flagged that two same-labelled buttons on screen at once make `getByRole('button', { name: 'Watchlist' })` ambiguous in tests. This is a hard constraint, not a style choice.
- Follow existing code style: no comments except where a non-obvious constraint needs explaining (the two constraints above are exactly the kind worth a one-line comment at their point of use), no abstractions beyond what this task needs.
- `npx tsc -b` must be clean.

---

### Task 1: Watchlist types and API client functions

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/client.test.ts`

**Interfaces:**
- Consumes: the existing `request<T>()` helper and `ApiError` class already in `client.ts` — no changes to either.
- Produces: `WatchlistItem` and `WatchlistItemCreateInput` types from `types.ts`; `listWatchlist(): Promise<WatchlistItem[]>`, `createWatchlistItem(input: WatchlistItemCreateInput): Promise<WatchlistItem>`, `deleteWatchlistItem(id: number): Promise<void>` from `client.ts`. Task 2's `useWatchlist` hook imports all three functions and both types.

- [ ] **Step 1: Add the Watchlist types**

Append to the end of `frontend/src/api/types.ts`:

```ts
export interface WatchlistItem {
  id: number;
  ticker: string;
  category: string | null;
  created_at: string;
}

export interface WatchlistItemCreateInput {
  ticker: string;
  category?: string | null;
}
```

- [ ] **Step 2: Write the failing tests for the three client functions**

Add `WatchlistItem`, `WatchlistItemCreateInput` to the type-only nothing (client functions are the import, not types) — add these three `it` blocks inside the existing `describe('api client', ...)` block in `frontend/src/api/client.test.ts`, and add `listWatchlist, createWatchlistItem, deleteWatchlistItem` to the existing `import { ... } from './client'` list at the top of the file:

```ts
  it('listWatchlist calls GET /watchlist and returns the parsed body', async () => {
    mockFetchOnce([{ id: 1, ticker: 'VTI', category: 'Core', created_at: '2026-01-01T00:00:00Z' }]);

    const result = await listWatchlist();

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/watchlist',
      expect.objectContaining({ method: undefined }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe('VTI');
  });

  it('createWatchlistItem POSTs the payload as JSON', async () => {
    mockFetchOnce({ id: 1, ticker: 'VTI', category: null, created_at: '2026-01-01T00:00:00Z' }, { status: 201 });

    await createWatchlistItem({ ticker: 'VTI', category: null });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/watchlist',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ticker: 'VTI', category: null }),
      }),
    );
  });

  it('deleteWatchlistItem DELETEs the item by id', async () => {
    mockFetchOnce(undefined, { status: 204 });

    await deleteWatchlistItem(1);

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/watchlist/1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/api/client.test.ts`
Expected: FAIL — `listWatchlist is not defined` (or similar), since the functions don't exist yet.

- [ ] **Step 4: Implement the three client functions**

Append to the end of `frontend/src/api/client.ts`, and add `WatchlistItem, WatchlistItemCreateInput` to the existing `import type { ... } from './types'` block at the top of the file:

```ts
export function listWatchlist(): Promise<WatchlistItem[]> {
  return request<WatchlistItem[]>('/watchlist');
}

export function createWatchlistItem(input: WatchlistItemCreateInput): Promise<WatchlistItem> {
  return request<WatchlistItem>('/watchlist', { method: 'POST', body: JSON.stringify(input) });
}

export function deleteWatchlistItem(id: number): Promise<void> {
  return request<void>(`/watchlist/${id}`, { method: 'DELETE' });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/api/client.test.ts`
Expected: PASS (all tests in the file, including the 3 new ones)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/api/client.test.ts
git commit -m "feat: add Watchlist API client functions and types"
```

---

### Task 2: `useWatchlist` data hook

**Files:**
- Create: `frontend/src/hooks/useWatchlist.ts`
- Create: `frontend/src/hooks/useWatchlist.test.tsx`

**Interfaces:**
- Consumes: `listWatchlist`, `createWatchlistItem`, `deleteWatchlistItem` from `../api/client` and `WatchlistItem`, `WatchlistItemCreateInput` from `../api/types` (Task 1).
- Produces: `useWatchlist()` returning `{ items: WatchlistItem[]; loading: boolean; error: string | null; create: (input: WatchlistItemCreateInput) => Promise<void>; remove: (id: number) => Promise<void> }`. Task 5's `WatchlistManagementPage` consumes this hook by that exact shape.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/hooks/useWatchlist.test.tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { useWatchlist } from './useWatchlist';

const sampleItem = { id: 1, ticker: 'VTI', category: 'Core', created_at: '2026-01-01T00:00:00Z' };

describe('useWatchlist', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads watchlist items on mount', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([sampleItem]);

    const { result } = renderHook(() => useWatchlist());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([sampleItem]);
    expect(result.current.error).toBeNull();
  });

  it('sets error when the initial load fails', async () => {
    vi.spyOn(client, 'listWatchlist').mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useWatchlist());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('network down');
    expect(result.current.items).toEqual([]);
  });

  it('create() adds the new item and refetches the list', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValueOnce([]).mockResolvedValueOnce([sampleItem]);
    vi.spyOn(client, 'createWatchlistItem').mockResolvedValue(sampleItem);

    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.create({ ticker: 'VTI', category: 'Core' });
    });

    expect(client.createWatchlistItem).toHaveBeenCalledWith({ ticker: 'VTI', category: 'Core' });
    expect(result.current.items).toEqual([sampleItem]);
  });

  it('remove() deletes and refetches the list', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValueOnce([sampleItem]).mockResolvedValueOnce([]);
    vi.spyOn(client, 'deleteWatchlistItem').mockResolvedValue(undefined);

    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.items).toEqual([sampleItem]));

    await act(async () => {
      await result.current.remove(1);
    });

    expect(client.deleteWatchlistItem).toHaveBeenCalledWith(1);
    expect(result.current.items).toEqual([]);
  });

  it('create() sets error and re-throws when the API call fails, without touching items', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);
    vi.spyOn(client, 'createWatchlistItem').mockRejectedValue(new client.ApiError(400, 'Ticker already on watchlist'));

    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.create({ ticker: 'VTI' });
      } catch (err) {
        thrown = err;
      }
    });

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('Ticker already on watchlist');
    expect(result.current.error).toBe('Ticker already on watchlist');
    expect(result.current.items).toEqual([]);
  });

  it('remove() sets error and re-throws when the API call fails', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([sampleItem]);
    vi.spyOn(client, 'deleteWatchlistItem').mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.items).toEqual([sampleItem]));

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.remove(1);
      } catch (err) {
        thrown = err;
      }
    });

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('network down');
    expect(result.current.error).toBe('network down');
    expect(result.current.items).toEqual([sampleItem]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/hooks/useWatchlist.test.tsx`
Expected: FAIL — `Cannot find module './useWatchlist'`

- [ ] **Step 3: Implement `useWatchlist`**

```ts
// frontend/src/hooks/useWatchlist.ts
import { useCallback, useEffect, useState } from 'react';
import { createWatchlistItem, deleteWatchlistItem, listWatchlist } from '../api/client';
import type { WatchlistItem, WatchlistItemCreateInput } from '../api/types';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listWatchlist();
      setItems(data);
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
    async (input: WatchlistItemCreateInput) => {
      try {
        await createWatchlistItem(input);
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
        await deleteWatchlistItem(id);
        setError(null);
        await refetch();
      } catch (err) {
        setError(toMessage(err));
        throw err;
      }
    },
    [refetch],
  );

  return { items, loading, error, create, remove };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/hooks/useWatchlist.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useWatchlist.ts frontend/src/hooks/useWatchlist.test.tsx
git commit -m "feat: add useWatchlist data hook"
```

---

### Task 3: `AddWatchlistItemForm` component

**Files:**
- Create: `frontend/src/components/AddWatchlistItemForm.tsx`
- Create: `frontend/src/components/AddWatchlistItemForm.test.tsx`

**Interfaces:**
- Consumes: `WatchlistItemCreateInput` from `../api/types` (Task 1).
- Produces: `AddWatchlistItemForm({ onSubmit }: { onSubmit: (input: WatchlistItemCreateInput) => void | Promise<void> })`. Task 5's `WatchlistManagementPage` renders `<AddWatchlistItemForm onSubmit={create} />` where `create` is `useWatchlist()`'s `create` function.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/components/AddWatchlistItemForm.test.tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddWatchlistItemForm } from './AddWatchlistItemForm';

describe('AddWatchlistItemForm', () => {
  it('calls onSubmit with the upper-cased ticker and trimmed category on submit', async () => {
    const onSubmit = vi.fn();
    render(<AddWatchlistItemForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'vti' } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: '  Core  ' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add to watchlist/i }));
    });

    expect(onSubmit).toHaveBeenCalledWith({ ticker: 'VTI', category: 'Core' });
  });

  it('sends category as null when the category field is left blank', async () => {
    const onSubmit = vi.fn();
    render(<AddWatchlistItemForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'VTI' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add to watchlist/i }));
    });

    expect(onSubmit).toHaveBeenCalledWith({ ticker: 'VTI', category: null });
  });

  it('does not call onSubmit when the ticker is empty', async () => {
    const onSubmit = vi.fn();
    render(<AddWatchlistItemForm onSubmit={onSubmit} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add to watchlist/i }));
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not clear the ticker field when onSubmit rejects', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('boom'));
    render(<AddWatchlistItemForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'VTI' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add to watchlist/i }));
    });

    expect(screen.getByLabelText('Ticker')).toHaveValue('VTI');
  });

  it('clears both fields when onSubmit succeeds', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AddWatchlistItemForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'VTI' } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Core' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add to watchlist/i }));
    });

    expect(screen.getByLabelText('Ticker')).toHaveValue('');
    expect(screen.getByLabelText(/category/i)).toHaveValue('');
  });
});
```

Note: the ticker field is queried with the exact string `'Ticker'`, not a `/ticker/i` regex — the category label contains the word "optional" but not "ticker", so there is no collision risk here, but exact-string matching is used anyway per this project's established convention of preferring exact `getByLabelText` matches over loose regexes (see the `extract-shared-tab-navigation` and `portfolio-builder-and-etf-comparison` plans, both of which hit real regex-collision bugs).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/AddWatchlistItemForm.test.tsx`
Expected: FAIL — `Cannot find module './AddWatchlistItemForm'`

- [ ] **Step 3: Implement `AddWatchlistItemForm`**

```tsx
// frontend/src/components/AddWatchlistItemForm.tsx
import { useState, type FormEvent } from 'react';
import type { WatchlistItemCreateInput } from '../api/types';

interface AddWatchlistItemFormProps {
  onSubmit: (input: WatchlistItemCreateInput) => void | Promise<void>;
}

export function AddWatchlistItemForm({ onSubmit }: AddWatchlistItemFormProps) {
  const [ticker, setTicker] = useState('');
  const [category, setCategory] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedTicker = ticker.trim();
    if (!trimmedTicker) {
      return;
    }
    const trimmedCategory = category.trim();
    try {
      // Normalised to upper case here so "vti" and "VTI" can never become two watchlist entries.
      await onSubmit({ ticker: trimmedTicker.toUpperCase(), category: trimmedCategory === '' ? null : trimmedCategory });
      setTicker('');
      setCategory('');
    } catch {
      // Leave the fields populated so the user can retry; the error itself
      // is surfaced by the page-level error banner (see WatchlistManagementPage).
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="watchlist-ticker">Ticker</label>
      <input id="watchlist-ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} />

      <label htmlFor="watchlist-category">Category (optional)</label>
      <input id="watchlist-category" value={category} onChange={(e) => setCategory(e.target.value)} />

      <button type="submit">+ Add to watchlist</button>
    </form>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/AddWatchlistItemForm.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AddWatchlistItemForm.tsx frontend/src/components/AddWatchlistItemForm.test.tsx
git commit -m "feat: add AddWatchlistItemForm component"
```

---

### Task 4: `WatchlistItemRow` component

**Files:**
- Create: `frontend/src/components/WatchlistItemRow.tsx`
- Create: `frontend/src/components/WatchlistItemRow.test.tsx`

**Interfaces:**
- Consumes: `WatchlistItem` from `../api/types` (Task 1).
- Produces: `WatchlistItemRow({ item, onDelete }: { item: WatchlistItem; onDelete: (id: number) => void })`. Task 5's `WatchlistManagementPage` renders one per item.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/components/WatchlistItemRow.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WatchlistItemRow } from './WatchlistItemRow';

const item = { id: 1, ticker: 'VTI', category: 'Core', created_at: '2026-01-01T00:00:00Z' };

describe('WatchlistItemRow', () => {
  it('renders the ticker and category', () => {
    render(<WatchlistItemRow item={item} onDelete={vi.fn()} />);

    expect(screen.getByText('VTI')).toBeInTheDocument();
    expect(screen.getByText('Core')).toBeInTheDocument();
  });

  it('renders a placeholder when category is null', () => {
    render(<WatchlistItemRow item={{ ...item, category: null }} onDelete={vi.fn()} />);

    expect(screen.getByText(/no category/i)).toBeInTheDocument();
  });

  it('calls onDelete with the item id when Remove is clicked', () => {
    const onDelete = vi.fn();
    render(<WatchlistItemRow item={item} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    expect(onDelete).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/WatchlistItemRow.test.tsx`
Expected: FAIL — `Cannot find module './WatchlistItemRow'`

- [ ] **Step 3: Implement `WatchlistItemRow`**

```tsx
// frontend/src/components/WatchlistItemRow.tsx
import type { WatchlistItem } from '../api/types';

interface WatchlistItemRowProps {
  item: WatchlistItem;
  onDelete: (id: number) => void;
}

export function WatchlistItemRow({ item, onDelete }: WatchlistItemRowProps) {
  return (
    <div>
      <span>{item.ticker}</span>
      <span>{item.category ?? 'No category'}</span>
      <button onClick={() => onDelete(item.id)}>Remove</button>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/WatchlistItemRow.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/WatchlistItemRow.tsx frontend/src/components/WatchlistItemRow.test.tsx
git commit -m "feat: add WatchlistItemRow component"
```

---

### Task 5: `WatchlistManagementPage`

**Files:**
- Create: `frontend/src/pages/WatchlistManagementPage.tsx`
- Create: `frontend/src/pages/WatchlistManagementPage.test.tsx`

**Interfaces:**
- Consumes: `useWatchlist` (Task 2), `AddWatchlistItemForm` (Task 3), `WatchlistItemRow` (Task 4).
- Produces: `WatchlistManagementPage()` with no props. Task 6's `WatchlistPage` renders `<WatchlistManagementPage />` as the content for its one sub-tab.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/pages/WatchlistManagementPage.test.tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { WatchlistManagementPage } from './WatchlistManagementPage';

const item = { id: 1, ticker: 'VTI', category: 'Core', created_at: '2026-01-01T00:00:00Z' };

describe('WatchlistManagementPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a loading state, then renders fetched items', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([item]);

    render(<WatchlistManagementPage />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('VTI')).toBeInTheDocument());
  });

  it('shows an empty state when the watchlist has no items', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<WatchlistManagementPage />);

    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());
  });

  it('submitting the add form creates an item and shows it in the list', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValueOnce([]).mockResolvedValueOnce([item]);
    vi.spyOn(client, 'createWatchlistItem').mockResolvedValue(item);

    render(<WatchlistManagementPage />);
    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'vti' } });
    fireEvent.click(screen.getByRole('button', { name: /add to watchlist/i }));

    await waitFor(() => expect(screen.getByText('VTI')).toBeInTheDocument());
    expect(client.createWatchlistItem).toHaveBeenCalledWith({ ticker: 'VTI', category: null });
  });

  it('clicking Remove on an item removes it from the list', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValueOnce([item]).mockResolvedValueOnce([]);
    vi.spyOn(client, 'deleteWatchlistItem').mockResolvedValue(undefined);

    render(<WatchlistManagementPage />);
    await waitFor(() => expect(screen.getByText('VTI')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());
  });

  it('shows an inline error banner on a failed create, while keeping the form and list visible', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([item]);
    vi.spyOn(client, 'createWatchlistItem').mockRejectedValue(new client.ApiError(400, 'Ticker already on watchlist'));

    render(<WatchlistManagementPage />);
    await waitFor(() => expect(screen.getByText('VTI')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'IOVA' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add to watchlist/i }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Ticker already on watchlist');
    expect(screen.getByText('VTI')).toBeInTheDocument();
    expect(screen.getByLabelText('Ticker')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/WatchlistManagementPage.test.tsx`
Expected: FAIL — `Cannot find module './WatchlistManagementPage'`

- [ ] **Step 3: Implement `WatchlistManagementPage`**

```tsx
// frontend/src/pages/WatchlistManagementPage.tsx
import { AddWatchlistItemForm } from '../components/AddWatchlistItemForm';
import { WatchlistItemRow } from '../components/WatchlistItemRow';
import { useWatchlist } from '../hooks/useWatchlist';

export function WatchlistManagementPage() {
  const { items, loading, error, create, remove } = useWatchlist();

  if (loading) {
    return <div>Loading watchlist…</div>;
  }

  return (
    <div>
      {error && <div role="alert">{error}</div>}
      <AddWatchlistItemForm onSubmit={create} />
      {items.length === 0 ? (
        <p>Your watchlist is empty — add your first ticker above.</p>
      ) : (
        items.map((item) => <WatchlistItemRow key={item.id} item={item} onDelete={remove} />)
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/WatchlistManagementPage.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/WatchlistManagementPage.tsx frontend/src/pages/WatchlistManagementPage.test.tsx
git commit -m "feat: add WatchlistManagementPage"
```

---

### Task 6: `WatchlistPage` and top-level nav wiring

**Files:**
- Create: `frontend/src/pages/WatchlistPage.tsx`
- Create: `frontend/src/pages/WatchlistPage.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `TabStrip` from `../components/TabStrip` (already on master from the `extract-shared-tab-navigation` branch), `WatchlistManagementPage` (Task 5).
- Produces: `WatchlistPage()` with no props, exported from `frontend/src/pages/WatchlistPage.tsx`. This is what later Scanner tickets extend by adding one more entry to its `TABS` array and one more conditional render — no other file changes required for them to add a sub-tab.

- [ ] **Step 1: Write the failing test for `WatchlistPage`**

```tsx
// frontend/src/pages/WatchlistPage.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { WatchlistPage } from './WatchlistPage';

describe('WatchlistPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the Manage Watchlist sub-tab content by default', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<WatchlistPage />);

    expect(screen.getByRole('heading', { name: 'Watchlist' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manage Watchlist' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/WatchlistPage.test.tsx`
Expected: FAIL — `Cannot find module './WatchlistPage'`

- [ ] **Step 3: Implement `WatchlistPage`**

```tsx
// frontend/src/pages/WatchlistPage.tsx
import { useState } from 'react';
import { TabStrip } from '../components/TabStrip';
import { WatchlistManagementPage } from './WatchlistManagementPage';

type WatchlistTab = 'manage';

// "Manage Watchlist", not "Watchlist" — the top-level nav button in App.tsx is already labelled
// "Watchlist"; a same-labelled sub-tab button would make getByRole('button', { name: 'Watchlist' })
// ambiguous in tests (both buttons render at once) and confusing for a screen-reader user.
const TABS = [{ id: 'manage', label: 'Manage Watchlist' }] as const satisfies { id: WatchlistTab; label: string }[];

export function WatchlistPage() {
  const [activeTab, setActiveTab] = useState<WatchlistTab>('manage');

  return (
    <div>
      <h2>Watchlist</h2>
      <TabStrip tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'manage' && <WatchlistManagementPage />}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/WatchlistPage.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Add the failing test for the App-level nav entry**

Add this test inside the existing `describe('App', ...)` block in `frontend/src/App.test.tsx` (the file already has a `beforeEach` mocking `getPortfolioSummary` and an `afterEach` calling `vi.restoreAllMocks()` — reuse those, don't duplicate them):

```tsx
  it('switches to the Watchlist tab and shows its content', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<App />);
    await waitFor(() => expect(screen.getByText(/no portfolios yet/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Watchlist' }));

    expect(screen.getByRole('heading', { name: 'Watchlist' })).toBeInTheDocument();
    expect(screen.queryByText(/no portfolios yet/i)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());
  });
```

- [ ] **Step 6: Run `App.test.tsx` to verify the new test fails**

Run: `cd frontend && npx vitest run src/App.test.tsx`
Expected: FAIL on the new test — no button named "Watchlist" exists yet in `App.tsx`. The two pre-existing tests in this file must still pass.

- [ ] **Step 7: Wire `WatchlistPage` into `App.tsx`**

Replace the full contents of `frontend/src/App.tsx` with:

```tsx
import { useState } from 'react';
import { TabStrip } from './components/TabStrip';
import { PortfoliosPage } from './pages/PortfoliosPage';
import { ToolsPage } from './pages/ToolsPage';
import { WatchlistPage } from './pages/WatchlistPage';

type Tab = 'portfolios' | 'tools' | 'watchlist';

const TABS = [
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
      {activeTab === 'portfolios' && <PortfoliosPage />}
      {activeTab === 'tools' && <ToolsPage />}
      {activeTab === 'watchlist' && <WatchlistPage />}
    </div>
  );
}
```

- [ ] **Step 8: Run `App.test.tsx` to verify all three tests pass**

Run: `cd frontend && npx vitest run src/App.test.tsx`
Expected: PASS (3 tests — the 2 pre-existing plus the new Watchlist-tab test)

- [ ] **Step 9: Run the full frontend suite and typecheck**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: All tests pass (109 pre-existing + 3 client + 7 hook + 5 form + 3 row + 5 management-page + 1 WatchlistPage + 1 new App test = 134), `tsc -b` exits clean.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/WatchlistPage.tsx frontend/src/pages/WatchlistPage.test.tsx frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat: add WatchlistPage and wire it into the top-level nav"
```

## Self-Review

**1. Spec coverage:** Ticket 2's four acceptance groups from `tickets.md` map directly: nav entry + area (Task 6), add with/without category + upper-case normalisation (Task 3), list with ticker+category (Task 4/5), remove (Task 4/5), empty-state message (Task 5), failed-add error message that doesn't clear the form (Task 3/5), backend endpoints unchanged (no `backend/` files touched anywhere in this plan — verified by file list across all 6 tasks).

**2. Placeholder scan:** No TBD/TODO markers. Every code block is complete, copy-pasteable file contents. The two inline comments (upper-casing in Task 3, label-collision avoidance in Task 6) both explain a non-obvious constraint at its point of use, per the Global Constraints section — not decorative.

**3. Type consistency:** `WatchlistItem` / `WatchlistItemCreateInput` (Task 1) are consumed with identical field names and optionality across Tasks 2–5 (`category?: string | null` on create, `category: string | null` on the read type — never conflated). `useWatchlist()`'s return shape (`items`, `loading`, `error`, `create`, `remove`) declared in Task 2's Interfaces block matches exactly what Task 5's `WatchlistManagementPage` destructures. `WatchlistPage`'s `TABS`/`WatchlistTab` naming pattern matches `ToolsPage`'s and `App`'s exactly, so a later ticket extending `WatchlistPage.TABS` has a same-shaped precedent to copy from in every other tab area in the codebase.
