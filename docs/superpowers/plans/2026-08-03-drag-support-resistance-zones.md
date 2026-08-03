# Drag Support/Resistance Zones Directly on the Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any support/resistance zone — auto or manual — be grabbed with the mouse directly on the Dashboard price chart and dragged to a new price, using the exact same freeze/move backend the prior ticket already built.

**Architecture:** Pure frontend work — no new backend endpoints. `PriceChart.tsx` gains raw `mousedown`/`mousemove`/`mouseup` handling on its container: `mousedown` hit-tests the click's Y position against every zone's `series.priceToCoordinate(price)` within a small pixel tolerance; while a hit is active, `mousemove` repositions that price line live via the line's own `applyOptions()` (no backend call per pixel) and reports the live price up to the parent via a new `onZoneDragMove` prop; `mouseup` reports the final price once via a new `onZoneDragEnd` prop. `useZoneEditing.ts` gains one new action, `dragZonePrice(zone, price)`, that branches exactly the way `editZonePrice` already does for manual zones but adds the freeze-and-edit branch (preserving every other currently-shown zone) for a zone that's still auto — this is the one new piece of business logic in the whole ticket. `DashboardPage.tsx` wires the two new `PriceChart` callbacks to a small `dragPreview` state (for live list sync) and to `zoneEditing.dragZonePrice` (for the commit), and `ZoneList.tsx` gets its row `key` widened to include `price` so its uncontrolled price input actually re-displays a new value when one arrives, live during a drag or after a server-confirmed edit.

**Tech Stack:** React 19 + TypeScript, `lightweight-charts` v5 (`series.priceToCoordinate()` / `series.coordinateToPrice()` for pixel↔price conversion, `IPriceLine.applyOptions()` for live reposition), Vitest + React Testing Library (`fireEvent.mouseDown/mouseMove/mouseUp`), FastAPI/SQLAlchemy backend (untouched by this ticket — every endpoint it needs already exists).

## Global Constraints

- No new backend endpoints or schema changes — `PATCH /market/chart/zones/{id}` (already wired via the `updateZone` client function) and `POST /market/chart/zones/freeze` (`freezeZones`) are reused exactly as they are.
- The drag interaction is built directly on `lightweight-charts`' coordinate conversion and raw mouse events on the chart's container element — there is no built-in draggable price line in this library.
- `mousedown` hit-tests the click position against every currently-rendered zone's on-screen Y position (via `priceToCoordinate`) within a small pixel tolerance (6px in this plan).
- `mousemove` while a hit is active updates the dragged line's on-screen position immediately by calling the price line's own `applyOptions()` — no backend call per pixel moved.
- `mouseup` commits the final price to the backend exactly once: a Move call (`updateZone`) if the dragged zone is already manual, or the same Freeze-and-edit call (`freezeZones`) the prior ticket's add path uses if this is the first edit for that ticker+range pair.
- Dragging an auto zone (the first edit for that pair) preserves every other zone currently shown, unchanged — the identical guarantee the prior ticket's `addZone` freeze path already has.
- The side list's displayed price for the zone being dragged updates live, staying in sync with what's rendered on the chart, before the drag commits.
- `strength` stays `null` on every zone this ticket's code path touches or creates — this ticket adds no new zone-creation logic, only repositioning, so the invariant carries over unchanged from the prior ticket.
- Adding a zone still works the way the prior ticket built it (S/R/Freestyle buttons place a new zone at the current price) — this ticket adds no separate "click the chart to place a new zone" mode; a newly-added zone is repositioned with the exact same drag mechanism as any other zone.

---

### Task 1: `PriceChart.tsx` drag mechanics

**Files:**
- Modify: `frontend/src/components/PriceChart.tsx`
- Test: `frontend/src/components/PriceChart.test.tsx`

**Interfaces:**
- Consumes: `Zone` type from `../api/types` (already imported); `ISeriesApi<'Line'>.priceToCoordinate(price: number): number | null` and `.coordinateToPrice(y: number): number | null` (real `lightweight-charts` v5 methods, mocked in tests the same way `createPriceLine`/`removePriceLine` already are); `IPriceLine.applyOptions({ price: number }): void` (already available on the `IPriceLine` objects `createPriceLine` returns).
- Produces: two new optional props — `onZoneDragMove?: (zone: Zone, price: number) => void` (fired on every `mousemove` while a drag is active, with the live price under the cursor) and `onZoneDragEnd?: (zone: Zone, price: number) => void` (fired once on `mouseup`, with the final price) — and one new optional prop `disabled?: boolean` (when true, `mousedown` never starts a drag). The chart's container `div` now carries `data-testid="price-chart"` so later tasks (and this task's own tests) can target it without DOM traversal.

