# Portfolio Builder and ETF Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the last two of the four Tools features from `docs/specs/2026-07-24-stockvision-tools-merge.md` — Portfolio Builder and ETF Comparison — and wire them into the Tools tab as two more sub-tabs alongside the already-shipped DCA Projection and Passive Income.

**Architecture:** Frontend-only plan. Portfolio Builder: an originally-authored preset dataset (`utils/portfolioBuilderPresets.ts`), a pure allocation-splitting function (`utils/portfolioBuilder.ts`) that converts a THB capital amount into per-ticker share counts using a live FX rate and live prices, and a wizard component that previews the allocation then creates a real Portfolio + Holdings via the existing API. ETF Comparison: a simple two-ticker price side-by-side using the existing `GET /prices` endpoint (via a new thin client wrapper). Both are wired into `ToolsPage.tsx` as two more sub-tabs.

**Tech Stack:** React 19 + TypeScript 5.7 (strict) + Vite 6 frontend, Vitest 3 + Testing Library (frontend tests). No backend changes — this plan only adds frontend consumers of already-shipped, already-tested backend endpoints (`GET /prices`, `GET /fx/usd-thb`).

## Global Constraints

- Zero `any` / `@ts-ignore` / `@ts-expect-error` in any TypeScript file.
- Tests never touch real network — mock at the `api/client` function boundary (`vi.spyOn(client, 'getPrices')`, etc.), matching every prior plan's convention in this project.
- Portfolio Builder's preset names, descriptions, and bucket compositions must be **originally written**, not reused from the `stockvision-app` draft, per [ADR 0003](../../adr/0003-original-content-for-ported-features.md) — `stockvision-app`'s `bundle.js` self-describes as "exact replication" of a third-party site's presets. Public facts (ticker symbols) may be used freely; curated selection and description wording must be original. The three presets defined in this plan (Task 2) are original work product of this plan, not ported from the draft.
- Portfolio Builder is the **first real consumer** of the FX service (`GET /fx/usd-thb`, built in `docs/superpowers/plans/2026-07-24-fx-service-and-theme-nav.md` but never consumed until now, and explicitly *not* consumed by the DCA Projection / Passive Income plan since those two only need currency-invariant percentages). Portfolio Builder needs an actual currency conversion: capital is entered in THB (matching the established THB-native convention for planning tools per [ADR 0002](../../adr/0002-thb-native-planning-calculators.md)), converted to USD via the live FX rate to compute each holding's share count and `avg_cost_usd` (stored in USD, matching the existing `Holding` schema).
- Never fabricate a value: if a ticker's price can't be fetched, that ticker is silently skipped from the allocation preview (not shown with a guessed price). If the USD/THB rate can't be fetched at all, the whole preview is blocked with a visible error instead of guessing a rate. This matches the "fail to None/blank, never fabricate" convention already established in `DcaProjectionCalculator`/`PassiveIncomeCalculator`.
- ETF Comparison v1 is **price-only** — no P/E, dividend yield, beta, or other fundamentals. Those are explicitly out of scope for v1 per the merge spec's "Out of Scope" section and tracked as a follow-up ticket in `PRD.md` §12. `getPrices` (this plan's Task 1) is used, not `getMarketData`.
- This plan does not modify the backend. `GET /prices` (`backend/app/routers/prices.py`), `GET /fx/usd-thb` (`backend/app/routers/fx.py`), and `POST /portfolios` / `POST /portfolios/{id}/holdings` all already exist, are already tested, and are already merged to master.

---

### Task 1: Frontend — `getPrices` and `getUsdToThbRate` API client functions

**Files:**
- Modify: `frontend/src/api/client.ts`
- Test: `frontend/src/api/client.test.ts` (append)

**Interfaces:**
- Consumes: nothing from other tasks in this plan; the backend contracts (`GET /prices`, `GET /fx/usd-thb`) already exist and are already merged.
- Produces: `getPrices(tickers: string[]): Promise<Record<string, number>>` and `getUsdToThbRate(): Promise<number | null>`, both exported from `api/client.ts` — Task 3 imports `getUsdToThbRate`, Task 4 and Task 5 import `getPrices`, all by these exact names.

- [ ] **Step 1: Write the failing tests**

Read `frontend/src/api/client.test.ts` first (it already exists) to confirm the exact `mockFetchOnce`/`vi.stubGlobal` conventions, then append these two tests inside the existing `describe('api client', ...)` block, right after the `getMarketData` test:

