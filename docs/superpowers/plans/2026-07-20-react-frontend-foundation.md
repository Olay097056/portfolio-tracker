# React Frontend Foundation (App Shell, API Client, Portfolios Page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the React (Vite + TypeScript) frontend's app shell, a typed API client against the already-built FastAPI backend, and a fully working Portfolios page (list/create/edit/delete portfolios and their holdings) — with no live price data yet, since price-fetching is a separate, not-yet-built plan.

**Architecture:** Vite + React 19 + TypeScript SPA. A thin `api/client.ts` wraps `fetch` against the backend (`http://localhost:8000` in dev, via `VITE_API_BASE_URL`). Data access goes through small custom hooks (`usePortfolios`, `useHoldings`) rather than a heavier state library — YAGNI for a single-user local app with a handful of screens. Dark+gold theme via CSS custom properties, matching the palette already validated in `.scratch/planning/prototype-06-dashboard/index.html` (Variant A, the chosen dashboard layout).

**Tech Stack:** React 19, TypeScript 5.7, Vite 6, Vitest 2 + @testing-library/react 16 + jsdom for tests. Backend: FastAPI (already built on `master`), needs one small CORS addition (Task 1) before the frontend can call it from a different dev-server port.

This is Plan 2 of the portfolio-tracker build (Plan 1 was `2026-07-20-backend-foundation.md`, now merged to `master`). This plan covers PRD.md sections 4 (portfolio/holding CRUD UI) and part of 10.3 (Portfolios page) — **without** live pricing, since PRD.md sections 5/6 (price data, S/R) aren't implemented yet. The Dashboard page's chart panel, DCA calculator, stress-test calculator, and rebalance-severity coloring all depend on real prices and are explicitly deferred to a follow-up plan once either (a) a price-fetching plan lands, or (b) manual price entry is added.

## Global Constraints

- No live price data in this plan — `PortfolioSummaryOut`/`HoldingStatsOut` (which need a `prices` map) are NOT used here. Only `GET/POST/PATCH/DELETE /portfolios` and `GET/POST/PATCH/DELETE /portfolios/{id}/holdings` are wired.
- Backend API base URL is configurable via `VITE_API_BASE_URL`, defaulting to `http://localhost:8000`.
- Dark theme only for this plan (matches the prototype); no light-mode toggle.
- TypeScript types for API payloads must exactly match `backend/app/schemas.py` field names/nullability — copied verbatim from that file, not guessed.
- Money/share values are plain numbers (matches the backend's `float` — see backend-foundation plan's Global Constraints for why).

---

## File Structure

```
portfolio-tracker/frontend/
  package.json
  tsconfig.json
  tsconfig.node.json
  vite.config.ts
  index.html
  src/
    main.tsx
    App.tsx
    api/
      types.ts          # TS interfaces matching backend/app/schemas.py
      client.ts          # fetch wrapper + typed request functions
      client.test.ts
    hooks/
      usePortfolios.ts
      usePortfolios.test.tsx
      useHoldings.ts
      useHoldings.test.tsx
    components/
      PortfolioCard.tsx
      PortfolioCard.test.tsx
      AddPortfolioForm.tsx
      AddPortfolioForm.test.tsx
      HoldingRow.tsx
      HoldingRow.test.tsx
      AddHoldingForm.tsx
      AddHoldingForm.test.tsx
    pages/
      PortfoliosPage.tsx
      PortfoliosPage.test.tsx
    styles/
      theme.css
    test/
      setup.ts            # jsdom + @testing-library/jest-dom setup
```

`backend/app/main.py` gets one small change in Task 1 (CORS middleware) — no new backend files.

---

### Task 1: Backend CORS middleware

**Files:**
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_cors.py`

**Interfaces:**
- Consumes: `app` FastAPI instance already defined in `backend/app/main.py`.
- Produces: the running API now sends `Access-Control-Allow-Origin` headers permitting requests from the Vite dev server origin — no new importable names, this is a pure app-configuration change.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_cors.py
def test_cors_allows_vite_dev_origin(client):
    response = client.options(
        "/portfolios",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/Scripts/pytest tests/test_cors.py -v`
Expected: FAIL — no CORS middleware installed, so the preflight `OPTIONS` request returns 400 or lacks the header.

- [ ] **Step 3: Add CORS middleware to `backend/app/main.py`**

```python
# backend/app/main.py (replace the full file)
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import holdings, portfolios, watchlist


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Portfolio Tracker API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(portfolios.router)
app.include_router(holdings.router)
app.include_router(watchlist.router)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/Scripts/pytest tests/test_cors.py -v`
Expected: `test_cors_allows_vite_dev_origin PASSED`

- [ ] **Step 5: Run the full backend suite to confirm no regressions**