- [ ] **Step 1: Write the failing tests**

Add `fireEvent` to the existing RTL import, and append this new `describe` block at the end of `frontend/src/components/PriceChart.test.tsx` (inside the existing outer `describe('PriceChart', ...)`, after the last `it(...)`):

```tsx
// at the top of the file, change:
import { render, screen } from '@testing-library/react';
// to:
import { fireEvent, render, screen } from '@testing-library/react';
```

```tsx
  describe('drag interaction', () => {
    it("starts a drag on mousedown within tolerance of a zone's line, and repositions that zone's price line live via applyOptions on mousemove", () => {
      const priceLine = { applyOptions: vi.fn() };
      const createPriceLine = vi.fn(() => priceLine);
      const priceToCoordinate = vi.fn((price: number) => (price === 95 ? 50 : null));
      const coordinateToPrice = vi.fn((y: number) => 200 - y);
      addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine: vi.fn(), priceToCoordinate, coordinateToPrice });

      render(
        <PriceChart
          points={null}
          loading={false}
          error={null}
          zones={[{ id: null, price: 95, kind: 'support', strength: 3, source: 'auto' }]}
        />,
      );

      fireEvent.mouseDown(screen.getByTestId('price-chart'), { clientY: 50 });
      fireEvent.mouseMove(window, { clientY: 40 });

      expect(priceLine.applyOptions).toHaveBeenCalledWith({ price: 160 });
    });

    it('ignores a mousedown that is not within tolerance of any zone line', () => {
      const priceLine = { applyOptions: vi.fn() };
      const createPriceLine = vi.fn(() => priceLine);
      const priceToCoordinate = vi.fn(() => 50);
      const coordinateToPrice = vi.fn(() => 999);
      addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine: vi.fn(), priceToCoordinate, coordinateToPrice });

      render(
        <PriceChart
          points={null}
          loading={false}
          error={null}
          zones={[{ id: null, price: 95, kind: 'support', strength: 3, source: 'auto' }]}
        />,
      );

      fireEvent.mouseDown(screen.getByTestId('price-chart'), { clientY: 200 });
      fireEvent.mouseMove(window, { clientY: 190 });

      expect(priceLine.applyOptions).not.toHaveBeenCalled();
    });

    it('commits the final price via onZoneDragEnd exactly once on mouseup', () => {
      const priceLine = { applyOptions: vi.fn() };
      const createPriceLine = vi.fn(() => priceLine);
      const priceToCoordinate = vi.fn((price: number) => (price === 95 ? 50 : null));
      const coordinateToPrice = vi.fn((y: number) => 200 - y);
      addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine: vi.fn(), priceToCoordinate, coordinateToPrice });
      const onZoneDragEnd = vi.fn();
      const zone = { id: null, price: 95, kind: 'support' as const, strength: 3, source: 'auto' as const };

      render(<PriceChart points={null} loading={false} error={null} zones={[zone]} onZoneDragEnd={onZoneDragEnd} />);

      fireEvent.mouseDown(screen.getByTestId('price-chart'), { clientY: 50 });
      fireEvent.mouseMove(window, { clientY: 40 });
      fireEvent.mouseUp(window, { clientY: 30 });

      expect(onZoneDragEnd).toHaveBeenCalledTimes(1);
      expect(onZoneDragEnd).toHaveBeenCalledWith(zone, 170);
    });

    it('calls onZoneDragMove on every mousemove while dragging, with the live price', () => {
      const priceLine = { applyOptions: vi.fn() };
      const createPriceLine = vi.fn(() => priceLine);
      const priceToCoordinate = vi.fn((price: number) => (price === 95 ? 50 : null));
      const coordinateToPrice = vi.fn((y: number) => 200 - y);
      addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine: vi.fn(), priceToCoordinate, coordinateToPrice });
      const onZoneDragMove = vi.fn();
      const zone = { id: null, price: 95, kind: 'support' as const, strength: 3, source: 'auto' as const };

      render(<PriceChart points={null} loading={false} error={null} zones={[zone]} onZoneDragMove={onZoneDragMove} />);

      fireEvent.mouseDown(screen.getByTestId('price-chart'), { clientY: 50 });
      fireEvent.mouseMove(window, { clientY: 40 });
      fireEvent.mouseMove(window, { clientY: 35 });

      expect(onZoneDragMove).toHaveBeenNthCalledWith(1, zone, 160);
      expect(onZoneDragMove).toHaveBeenNthCalledWith(2, zone, 165);
    });

    it('does not start a drag when disabled is true', () => {
      const priceLine = { applyOptions: vi.fn() };
      const createPriceLine = vi.fn(() => priceLine);
      const priceToCoordinate = vi.fn((price: number) => (price === 95 ? 50 : null));
      const coordinateToPrice = vi.fn((y: number) => 200 - y);
      addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine: vi.fn(), priceToCoordinate, coordinateToPrice });
      const onZoneDragEnd = vi.fn();

      render(
        <PriceChart
          points={null}
          loading={false}
          error={null}
          zones={[{ id: null, price: 95, kind: 'support', strength: 3, source: 'auto' }]}
          onZoneDragEnd={onZoneDragEnd}
          disabled
        />,
      );

      fireEvent.mouseDown(screen.getByTestId('price-chart'), { clientY: 50 });
      fireEvent.mouseMove(window, { clientY: 40 });
      fireEvent.mouseUp(window, { clientY: 40 });

      expect(priceLine.applyOptions).not.toHaveBeenCalled();
      expect(onZoneDragEnd).not.toHaveBeenCalled();
    });

    it('removes its window mouse listeners on unmount', () => {
      const priceLine = { applyOptions: vi.fn() };
      const createPriceLine = vi.fn(() => priceLine);
      const priceToCoordinate = vi.fn((price: number) => (price === 95 ? 50 : null));
      const coordinateToPrice = vi.fn((y: number) => 200 - y);
      addSeries.mockReturnValue({ setData, createPriceLine, removePriceLine: vi.fn(), priceToCoordinate, coordinateToPrice });
      const zone = { id: null, price: 95, kind: 'support' as const, strength: 3, source: 'auto' as const };

      const { unmount } = render(<PriceChart points={null} loading={false} error={null} zones={[zone]} />);
      fireEvent.mouseDown(screen.getByTestId('price-chart'), { clientY: 50 });

      unmount();
      fireEvent.mouseMove(window, { clientY: 30 });

      expect(priceLine.applyOptions).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/PriceChart.test.tsx`