```ts
  it('getPrices fetches from /prices with a comma-joined tickers param and returns the prices map', async () => {
    const mockResponse = { prices: { VTI: 210, SPY: 150 } };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      }),
    );

    const result = await getPrices(['VTI', 'SPY']);

    expect(result).toEqual(mockResponse.prices);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/prices?tickers=VTI%2CSPY'),
      expect.anything(),
    );
  });

  it('getUsdToThbRate fetches from /fx/usd-thb and returns the rate', async () => {
    const mockResponse = { usd_thb_rate: 35.2 };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      }),
    );

    const result = await getUsdToThbRate();

    expect(result).toBe(35.2);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/fx/usd-thb'), expect.anything());
  });
```

Add `getPrices` and `getUsdToThbRate` to the existing `import { ... } from './client'` block at the top of the file (alongside `getMarketData`).

- [ ] **Step 2: Run tests to verify they fail**

From `portfolio-tracker/frontend`, run: `npm test -- src/api/client.test.ts`
Expected: FAIL — `getPrices`/`getUsdToThbRate` are not exported / not functions

- [ ] **Step 3: Write the implementation**

Add to `frontend/src/api/client.ts`, after the existing `getMarketData` function:

```ts
export function getPrices(tickers: string[]): Promise<Record<string, number>> {
  const query = tickers.join(',');
  return request<{ prices: Record<string, number> }>(`/prices?tickers=${encodeURIComponent(query)}`).then(
    (res) => res.prices,
  );
}

export function getUsdToThbRate(): Promise<number | null> {
  return request<{ usd_thb_rate: number | null }>('/fx/usd-thb').then((res) => res.usd_thb_rate);
}
```

- [ ] **Step 4: Run tests to verify they pass**

From `portfolio-tracker/frontend`, run: `npm test -- src/api/client.test.ts`
Expected: all tests in the file pass (existing + 2 new)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/api/client.test.ts
git commit -m "feat: add getPrices and getUsdToThbRate API client functions"
```

---

### Task 2: Frontend — `utils/portfolioBuilderPresets.ts`

**Files:**
- Create: `frontend/src/utils/portfolioBuilderPresets.ts`
- Test: `frontend/src/utils/portfolioBuilderPresets.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `PortfolioBuilderBucket`, `PortfolioBuilderPreset`, `PORTFOLIO_BUILDER_PRESETS: PortfolioBuilderPreset[]` — Task 3 imports `PortfolioBuilderPreset` (type only), Task 4 imports `PORTFOLIO_BUILDER_PRESETS`, both by these exact names from `../utils/portfolioBuilderPresets`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/portfolioBuilderPresets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PORTFOLIO_BUILDER_PRESETS } from './portfolioBuilderPresets';

