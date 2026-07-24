# Holding Calculators (DCA + Stress-Test) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the DCA/average-cost calculator and the stress-test (scenario) calculator per PRD.md sections 7 and 10.2 — both are pure client-side math, no backend changes needed — and fix the 3 minor findings noted in the frontend-live-pricing plan's final review.

**Architecture:** Two pure calculation modules (`utils/dca.ts`, `utils/stressTest.ts`) with zero React/DOM dependency, unit-tested directly. Two small presentational components (`DcaCalculator`, `StressTestCalculator`) wrap them with a form + results display. Both are composed into a per-holding expandable panel inside `HoldingRow` (a new "Calculate" toggle, mirroring the existing portfolio-level "Show holdings" expand pattern already established in `PortfolioCard`).

**Tech Stack:** Same as prior frontend plans — React 19, TypeScript 5.7 (strict, zero `any`), Vite 6, Vitest 3 + Testing Library.

This is Plan 6 of the portfolio-tracker build (Plans 1-5 merged to `master`). This plan implements PRD.md section 7 (scenario/stress-test calculator) and the DCA calculator referenced throughout PRD.md sections 9-10 and the original wethaiinvest-inspired prototype — both explicitly called out as pure client-side, no-new-backend-work items in prior plans' "What this plan does NOT cover" sections.

## Global Constraints