Expected: the 6 new tests FAIL (`priceToCoordinate`/`coordinateToPrice` don't exist on the current mock shape being read by any drag code, `onZoneDragMove`/`onZoneDragEnd` are never called because no drag handling exists yet, `getByTestId('price-chart')` fails because the container div has no `data-testid` yet).

- [ ] **Step 3: Implement the drag mechanics**

In `frontend/src/components/PriceChart.tsx`, add the container's test id and the drag effect. First, mark the container div:

```tsx
      <div ref={containerRef} data-testid="price-chart" />
```

(replaces the current `<div ref={containerRef} />` at the end of the `return` block).

Then add a constant near the top of the file, after the `ZONE_STYLE`/`zoneTitle` block:

```ts
const HIT_TOLERANCE_PX = 6; // pixels of vertical slack around a zone's line for a mousedown to "grab" it
```

Widen the props interface:

```ts
interface PriceChartProps {
  points: ChartPoint[] | null;
  loading: boolean;
  error: string | null;
  zones: Zone[];
  onZoneDragMove?: (zone: Zone, price: number) => void;
  onZoneDragEnd?: (zone: Zone, price: number) => void;
  disabled?: boolean;
}
```

Update the component signature to destructure the new props:

```tsx
export function PriceChart({ points, loading, error, zones, onZoneDragMove, onZoneDragEnd, disabled = false }: PriceChartProps) {
```

Add a new ref, and a new `useEffect`, placed after the existing zones-drawing `useEffect` (so this effect always runs after `priceLinesRef.current` has been refreshed for the current `zones` in the same commit):

```tsx
  const draggingRef = useRef<{ zone: Zone; priceLine: IPriceLine } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    function findHit(y: number): { zone: Zone; priceLine: IPriceLine } | null {
      const series = seriesRef.current;
      if (series === null) return null;
      for (let i = 0; i < zones.length; i++) {
        const lineY = series.priceToCoordinate(zones[i].price);
        if (lineY !== null && Math.abs(lineY - y) <= HIT_TOLERANCE_PX) {
          const priceLine = priceLinesRef.current[i];
          if (priceLine !== undefined) return { zone: zones[i], priceLine };
        }
      }
      return null;
    }

    function priceAt(y: number): number | null {
      return seriesRef.current === null ? null : seriesRef.current.coordinateToPrice(y);
    }

    function handleMouseDown(event: MouseEvent) {
      if (disabled) return;
      const rect = container!.getBoundingClientRect();
      const hit = findHit(event.clientY - rect.top);
      if (hit === null) return;
      draggingRef.current = hit;
    }

    function handleMouseMove(event: MouseEvent) {
      const dragging = draggingRef.current;
      if (dragging === null) return;
      const rect = container!.getBoundingClientRect();
      const price = priceAt(event.clientY - rect.top);
      if (price === null) return;
      dragging.priceLine.applyOptions({ price });
      onZoneDragMove?.(dragging.zone, price);
    }

    function handleMouseUp(event: MouseEvent) {
      const dragging = draggingRef.current;
      draggingRef.current = null;
      if (dragging === null) return;
      const rect = container!.getBoundingClientRect();
      const price = priceAt(event.clientY - rect.top);
      if (price === null) return;
      onZoneDragEnd?.(dragging.zone, price);
    }

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [zones, disabled, onZoneDragMove, onZoneDragEnd]);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/PriceChart.test.tsx`
Expected: all 20 tests PASS (14 pre-existing + 6 new).

- [ ] **Step 5: Run the full frontend suite and typecheck**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: `303 passed` (297 pre-existing + 6 new), `tsc -b` exits clean with no output.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/PriceChart.tsx frontend/src/components/PriceChart.test.tsx
git commit -m "feat: add drag mechanics to PriceChart (hit-test, live reposition, drag callbacks)"
```

---

### Task 2: `useZoneEditing.ts` — `dragZonePrice` action

**Files:**
- Modify: `frontend/src/hooks/useZoneEditing.ts`
- Test: `frontend/src/hooks/useZoneEditing.test.tsx`

**Interfaces:**
- Consumes: `updateZone(zoneId: number, price: number): Promise<Zone>` and `freezeZones(ticker: string, range: ChartRange, zones: ZoneInput[]): Promise<Zone[]>` (both already imported into this file); the hook's own existing `runMutation` wrapper (already implements the busy-guard/error/onZonesChanged plumbing — reuse it, don't duplicate it).
- Produces: a new action on the hook's return value, `dragZonePrice(zone: Zone, price: number): Promise<void>` — later tasks call this from `PriceChart`'s `onZoneDragEnd` callback.

- [ ] **Step 1: Write the failing tests**

Append these three tests to the end of the `describe('useZoneEditing', ...)` block in `frontend/src/hooks/useZoneEditing.test.tsx` (just before the closing `});` of the describe block):

```tsx
  it('dragZonePrice calls updateZone directly when the dragged zone is already manual', async () => {
    vi.spyOn(client, 'updateZone').mockResolvedValue({ ...manualZone, price: 99 });
    const onZonesChanged = vi.fn();

    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [manualZone], onZonesChanged));

    await act(async () => {
      await result.current.dragZonePrice(manualZone, 99);
    });

    expect(client.updateZone).toHaveBeenCalledWith(5, 99);
    expect(onZonesChanged).toHaveBeenCalledTimes(1);
  });

  it("dragZonePrice freezes the whole zone set, replacing only the dragged zone's price, when dragging an auto zone for the first time", async () => {
    const otherAutoZone = { id: null, price: 110, kind: 'resistance' as const, strength: 2, source: 'auto' as const };
    const freezeSpy = vi.spyOn(client, 'freezeZones').mockResolvedValue([]);
    const onZonesChanged = vi.fn();

    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [autoZone, otherAutoZone], onZonesChanged));

    await act(async () => {
      await result.current.dragZonePrice(autoZone, 93);
    });

    expect(freezeSpy).toHaveBeenCalledWith('VTI', '1Y', [
      { kind: 'support', price: 93 },
      { kind: 'resistance', price: 110 },
    ]);
    expect(onZonesChanged).toHaveBeenCalledTimes(1);
  });

  it('dragZonePrice is ignored while another mutation is already in flight', async () => {
    let resolveUpdate: (zone: client.Zone) => void;
    const updateSpy = vi.spyOn(client, 'updateZone').mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    const onZonesChanged = vi.fn();

    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [manualZone], onZonesChanged));

    let firstPromise: Promise<void>;
    let secondPromise: Promise<void>;
    act(() => {
      firstPromise = result.current.dragZonePrice(manualZone, 96);
      secondPromise = result.current.dragZonePrice(manualZone, 97);
    });

    await waitFor(() => expect(result.current.busy).toBe(true));
    expect(updateSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveUpdate!({ ...manualZone, price: 96 });
      await Promise.all([firstPromise, secondPromise]);
    });

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/hooks/useZoneEditing.test.tsx`
Expected: the 3 new tests FAIL with `TypeError: result.current.dragZonePrice is not a function`.

- [ ] **Step 3: Implement `dragZonePrice`**

In `frontend/src/hooks/useZoneEditing.ts`, add the new action after `removeZone` and before `recomputeDefaults`:

```ts
  const dragZonePrice = (zone: Zone, price: number): Promise<void> => {
    if (ticker === null) return Promise.resolve();
    return runMutation(async () => {
      if (zone.source === 'manual' && zone.id !== null) {
        await updateZone(zone.id, price);
      } else {
        const updated: ZoneInput[] = zones.map((z) => ({
          kind: z.kind,
          price: z === zone ? price : z.price,
        }));
        await freezeZones(ticker, range, updated);
      }
    });
  };
