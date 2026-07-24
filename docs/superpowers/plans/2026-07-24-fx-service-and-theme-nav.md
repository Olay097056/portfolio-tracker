# FX Service and Theme/Nav Restructuring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal USD→THB FX-rate capability to the backend, and make the app's visual theme actually apply (it's written but never imported today) with a real top-nav bar that can switch between the existing Portfolios page and a new Tools placeholder page.

**Architecture:** Backend: a new `fx_service.py` module (mirrors the existing `price_service.py` shape — fetch, in-memory cache with TTL, fail-to-`None`) fetching from Frankfurter, exposed via a new `routers/fx.py` endpoint (mirrors `routers/prices.py`). Frontend: rewrite `styles/theme.css`'s design tokens to the stockvision-app palette and actually `import` it; add client-side tab state to `App.tsx` to switch between `PortfoliosPage` (existing, untouched) and a new `ToolsPage` placeholder (empty shell — the real Tools features are a separate follow-up plan).

**Tech Stack:** FastAPI + SQLAlchemy backend (Python), React 19 + TypeScript 5.7 (strict) + Vite 6 frontend, pytest (backend tests), Vitest 3 + Testing Library (frontend tests).

## Global Constraints

- Zero `any` / `@ts-ignore` / `@ts-expect-error` in any TypeScript file.
- Tests never touch real network — mock at the service/client function boundary (`_fetch_from_frankfurter` on the backend, `api/client` functions on the frontend), matching this codebase's established pattern in `backend/tests/test_price_service.py` and every frontend component test.
- FX data source: Frankfurter (`api.frankfurter.app`) — free, no API key required. This is a deliberate choice resolving PRD §11's still-open "pick a real FX provider" item in favor of the no-key option, consistent with yfinance also requiring no key.
- This plan does NOT build the DCA Projection, Passive Income, Portfolio Builder, or ETF Comparison features, and does NOT build the `/market-data` endpoint. `ToolsPage` is an empty placeholder only. Those are separate, later work per `docs/specs/2026-07-24-stockvision-tools-merge.md`.
- No visual/CSS regression test exists or is expected in this project (see that spec's Testing Decisions) — Task 3 below is the one task in this plan without a red-green unit test cycle, and says so explicitly.

---

### Task 1: Backend FX service module

**Files:**
- Create: `backend/app/fx_service.py`
- Test: `backend/tests/test_fx_service.py`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `get_usd_to_thb_rate() -> float | None`, `clear_cache() -> None`, module-level `CACHE_TTL_SECONDS: float` — Task 2's router imports `get_usd_to_thb_rate` by this exact name from `app.fx_service`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_fx_service.py`:

```python
import pytest

from app import fx_service


@pytest.fixture(autouse=True)
def _clear_cache():
    fx_service.clear_cache()
    yield
    fx_service.clear_cache()


def test_get_usd_to_thb_rate_returns_fetched_rate(monkeypatch):
    monkeypatch.setattr(fx_service, "_fetch_from_frankfurter", lambda: 36.5)

    rate = fx_service.get_usd_to_thb_rate()

    assert rate == 36.5


def test_get_usd_to_thb_rate_returns_none_when_fetch_fails(monkeypatch):
    monkeypatch.setattr(fx_service, "_fetch_from_frankfurter", lambda: None)

    rate = fx_service.get_usd_to_thb_rate()

    assert rate is None


def test_get_usd_to_thb_rate_caches_and_does_not_refetch_within_ttl(monkeypatch):
    call_count = {"n": 0}

    def fake_fetch():
        call_count["n"] += 1
        return 36.5

    monkeypatch.setattr(fx_service, "_fetch_from_frankfurter", fake_fetch)

    first = fx_service.get_usd_to_thb_rate()
    second = fx_service.get_usd_to_thb_rate()

    assert first == 36.5
    assert second == 36.5
    assert call_count["n"] == 1


def test_get_usd_to_thb_rate_refetches_after_ttl_expires(monkeypatch):
    monkeypatch.setattr(fx_service, "_fetch_from_frankfurter", lambda: 36.5)

    fake_time = {"t": 1000.0}
    monkeypatch.setattr(fx_service.time, "monotonic", lambda: fake_time["t"])

    fx_service.get_usd_to_thb_rate()

    fake_time["t"] += fx_service.CACHE_TTL_SECONDS + 1

    call_count = {"n": 0}

    def fake_fetch_second():
        call_count["n"] += 1
        return 37.0

    monkeypatch.setattr(fx_service, "_fetch_from_frankfurter", fake_fetch_second)

    rate = fx_service.get_usd_to_thb_rate()

    assert rate == 37.0
    assert call_count["n"] == 1


def test_a_failed_fetch_is_not_cached(monkeypatch):
    monkeypatch.setattr(fx_service, "_fetch_from_frankfurter", lambda: None)

    fx_service.get_usd_to_thb_rate()

    call_count = {"n": 0}

    def fake_fetch():
        call_count["n"] += 1
        return 36.0

    monkeypatch.setattr(fx_service, "_fetch_from_frankfurter", fake_fetch)

    rate = fx_service.get_usd_to_thb_rate()

    assert rate == 36.0
    assert call_count["n"] == 1
```

- [ ] **Step 2: Run tests to verify they fail**

From `portfolio-tracker/backend`, run: `.venv/Scripts/python.exe -m pytest tests/test_fx_service.py -v`
Expected: FAIL/ERROR — `ModuleNotFoundError: No module named 'app.fx_service'`

- [ ] **Step 3: Write the implementation**

Create `backend/app/fx_service.py`:

```python
import time

CACHE_TTL_SECONDS = 86400.0

_cached_rate: tuple[float, float] | None = None


def clear_cache() -> None:
    global _cached_rate
    _cached_rate = None


def _get_cached_rate() -> float | None:
    if _cached_rate is None:
        return None
    rate, fetched_at = _cached_rate
    if time.monotonic() - fetched_at > CACHE_TTL_SECONDS:
        return None
    return rate


def _set_cached_rate(rate: float) -> None:
    global _cached_rate
    _cached_rate = (rate, time.monotonic())


def _fetch_from_frankfurter() -> float | None:
    import httpx

    try:
        response = httpx.get(
            "https://api.frankfurter.app/latest",
            params={"from": "USD", "to": "THB"},
            timeout=5.0,
        )
        response.raise_for_status()
        rate = response.json().get("rates", {}).get("THB")
        return float(rate) if rate is not None else None
    except Exception:
        return None


def get_usd_to_thb_rate() -> float | None:
    cached = _get_cached_rate()
    if cached is not None:
        return cached

    rate = _fetch_from_frankfurter()
    if rate is not None:
        _set_cached_rate(rate)

    return rate
```

Note: `httpx` is already a dependency (used by `price_service._fetch_from_twelvedata`), no new package to install.

- [ ] **Step 4: Run tests to verify they pass**

From `portfolio-tracker/backend`, run: `.venv/Scripts/python.exe -m pytest tests/test_fx_service.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/fx_service.py backend/tests/test_fx_service.py
git commit -m "feat: add USD-to-THB FX rate service backed by Frankfurter"
```

---

### Task 2: Backend FX router endpoint

**Files:**
- Create: `backend/app/routers/fx.py`
- Modify: `backend/app/main.py:7` (import list) and `backend/app/main.py:25-28` (router registration)
- Test: `backend/tests/test_fx_router.py`

**Interfaces:**
- Consumes: `app.fx_service.get_usd_to_thb_rate` (Task 1).
- Produces: `GET /fx/usd-thb` → `{"usd_thb_rate": float | None}`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_fx_router.py`:

```python
from unittest.mock import patch


def test_get_usd_thb_rate_returns_fetched_rate(client):
    with patch("app.routers.fx.get_usd_to_thb_rate", return_value=36.5) as mock_get_rate:
        response = client.get("/fx/usd-thb")

    assert response.status_code == 200
    assert response.json() == {"usd_thb_rate": 36.5}
    mock_get_rate.assert_called_once_with()


def test_get_usd_thb_rate_returns_null_when_unavailable(client):
    with patch("app.routers.fx.get_usd_to_thb_rate", return_value=None):
        response = client.get("/fx/usd-thb")

    assert response.status_code == 200
    assert response.json() == {"usd_thb_rate": None}
```

This uses the `client` fixture already defined in `backend/tests/conftest.py` — no new fixture needed.

- [ ] **Step 2: Run tests to verify they fail**

From `portfolio-tracker/backend`, run: `.venv/Scripts/python.exe -m pytest tests/test_fx_router.py -v`
Expected: FAIL — `404 Not Found` (route doesn't exist yet) or `ModuleNotFoundError: No module named 'app.routers.fx'`

- [ ] **Step 3: Write the implementation**

Create `backend/app/routers/fx.py`:

```python
from fastapi import APIRouter

from app.fx_service import get_usd_to_thb_rate

router = APIRouter(prefix="/fx", tags=["fx"])


@router.get("/usd-thb")
def read_usd_thb_rate():
    return {"usd_thb_rate": get_usd_to_thb_rate()}
```

Modify `backend/app/main.py` line 7 from:

```python
from app.routers import holdings, portfolios, prices, watchlist
```

to:

```python
from app.routers import fx, holdings, portfolios, prices, watchlist
```

Modify `backend/app/main.py` lines 25-28 from:

```python
app.include_router(portfolios.router)
app.include_router(holdings.router)
app.include_router(watchlist.router)
app.include_router(prices.router)
```

to:

```python
app.include_router(portfolios.router)
app.include_router(holdings.router)
app.include_router(watchlist.router)
app.include_router(prices.router)
app.include_router(fx.router)
```

- [ ] **Step 4: Run tests to verify they pass**

From `portfolio-tracker/backend`, run: `.venv/Scripts/python.exe -m pytest tests/test_fx_router.py -v`
Expected: 2 passed

Also run the full backend suite to confirm nothing else broke: `.venv/Scripts/python.exe -m pytest -v`
Expected: all passed (existing count plus the 5 from Task 1 and 2 from this task)

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/fx.py backend/app/main.py backend/tests/test_fx_router.py
git commit -m "feat: expose GET /fx/usd-thb endpoint"
```

---

### Task 3: Rewrite theme.css tokens and wire up the import

**Files:**
- Modify: `frontend/src/styles/theme.css` (full rewrite)
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by later tasks (Task 4's nav bar has no styling dependency on this task — it uses plain unstyled `<button>`/`<nav>` elements, matching how every other component in this codebase is currently unstyled).

**No red-green test cycle for this task.** `theme.css` is pure CSS with no logic to assert against, and this project has zero CSS unit tests anywhere (confirmed: no component `.tsx` file references a `var(--...)` CSS custom property today — components are currently plain unstyled elements). Verification here is: the build succeeds (catches a broken import path) and the existing test suite still passes (catches nothing behavior-relevant changing). Visual correctness is checked by hand in the browser preview, per this project's established convention.

- [ ] **Step 1: Rewrite the theme file**

Replace the full contents of `frontend/src/styles/theme.css` with:

```css
/* frontend/src/styles/theme.css */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;600;700;800&display=swap');

:root {
  --bg: #0b0f19;
  --panel: rgba(20, 26, 42, 0.85);
  --panel2: rgba(30, 38, 60, 0.95);
  --panel3: rgba(15, 23, 42, 0.8);
  --border: rgba(255, 255, 255, 0.08);
  --primary: #38bdf8;
  --primary-glow: rgba(56, 189, 248, 0.25);
  --accent-purple: #8b5cf6;
  --green: #10b981;
  --yellow: #f59e0b;
  --red: #ef4444;
  --text: #f8fafc;
  --muted: #94a3b8;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background-color: var(--bg);
  background-image:
    radial-gradient(circle at 15% 15%, rgba(56, 189, 248, 0.08) 0%, transparent 40%),
    radial-gradient(circle at 85% 85%, rgba(139, 92, 246, 0.08) 0%, transparent 40%);
  color: var(--text);
  font: 14px/1.6 'Inter', -apple-system, "Segoe UI", Roboto, sans-serif;
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

This keeps the same selector set as before (`:root`, `*`, `body`, `button`, `input`) and the same custom-property names that existed before (`--bg`, `--panel`, `--panel2`, `--panel3`, `--border`, `--green`, `--yellow`, `--red`, `--text`, `--muted`) — only their values change, plus new tokens are added (`--primary`, `--primary-glow`, `--accent-purple`) for future Tools components to use. `--gold`/`--gold-dim` are removed since ADR 0001 supersedes the gold theme entirely.

- [ ] **Step 2: Import the theme file**

Modify `frontend/src/main.tsx` from:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const rootElement = document.getElementById('root');
```

to:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/theme.css';

const rootElement = document.getElementById('root');
```

- [ ] **Step 3: Verify the build succeeds**

From `portfolio-tracker/frontend`, run: `npm run build`
Expected: build succeeds with no errors (this is the check that catches a broken CSS import path — Vite fails the build if `./styles/theme.css` doesn't resolve)

- [ ] **Step 4: Verify the existing test suite still passes**

From `portfolio-tracker/frontend`, run: `npm test`
Expected: all existing tests pass unchanged (styling has no effect on Testing Library's DOM queries)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles/theme.css frontend/src/main.tsx
git commit -m "feat: apply stockvision-app color/typography theme (ADR 0001)"
```

---

### Task 4: Top nav bar with Portfolios/Tools tabs

**Files:**
- Create: `frontend/src/pages/ToolsPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `PortfoliosPage` (existing, from `./pages/PortfoliosPage`), `ToolsPage` (new, produced by Step 3 below — export name `ToolsPage`, no props).
- Produces: nothing consumed by later tasks — the real Tools features (a separate follow-up plan) will replace the body of `ToolsPage`, not its export signature, so they aren't blocked on anything else here.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `frontend/src/App.test.tsx` with:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from './api/client';
import { App } from './App';

describe('App', () => {
  beforeEach(() => {
    vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue({
      id: 1,
      name: '',
      cash_usd: 0,
      target_allocation_pct: null,
      holdings_value: 0,
      total_value: 0,
      unrealized_pnl: 0,
      realized_pnl: 0,
      holdings: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the app title and the portfolios page by default', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Portfolio Tracker' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/no portfolios yet/i)).toBeInTheDocument());
  });

  it('switches to the Tools tab and back without losing the Portfolios tab content', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);

    render(<App />);
    await waitFor(() => expect(screen.getByText(/no portfolios yet/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Tools' }));

    expect(screen.getByRole('heading', { name: 'Tools' })).toBeInTheDocument();
    expect(screen.queryByText(/no portfolios yet/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Portfolios' }));

    expect(screen.getByText(/no portfolios yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tools' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify the new test fails**

From `portfolio-tracker/frontend`, run: `npm test -- src/App.test.tsx`
Expected: first test PASSES (unchanged behavior), second test FAILS — no button named "Tools" exists yet

- [ ] **Step 3: Create the Tools placeholder page**

Create `frontend/src/pages/ToolsPage.tsx`:

```tsx
export function ToolsPage() {
  return (
    <div>
      <h2>Tools</h2>
      <p>Coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 4: Add the nav bar to App.tsx**

Replace the full contents of `frontend/src/App.tsx` with:

```tsx
import { useState } from 'react';
import { PortfoliosPage } from './pages/PortfoliosPage';
import { ToolsPage } from './pages/ToolsPage';

type Tab = 'portfolios' | 'tools';

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('portfolios');

  return (
    <div>
      <h1>Portfolio Tracker</h1>
      <nav>
        <button type="button" aria-pressed={activeTab === 'portfolios'} onClick={() => setActiveTab('portfolios')}>
          Portfolios
        </button>
        <button type="button" aria-pressed={activeTab === 'tools'} onClick={() => setActiveTab('tools')}>
          Tools
        </button>
      </nav>
      {activeTab === 'portfolios' && <PortfoliosPage />}
      {activeTab === 'tools' && <ToolsPage />}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

From `portfolio-tracker/frontend`, run: `npm test -- src/App.test.tsx`
Expected: 2 passed

Also run the full frontend suite to confirm nothing else broke: `npm test`
Expected: all passed

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ToolsPage.tsx frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat: add top nav bar with Portfolios/Tools tabs"
```

---

## Self-Review

**Spec coverage** (against `docs/specs/2026-07-24-stockvision-tools-merge.md`'s "Theme", "Navigation", and "Backend: USD→THB FX rate" Implementation Decisions sections):
- Theme tokens rewritten to stockvision-app palette, actually imported → Task 3. ✅
- Rebalance severity colors kept semantic, re-shaded → Task 3 (`--green`/`--yellow`/`--red` retained, new values). ✅
- Nav bar with Portfolios/Tools, no Dashboard stub → Task 4. ✅
- `fx_service.py` with Frankfurter, no API key, 24h cache → Task 1. ✅
- `GET /fx/usd-thb` endpoint modeled on `routers/prices.py` → Task 2. ✅
- Explicitly NOT building: market-data endpoint, the four Tools features → stated in Global Constraints, `ToolsPage` is a placeholder only. ✅

**Placeholder scan:** No TBD/TODO/"add error handling"-style steps — every step has full code. The one deliberate deviation (Task 3 has no red-green cycle) is explicitly justified, not a placeholder.

**Type consistency:** `get_usd_to_thb_rate` (Task 1) is imported by that exact name in Task 2's router. `ToolsPage` (Task 4 Step 3) is imported by that exact name in Task 4 Step 4's `App.tsx`. `CACHE_TTL_SECONDS` name matches the existing `price_service.py` convention for consistency, though its value (86400.0) differs intentionally (24h vs 60s) per the spec.