- Zero `any`/`@ts-ignore`/`@ts-expect-error` anywhere.
- Test output must be pristine — no warnings.
- Calculators are pure functions with no side effects, no API calls — fully unit-testable without mocking `fetch`.
- DCA calculator matches PRD.md's confirmed behavior: given additional investment (USD) and the ticker's current price, compute new average cost and new total shares (per the original wethaiinvest-inspired form: "คำนวณค่าเฉลี่ยล่วงหน้า").
- Stress-test calculator matches PRD.md section 7: fixed -5%/-10%/-20% price-drop scenarios plus a custom target price, computed from an investment amount and the current price.
- A holding with no `stats` (i.e. no current price available — see the frontend-live-pricing plan's graceful-degradation handling) cannot run either calculator; both calculator toggles must be absent/disabled in that case, not crash on a missing price.

---

## File Structure

```
portfolio-tracker/frontend/src/
  utils/
    dca.ts                    # CREATE: pure calculateDca()
    dca.test.ts                # CREATE
    stressTest.ts               # CREATE: pure calculateStressTest()
    stressTest.test.ts          # CREATE
  components/
    DcaCalculator.tsx            # CREATE
    DcaCalculator.test.tsx       # CREATE
    StressTestCalculator.tsx      # CREATE
    StressTestCalculator.test.tsx # CREATE
    HoldingRow.tsx                 # MODIFY: add "Calculate" expand toggle, render both calculators when stats present
    HoldingRow.test.tsx             # MODIFY: add expand/collapse + no-stats-means-no-toggle tests
    PortfolioCard.test.tsx           # MODIFY: rename the stale test, no behavior change
    PortfolioHoldings.tsx             # MODIFY: surface its own summary hook's error (Minor #4 from prior review)
    PortfolioHoldings.test.tsx        # MODIFY: add a test for that error surfacing
  App.test.tsx                        # MODIFY: add a defensive getPortfolioSummary mock (Minor #2 from prior review)
```

No backend changes in this plan.

---

### Task 1: `calculateDca` pure function

**Files:**
- Create: `frontend/src/utils/dca.ts`
- Test: `frontend/src/utils/dca.test.ts`

**Interfaces:**
- Produces: `calculateDca(input: DcaInput): DcaResult` where `DcaInput = { currentShares: number; currentAvgCostUsd: number; additionalInvestmentUsd: number; currentPriceUsd: number }` and `DcaResult = { newShares: number; newAvgCostUsd: number; newTotalCostUsd: number }` — Task 3's `DcaCalculator` component imports this by exact name and shape.

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/utils/dca.test.ts
import { describe, expect, it } from 'vitest';
import { calculateDca } from './dca';

describe('calculateDca', () => {
  it('computes new shares, average cost, and total cost after adding an investment', () => {
    const result = calculateDca({
      currentShares: 12,
      currentAvgCostUsd: 187.4,
      additionalInvestmentUsd: 1000,
      currentPriceUsd: 333.74,
    });

    const expectedNewShares = 12 + 1000 / 333.74;
    const expectedTotalCost = 12 * 187.4 + 1000;

    expect(result.newShares).toBeCloseTo(expectedNewShares, 6);
    expect(result.newTotalCostUsd).toBeCloseTo(expectedTotalCost, 6);
    expect(result.newAvgCostUsd).toBeCloseTo(expectedTotalCost / expectedNewShares, 6);
  });

  it('returns the unchanged position when additional investment is zero', () => {
    const result = calculateDca({
      currentShares: 10,
      currentAvgCostUsd: 100,
      additionalInvestmentUsd: 0,
      currentPriceUsd: 150,
    });

    expect(result.newShares).toBe(10);
    expect(result.newAvgCostUsd).toBe(100);
    expect(result.newTotalCostUsd).toBe(1000);
  });

  it('starting from zero shares, new average cost equals the current price', () => {
    const result = calculateDca({
      currentShares: 0,
      currentAvgCostUsd: 0,
      additionalInvestmentUsd: 500,
      currentPriceUsd: 50,
    });

    expect(result.newShares).toBe(10);
    expect(result.newAvgCostUsd).toBe(50);
    expect(result.newTotalCostUsd).toBe(500);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- dca.test`
Expected: FAIL — `./dca` module does not exist yet.

- [ ] **Step 3: Write `frontend/src/utils/dca.ts`**

```typescript
// frontend/src/utils/dca.ts
export interface DcaInput {
  currentShares: number;
  currentAvgCostUsd: number;
  additionalInvestmentUsd: number;
  currentPriceUsd: number;
}

export interface DcaResult {
  newShares: number;
  newAvgCostUsd: number;
  newTotalCostUsd: number;
}

export function calculateDca(input: DcaInput): DcaResult {
  const { currentShares, currentAvgCostUsd, additionalInvestmentUsd, currentPriceUsd } = input;

  const additionalShares = currentPriceUsd > 0 ? additionalInvestmentUsd / currentPriceUsd : 0;
  const newShares = currentShares + additionalShares;
  const newTotalCostUsd = currentShares * currentAvgCostUsd + additionalInvestmentUsd;
  const newAvgCostUsd = newShares > 0 ? newTotalCostUsd / newShares : 0;

  return { newShares, newAvgCostUsd, newTotalCostUsd };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- dca.test`
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/dca.ts frontend/src/utils/dca.test.ts
git commit -m "feat: add pure calculateDca function"
```

---

### Task 2: `calculateStressTest` pure function

**Files:**
- Create: `frontend/src/utils/stressTest.ts`
- Test: `frontend/src/utils/stressTest.test.ts`

**Interfaces:**
- Produces: `calculateStressTest(input: StressTestInput): StressTestScenario[]` where `StressTestInput = { investmentUsd: number; currentPriceUsd: number; customTargetPriceUsd?: number }` and `StressTestScenario = { label: string; targetPriceUsd: number; remainingValueUsd: number; moneyLostUsd: number }` — Task 4's `StressTestCalculator` component imports this by exact name and shape.

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/utils/stressTest.test.ts
import { describe, expect, it } from 'vitest';
import { calculateStressTest } from './stressTest';

describe('calculateStressTest', () => {
  it('computes the fixed -5%/-10%/-20% scenarios from an investment and current price', () => {
    const scenarios = calculateStressTest({ investmentUsd: 1000, currentPriceUsd: 100 });

    expect(scenarios).toHaveLength(3);

    const [down5, down10, down20] = scenarios;
    expect(down5.label).toBe('-5%');
    expect(down5.targetPriceUsd).toBeCloseTo(95, 6);
    expect(down5.remainingValueUsd).toBeCloseTo(950, 6);
    expect(down5.moneyLostUsd).toBeCloseTo(50, 6);

    expect(down10.label).toBe('-10%');
    expect(down10.targetPriceUsd).toBeCloseTo(90, 6);
    expect(down10.remainingValueUsd).toBeCloseTo(900, 6);
    expect(down10.moneyLostUsd).toBeCloseTo(100, 6);

    expect(down20.label).toBe('-20%');
    expect(down20.targetPriceUsd).toBeCloseTo(80, 6);
    expect(down20.remainingValueUsd).toBeCloseTo(800, 6);
    expect(down20.moneyLostUsd).toBeCloseTo(200, 6);
  });

  it('appends a custom-target-price scenario when provided', () => {
    const scenarios = calculateStressTest({ investmentUsd: 1000, currentPriceUsd: 100, customTargetPriceUsd: 70 });

    expect(scenarios).toHaveLength(4);
    const custom = scenarios[3];
    expect(custom.label).toBe('Custom');
    expect(custom.targetPriceUsd).toBe(70);
    expect(custom.remainingValueUsd).toBeCloseTo(700, 6);
    expect(custom.moneyLostUsd).toBeCloseTo(300, 6);
  });

  it('returns zeroed scenarios when investment is zero', () => {
    const scenarios = calculateStressTest({ investmentUsd: 0, currentPriceUsd: 100 });

    for (const scenario of scenarios) {
      expect(scenario.remainingValueUsd).toBe(0);
      expect(scenario.moneyLostUsd).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- stressTest.test`
Expected: FAIL — `./stressTest` module does not exist yet.

- [ ] **Step 3: Write `frontend/src/utils/stressTest.ts`**

```typescript
// frontend/src/utils/stressTest.ts
export interface StressTestInput {
  investmentUsd: number;
  currentPriceUsd: number;
  customTargetPriceUsd?: number;
}

export interface StressTestScenario {
  label: string;
  targetPriceUsd: number;
  remainingValueUsd: number;
  moneyLostUsd: number;
}

const FIXED_DROP_PCTS = [-5, -10, -20];

function buildScenario(label: string, targetPriceUsd: number, investmentUsd: number, currentPriceUsd: number): StressTestScenario {
  const shares = currentPriceUsd > 0 ? investmentUsd / currentPriceUsd : 0;
  const remainingValueUsd = shares * targetPriceUsd;
  const moneyLostUsd = investmentUsd - remainingValueUsd;
  return { label, targetPriceUsd, remainingValueUsd, moneyLostUsd };
}

export function calculateStressTest(input: StressTestInput): StressTestScenario[] {
  const { investmentUsd, currentPriceUsd, customTargetPriceUsd } = input;

  const scenarios = FIXED_DROP_PCTS.map((pct) => {
    const targetPriceUsd = currentPriceUsd * (1 + pct / 100);
    return buildScenario(`${pct}%`, targetPriceUsd, investmentUsd, currentPriceUsd);
  });

  if (customTargetPriceUsd !== undefined) {
    scenarios.push(buildScenario('Custom', customTargetPriceUsd, investmentUsd, currentPriceUsd));
  }

  return scenarios;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- stressTest.test`
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/stressTest.ts frontend/src/utils/stressTest.test.ts
git commit -m "feat: add pure calculateStressTest function"
```

---

### Task 3: `DcaCalculator` component

**Files:**
- Create: `frontend/src/components/DcaCalculator.tsx`
- Test: `frontend/src/components/DcaCalculator.test.tsx`

**Interfaces:**
- Consumes: `calculateDca` from `utils/dca` (Task 1).
- Produces: `DcaCalculator` component taking `{ currentShares: number; currentAvgCostUsd: number; currentPriceUsd: number }` — Task 5's `HoldingRow` renders this by exact name and props.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/components/DcaCalculator.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DcaCalculator } from './DcaCalculator';

describe('DcaCalculator', () => {
  it('shows updated new average cost, shares, and total cost after entering an investment amount', () => {
    render(<DcaCalculator currentShares={12} currentAvgCostUsd={187.4} currentPriceUsd={333.74} />);

    fireEvent.change(screen.getByLabelText(/add investment/i), { target: { value: '1000' } });

    const expectedNewShares = 12 + 1000 / 333.74;
    const expectedTotalCost = 12 * 187.4 + 1000;
    const expectedAvgCost = expectedTotalCost / expectedNewShares;

    expect(screen.getByText(new RegExp(expectedAvgCost.toFixed(2)))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(expectedNewShares.toFixed(2)))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(expectedTotalCost.toFixed(2)))).toBeInTheDocument();
  });

  it('shows the current position unchanged before any investment is entered', () => {
    render(<DcaCalculator currentShares={12} currentAvgCostUsd={187.4} currentPriceUsd={333.74} />);

    expect(screen.getByText(/187.40/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- DcaCalculator`
Expected: FAIL — `./DcaCalculator` module does not exist yet.

- [ ] **Step 3: Write `frontend/src/components/DcaCalculator.tsx`**

```tsx
// frontend/src/components/DcaCalculator.tsx
import { useState } from 'react';
import { calculateDca } from '../utils/dca';

interface DcaCalculatorProps {
  currentShares: number;
  currentAvgCostUsd: number;
  currentPriceUsd: number;
}

export function DcaCalculator({ currentShares, currentAvgCostUsd, currentPriceUsd }: DcaCalculatorProps) {
  const [investment, setInvestment] = useState('');

  const additionalInvestmentUsd = investment === '' ? 0 : Number(investment);
  const result = calculateDca({
    currentShares,
    currentAvgCostUsd,
    additionalInvestmentUsd,
    currentPriceUsd,
  });

  return (
    <div>
      <h4>DCA calculator</h4>
      <label htmlFor="dca-investment">Add investment (USD)</label>
      <input id="dca-investment" type="number" value={investment} onChange={(e) => setInvestment(e.target.value)} />
      <div>New average cost: ${result.newAvgCostUsd.toFixed(2)}</div>
      <div>New shares: {result.newShares.toFixed(2)}</div>
      <div>New total cost: ${result.newTotalCostUsd.toFixed(2)}</div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- DcaCalculator`
Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DcaCalculator.tsx frontend/src/components/DcaCalculator.test.tsx
git commit -m "feat: add DcaCalculator component"
```

---

### Task 4: `StressTestCalculator` component

**Files:**
- Create: `frontend/src/components/StressTestCalculator.tsx`
- Test: `frontend/src/components/StressTestCalculator.test.tsx`

**Interfaces:**
- Consumes: `calculateStressTest` from `utils/stressTest` (Task 2).
- Produces: `StressTestCalculator` component taking `{ currentPriceUsd: number }` — Task 5's `HoldingRow` renders this by exact name and props.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/components/StressTestCalculator.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StressTestCalculator } from './StressTestCalculator';

describe('StressTestCalculator', () => {
  it('shows the three fixed scenarios after entering an investment amount', () => {
    render(<StressTestCalculator currentPriceUsd={100} />);

    fireEvent.change(screen.getByLabelText(/investment amount/i), { target: { value: '1000' } });

    expect(screen.getByText('-5%')).toBeInTheDocument();
    expect(screen.getByText('-10%')).toBeInTheDocument();
    expect(screen.getByText('-20%')).toBeInTheDocument();
    expect(screen.getByText(/950.00/)).toBeInTheDocument();
    expect(screen.getByText(/900.00/)).toBeInTheDocument();
    expect(screen.getByText(/800.00/)).toBeInTheDocument();
  });

  it('adds a custom scenario when a target price is entered', () => {
    render(<StressTestCalculator currentPriceUsd={100} />);

    fireEvent.change(screen.getByLabelText(/investment amount/i), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText(/target price/i), { target: { value: '70' } });

    expect(screen.getByText('Custom')).toBeInTheDocument();
    expect(screen.getByText(/700.00/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- StressTestCalculator`
Expected: FAIL — `./StressTestCalculator` module does not exist yet.

- [ ] **Step 3: Write `frontend/src/components/StressTestCalculator.tsx`**

```tsx
// frontend/src/components/StressTestCalculator.tsx
import { useState } from 'react';
import { calculateStressTest } from '../utils/stressTest';

interface StressTestCalculatorProps {
  currentPriceUsd: number;
}

export function StressTestCalculator({ currentPriceUsd }: StressTestCalculatorProps) {
  const [investment, setInvestment] = useState('');
  const [targetPrice, setTargetPrice] = useState('');

  const investmentUsd = investment === '' ? 0 : Number(investment);
  const customTargetPriceUsd = targetPrice === '' ? undefined : Number(targetPrice);
  const scenarios = calculateStressTest({ investmentUsd, currentPriceUsd, customTargetPriceUsd });

  return (
    <div>
      <h4>Stress test</h4>
      <label htmlFor="stress-investment">Investment amount (USD)</label>
      <input id="stress-investment" type="number" value={investment} onChange={(e) => setInvestment(e.target.value)} />

      <label htmlFor="stress-target-price">Target price (USD, optional)</label>
      <input id="stress-target-price" type="number" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} />

      {scenarios.map((scenario) => (
        <div key={scenario.label}>
          <span>{scenario.label}</span>
          <span> (${scenario.targetPriceUsd.toFixed(2)})</span>
          <span> remaining: ${scenario.remainingValueUsd.toFixed(2)}</span>
          <span> lost: ${scenario.moneyLostUsd.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- StressTestCalculator`
Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/StressTestCalculator.tsx frontend/src/components/StressTestCalculator.test.tsx
git commit -m "feat: add StressTestCalculator component"
```

---

### Task 5: Wire both calculators into `HoldingRow` via a "Calculate" toggle

**Files:**
- Modify: `frontend/src/components/HoldingRow.tsx`
- Modify: `frontend/src/components/HoldingRow.test.tsx`

**Interfaces:**
- Consumes: `DcaCalculator` (Task 3), `StressTestCalculator` (Task 4).
- Produces: `HoldingRow`'s props gain no new required fields — the "Calculate" toggle only appears (and only renders the two calculators) when `stats` is present, since both calculators need `currentPriceUsd` from `stats.current_price`.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/components/HoldingRow.test.tsx (append)
const statsWithPrice = {
  ticker: 'AAPL',
  shares: 12,
  avg_cost_usd: 187.4,
  current_price: 333.74,
  value: 4004.88,
  current_pct: 41.1,
  target_pct: 20,
  deviation_pp: 21.1,
  severity: 'red' as const,
  unrealized_pnl: 1755.28,
  realized_pnl: 0,
};

it('shows a "Calculate" toggle when stats (and thus a current price) are available', () => {
  render(<HoldingRow holding={holding} onDelete={vi.fn()} stats={statsWithPrice} />);

  expect(screen.getByRole('button', { name: /calculate/i })).toBeInTheDocument();
});

it('does not show a "Calculate" toggle when stats are unavailable', () => {
  render(<HoldingRow holding={holding} onDelete={vi.fn()} />);

  expect(screen.queryByRole('button', { name: /calculate/i })).not.toBeInTheDocument();
});

it('clicking "Calculate" reveals both the DCA and stress-test calculators', () => {
  render(<HoldingRow holding={holding} onDelete={vi.fn()} stats={statsWithPrice} />);

  fireEvent.click(screen.getByRole('button', { name: /calculate/i }));

  expect(screen.getByText(/dca calculator/i)).toBeInTheDocument();
  expect(screen.getByText(/stress test/i)).toBeInTheDocument();
});
```

Add `fireEvent` to the existing `@testing-library/react` import at the top of the file if it isn't already imported.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- HoldingRow`
Expected: FAIL — no "Calculate" button exists yet.

- [ ] **Step 3: Update `frontend/src/components/HoldingRow.tsx`**

```tsx
// frontend/src/components/HoldingRow.tsx (replace the full file)
import { useState } from 'react';
import type { Holding, HoldingStats } from '../api/types';
import { DcaCalculator } from './DcaCalculator';
import { StressTestCalculator } from './StressTestCalculator';

interface HoldingRowProps {
  holding: Holding;
  onDelete: (id: number) => void;
  stats?: HoldingStats;
}

export function HoldingRow({ holding, onDelete, stats }: HoldingRowProps) {
  const [calculatorsOpen, setCalculatorsOpen] = useState(false);

  return (
    <div className="holding-row">
      <div>
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
        {stats && (
          <button onClick={() => setCalculatorsOpen((open) => !open)}>
            {calculatorsOpen ? 'Hide calculators' : 'Calculate'}
          </button>
        )}
        <button onClick={() => onDelete(holding.id)}>Delete</button>
      </div>
      {stats && calculatorsOpen && (
        <div>
          <DcaCalculator currentShares={holding.shares} currentAvgCostUsd={holding.avg_cost_usd} currentPriceUsd={stats.current_price} />
          <StressTestCalculator currentPriceUsd={stats.current_price} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- HoldingRow`
Expected: all `HoldingRow` tests pass (4 original + 3 new = 7).

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `cd frontend && npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/HoldingRow.tsx frontend/src/components/HoldingRow.test.tsx
git commit -m "feat: wire DCA and stress-test calculators into HoldingRow via a Calculate toggle"
```

---

### Task 6: Minor cleanup from the frontend-live-pricing plan's final review

**Files:**
- Modify: `frontend/src/components/PortfolioCard.test.tsx` (rename stale test — Minor #3)
- Modify: `frontend/src/App.test.tsx` (defensive mock — Minor #2)
- Modify: `frontend/src/components/PortfolioHoldings.tsx` (surface summary error — Minor #4)
- Modify: `frontend/src/components/PortfolioHoldings.test.tsx` (test for that error)

**Interfaces:**
- No new exported interfaces — this task only touches test names/mocks and adds one error-rendering branch to an existing component.

- [ ] **Step 1: Rename the stale test in `PortfolioCard.test.tsx`**

Find the test currently named `'renders the portfolio name, cash, and target allocation'` and rename it to `'renders the portfolio name, total value, and target allocation'` — no other change to that test's body (its assertions already correctly check total value, not cash, per the prior review finding; only the name was stale).

- [ ] **Step 2: Add a defensive mock to `frontend/src/App.test.tsx`**

Read the current file first. Add a `beforeEach` that mocks `client.getPortfolioSummary` with a reasonable default (e.g. an empty-holdings summary), so this file's safety doesn't depend on `listPortfolios` always resolving to an empty array in its one existing test:

```tsx
// frontend/src/App.test.tsx
// add to the existing imports: `beforeEach` from vitest if not already imported
// add inside the describe block, before the existing test:
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
```

- [ ] **Step 3: Run tests to verify Steps 1-2 still pass**

Run: `cd frontend && npm test -- App.test PortfolioCard`
Expected: all pass (renamed test still passes since only its name changed; App test still passes with the new defensive mock in place).

- [ ] **Step 4: Write the failing test for `PortfolioHoldings`' error surfacing**

```tsx
// frontend/src/components/PortfolioHoldings.test.tsx (append)
it('shows an inline error banner when the summary fetch fails', async () => {
  vi.spyOn(client, 'listHoldings').mockResolvedValue([holding]);
  vi.spyOn(client, 'getPortfolioSummary').mockRejectedValue(new Error('price service unavailable'));

  render(<PortfolioHoldings portfolioId={1} />);

  await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());
  await waitFor(() => expect(screen.getByText(/price service unavailable/i)).toBeInTheDocument());
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd frontend && npm test -- PortfolioHoldings`
Expected: FAIL — `PortfolioHoldings` currently ignores its summary hook's `error`.

- [ ] **Step 6: Update `frontend/src/components/PortfolioHoldings.tsx`**

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
  const { summary, error: summaryError } = usePortfolioSummary(portfolioId);

  if (loading) {
    return <div>Loading holdings…</div>;
  }

  return (
    <div>
      {error && <div role="alert">{error}</div>}
      {summaryError && <div role="alert">{summaryError}</div>}
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

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd frontend && npm test -- PortfolioHoldings`
Expected: all tests pass, including the new error test.

- [ ] **Step 8: Run the full frontend suite**

Run: `cd frontend && npm test`
Expected: all tests pass, 0 warnings.

- [ ] **Step 9: Run the production build**

Run: `cd frontend && npm run build`
Expected: succeeds with zero TypeScript errors.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/PortfolioCard.test.tsx frontend/src/App.test.tsx frontend/src/components/PortfolioHoldings.tsx frontend/src/components/PortfolioHoldings.test.tsx
git commit -m "fix: rename stale test, defend App.test.tsx against a future non-empty fixture, surface PortfolioHoldings summary errors"
```

---

## What this plan does NOT cover (deliberately — see follow-up plans)

- Shared summary cache/dedupe (the duplicate-fetch-on-expand Minor finding) — a genuine future optimization, not addressed here since it's not blocking and affects architecture more broadly (noted as "wait until more summary consumers exist" in the prior review).
- Price charts, S/R lines, portfolio-level (cross-portfolio) rebalancing severity, currency conversion, editing an existing holding — all still separate future plans.
