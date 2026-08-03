// frontend/src/hooks/useChartData.test.tsx
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import type { ChartRange, Zone } from '../api/types';
import { useChartData } from './useChartData';

describe('useChartData', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('issues no request and has no data while ticker is null', () => {
    const getChartDataSpy = vi.spyOn(client, 'getChartData');

    const { result } = renderHook(() => useChartData(null, '1Y'));

    expect(getChartDataSpy).not.toHaveBeenCalled();
    expect(result.current.points).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('fetches and stores points once a ticker is provided', async () => {
    const points = [{ time: '2026-01-02', close: 100 }];
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points, zones: [] });

    const { result } = renderHook(() => useChartData('VTI', '1Y'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(client.getChartData).toHaveBeenCalledWith('VTI', '1Y');
    expect(result.current.points).toEqual(points);
    expect(result.current.error).toBeNull();
  });

  it('refetches when the ticker changes', async () => {
    vi.spyOn(client, 'getChartData')
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', close: 100 }], zones: [] })
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', close: 400 }], zones: [] });

    const { result, rerender } = renderHook(({ ticker }) => useChartData(ticker, '1Y'), {
      initialProps: { ticker: 'VTI' as string | null },
    });
    await waitFor(() => expect(result.current.points).toEqual([{ time: '2026-01-02', close: 100 }]));

    rerender({ ticker: 'SPY' });

    await waitFor(() => expect(client.getChartData).toHaveBeenLastCalledWith('SPY', '1Y'));
    await waitFor(() => expect(result.current.points).toEqual([{ time: '2026-01-02', close: 400 }]));
  });

  it('sets an explicit error and null points when the API reports the ticker unavailable', async () => {
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: null, zones: [] });

    const { result } = renderHook(() => useChartData('BADTICKER', '1Y'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.points).toBeNull();
    expect(result.current.error).toContain('BADTICKER');
  });

  it('sets an error and null points when the request throws', async () => {
    vi.spyOn(client, 'getChartData').mockRejectedValue(new client.ApiError(502, 'upstream error'));

    const { result } = renderHook(() => useChartData('VTI', '1Y'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.points).toBeNull();
    expect(result.current.error).toBe('upstream error');
  });

  it('a stale in-flight request cannot overwrite a newer selection', async () => {
    let resolveFirst!: (value: { points: client.ChartData['points'] }) => void;
    const firstPromise = new Promise<{ points: client.ChartData['points'] }>((resolve) => {
      resolveFirst = resolve;
    });
    vi.spyOn(client, 'getChartData')
      .mockReturnValueOnce(firstPromise as Promise<client.ChartData>)
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', close: 400 }], zones: [] });

    const { result, rerender } = renderHook(({ ticker }) => useChartData(ticker, '1Y'), {
      initialProps: { ticker: 'VTI' as string | null },
    });

    rerender({ ticker: 'SPY' });
    await waitFor(() => expect(result.current.points).toEqual([{ time: '2026-01-02', close: 400 }]));

    // The abandoned VTI request now resolves late — it must not overwrite SPY's already-landed data.
    resolveFirst({ points: [{ time: '2026-01-02', close: 100 }] });

    expect(result.current.points).toEqual([{ time: '2026-01-02', close: 400 }]);
  });

  it('clears points immediately when the ticker changes, before the new fetch resolves', async () => {
    let resolveSecond!: (value: { points: client.ChartData['points'] }) => void;
    const secondPromise = new Promise<{ points: client.ChartData['points'] }>((resolve) => {
      resolveSecond = resolve;
    });
    vi.spyOn(client, 'getChartData')
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', close: 100 }], zones: [] })
      .mockReturnValueOnce(secondPromise as Promise<client.ChartData>);

    const { result, rerender } = renderHook(({ ticker }) => useChartData(ticker, '1Y'), {
      initialProps: { ticker: 'VTI' as string | null },
    });
    await waitFor(() => expect(result.current.points).toEqual([{ time: '2026-01-02', close: 100 }]));

    rerender({ ticker: 'SPY' });

    // SPY's fetch hasn't resolved yet — VTI's stale points must not still be sitting there.
    expect(result.current.points).toBeNull();

    resolveSecond({ points: [{ time: '2026-01-02', close: 400 }] });
    await waitFor(() => expect(result.current.points).toEqual([{ time: '2026-01-02', close: 400 }]));
  });

  it('never commits a render for the new ticker that still carries the outgoing ticker error', async () => {
    // The effect body already clears `error` unconditionally on every ticker/range change, so
    // reading `result.current.error` right after a plain rerender() would pass even without the
    // render-phase reset — testing-library's act() flushes the effect synchronously too, by which
    // point error is already cleared either way. That check can't tell the two implementations
    // apart.
    //
    // What actually distinguishes them is what a REAL CHILD COMPONENT sees at its first commit.
    // React's "call setState during render" trick (used by the render-phase reset) discards and
    // retries the *calling* component's own function body before any child ever renders — so if
    // the reset runs, a child never sees the stale value, full stop. Without the reset, there's no
    // retry: the parent's function body runs exactly once with the stale `error` still in state,
    // and that stale value is what gets baked into the child's props at the one and only commit —
    // which is exactly the "outgoing ticker's error momentarily visible in a freshly-remounted
    // child" bug this finding describes. So the probe below has to be a distinct child component,
    // not just a value read out of the hook.
    const seenErrors: (string | null)[] = [];

    function ErrorProbe({ error }: { error: string | null }) {
      seenErrors.push(error);
      return null;
    }

    function Harness({ ticker }: { ticker: string | null }) {
      const { error } = useChartData(ticker, '1Y');
      return <ErrorProbe error={error} />;
    }

    vi.spyOn(client, 'getChartData')
      .mockRejectedValueOnce(new client.ApiError(502, 'upstream error'))
      .mockReturnValueOnce(new Promise<client.ChartData>(() => {})); // never resolves

    const { rerender } = render(<Harness ticker="VTI" />);
    await waitFor(() => expect(seenErrors).toContain('upstream error'));

    seenErrors.length = 0;
    rerender(<Harness ticker="SPY" />);

    // The child's very first commit for the new ticker must not carry the old error.
    expect(seenErrors[0]).toBeNull();
  });

  it('clears points immediately when the range changes for the same ticker, before the new fetch resolves', async () => {
    let resolveSecond!: (value: { points: client.ChartData['points'] }) => void;
    const secondPromise = new Promise<{ points: client.ChartData['points'] }>((resolve) => {
      resolveSecond = resolve;
    });
    vi.spyOn(client, 'getChartData')
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', close: 100 }], zones: [] })
      .mockReturnValueOnce(secondPromise as Promise<client.ChartData>);

    const { result, rerender } = renderHook(({ ticker, range }) => useChartData(ticker, range), {
      initialProps: { ticker: 'VTI' as string | null, range: '1Y' as ChartRange },
    });
    await waitFor(() => expect(result.current.points).toEqual([{ time: '2026-01-02', close: 100 }]));

    rerender({ ticker: 'VTI', range: '5Y' });

    // 5Y's fetch hasn't resolved yet — the 1Y-range points must not still be sitting there.
    expect(result.current.points).toBeNull();

    resolveSecond({ points: [{ time: '2026-01-02', close: 400 }] });
    await waitFor(() => expect(result.current.points).toEqual([{ time: '2026-01-02', close: 400 }]));
  });

  it('defaults zones to an empty array when the response omits it', async () => {
    const points = [{ time: '2026-01-02', close: 100 }];
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points } as unknown as client.ChartData);

    const { result } = renderHook(() => useChartData('VTI', '1Y'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.zones).toEqual([]);
  });

  it('fetches and stores zones alongside points', async () => {
    const points = [{ time: '2026-01-02', close: 100 }];
    const zones = [{ id: null, price: 95, kind: 'support' as const, strength: 3, source: 'auto' as const }];
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points, zones });

    const { result } = renderHook(() => useChartData('VTI', '1Y'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.zones).toEqual(zones);
  });

  it('clears zones immediately when the ticker changes, before the new fetch resolves', async () => {
    let resolveSecond!: (value: client.ChartData) => void;
    const secondPromise = new Promise<client.ChartData>((resolve) => {
      resolveSecond = resolve;
    });
    vi.spyOn(client, 'getChartData')
      .mockResolvedValueOnce({
        points: [{ time: '2026-01-02', close: 100 }],
        zones: [{ id: null, price: 95, kind: 'support', strength: 3, source: 'auto' }],
      })
      .mockReturnValueOnce(secondPromise);

    const { result, rerender } = renderHook(({ ticker }) => useChartData(ticker, '1Y'), {
      initialProps: { ticker: 'VTI' as string | null },
    });
    await waitFor(() => expect(result.current.zones.length).toBe(1));

    rerender({ ticker: 'SPY' });

    expect(result.current.zones).toEqual([]);

    resolveSecond({ points: [], zones: [] });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('never commits a render for the new ticker that still carries the outgoing ticker zones', async () => {
    // Same rationale as the ErrorProbe test above: `expect(result.current.zones).toEqual([])`
    // right after rerender() can't distinguish a render-phase reset from an effect-based one,
    // because act() flushes effects synchronously before that assertion ever runs. What actually
    // distinguishes them is what a REAL CHILD COMPONENT sees at its first commit — if the reset
    // runs during render, React discards and retries the parent's function body before any child
    // renders, so a child never sees the stale zones. Without the render-phase reset, the parent's
    // body runs once with the stale `zones` still in state, and that stale value is what a child
    // sees at its one and only commit.
    const seenZones: Zone[][] = [];

    function ZonesProbe({ zones }: { zones: Zone[] }) {
      seenZones.push(zones);
      return null;
    }

    function Harness({ ticker }: { ticker: string | null }) {
      const { zones } = useChartData(ticker, '1Y');
      return <ZonesProbe zones={zones} />;
    }

    vi.spyOn(client, 'getChartData')
      .mockResolvedValueOnce({
        points: [{ time: '2026-01-02', close: 100 }],
        zones: [{ id: null, price: 95, kind: 'support', strength: 3, source: 'auto' }],
      })
      .mockReturnValueOnce(new Promise<client.ChartData>(() => {})); // never resolves

    const { rerender } = render(<Harness ticker="VTI" />);
    await waitFor(() => expect(seenZones.some((z) => z.length === 1)).toBe(true));

    seenZones.length = 0;
    rerender(<Harness ticker="SPY" />);

    // The child's very first commit for the new ticker must not carry the old zones.
    expect(seenZones[0]).toEqual([]);
  });

  it('exposes a refetch function that re-fetches without waiting for ticker or range to change', async () => {
    vi.spyOn(client, 'getChartData')
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', close: 100 }], zones: [] })
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', close: 105 }], zones: [] });

    const { result } = renderHook(() => useChartData('VTI', '1Y'));
    await waitFor(() => expect(result.current.points).toEqual([{ time: '2026-01-02', close: 100 }]));

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.points).toEqual([{ time: '2026-01-02', close: 105 }]));
    expect(client.getChartData).toHaveBeenCalledTimes(2);
  });
});
