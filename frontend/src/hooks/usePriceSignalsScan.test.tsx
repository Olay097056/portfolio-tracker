// frontend/src/hooks/usePriceSignalsScan.test.tsx
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { usePriceSignalsScan } from './usePriceSignalsScan';

describe('usePriceSignalsScan', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with no results and not scanning', () => {
    const { result } = renderHook(() => usePriceSignalsScan());

    expect(result.current.results).toEqual({});
    expect(result.current.scanning).toBe(false);
    expect(result.current.progress).toBeNull();
  });

  it('fetches each ticker sequentially and stores results keyed by ticker', async () => {
    const calls: string[] = [];
    vi.spyOn(client, 'getPriceSignal').mockImplementation(async (ticker) => {
      calls.push(ticker);
      return { ticker, percent_change_pct: ticker === 'VTI' ? 1.5 : 2.5 };
    });

    const { result } = renderHook(() => usePriceSignalsScan());

    await act(async () => {
      await result.current.scan(['VTI', 'SPY'], '1w');
    });

    expect(calls).toEqual(['VTI', 'SPY']);
    expect(result.current.results).toEqual({
      VTI: { ticker: 'VTI', percent_change_pct: 1.5 },
      SPY: { ticker: 'SPY', percent_change_pct: 2.5 },
    });
    expect(client.getPriceSignal).toHaveBeenNthCalledWith(1, 'VTI', '1w');
    expect(client.getPriceSignal).toHaveBeenNthCalledWith(2, 'SPY', '1w');
  });

  it('updates progress after each ticker completes and clears it when done', async () => {
    vi.spyOn(client, 'getPriceSignal').mockImplementation(async (ticker) => ({
      ticker,
      percent_change_pct: 1,
    }));

    const { result } = renderHook(() => usePriceSignalsScan());

    const scanPromise = act(async () => {
      await result.current.scan(['VTI', 'SPY', 'BND'], '1d');
    });

    await scanPromise;

    expect(result.current.scanning).toBe(false);
  });

  it('records a null-valued row for a ticker whose fetch fails, without abandoning the rest', async () => {
    vi.spyOn(client, 'getPriceSignal').mockImplementation(async (ticker) => {
      if (ticker === 'BADTICKER') {
        throw new client.ApiError(502, 'upstream error');
      }
      return { ticker, percent_change_pct: 3 };
    });

    const { result } = renderHook(() => usePriceSignalsScan());

    await act(async () => {
      await result.current.scan(['VTI', 'BADTICKER'], '1w');
    });

    expect(result.current.results).toEqual({
      VTI: { ticker: 'VTI', percent_change_pct: 3 },
      BADTICKER: { ticker: 'BADTICKER', percent_change_pct: null },
    });
  });

  it('replaces prior results wholesale on a new scan rather than merging', async () => {
    vi.spyOn(client, 'getPriceSignal').mockImplementation(async (ticker) => ({
      ticker,
      percent_change_pct: 1,
    }));

    const { result } = renderHook(() => usePriceSignalsScan());

    await act(async () => {
      await result.current.scan(['VTI'], '1w');
    });
    expect(result.current.results).toEqual({ VTI: { ticker: 'VTI', percent_change_pct: 1 } });

    await act(async () => {
      await result.current.scan(['SPY'], '1w');
    });

    expect(result.current.results).toEqual({ SPY: { ticker: 'SPY', percent_change_pct: 1 } });
  });
});