Run: `cd backend && .venv/Scripts/pytest -v`
Expected: all 32 tests pass (31 existing + 1 new), 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py backend/tests/test_cors.py
git commit -m "feat: allow CORS from the Vite dev server origin"
```

---

### Task 2: Vite + React + TypeScript scaffold, dark theme, Vitest setup

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/styles/theme.css`
- Create: `frontend/src/test/setup.ts`
- Test: `frontend/src/App.test.tsx`

**Interfaces:**
- Produces: a runnable Vite dev server (`npm run dev`) rendering `App`, and a working `npm test` (Vitest) harness — every later task's `*.test.tsx` files run under this harness.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "portfolio-tracker-frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.2",
    "vite": "^6.0.5",
    "vitest": "^3.0.5"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd frontend && npm install`
Expected: installs with no errors (creates `node_modules/` and `package-lock.json`).

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: Write `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

(Note: `"noEmit": true` cannot be added here — TypeScript's `TS6310` rule forbids a `composite` project referenced via another tsconfig's `"references"` from disabling emit. The resulting `vite.config.js`/`vite.config.d.ts`/`*.tsbuildinfo` build byproducts are handled instead by gitignoring them — see Task 2 Step 15's `.gitignore` additions.)

- [ ] **Step 5: Write `vite.config.ts`**

```typescript
// frontend/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
```

- [ ] **Step 6: Write `frontend/src/test/setup.ts`**

```typescript
// frontend/src/test/setup.ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 7: Write `frontend/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Portfolio Tracker</title>
    <link rel="stylesheet" href="/src/styles/theme.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Write `frontend/src/styles/theme.css`**

```css
/* frontend/src/styles/theme.css */
:root {
  --bg: #0a0d12;
  --panel: #131822;
  --panel2: #1a212c;
  --panel3: #20293a;
  --border: #232b38;
  --gold: #f0b90b;
  --gold-dim: #8a6c17;
  --green: #2ecc71;
  --red: #ef4444;
  --yellow: #f1c40f;
  --text: #e6e9ef;
  --muted: #8892a0;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 14px/1.4 -apple-system, "Segoe UI", Roboto, sans-serif;
}

button {
  font: inherit;
  cursor: pointer;
}

input {
  background: var(--panel3);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 6px;
  padding: 6px 8px;
}
```

- [ ] **Step 9: Write `frontend/src/App.tsx`**

```tsx
// frontend/src/App.tsx
export function App() {
  return (
    <div>
      <h1>Portfolio Tracker</h1>
    </div>
  );
}
```

- [ ] **Step 10: Write `frontend/src/main.tsx`**

```tsx
// frontend/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 11: Write the failing smoke test**

```tsx
// frontend/src/App.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the app title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Portfolio Tracker' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 12: Run the test to verify it fails first**

Run: `cd frontend && npm test`
Expected: FAIL if any prior step was skipped (e.g. missing setup file causes a config error). With all steps done, it passes immediately — confirm in Step 13.

- [ ] **Step 13: Run the test to verify it passes**

Run: `cd frontend && npm test`
Expected: `App > renders the app title` PASSED, 1 test file, 1 test.

- [ ] **Step 14: Verify the dev server actually runs**

Run: `cd frontend && npm run dev` (then stop it with Ctrl+C after confirming) — or non-interactively, run `npm run build` instead to verify the TypeScript+Vite pipeline compiles cleanly:

Run: `cd frontend && npm run build`
Expected: builds successfully, producing a `dist/` directory with no TypeScript errors.

- [ ] **Step 15: Commit**

```bash
git add frontend/package.json frontend/tsconfig.json frontend/tsconfig.node.json frontend/vite.config.ts frontend/index.html frontend/src/main.tsx frontend/src/App.tsx frontend/src/styles/theme.css frontend/src/test/setup.ts frontend/src/App.test.tsx
git commit -m "chore: scaffold Vite + React + TypeScript frontend with Vitest"
```

Note: do NOT commit `frontend/node_modules/` or `frontend/dist/` — add a `frontend/.gitignore` if one doesn't already cover them (check the repo-root `.gitignore` first; if it doesn't have a `node_modules` entry, add `frontend/node_modules/` and `frontend/dist/` to it in this same commit). Also add `*.tsbuildinfo`, `frontend/vite.config.js`, and `frontend/vite.config.d.ts` to the same `.gitignore` — `tsc -b`'s composite build for `vite.config.ts` regenerates these on every build (see the `noEmit` note under Task 2 Step 4 above for why they can't simply be suppressed at the source).

---

### Task 3: TypeScript API types + client (Portfolio + Holding)

**Files:**
- Create: `frontend/src/api/types.ts`
- Create: `frontend/src/api/client.ts`
- Test: `frontend/src/api/client.test.ts`