```

Add it to the hook's return value:

```ts
  return { error, isManual, busy, addZone, editZonePrice, removeZone, recomputeDefaults, dragZonePrice };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/hooks/useZoneEditing.test.tsx`
Expected: all 14 tests PASS (11 pre-existing + 3 new).

- [ ] **Step 5: Run the full frontend suite and typecheck**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: `306 passed` (303 after Task 1 + 3 new), `tsc -b` exits clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useZoneEditing.ts frontend/src/hooks/useZoneEditing.test.tsx
git commit -m "feat: add dragZonePrice action to useZoneEditing (move-or-freeze-and-edit)"
```

---

### Task 3: Wire dragging into `DashboardPage.tsx`, live-sync `ZoneList.tsx`

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/components/ZoneList.tsx`
- Test: `frontend/src/pages/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `PriceChart`'s new `onZoneDragMove`/`onZoneDragEnd`/`disabled` props (Task 1); `useZoneEditing`'s new `dragZonePrice(zone, price)` action (Task 2); `Zone` type from `../api/types`.
- Produces: nothing new for later tasks — this is the final task of the ticket.

- [ ] **Step 1: Write the failing tests**

Append these three tests to the end of the `describe('DashboardPage', ...)` block in `frontend/src/pages/DashboardPage.test.tsx` (just before the closing `});`):

