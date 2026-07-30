// frontend/src/hooks/useChartData.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
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
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points });

    const { result } = renderHook(() => useChartData('VTI', '1Y'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(client.getChartData).toHaveBeenCalledWith('VTI', '1Y');
    expect(result.current.points).toEqual(points);
    expect(result.current.error).toBeNull();
  });

  it('refetches when the ticker changes', async () => {
    vi.spyOn(client, 'getChartData')
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', close: 100 }] })
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', close: 400 }] });

    const { result, rerender } = renderHook(({ ticker }) => useChartData(ticker, '1Y'), {
      initialProps: { ticker: 'VTI' as string | null },
    });
    await waitFor(() => expect(result.current.points).toEqual([{ time: '2026-01-02', close: 100 }]));

    rerender({ ticker: 'SPY' });

    await waitFor(() => expect(client.getChartData).toHaveBeenLastCalledWith('SPY', '1Y'));
    await waitFor(() => expect(result.current.points).toEqual([{ time: '2026-01-02', close: 400 }]));
  });

  it('sets an explicit error and null points when the API reports the ticker unavailable', async () => {
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: null });

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
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', close: 400 }] });

    const { result, rerender } = renderHook(({ ticker }) => useChartData(ticker, '1Y'), {
      initialProps: { ticker: 'VTI' as string | null },
    });

    rerender({ ticker: 'SPY' });
    await waitFor(() => expect(result.current.points).toEqual([{ time: '2026-01-02', close: 400 }]));

    // The abandoned VTI request now resolves late — it must not overwrite SPY's already-landed data.
    resolveFirst({ points: [{ time: '2026-01-02', close: 100 }] });

    expect(result.current.points).toEqual([{ time: '2026-01-02', close: 400 }]);
  });
});