**Interfaces:**
- Produces: `Portfolio`, `PortfolioCreateInput`, `PortfolioUpdateInput`, `Holding`, `HoldingCreateInput`, `HoldingUpdateInput`, `ApiError` types/classes in `api/types.ts` / `api/client.ts`; `listPortfolios()`, `createPortfolio()`, `updatePortfolio()`, `deletePortfolio()`, `listHoldings()`, `createHolding()`, `updateHolding()`, `deleteHolding()` functions in `api/client.ts` — Tasks 4–6 import these by exact name.

- [ ] **Step 1: Write `frontend/src/api/types.ts`**

Field names and nullability copied verbatim from `backend/app/schemas.py`.

```typescript
// frontend/src/api/types.ts
export interface Portfolio {
  id: number;
  name: string;
  cash_usd: number;
  target_allocation_pct: number | null;
  created_at: string;
}

export interface PortfolioCreateInput {
  name: string;
  cash_usd?: number;
  target_allocation_pct?: number | null;
}

export interface PortfolioUpdateInput {
  name?: string;
  cash_usd?: number;
  target_allocation_pct?: number | null;
}

export interface Holding {
  id: number;
  portfolio_id: number;
  ticker: string;
  shares: number;
  avg_cost_usd: number;
  target_allocation_pct: number | null;
  realized_pnl_usd: number;
  created_at: string;
  updated_at: string;
}

export interface HoldingCreateInput {
  ticker: string;
  shares: number;
  avg_cost_usd: number;
  target_allocation_pct?: number | null;
}

export interface HoldingUpdateInput {
  ticker?: string;
  shares?: number;
  avg_cost_usd?: number;
  target_allocation_pct?: number | null;
  realized_pnl_usd?: number;
}
```

- [ ] **Step 2: Write the failing tests**

```typescript
// frontend/src/api/client.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  createPortfolio,
  deletePortfolio,
  listPortfolios,
  updatePortfolio,
  createHolding,
  listHoldings,
} from './client';

function mockFetchOnce(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }),
  );
}

describe('api client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('listPortfolios calls GET /portfolios and returns the parsed body', async () => {
    mockFetchOnce([{ id: 1, name: 'DIME', cash_usd: 250, target_allocation_pct: 70, created_at: '2026-01-01T00:00:00Z' }]);

    const result = await listPortfolios();

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/portfolios',
      expect.objectContaining({ method: undefined }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('DIME');
  });

  it('createPortfolio POSTs the payload as JSON', async () => {
    mockFetchOnce({ id: 1, name: 'DIME', cash_usd: 0, target_allocation_pct: null, created_at: '2026-01-01T00:00:00Z' }, { status: 201 });

    await createPortfolio({ name: 'DIME' });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/portfolios',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'DIME' }),
      }),
    );
  });

  it('updatePortfolio PATCHes to the correct URL', async () => {
    mockFetchOnce({ id: 1, name: 'DIME 2', cash_usd: 0, target_allocation_pct: null, created_at: '2026-01-01T00:00:00Z' });

    await updatePortfolio(1, { name: 'DIME 2' });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/portfolios/1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'DIME 2' }) }),
    );
  });

  it('deletePortfolio DELETEs and resolves with no body on 204', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error('should not be called'); } }),
    );

    await expect(deletePortfolio(1)).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/portfolios/1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('throws ApiError with the backend detail message on a non-2xx response', async () => {
    mockFetchOnce({ detail: 'Portfolio not found' }, { status: 404 });

    await expect(listHoldings(999)).rejects.toBeInstanceOf(ApiError);
    await expect(listHoldings(999)).rejects.toThrow('Portfolio not found');
  });

  it('createHolding POSTs to the nested holdings path', async () => {
    mockFetchOnce(
      { id: 1, portfolio_id: 1, ticker: 'AAPL', shares: 12, avg_cost_usd: 187.4, target_allocation_pct: 20, realized_pnl_usd: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { status: 201 },
    );

    await createHolding(1, { ticker: 'AAPL', shares: 12, avg_cost_usd: 187.4 });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/portfolios/1/holdings',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ ticker: 'AAPL', shares: 12, avg_cost_usd: 187.4 }) }),
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — `./client` module does not exist yet.

- [ ] **Step 4: Write `frontend/src/api/client.ts`**

```typescript
// frontend/src/api/client.ts
import type {
  Holding,
  HoldingCreateInput,
  HoldingUpdateInput,
  Portfolio,
  PortfolioCreateInput,
  PortfolioUpdateInput,
} from './types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}) as { detail?: string });
    throw new ApiError(response.status, body.detail ?? response.statusText);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function listPortfolios(): Promise<Portfolio[]> {
  return request<Portfolio[]>('/portfolios');
}