```tsx
  it('dragging a zone updates the zone list price live, then commits via dragZonePrice on mouseup', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({
      points: [{ time: '2026-01-02', close: 100 }],
      zones: [{ id: 1, price: 95, kind: 'support', strength: null, source: 'manual' }],
    });
    const updateSpy = vi
      .spyOn(client, 'updateZone')
      .mockResolvedValue({ id: 1, price: 160, kind: 'support', strength: null, source: 'manual' });
    const priceLine = { applyOptions: vi.fn() };
    const createPriceLine = vi.fn(() => priceLine);
    const priceToCoordinate = vi.fn((price: number) => (price === 95 ? 50 : null));
    const coordinateToPrice = vi.fn((y: number) => 200 - y);
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn(), createPriceLine, removePriceLine: vi.fn(), priceToCoordinate, coordinateToPrice })),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(screen.getByLabelText('support zone price')).toBeInTheDocument());
    expect(screen.getByLabelText('support zone price')).toHaveValue(95);

    fireEvent.mouseDown(screen.getByTestId('price-chart'), { clientY: 50 });
    fireEvent.mouseMove(window, { clientY: 43 });

    expect(screen.getByLabelText('support zone price')).toHaveValue(157);

    fireEvent.mouseUp(window, { clientY: 40 });

    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith(1, 160));
  });

  it('disables chart dragging while a zone mutation is already in flight', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({
      points: [{ time: '2026-01-02', close: 100 }],
      zones: [{ id: 1, price: 95, kind: 'support', strength: null, source: 'manual' }],
    });
    let resolveDelete: () => void;
    vi.spyOn(client, 'deleteZone').mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDelete = resolve;
      }),
    );
    const updateSpy = vi.spyOn(client, 'updateZone');
    const priceLine = { applyOptions: vi.fn() };
    const createPriceLine = vi.fn(() => priceLine);
    const priceToCoordinate = vi.fn((price: number) => (price === 95 ? 50 : null));
    const coordinateToPrice = vi.fn((y: number) => 200 - y);
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn(), createPriceLine, removePriceLine: vi.fn(), priceToCoordinate, coordinateToPrice })),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^s$/i })).toBeDisabled());

    fireEvent.mouseDown(screen.getByTestId('price-chart'), { clientY: 50 });
    fireEvent.mouseUp(window, { clientY: 40 });

    expect(updateSpy).not.toHaveBeenCalled();

    resolveDelete!();
  });

  it('dragging an auto zone freezes the whole zone set with the dragged zone at its new price', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({
      points: [{ time: '2026-01-02', close: 100 }],
      zones: [
        { id: null, price: 95, kind: 'support', strength: 3, source: 'auto' },
        { id: null, price: 110, kind: 'resistance', strength: 2, source: 'auto' },
      ],
    });
    const freezeSpy = vi.spyOn(client, 'freezeZones').mockResolvedValue([]);
    const priceLine = { applyOptions: vi.fn() };
    const createPriceLine = vi.fn(() => priceLine);
    const priceToCoordinate = vi.fn((price: number) => (price === 95 ? 50 : price === 110 ? 20 : null));
    const coordinateToPrice = vi.fn((y: number) => 200 - y);
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn(), createPriceLine, removePriceLine: vi.fn(), priceToCoordinate, coordinateToPrice })),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(screen.getByTestId('price-chart')).toBeInTheDocument());

    fireEvent.mouseDown(screen.getByTestId('price-chart'), { clientY: 50 });
    fireEvent.mouseUp(window, { clientY: 40 });

    await waitFor(() =>
      expect(freezeSpy).toHaveBeenCalledWith('AAPL', '1Y', [
        { kind: 'support', price: 160 },
        { kind: 'resistance', price: 110 },
      ]),
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/DashboardPage.test.tsx`
Expected: the 3 new tests FAIL — `getByTestId('price-chart')` resolves (Task 1 already added it), but nothing calls `updateZone`/`freezeZones` on drag yet since `DashboardPage` doesn't wire the callbacks, and the list price never updates live.