describe('PORTFOLIO_BUILDER_PRESETS', () => {
  it('defines at least one preset', () => {
    expect(PORTFOLIO_BUILDER_PRESETS.length).toBeGreaterThan(0);
  });

  it('each preset has a non-empty name, description, and buckets that allocate exactly 100%', () => {
    for (const preset of PORTFOLIO_BUILDER_PRESETS) {
      expect(preset.name.trim().length).toBeGreaterThan(0);
      expect(preset.description.trim().length).toBeGreaterThan(0);
      expect(preset.buckets.length).toBeGreaterThan(0);

      const total = preset.buckets.reduce((sum, bucket) => sum + bucket.targetAllocationPct, 0);
      expect(total).toBeCloseTo(100, 5);

      for (const bucket of preset.buckets) {
        expect(bucket.tickers.length).toBeGreaterThan(0);
      }
    }
  });

  it('every preset has a unique id', () => {
    const ids = PORTFOLIO_BUILDER_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

From `portfolio-tracker/frontend`, run: `npm test -- src/utils/portfolioBuilderPresets.test.ts`
Expected: FAIL — cannot find module `./portfolioBuilderPresets`

- [ ] **Step 3: Write the implementation**

Create `frontend/src/utils/portfolioBuilderPresets.ts`. This content is original — written for this plan, not copied from `stockvision-app` (see Global Constraints):

```ts
export interface PortfolioBuilderBucket {
  label: string;
  targetAllocationPct: number;
  tickers: string[];
}

export interface PortfolioBuilderPreset {
  id: string;
  name: string;
  description: string;
  buckets: PortfolioBuilderBucket[];
}

export const PORTFOLIO_BUILDER_PRESETS: PortfolioBuilderPreset[] = [
  {
    id: 'beginner',
    name: 'Beginner — Simple Starter',
    description:
      'A simple two-fund starting point: mostly broad US market exposure with a bond cushion to smooth out volatility. Good for a first portfolio you do not want to fuss over.',
    buckets: [
      { label: 'Total US Market', targetAllocationPct: 70, tickers: ['VTI', 'SPY'] },
      { label: 'Bonds', targetAllocationPct: 30, tickers: ['BND'] },
    ],
  },
  {
    id: 'conservative',
    name: 'Conservative — Capital Preservation',
    description:
      'Bond-heavy for stability, with modest US and international equity exposure for some growth. Suited to a lower risk tolerance or a shorter time horizon.',
    buckets: [
      { label: 'Bonds', targetAllocationPct: 50, tickers: ['BND'] },
      { label: 'Total US Market', targetAllocationPct: 30, tickers: ['VTI', 'SPY'] },
      { label: 'International', targetAllocationPct: 20, tickers: ['VXUS'] },
    ],
  },
  {
    id: 'growth',
    name: 'Growth — Long-Term Aggressive',
    description:
      'Tilted toward growth and technology exposure alongside broad US market coverage. Suited to a higher risk tolerance and a long investment horizon.',
    buckets: [
      { label: 'US Growth', targetAllocationPct: 50, tickers: ['QQQ', 'VUG'] },
      { label: 'Total US Market', targetAllocationPct: 50, tickers: ['VTI', 'SPY'] },
    ],
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

From `portfolio-tracker/frontend`, run: `npm test -- src/utils/portfolioBuilderPresets.test.ts`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/portfolioBuilderPresets.ts frontend/src/utils/portfolioBuilderPresets.test.ts
git commit -m "feat: add original Portfolio Builder preset data"
```

---

### Task 3: Frontend — `utils/portfolioBuilder.ts`

**Files:**
- Create: `frontend/src/utils/portfolioBuilder.ts`
- Test: `frontend/src/utils/portfolioBuilder.test.ts`

**Interfaces:**
- Consumes: `PortfolioBuilderPreset` (type only) from `../utils/portfolioBuilderPresets` (Task 2, exact name).
- Produces: `PortfolioBuilderLine`, `PortfolioBuilderPlanInput`, `buildPortfolioPlan(input: PortfolioBuilderPlanInput): PortfolioBuilderLine[]` — Task 4 imports `buildPortfolioPlan` and `PortfolioBuilderLine` by these exact names from `../utils/portfolioBuilder`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/portfolioBuilder.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildPortfolioPlan } from './portfolioBuilder';
import type { PortfolioBuilderPreset } from './portfolioBuilderPresets';

const preset: PortfolioBuilderPreset = {
  id: 'test-preset',
  name: 'Test Preset',
  description: 'test',
  buckets: [
    { label: 'Bucket A', targetAllocationPct: 60, tickers: ['AAA', 'BBB'] },
    { label: 'Bucket B', targetAllocationPct: 40, tickers: ['CCC'] },
  ],
};

describe('buildPortfolioPlan', () => {
  it('splits each bucket allocation evenly across its candidate tickers', () => {
    const lines = buildPortfolioPlan({
      preset,
      capitalThb: 100000,
      usdThbRate: 30,
      pricesUsd: { AAA: 100, BBB: 200, CCC: 50 },
    });

    expect(lines).toHaveLength(3);
    const aaa = lines.find((l) => l.ticker === 'AAA');
    expect(aaa).toBeDefined();
    expect(aaa!.capitalThb).toBeCloseTo(30000, 5);
    expect(aaa!.capitalUsd).toBeCloseTo(1000, 5);
    expect(aaa!.shares).toBeCloseTo(10, 5);
  });

  it('skips a ticker whose price is unavailable instead of fabricating a share count', () => {
    const lines = buildPortfolioPlan({
      preset,
      capitalThb: 100000,
      usdThbRate: 30,
      pricesUsd: { AAA: 100, CCC: 50 },
    });

    expect(lines.find((l) => l.ticker === 'BBB')).toBeUndefined();
    expect(lines).toHaveLength(2);
  });

  it('returns an empty array when the USD/THB rate is zero or negative', () => {
    const lines = buildPortfolioPlan({
      preset,
      capitalThb: 100000,
      usdThbRate: 0,
      pricesUsd: { AAA: 100, BBB: 200, CCC: 50 },
    });

    expect(lines).toEqual([]);
  });

  it('returns an empty array for zero capital', () => {
    const lines = buildPortfolioPlan({
      preset,
      capitalThb: 0,
      usdThbRate: 30,
      pricesUsd: { AAA: 100, BBB: 200, CCC: 50 },
    });

    expect(lines).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

From `portfolio-tracker/frontend`, run: `npm test -- src/utils/portfolioBuilder.test.ts`
Expected: FAIL — cannot find module `./portfolioBuilder`

- [ ] **Step 3: Write the implementation**

Create `frontend/src/utils/portfolioBuilder.ts`:

```ts
import type { PortfolioBuilderPreset } from './portfolioBuilderPresets';

export interface PortfolioBuilderLine {
  ticker: string;
  bucketLabel: string;
  capitalThb: number;
  capitalUsd: number;
  priceUsd: number;
  shares: number;
}

export interface PortfolioBuilderPlanInput {
  preset: PortfolioBuilderPreset;
  capitalThb: number;
  usdThbRate: number;
  pricesUsd: Record<string, number>;
}

export function buildPortfolioPlan(input: PortfolioBuilderPlanInput): PortfolioBuilderLine[] {
  const { preset, capitalThb, usdThbRate, pricesUsd } = input;

  if (capitalThb <= 0 || usdThbRate <= 0) {
    return [];
  }

  const lines: PortfolioBuilderLine[] = [];

  for (const bucket of preset.buckets) {
    const bucketCapitalThb = capitalThb * (bucket.targetAllocationPct / 100);
    const perTickerCapitalThb = bucketCapitalThb / bucket.tickers.length;

    for (const ticker of bucket.tickers) {
      const priceUsd = pricesUsd[ticker];
      if (priceUsd === undefined || priceUsd <= 0) {
        continue;
      }
      const capitalUsd = perTickerCapitalThb / usdThbRate;
      const shares = capitalUsd / priceUsd;
      lines.push({ ticker, bucketLabel: bucket.label, capitalThb: perTickerCapitalThb, capitalUsd, priceUsd, shares });
    }
  }

  return lines;
}
```

- [ ] **Step 4: Run test to verify it passes**

From `portfolio-tracker/frontend`, run: `npm test -- src/utils/portfolioBuilder.test.ts`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/portfolioBuilder.ts frontend/src/utils/portfolioBuilder.test.ts
git commit -m "feat: add buildPortfolioPlan (THB capital to per-ticker share split)"
```

---

### Task 4: Frontend — `PortfolioBuilderWizard` component

**Files:**
- Create: `frontend/src/components/PortfolioBuilderWizard.tsx`
- Test: `frontend/src/components/PortfolioBuilderWizard.test.tsx`

**Interfaces:**
- Consumes: `PORTFOLIO_BUILDER_PRESETS` from `../utils/portfolioBuilderPresets` (Task 2), `buildPortfolioPlan`/`PortfolioBuilderLine` from `../utils/portfolioBuilder` (Task 3), `getPrices`/`getUsdToThbRate` from `../api/client` (Task 1), `createPortfolio`/`createHolding` from `../api/client` (already existed before this plan).
- Produces: `PortfolioBuilderWizard` (no props) — Task 6 imports this exact name from `../components/PortfolioBuilderWizard`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/PortfolioBuilderWizard.test.tsx`. This test relies on the real, exported `PORTFOLIO_BUILDER_PRESETS[0]` (the "Beginner" preset: `Total US Market` 70% split across `VTI`/`SPY`, `Bonds` 30% on `BND`) — the numbers below (capital 105000 THB, rate 35, prices VTI=210/SPY=150/BND=90) are chosen so every resulting share count is a clean integer, for a readable assertion:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { PortfolioBuilderWizard } from './PortfolioBuilderWizard';

describe('PortfolioBuilderWizard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('previews an allocation and creates a portfolio with one holding per resulting ticker', async () => {
    vi.spyOn(client, 'getUsdToThbRate').mockResolvedValue(35);
    vi.spyOn(client, 'getPrices').mockResolvedValue({ VTI: 210, SPY: 150, BND: 90 });
    vi.spyOn(client, 'createPortfolio').mockResolvedValue({
      id: 1,
      name: 'Test Portfolio',
      cash_usd: 0,
      target_allocation_pct: null,
      created_at: '2026-01-01T00:00:00Z',
    });
    vi.spyOn(client, 'createHolding').mockResolvedValue({
      id: 1,
      portfolio_id: 1,
      ticker: 'VTI',
      shares: 5,
      avg_cost_usd: 210,
      target_allocation_pct: null,
      realized_pnl_usd: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    render(<PortfolioBuilderWizard />);

    fireEvent.change(screen.getByLabelText(/portfolio name/i), { target: { value: 'Test Portfolio' } });
    fireEvent.change(screen.getByLabelText(/capital/i), { target: { value: '105000' } });
    fireEvent.click(screen.getByRole('button', { name: /preview allocation/i }));

    await waitFor(() => expect(screen.getByText(/5.0000 shares/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /create portfolio/i }));

    await waitFor(() => expect(client.createPortfolio).toHaveBeenCalledWith({ name: 'Test Portfolio' }));
    expect(client.createHolding).toHaveBeenCalledTimes(3);
    expect(client.createHolding).toHaveBeenCalledWith(1, { ticker: 'VTI', shares: 5, avg_cost_usd: 210 });
    expect(client.createHolding).toHaveBeenCalledWith(1, { ticker: 'SPY', shares: 7, avg_cost_usd: 150 });
    expect(client.createHolding).toHaveBeenCalledWith(1, { ticker: 'BND', shares: 10, avg_cost_usd: 90 });
  });

  it('shows an error and does not create a portfolio when the USD/THB rate cannot be fetched', async () => {
    vi.spyOn(client, 'getUsdToThbRate').mockResolvedValue(null);
    vi.spyOn(client, 'getPrices').mockResolvedValue({ VTI: 210, SPY: 150, BND: 90 });
    const createPortfolioSpy = vi.spyOn(client, 'createPortfolio');

    render(<PortfolioBuilderWizard />);

    fireEvent.change(screen.getByLabelText(/portfolio name/i), { target: { value: 'Test Portfolio' } });
    fireEvent.change(screen.getByLabelText(/capital/i), { target: { value: '105000' } });
    fireEvent.click(screen.getByRole('button', { name: /preview allocation/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/usd\/thb rate/i));
    expect(screen.queryByRole('button', { name: /create portfolio/i })).not.toBeInTheDocument();
    expect(createPortfolioSpy).not.toHaveBeenCalled();
  });

  it('shows an error and does not fetch anything when capital is left at zero', async () => {
    const getPricesSpy = vi.spyOn(client, 'getPrices');
    const getUsdToThbRateSpy = vi.spyOn(client, 'getUsdToThbRate');

    render(<PortfolioBuilderWizard />);

    fireEvent.change(screen.getByLabelText(/portfolio name/i), { target: { value: 'Test Portfolio' } });
    fireEvent.click(screen.getByRole('button', { name: /preview allocation/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/capital amount/i);
    expect(getPricesSpy).not.toHaveBeenCalled();
    expect(getUsdToThbRateSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

From `portfolio-tracker/frontend`, run: `npm test -- src/components/PortfolioBuilderWizard.test.tsx`
Expected: FAIL — cannot find module `./PortfolioBuilderWizard`

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/PortfolioBuilderWizard.tsx`:

```tsx
import { useState } from 'react';
import { createHolding, createPortfolio, getPrices, getUsdToThbRate } from '../api/client';
import { buildPortfolioPlan, type PortfolioBuilderLine } from '../utils/portfolioBuilder';
import { PORTFOLIO_BUILDER_PRESETS } from '../utils/portfolioBuilderPresets';

export function PortfolioBuilderWizard() {
  const [presetId, setPresetId] = useState(PORTFOLIO_BUILDER_PRESETS[0].id);
  const [name, setName] = useState('');
  const [capitalThb, setCapitalThb] = useState('');
  const [lines, setLines] = useState<PortfolioBuilderLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);

  const preset = PORTFOLIO_BUILDER_PRESETS.find((p) => p.id === presetId) ?? PORTFOLIO_BUILDER_PRESETS[0];

  async function handlePreview() {
    setError(null);
    setLines(null);
    setCreated(false);

    const capital = Number(capitalThb) || 0;
    if (capital <= 0) {
      setError('Enter a capital amount greater than zero.');
      return;
    }

    const tickers = Array.from(new Set(preset.buckets.flatMap((b) => b.tickers)));

    try {
      const [usdThbRate, prices] = await Promise.all([getUsdToThbRate(), getPrices(tickers)]);
      if (usdThbRate == null) {
        setError('Could not fetch the current USD/THB rate — try again later.');
        return;
      }
      const plan = buildPortfolioPlan({ preset, capitalThb: capital, usdThbRate, pricesUsd: prices });
      if (plan.length === 0) {
        setError('Could not fetch prices for any ticker in this preset — try again later.');
        return;
      }
      setLines(plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCreate() {
    if (!lines || !name.trim()) {
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const portfolio = await createPortfolio({ name });
      for (const line of lines) {
        await createHolding(portfolio.id, { ticker: line.ticker, shares: line.shares, avg_cost_usd: line.priceUsd });
      }
      setCreated(true);
      setLines(null);
      setName('');
      setCapitalThb('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <h3>Portfolio Builder</h3>
      {error && <div role="alert">{error}</div>}
      {created && <div>Portfolio created.</div>}

      <fieldset>
        <legend>Goal</legend>
        {PORTFOLIO_BUILDER_PRESETS.map((p) => (
          <label key={p.id}>
            <input
              type="radio"
              name="portfolio-builder-preset"
              value={p.id}
              checked={presetId === p.id}
              onChange={() => {
                setPresetId(p.id);
                setLines(null);
              }}
            />
            {p.name}
          </label>
        ))}
      </fieldset>
      <p>{preset.description}</p>

      <label htmlFor="pb-name">Portfolio name</label>
      <input id="pb-name" value={name} onChange={(e) => setName(e.target.value)} />

      <label htmlFor="pb-capital">Capital (THB)</label>
      <input
        id="pb-capital"
        type="number"
        value={capitalThb}
        onChange={(e) => {
          setCapitalThb(e.target.value);
          setLines(null);
        }}
      />

      <button type="button" onClick={handlePreview}>
        Preview allocation
      </button>

      {lines && (
        <div>
          <table>
            <tbody>
              {lines.map((line) => (
                <tr key={line.ticker}>
                  <td>{line.ticker}</td>
                  <td>{line.bucketLabel}</td>
                  <td>{line.shares.toFixed(4)} shares</td>
                  <td>฿{line.capitalThb.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={handleCreate} disabled={creating || !name.trim()}>
            Create portfolio
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

From `portfolio-tracker/frontend`, run: `npm test -- src/components/PortfolioBuilderWizard.test.tsx`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PortfolioBuilderWizard.tsx frontend/src/components/PortfolioBuilderWizard.test.tsx
git commit -m "feat: add PortfolioBuilderWizard component"
```

---

### Task 5: Frontend — `EtfComparisonTool` component

**Files:**
- Create: `frontend/src/components/EtfComparisonTool.tsx`
- Test: `frontend/src/components/EtfComparisonTool.test.tsx`

**Interfaces:**
- Consumes: `getPrices` from `../api/client` (Task 1, exact name).
- Produces: `EtfComparisonTool` (no props) — Task 6 imports this exact name from `../components/EtfComparisonTool`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/EtfComparisonTool.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { EtfComparisonTool } from './EtfComparisonTool';

describe('EtfComparisonTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches and shows prices for two entered tickers side by side', async () => {
    vi.spyOn(client, 'getPrices').mockResolvedValue({ VTI: 210, SPY: 150 });

    render(<EtfComparisonTool />);
    fireEvent.change(screen.getByLabelText(/ticker a/i), { target: { value: 'VTI' } });
    fireEvent.change(screen.getByLabelText(/ticker b/i), { target: { value: 'SPY' } });
    fireEvent.click(screen.getByRole('button', { name: /compare/i }));

    await waitFor(() => expect(screen.getByText('$210.00')).toBeInTheDocument());
    expect(screen.getByText('$150.00')).toBeInTheDocument();
    expect(client.getPrices).toHaveBeenCalledWith(['VTI', 'SPY']);
  });

  it('shows "Price unavailable" for a ticker whose price could not be fetched, without fabricating one', async () => {
    vi.spyOn(client, 'getPrices').mockResolvedValue({ VTI: 210 });

    render(<EtfComparisonTool />);
    fireEvent.change(screen.getByLabelText(/ticker a/i), { target: { value: 'VTI' } });
    fireEvent.change(screen.getByLabelText(/ticker b/i), { target: { value: 'SPY' } });
    fireEvent.click(screen.getByRole('button', { name: /compare/i }));

    await waitFor(() => expect(screen.getByText('$210.00')).toBeInTheDocument());
    expect(screen.getByText('Price unavailable')).toBeInTheDocument();
  });

  it('shows an error and does not call getPrices when a ticker field is left blank', () => {
    const getPricesSpy = vi.spyOn(client, 'getPrices');

    render(<EtfComparisonTool />);
    fireEvent.change(screen.getByLabelText(/ticker a/i), { target: { value: 'VTI' } });
    fireEvent.click(screen.getByRole('button', { name: /compare/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/enter both tickers/i);
    expect(getPricesSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

From `portfolio-tracker/frontend`, run: `npm test -- src/components/EtfComparisonTool.test.tsx`
Expected: FAIL — cannot find module `./EtfComparisonTool`

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/EtfComparisonTool.tsx`:

```tsx
import { useState } from 'react';
import { getPrices } from '../api/client';

interface EtfComparisonResult {
  ticker: string;
  priceUsd: number | null;
}

export function EtfComparisonTool() {
  const [tickerA, setTickerA] = useState('');
  const [tickerB, setTickerB] = useState('');
  const [results, setResults] = useState<EtfComparisonResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCompare() {
    setError(null);
    setResults(null);
    const a = tickerA.trim().toUpperCase();
    const b = tickerB.trim().toUpperCase();
    if (!a || !b) {
      setError('Enter both tickers to compare.');
      return;
    }
    try {
      const prices = await getPrices([a, b]);
      setResults([
        { ticker: a, priceUsd: prices[a] ?? null },
        { ticker: b, priceUsd: prices[b] ?? null },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      <h3>ETF Comparison</h3>
      {error && <div role="alert">{error}</div>}

      <label htmlFor="etf-a">Ticker A</label>
      <input id="etf-a" value={tickerA} onChange={(e) => setTickerA(e.target.value)} />

      <label htmlFor="etf-b">Ticker B</label>
      <input id="etf-b" value={tickerB} onChange={(e) => setTickerB(e.target.value)} />

      <button type="button" onClick={handleCompare}>
        Compare
      </button>

      {results && (
        <table>
          <tbody>
            {results.map((r) => (
              <tr key={r.ticker}>
                <td>{r.ticker}</td>
                <td>{r.priceUsd !== null ? `$${r.priceUsd.toFixed(2)}` : 'Price unavailable'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

From `portfolio-tracker/frontend`, run: `npm test -- src/components/EtfComparisonTool.test.tsx`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/EtfComparisonTool.tsx frontend/src/components/EtfComparisonTool.test.tsx
git commit -m "feat: add EtfComparisonTool component"
```

---

### Task 6: Frontend — wire both into `ToolsPage`

**Files:**
- Modify: `frontend/src/pages/ToolsPage.tsx`
- Modify: `frontend/src/pages/ToolsPage.test.tsx`

**Interfaces:**
- Consumes: `PortfolioBuilderWizard` from `../components/PortfolioBuilderWizard` (Task 4), `EtfComparisonTool` from `../components/EtfComparisonTool` (Task 5).
- Produces: `ToolsPage` — export name and no-props signature unchanged, so `App.tsx` needs no changes. This completes all four Tools features from the merge spec; no further sub-tabs are planned.

- [ ] **Step 1: Write the failing test**

Read the existing `frontend/src/pages/ToolsPage.test.tsx` first, then replace its full contents with:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToolsPage } from './ToolsPage';

describe('ToolsPage', () => {
  it('shows DCA Projection by default and switches between all four sub-tabs', () => {
    render(<ToolsPage />);

    expect(screen.getByRole('heading', { name: 'DCA Projection' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Passive Income' }));
    expect(screen.getByRole('heading', { name: 'Passive Income' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'DCA Projection' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Portfolio Builder' }));
    expect(screen.getByRole('heading', { name: 'Portfolio Builder' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Passive Income' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ETF Comparison' }));
    expect(screen.getByRole('heading', { name: 'ETF Comparison' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Portfolio Builder' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

From `portfolio-tracker/frontend`, run: `npm test -- src/pages/ToolsPage.test.tsx`
Expected: FAIL — no button named "Portfolio Builder" / "ETF Comparison" (current `ToolsPage` only has the first two sub-tabs)

- [ ] **Step 3: Write the implementation**

Replace the full contents of `frontend/src/pages/ToolsPage.tsx` with:

```tsx
import { useState } from 'react';
import { DcaProjectionCalculator } from '../components/DcaProjectionCalculator';
import { EtfComparisonTool } from '../components/EtfComparisonTool';
import { PassiveIncomeCalculator } from '../components/PassiveIncomeCalculator';
import { PortfolioBuilderWizard } from '../components/PortfolioBuilderWizard';

type ToolsTab = 'dca-projection' | 'passive-income' | 'portfolio-builder' | 'etf-comparison';

export function ToolsPage() {
  const [activeTab, setActiveTab] = useState<ToolsTab>('dca-projection');

  return (
    <div>
      <h2>Tools</h2>
      <nav>
        <button
          type="button"
          aria-pressed={activeTab === 'dca-projection'}
          onClick={() => setActiveTab('dca-projection')}
        >
          DCA Projection
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'passive-income'}
          onClick={() => setActiveTab('passive-income')}
        >
          Passive Income
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'portfolio-builder'}
          onClick={() => setActiveTab('portfolio-builder')}
        >
          Portfolio Builder
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'etf-comparison'}
          onClick={() => setActiveTab('etf-comparison')}
        >
          ETF Comparison
        </button>
      </nav>
      {activeTab === 'dca-projection' && <DcaProjectionCalculator />}
      {activeTab === 'passive-income' && <PassiveIncomeCalculator />}
      {activeTab === 'portfolio-builder' && <PortfolioBuilderWizard />}
      {activeTab === 'etf-comparison' && <EtfComparisonTool />}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

From `portfolio-tracker/frontend`, run: `npm test -- src/pages/ToolsPage.test.tsx`
Expected: 1 passed

Also run the full frontend suite to confirm nothing else broke: `npm test`
Expected: all passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ToolsPage.tsx frontend/src/pages/ToolsPage.test.tsx
git commit -m "feat: wire Portfolio Builder and ETF Comparison into ToolsPage"
```

---

## Self-Review

**Spec coverage** (against `docs/specs/2026-07-24-stockvision-tools-merge.md`'s user stories 13-21 and the relevant Implementation Decisions):
- Portfolio Builder: goal-preset selector → capital input → allocation preview → real Portfolio+Holdings creation → Tasks 2, 3, 4. ✅
- Original preset content (not reused from draft) per ADR 0003 → Task 2. ✅
- Even split across multiple candidate tickers within a bucket (user story 16) → Task 3 (`buildPortfolioPlan`), tested directly with a two-ticker bucket. ✅
- THB capital input, real FX conversion to USD for share/avg-cost computation (user story 15, ADR 0002/first real FX consumer) → Task 3 + Task 4. ✅
- Existing simple "+ Add portfolio" form stays available alongside the wizard (user story 18) → not touched by this plan (`AddPortfolioForm.tsx`/`PortfoliosPage.tsx` are untouched). ✅
- ETF Comparison: two free-text tickers, real price via `getPrices`, no fundamentals in v1 (user stories 19-21) → Tasks 1, 5. ✅
- Never fabricate a value on fetch failure → Task 3 (skip ticker with no price, block on missing FX rate) and Task 5 (show "Price unavailable" per-ticker, never a guessed price). ✅

**Placeholder scan:** No TBD/TODO/"add error handling"-style steps — every step has full code.

**Type consistency:** `PortfolioBuilderPreset`/`PortfolioBuilderBucket` (Task 2) are imported by those exact names in Task 3 (type-only) and Task 4. `buildPortfolioPlan`/`PortfolioBuilderLine` (Task 3) are imported by those exact names in Task 4. `getPrices`/`getUsdToThbRate` (Task 1) are imported by those exact names in Tasks 4 and 5. `PortfolioBuilderWizard`/`EtfComparisonTool` (Tasks 4, 5) are imported by those exact names in Task 6. `ToolsPage`'s export signature (no props) is unchanged, so no changes are needed to `App.tsx` in this plan.
