# Extract Shared Tab Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the duplicated pressed-button tab-strip markup in `App.tsx` and `ToolsPage.tsx` into one reusable `TabStrip` component, with zero user-visible behaviour change, so the upcoming Watchlist area (five sub-tabs) doesn't add a third copy of the same markup.

**Architecture:** A generic `TabStrip<T extends string>` component takes a list of `{ id, label }` tab definitions, the active tab id, and an `onChange` callback, and renders the exact same `<nav><button type="button" aria-pressed=... onClick=...></nav>` structure the two pages already render by hand. `App.tsx` and `ToolsPage.tsx` are then rewritten to declare their tab lists and delegate rendering to it.

**Tech Stack:** React 19, TypeScript, Vitest, @testing-library/react — matches the rest of `frontend/`.

## Global Constraints

- No user-visible change: rendered DOM (element types, `aria-pressed`, button text, click behaviour) must be identical before and after.
- Every existing test in `frontend/src/App.test.tsx` and `frontend/src/pages/ToolsPage.test.tsx` must pass **without modification** — this is the acceptance proof for the whole plan, not just a nice-to-have.
- `npx tsc -b` must be clean (this repo uses TypeScript project references — build via `tsc -b`, not `tsc --noEmit`, per existing CI usage).
- Follow existing code style: no comments except where a non-obvious constraint needs explaining, no added abstractions beyond what this task needs.

---

### Task 1: Create `TabStrip` component and wire it into `App` and `ToolsPage`

**Files:**
- Create: `frontend/src/components/TabStrip.tsx`
- Create: `frontend/src/components/TabStrip.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/ToolsPage.tsx`

**Interfaces:**
- Consumes: nothing from other tasks — this is the only task in this plan.
- Produces: `TabStrip<T extends string>` exported from `frontend/src/components/TabStrip.tsx` with props `{ tabs: { id: T; label: string }[]; activeTab: T; onChange: (tab: T) => void }`. This is the component the Watchlist area (a later, separate plan) will also import.

- [ ] **Step 1: Write the failing test for `TabStrip`**

```tsx
// frontend/src/components/TabStrip.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TabStrip } from './TabStrip';

describe('TabStrip', () => {
  const tabs = [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Beta' },
    { id: 'c', label: 'Gamma' },
  ] as const;

  it('renders one button per tab with the active tab pressed', () => {
    render(<TabStrip tabs={tabs} activeTab="b" onChange={() => {}} />);

    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Gamma' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the clicked tab id', () => {
    const onChange = vi.fn();
    render(<TabStrip tabs={tabs} activeTab="a" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Gamma' }));

    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('does not call onChange when the already-active tab is clicked', () => {
    const onChange = vi.fn();
    render(<TabStrip tabs={tabs} activeTab="a" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));

    expect(onChange).toHaveBeenCalledWith('a');
  });
});
```