- [ ] **Step 3: Widen `ZoneList.tsx`'s row key so a price change actually re-displays**

In `frontend/src/components/ZoneList.tsx`, replace the row `key`:

```tsx
          <tr key={zone.id ?? `auto-${zone.kind}-${zone.price}`}>
```

with:

```tsx
          <tr key={zone.id !== null ? `${zone.id}-${zone.price}` : `auto-${zone.kind}-${zone.price}`}>
```

This is required for the manual-zone price `<input>` (which is uncontrolled — `defaultValue={zone.price}`) to actually show a new price: React only re-initializes an uncontrolled input's `defaultValue` when the element remounts, which only happens when its `key` changes. Without this, neither a live drag preview nor a server-confirmed price update would ever appear in the list.

- [ ] **Step 4: Wire drag callbacks and live preview into `DashboardPage.tsx`**

In `frontend/src/pages/DashboardPage.tsx`, widen the type import:

```tsx
import type { ChartRange, Zone } from '../api/types';
```

Add drag-preview state, right after the `zoneEditing` line:

```tsx
  const zoneEditing = useZoneEditing(selectedTicker, range, zones, refetch);
  const [dragPreview, setDragPreview] = useState<{ zone: Zone; price: number } | null>(null);
  const displayZones = dragPreview === null ? zones : zones.map((z) => (z === dragPreview.zone ? { ...z, price: dragPreview.price } : z));
```

Update the `<PriceChart>` element to pass the two new callbacks and `disabled`:

```tsx
              <PriceChart
                key={chartIdentityKey(selectedTicker, range)}
                points={points}
                loading={loading}
                error={error}
                zones={zones}
                onZoneDragMove={(zone, price) => setDragPreview({ zone, price })}
                onZoneDragEnd={(zone, price) => {
                  setDragPreview(null);
                  void zoneEditing.dragZonePrice(zone, price);
                }}
                disabled={zoneEditing.busy}
              />
```

Update the `<ZoneList>` element to receive the live-preview-merged zones instead of the raw ones:

```tsx
              <ZoneList
                zones={displayZones}
                onEditPrice={zoneEditing.editZonePrice}
                onDelete={zoneEditing.removeZone}
                disabled={zoneEditing.busy}
              />
```

Note `PriceChart` keeps receiving the raw `zones` (not `displayZones`) — its own zones-drawing effect is keyed on `zones`, and re-running it on every `mousemove` would recreate every price line and fight the live `applyOptions()` reposition this ticket's drag mechanics already do internally. Only `ZoneList`, which has no equivalent internal live-update mechanism, needs the merged array.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/DashboardPage.test.tsx src/components/ZoneList.test.tsx`
Expected: all `DashboardPage.test.tsx` tests PASS (21 total: 18 pre-existing + 3 new); all `ZoneList.test.tsx` tests still PASS (8, unchanged — the key change is not externally observable through that file's existing assertions).

- [ ] **Step 6: Run the full frontend and backend suites and typecheck**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: `309 passed` (306 after Task 2 + 3 new), `tsc -b` exits clean.

Run: `cd backend && python -m pytest -q`
Expected: `208 passed` (unchanged — this ticket touches no backend file).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx frontend/src/components/ZoneList.tsx frontend/src/components/ZoneList.test.tsx frontend/src/pages/DashboardPage.test.tsx
git commit -m "feat: wire zone dragging into DashboardPage, live-sync ZoneList during drag"
```

(No changes to `ZoneList.test.tsx` are required by this task, so `git add` will simply no-op for that path if it wasn't touched — leaving it listed is harmless and keeps the commit's file list self-documenting.)

---

## Final Verification

- [ ] Run `cd frontend && npx vitest run` → expect `309 passed` (47+ test files — no new test files were created this ticket, only existing ones extended).
- [ ] Run `cd frontend && npx tsc -b` → expect a clean exit with no output.
- [ ] Run `cd backend && python -m pytest -q` → expect `208 passed` (unchanged).
- [ ] Manually confirm (via the review process, since no live backend/browser smoke test is part of this plan) that the three Global Constraints most likely to be silently wrong are each covered by a test: hit-tolerance mousedown (Task 1, tests 1–2), exactly-once commit on mouseup (Task 1, test 3), and the freeze-preserves-other-zones guarantee when dragging an auto zone (Task 2, test 2, and DashboardPage integration test 3).

## Self-Review Notes

- **Spec coverage**: all `Implementation Decisions` bullets in `docs/specs/2026-08-03-dashboard-manual-support-resistance.md`'s "Drag interaction" section map onto Task 1 (hit-test, live reposition, exactly-once commit) and Task 2 (move-vs-freeze branching). The "side list updates live" requirement maps onto Task 3's `dragPreview` state and the `ZoneList` key fix. "Adding a zone" (current-price placement, then drag to reposition) requires no new code — it's already built by the prior ticket and this ticket's drag mechanics apply to any zone regardless of how it was created.
- **Placeholder scan**: no TBD/TODO markers; every step has complete, runnable code.
- **Type consistency**: `dragZonePrice(zone: Zone, price: number): Promise<void>` (Task 2) is called with exactly that signature from `PriceChart`'s `onZoneDragEnd={(zone, price) => ...}` callback (Task 1's prop shape) in Task 3 — verified matching across all three tasks. `onZoneDragMove`/`onZoneDragEnd` are typed identically in the `PriceChartProps` interface (Task 1) and in the JSX usage (Task 3).
- **No backend task was added** because this ticket's spec explicitly reuses the four write endpoints (`freeze`, `add`, `move`/PATCH, `delete`/`delete-all`) the prior ticket already built and tested — confirmed by re-reading `backend/app/routers/market.py` and `backend/app/manual_zones_service.py` before writing this plan; nothing there needs to change for dragging to work.