export function createPortfolio(input: PortfolioCreateInput): Promise<Portfolio> {
  return request<Portfolio>('/portfolios', { method: 'POST', body: JSON.stringify(input) });
}

export function updatePortfolio(id: number, input: PortfolioUpdateInput): Promise<Portfolio> {
  return request<Portfolio>(`/portfolios/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deletePortfolio(id: number): Promise<void> {
  return request<void>(`/portfolios/${id}`, { method: 'DELETE' });
}

export function listHoldings(portfolioId: number): Promise<Holding[]> {
  return request<Holding[]>(`/portfolios/${portfolioId}/holdings`);
}

export function createHolding(portfolioId: number, input: HoldingCreateInput): Promise<Holding> {
  return request<Holding>(`/portfolios/${portfolioId}/holdings`, { method: 'POST', body: JSON.stringify(input) });
}

export function updateHolding(portfolioId: number, holdingId: number, input: HoldingUpdateInput): Promise<Holding> {
  return request<Holding>(`/portfolios/${portfolioId}/holdings/${holdingId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteHolding(portfolioId: number, holdingId: number): Promise<void> {
  return request<void>(`/portfolios/${portfolioId}/holdings/${holdingId}`, { method: 'DELETE' });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: all `api client` tests pass (7 tests), plus the `App` test from Task 2 — 2 test files, 8 tests total.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/api/client.test.ts
git commit -m "feat: add typed API client for portfolios and holdings"
```

---

### Task 4: `usePortfolios` and `useHoldings` hooks

**Files:**
- Create: `frontend/src/hooks/usePortfolios.ts`
- Create: `frontend/src/hooks/usePortfolios.test.tsx`
- Create: `frontend/src/hooks/useHoldings.ts`
- Create: `frontend/src/hooks/useHoldings.test.tsx`

**Interfaces:**
- Consumes: `listPortfolios`, `createPortfolio`, `updatePortfolio`, `deletePortfolio`, `listHoldings`, `createHolding`, `updateHolding`, `deleteHolding` from `api/client` (Task 3).
- Produces: `usePortfolios()` returning `{ portfolios, loading, error, create, update, remove }`; `useHoldings(portfolioId)` returning `{ holdings, loading, error, create, update, remove }` — Tasks 5–6 import these by exact name and shape.

- [ ] **Step 1: Write the failing tests for `usePortfolios`**

```tsx
// frontend/src/hooks/usePortfolios.test.tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { usePortfolios } from './usePortfolios';

const samplePortfolio = { id: 1, name: 'DIME', cash_usd: 0, target_allocation_pct: null, created_at: '2026-01-01T00:00:00Z' };

describe('usePortfolios', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads portfolios on mount', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([samplePortfolio]);

    const { result } = renderHook(() => usePortfolios());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.portfolios).toEqual([samplePortfolio]);
    expect(result.current.error).toBeNull();
  });

  it('sets error when the initial load fails', async () => {
    vi.spyOn(client, 'listPortfolios').mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => usePortfolios());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('network down');
    expect(result.current.portfolios).toEqual([]);
  });

  it('create() adds the new portfolio and refetches the list', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValueOnce([]).mockResolvedValueOnce([samplePortfolio]);
    vi.spyOn(client, 'createPortfolio').mockResolvedValue(samplePortfolio);

    const { result } = renderHook(() => usePortfolios());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.create({ name: 'DIME' });
    });

    expect(client.createPortfolio).toHaveBeenCalledWith({ name: 'DIME' });
    expect(result.current.portfolios).toEqual([samplePortfolio]);
  });

  it('remove() deletes and refetches the list', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValueOnce([samplePortfolio]).mockResolvedValueOnce([]);
    vi.spyOn(client, 'deletePortfolio').mockResolvedValue(undefined);

    const { result } = renderHook(() => usePortfolios());
    await waitFor(() => expect(result.current.portfolios).toEqual([samplePortfolio]));

    await act(async () => {
      await result.current.remove(1);
    });

    expect(client.deletePortfolio).toHaveBeenCalledWith(1);
    expect(result.current.portfolios).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — `./usePortfolios` module does not exist yet.

- [ ] **Step 3: Write `frontend/src/hooks/usePortfolios.ts`**

```typescript
// frontend/src/hooks/usePortfolios.ts
import { useCallback, useEffect, useState } from 'react';
import { createPortfolio, deletePortfolio, listPortfolios, updatePortfolio } from '../api/client';
import type { Portfolio, PortfolioCreateInput, PortfolioUpdateInput } from '../api/types';

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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const create = useCallback(
    async (input: PortfolioCreateInput) => {
      await createPortfolio(input);
      await refetch();
    },
    [refetch],
  );

  const update = useCallback(
    async (id: number, input: PortfolioUpdateInput) => {
      await updatePortfolio(id, input);
      await refetch();
    },
    [refetch],
  );

  const remove = useCallback(
    async (id: number) => {
      await deletePortfolio(id);
      await refetch();
    },
    [refetch],
  );

  return { portfolios, loading, error, create, update, remove };
}
```

- [ ] **Step 4: Run `usePortfolios` tests to verify they pass**

Run: `cd frontend && npm test -- usePortfolios`
Expected: all 4 `usePortfolios` tests pass.

- [ ] **Step 5: Write the failing tests for `useHoldings`**

```tsx
// frontend/src/hooks/useHoldings.test.tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { useHoldings } from './useHoldings';

const sampleHolding = {
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

describe('useHoldings', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads holdings for the given portfolio id on mount', async () => {
    vi.spyOn(client, 'listHoldings').mockResolvedValue([sampleHolding]);

    const { result } = renderHook(() => useHoldings(1));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(client.listHoldings).toHaveBeenCalledWith(1);
    expect(result.current.holdings).toEqual([sampleHolding]);
  });

  it('refetches when the portfolio id changes', async () => {
    vi.spyOn(client, 'listHoldings').mockResolvedValueOnce([sampleHolding]).mockResolvedValueOnce([]);

    const { result, rerender } = renderHook(({ id }) => useHoldings(id), { initialProps: { id: 1 } });
    await waitFor(() => expect(result.current.holdings).toEqual([sampleHolding]));

    rerender({ id: 2 });

    await waitFor(() => expect(client.listHoldings).toHaveBeenLastCalledWith(2));
  });

  it('create() adds a holding under the current portfolio and refetches', async () => {
    vi.spyOn(client, 'listHoldings').mockResolvedValueOnce([]).mockResolvedValueOnce([sampleHolding]);
    vi.spyOn(client, 'createHolding').mockResolvedValue(sampleHolding);

    const { result } = renderHook(() => useHoldings(1));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.create({ ticker: 'AAPL', shares: 12, avg_cost_usd: 187.4 });
    });

    expect(client.createHolding).toHaveBeenCalledWith(1, { ticker: 'AAPL', shares: 12, avg_cost_usd: 187.4 });
    expect(result.current.holdings).toEqual([sampleHolding]);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd frontend && npm test -- useHoldings`
Expected: FAIL — `./useHoldings` module does not exist yet.

- [ ] **Step 7: Write `frontend/src/hooks/useHoldings.ts`**

```typescript
// frontend/src/hooks/useHoldings.ts
import { useCallback, useEffect, useState } from 'react';
import { createHolding, deleteHolding, listHoldings, updateHolding } from '../api/client';
import type { Holding, HoldingCreateInput, HoldingUpdateInput } from '../api/types';

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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const create = useCallback(
    async (input: HoldingCreateInput) => {
      await createHolding(portfolioId, input);
      await refetch();
    },
    [portfolioId, refetch],
  );

  const update = useCallback(
    async (holdingId: number, input: HoldingUpdateInput) => {
      await updateHolding(portfolioId, holdingId, input);
      await refetch();
    },
    [portfolioId, refetch],
  );

  const remove = useCallback(
    async (holdingId: number) => {
      await deleteHolding(portfolioId, holdingId);
      await refetch();
    },
    [portfolioId, refetch],
  );

  return { holdings, loading, error, create, update, remove };
}
```

- [ ] **Step 8: Run all hook tests to verify they pass**

Run: `cd frontend && npm test`
Expected: all tests pass (App: 1, api client: 7, usePortfolios: 4, useHoldings: 3 — 15 total).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/hooks/usePortfolios.ts frontend/src/hooks/usePortfolios.test.tsx frontend/src/hooks/useHoldings.ts frontend/src/hooks/useHoldings.test.tsx
git commit -m "feat: add usePortfolios and useHoldings data hooks"
```

---

### Task 5: `PortfolioCard`, `AddPortfolioForm`, `HoldingRow`, `AddHoldingForm` components

**Files:**
- Create: `frontend/src/components/PortfolioCard.tsx`
- Create: `frontend/src/components/PortfolioCard.test.tsx`
- Create: `frontend/src/components/AddPortfolioForm.tsx`
- Create: `frontend/src/components/AddPortfolioForm.test.tsx`
- Create: `frontend/src/components/HoldingRow.tsx`
- Create: `frontend/src/components/HoldingRow.test.tsx`
- Create: `frontend/src/components/AddHoldingForm.tsx`
- Create: `frontend/src/components/AddHoldingForm.test.tsx`

**Interfaces:**
- Consumes: `Portfolio`, `Holding`, `PortfolioCreateInput`, `HoldingCreateInput` types from `api/types` (Task 3).
- Produces: `PortfolioCard`, `AddPortfolioForm`, `HoldingRow`, `AddHoldingForm` React components — Task 6's `PortfoliosPage` composes these by exact name and prop shape (see each component's props below).

- [ ] **Step 1: Write the failing test for `PortfolioCard`**

```tsx
// frontend/src/components/PortfolioCard.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PortfolioCard } from './PortfolioCard';

const portfolio = { id: 1, name: 'DIME', cash_usd: 250, target_allocation_pct: 70, created_at: '2026-01-01T00:00:00Z' };

describe('PortfolioCard', () => {
  it('renders the portfolio name, cash, and target allocation', () => {
    render(<PortfolioCard portfolio={portfolio} onDelete={vi.fn()} />);

    expect(screen.getByText('DIME')).toBeInTheDocument();
    expect(screen.getByText(/250/)).toBeInTheDocument();
    expect(screen.getByText(/70/)).toBeInTheDocument();
  });

  it('renders "no target set" when target_allocation_pct is null', () => {
    render(<PortfolioCard portfolio={{ ...portfolio, target_allocation_pct: null }} onDelete={vi.fn()} />);

    expect(screen.getByText(/no target set/i)).toBeInTheDocument();
  });

  it('calls onDelete with the portfolio id when the delete button is clicked', () => {
    const onDelete = vi.fn();
    render(<PortfolioCard portfolio={portfolio} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(onDelete).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- PortfolioCard`
Expected: FAIL — `./PortfolioCard` module does not exist yet.

- [ ] **Step 3: Write `frontend/src/components/PortfolioCard.tsx`**

```tsx
// frontend/src/components/PortfolioCard.tsx
import type { Portfolio } from '../api/types';

interface PortfolioCardProps {
  portfolio: Portfolio;
  onDelete: (id: number) => void;
}

export function PortfolioCard({ portfolio, onDelete }: PortfolioCardProps) {
  return (
    <div className="portfolio-card">
      <h3>{portfolio.name}</h3>
      <div>Cash: ${portfolio.cash_usd.toLocaleString()}</div>
      <div>
        Target allocation: {portfolio.target_allocation_pct === null ? 'no target set' : `${portfolio.target_allocation_pct}%`}
      </div>
      <button onClick={() => onDelete(portfolio.id)}>Delete</button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- PortfolioCard`
Expected: all 3 `PortfolioCard` tests pass.

- [ ] **Step 5: Write the failing test for `AddPortfolioForm`**

```tsx
// frontend/src/components/AddPortfolioForm.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddPortfolioForm } from './AddPortfolioForm';

describe('AddPortfolioForm', () => {
  it('calls onSubmit with the entered name and cash on submit', () => {
    const onSubmit = vi.fn();
    render(<AddPortfolioForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Speculative' } });
    fireEvent.change(screen.getByLabelText(/cash/i), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /add portfolio/i }));

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Speculative', cash_usd: 100 });
  });

  it('does not call onSubmit when the name is empty', () => {
    const onSubmit = vi.fn();
    render(<AddPortfolioForm onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: /add portfolio/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd frontend && npm test -- AddPortfolioForm`
Expected: FAIL — `./AddPortfolioForm` module does not exist yet.

- [ ] **Step 7: Write `frontend/src/components/AddPortfolioForm.tsx`**

```tsx
// frontend/src/components/AddPortfolioForm.tsx
import { useState, type FormEvent } from 'react';
import type { PortfolioCreateInput } from '../api/types';

interface AddPortfolioFormProps {
  onSubmit: (input: PortfolioCreateInput) => void;
}

export function AddPortfolioForm({ onSubmit }: AddPortfolioFormProps) {
  const [name, setName] = useState('');
  const [cash, setCash] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    onSubmit({ name, cash_usd: cash === '' ? 0 : Number(cash) });
    setName('');
    setCash('');
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

- [ ] **Step 8: Run test to verify it passes**

Run: `cd frontend && npm test -- AddPortfolioForm`
Expected: both `AddPortfolioForm` tests pass.

- [ ] **Step 9: Write the failing test for `HoldingRow`**

```tsx
// frontend/src/components/HoldingRow.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HoldingRow } from './HoldingRow';

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

describe('HoldingRow', () => {
  it('renders ticker, shares, and average cost', () => {
    render(<HoldingRow holding={holding} onDelete={vi.fn()} />);

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText(/12/)).toBeInTheDocument();
    expect(screen.getByText(/187.4/)).toBeInTheDocument();
  });

  it('calls onDelete with the holding id when delete is clicked', () => {
    const onDelete = vi.fn();
    render(<HoldingRow holding={holding} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(onDelete).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `cd frontend && npm test -- HoldingRow`
Expected: FAIL — `./HoldingRow` module does not exist yet.

- [ ] **Step 11: Write `frontend/src/components/HoldingRow.tsx`**

```tsx
// frontend/src/components/HoldingRow.tsx
import type { Holding } from '../api/types';

interface HoldingRowProps {
  holding: Holding;
  onDelete: (id: number) => void;
}

export function HoldingRow({ holding, onDelete }: HoldingRowProps) {
  return (
    <div className="holding-row">
      <span>{holding.ticker}</span>
      <span>{holding.shares} sh</span>
      <span>@ ${holding.avg_cost_usd}</span>
      <button onClick={() => onDelete(holding.id)}>Delete</button>
    </div>
  );
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `cd frontend && npm test -- HoldingRow`
Expected: both `HoldingRow` tests pass.

- [ ] **Step 13: Write the failing test for `AddHoldingForm`**

```tsx
// frontend/src/components/AddHoldingForm.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddHoldingForm } from './AddHoldingForm';

describe('AddHoldingForm', () => {
  it('calls onSubmit with ticker, shares, and avg cost on submit', () => {
    const onSubmit = vi.fn();
    render(<AddHoldingForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    fireEvent.change(screen.getByLabelText(/shares/i), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/average cost/i), { target: { value: '187.4' } });
    fireEvent.click(screen.getByRole('button', { name: /add holding/i }));

    expect(onSubmit).toHaveBeenCalledWith({ ticker: 'AAPL', shares: 12, avg_cost_usd: 187.4 });
  });

  it('does not call onSubmit when ticker is empty', () => {
    const onSubmit = vi.fn();
    render(<AddHoldingForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/shares/i), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /add holding/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 14: Run test to verify it fails**

Run: `cd frontend && npm test -- AddHoldingForm`
Expected: FAIL — `./AddHoldingForm` module does not exist yet.

- [ ] **Step 15: Write `frontend/src/components/AddHoldingForm.tsx`**

```tsx
// frontend/src/components/AddHoldingForm.tsx
import { useState, type FormEvent } from 'react';
import type { HoldingCreateInput } from '../api/types';

interface AddHoldingFormProps {
  onSubmit: (input: HoldingCreateInput) => void;
}

export function AddHoldingForm({ onSubmit }: AddHoldingFormProps) {
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [avgCost, setAvgCost] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!ticker.trim() || shares === '' || avgCost === '') {
      return;
    }
    onSubmit({ ticker, shares: Number(shares), avg_cost_usd: Number(avgCost) });
    setTicker('');
    setShares('');
    setAvgCost('');
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

- [ ] **Step 16: Run all component tests to verify they pass**

Run: `cd frontend && npm test`
Expected: all tests pass (App: 1, api client: 7, usePortfolios: 4, useHoldings: 3, PortfolioCard: 3, AddPortfolioForm: 2, HoldingRow: 2, AddHoldingForm: 2 — 24 total).

- [ ] **Step 17: Commit**

```bash
git add frontend/src/components/PortfolioCard.tsx frontend/src/components/PortfolioCard.test.tsx frontend/src/components/AddPortfolioForm.tsx frontend/src/components/AddPortfolioForm.test.tsx frontend/src/components/HoldingRow.tsx frontend/src/components/HoldingRow.test.tsx frontend/src/components/AddHoldingForm.tsx frontend/src/components/AddHoldingForm.test.tsx
git commit -m "feat: add PortfolioCard, AddPortfolioForm, HoldingRow, AddHoldingForm components"
```

---

### Task 6: `PortfoliosPage` — wire everything together

**Files:**
- Create: `frontend/src/pages/PortfoliosPage.tsx`
- Create: `frontend/src/pages/PortfoliosPage.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `usePortfolios` (Task 4), `PortfolioCard`, `AddPortfolioForm` (Task 5).
- Produces: `PortfoliosPage` component, rendered by `App`.

- [ ] **Step 1: Write the failing test for `PortfoliosPage`**

```tsx
// frontend/src/pages/PortfoliosPage.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { PortfoliosPage } from './PortfoliosPage';

const portfolio = { id: 1, name: 'DIME', cash_usd: 250, target_allocation_pct: 70, created_at: '2026-01-01T00:00:00Z' };

describe('PortfoliosPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a loading state, then renders fetched portfolios', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([portfolio]);

    render(<PortfoliosPage />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('DIME')).toBeInTheDocument());
  });

  it('shows an empty state when there are no portfolios', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);

    render(<PortfoliosPage />);

    await waitFor(() => expect(screen.getByText(/no portfolios yet/i)).toBeInTheDocument());
  });

  it('submitting the add-portfolio form creates a portfolio and shows it in the list', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValueOnce([]).mockResolvedValueOnce([portfolio]);
    vi.spyOn(client, 'createPortfolio').mockResolvedValue(portfolio);

    render(<PortfoliosPage />);
    await waitFor(() => expect(screen.getByText(/no portfolios yet/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'DIME' } });
    fireEvent.click(screen.getByRole('button', { name: /add portfolio/i }));

    await waitFor(() => expect(screen.getByText('DIME')).toBeInTheDocument());
    expect(client.createPortfolio).toHaveBeenCalledWith({ name: 'DIME', cash_usd: 0 });
  });

  it('clicking delete on a portfolio card removes it from the list', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValueOnce([portfolio]).mockResolvedValueOnce([]);
    vi.spyOn(client, 'deletePortfolio').mockResolvedValue(undefined);

    render(<PortfoliosPage />);
    await waitFor(() => expect(screen.getByText('DIME')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(screen.getByText(/no portfolios yet/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- PortfoliosPage`
Expected: FAIL — `./PortfoliosPage` module does not exist yet.

- [ ] **Step 3: Write `frontend/src/pages/PortfoliosPage.tsx`**

```tsx
// frontend/src/pages/PortfoliosPage.tsx
import { AddPortfolioForm } from '../components/AddPortfolioForm';
import { PortfolioCard } from '../components/PortfolioCard';
import { usePortfolios } from '../hooks/usePortfolios';

export function PortfoliosPage() {
  const { portfolios, loading, error, create, remove } = usePortfolios();

  if (loading) {
    return <div>Loading portfolios…</div>;
  }

  if (error) {
    return <div role="alert">Error loading portfolios: {error}</div>;
  }

  return (
    <div>
      <h2>Portfolios</h2>
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
Expected: all 4 `PortfoliosPage` tests pass.

- [ ] **Step 5: Wire `PortfoliosPage` into `App`**

```tsx
// frontend/src/App.tsx (replace the full file)
import { PortfoliosPage } from './pages/PortfoliosPage';

export function App() {
  return (
    <div>
      <h1>Portfolio Tracker</h1>
      <PortfoliosPage />
    </div>
  );
}
```

- [ ] **Step 6: Update the `App` smoke test to account for the now-async `PortfoliosPage`**

```tsx
// frontend/src/App.test.tsx (replace the full file)
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from './api/client';
import { App } from './App';

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the app title and the portfolios page', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Portfolio Tracker' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/no portfolios yet/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 7: Run the full test suite**

Run: `cd frontend && npm test`
Expected: all tests pass across every file (App: 1, api client: 7, usePortfolios: 4, useHoldings: 3, PortfolioCard: 3, AddPortfolioForm: 2, HoldingRow: 2, AddHoldingForm: 2, PortfoliosPage: 4 — 28 total).

- [ ] **Step 8: Run the production build to confirm TypeScript compiles cleanly**

Run: `cd frontend && npm run build`
Expected: builds successfully with no type errors.

- [ ] **Step 9: Manual end-to-end verification (not automatable in this environment — record the steps for whoever runs this task)**

1. In one terminal: `cd backend && .venv/Scripts/uvicorn app.main:app --reload --port 8000`
2. In another terminal: `cd frontend && npm run dev`
3. Open the printed Vite URL (typically `http://localhost:5173`) in a browser.
4. Confirm the page loads with "No portfolios yet — add one above."
5. Add a portfolio (e.g. name "DIME", cash 250) and confirm it appears in the list.
6. Delete it and confirm the empty state returns.
7. Confirm no CORS errors appear in the browser console (this proves Task 1's CORS fix works against a real cross-origin request, not just the test client).

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/PortfoliosPage.tsx frontend/src/pages/PortfoliosPage.test.tsx frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat: wire PortfoliosPage into the app shell"
```

---

## What this plan does NOT cover (deliberately — see follow-up plans)

- Holdings are not yet rendered inside `PortfoliosPage` (the `HoldingRow`/`AddHoldingForm`/`useHoldings` built in Tasks 4–5 are ready but not composed into the page yet) — fold this in once the page's per-portfolio expand/collapse interaction is designed, or as the first task of the next frontend plan.
- No live pricing, no `PortfolioSummaryOut` usage, no donut chart, no rebalance-severity coloring, no DCA calculator, no stress-test calculator, no price chart — all depend on real prices (PRD.md section 5, not yet built).
- No routing library — single-page `App` renders `PortfoliosPage` directly. Add React Router (or similar) when the Dashboard page is built and there's more than one screen to navigate between.
- No currency (USD/THB) conversion — depends on the FX plan (PRD.md section 9), not yet built.