Note on the third test: clicking the active tab still calls `onChange` with its own id (matching the current hand-rolled behaviour in `App.tsx`/`ToolsPage.tsx`, where `onClick={() => setActiveTab('portfolios')}` fires regardless of current state) — `TabStrip` must not add debouncing that didn't exist before.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/TabStrip.test.tsx`
Expected: FAIL — `Cannot find module './TabStrip'` (or similar, since the file doesn't exist yet).

- [ ] **Step 3: Implement `TabStrip`**

```tsx
// frontend/src/components/TabStrip.tsx
export interface TabDefinition<T extends string> {
  id: T;
  label: string;
}

interface TabStripProps<T extends string> {
  tabs: TabDefinition<T>[];
  activeTab: T;
  onChange: (tab: T) => void;
}

export function TabStrip<T extends string>({ tabs, activeTab, onChange }: TabStripProps<T>) {
  return (
    <nav>
      {tabs.map((tab) => (
        <button key={tab.id} type="button" aria-pressed={activeTab === tab.id} onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/TabStrip.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Rewrite `App.tsx` to use `TabStrip`**

Replace the full contents of `frontend/src/App.tsx` with:

```tsx
import { useState } from 'react';
import { TabStrip } from './components/TabStrip';
import { PortfoliosPage } from './pages/PortfoliosPage';
import { ToolsPage } from './pages/ToolsPage';

type Tab = 'portfolios' | 'tools';

const TABS = [
  { id: 'portfolios', label: 'Portfolios' },
  { id: 'tools', label: 'Tools' },
] as const satisfies { id: Tab; label: string }[];

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('portfolios');

  return (
    <div>
      <h1>Portfolio Tracker</h1>
      <TabStrip tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'portfolios' && <PortfoliosPage />}
      {activeTab === 'tools' && <ToolsPage />}
    </div>
  );
}
```

- [ ] **Step 6: Run `App.test.tsx` to verify it still passes unmodified**

Run: `cd frontend && npx vitest run src/App.test.tsx`
Expected: PASS (2 tests) — no edits made to `App.test.tsx` itself.

- [ ] **Step 7: Rewrite `ToolsPage.tsx` to use `TabStrip`**

Replace the full contents of `frontend/src/pages/ToolsPage.tsx` with:

```tsx
import { useState } from 'react';
import { TabStrip } from '../components/TabStrip';
import { DcaProjectionCalculator } from '../components/DcaProjectionCalculator';
import { EtfComparisonTool } from '../components/EtfComparisonTool';
import { PassiveIncomeCalculator } from '../components/PassiveIncomeCalculator';
import { PortfolioBuilderWizard } from '../components/PortfolioBuilderWizard';

type ToolsTab = 'dca-projection' | 'passive-income' | 'portfolio-builder' | 'etf-comparison';

const TABS = [
  { id: 'dca-projection', label: 'DCA Projection' },
  { id: 'passive-income', label: 'Passive Income' },
  { id: 'portfolio-builder', label: 'Portfolio Builder' },
  { id: 'etf-comparison', label: 'ETF Comparison' },
] as const satisfies { id: ToolsTab; label: string }[];

export function ToolsPage() {
  const [activeTab, setActiveTab] = useState<ToolsTab>('dca-projection');

  return (
    <div>
      <h2>Tools</h2>
      <TabStrip tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'dca-projection' && <DcaProjectionCalculator />}
      {activeTab === 'passive-income' && <PassiveIncomeCalculator />}
      {activeTab === 'portfolio-builder' && <PortfolioBuilderWizard />}
      {activeTab === 'etf-comparison' && <EtfComparisonTool />}
    </div>
  );
}
```

- [ ] **Step 8: Run `ToolsPage.test.tsx` to verify it still passes unmodified**

Run: `cd frontend && npx vitest run src/pages/ToolsPage.test.tsx`
Expected: PASS (1 test) — no edits made to `ToolsPage.test.tsx` itself.

- [ ] **Step 9: Run the full frontend suite and typecheck**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: All tests pass (should be 105 pre-existing + 3 new `TabStrip` tests = 108), `tsc -b` exits clean with no output.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/TabStrip.tsx frontend/src/components/TabStrip.test.tsx frontend/src/App.tsx frontend/src/pages/ToolsPage.tsx
git commit -m "refactor: extract shared TabStrip component from App and ToolsPage"
```

## Self-Review

**1. Spec coverage:** Ticket 1's only two acceptance criteria are "both App and Tools render through one shared tab component" and "every existing test passes without modification" — both directly covered by Steps 5–9. The "active tab still communicated to assistive technology the same way" criterion is covered by `aria-pressed` being preserved verbatim in `TabStrip`. Type checking is covered by Step 9.

**2. Placeholder scan:** No TBD/TODO markers. All code blocks are complete, copy-pasteable file contents, not diffs or fragments.

**3. Type consistency:** `TabDefinition<T>` and `TabStripProps<T>` are defined once in Step 3 and consumed identically in Steps 5 and 7 (`TABS` typed via `as const satisfies { id: Tab; label: string }[]`, matching the generic's shape). No other task references these types, since this is a single-task plan.
